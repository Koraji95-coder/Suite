/**
 * Authentication context for the Suite application
 * Provides authentication state and methods to the application
 */

import type { User } from "@supabase/supabase-js";
import {
	createContext,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import { hasAdminClaim } from "../lib/roles";
import { logger } from "../lib/logger";
import { agentService } from "../services/agentService";
import { agentTaskManager } from "../services/agentTaskManager";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "../services/securityEventService";
import {
	type EmailAuthRequestOptions,
	requestEmailAuthLink,
} from "./emailAuthApi";
import {
	buildSessionAuthKey,
	clearSessionAuthMarkers,
	consumePasskeySignInPending,
	readSessionAuthMethod,
	type SessionAuthMethod,
	storeSessionAuthMethod,
} from "./passkeySessionState";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
	user: User | null;
	profile: Profile | null;
	loading: boolean;
	sessionAuthMethod: SessionAuthMethod;
	signIn: (email: string, options?: EmailAuthRequestOptions) => Promise<void>;
	signUp: (email: string, options?: EmailAuthRequestOptions) => Promise<void>;
	signOut: () => Promise<void>;
	updateProfile: (
		updates: Partial<
			Pick<
				Database["public"]["Tables"]["profiles"]["Update"],
				"display_name" | "email"
			>
		>,
	) => Promise<Profile | null>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
	undefined,
);

function isUserAdmin(authUser: User | null): boolean {
	return hasAdminClaim(authUser);
}

async function fetchProfile(userId: string): Promise<Profile | null> {
	const { data, error } = await supabase
		.from("profiles")
		.select("*")
		.eq("id", userId)
		.maybeSingle();
	if (error) {
		const code = (error as { code?: string } | null)?.code;
		if (code === "PGRST116") {
			return null;
		}
		logger.error("AuthContext", "Failed to load profile", { userId, error });
		return null;
	}
	return data;
}

async function ensureProfileForUser(user: User): Promise<Profile | null> {
	const existing = await fetchProfile(user.id);
	if (existing) return existing;

	const fallbackDisplayName =
		typeof user.user_metadata?.display_name === "string"
			? user.user_metadata.display_name
			: typeof user.user_metadata?.full_name === "string"
				? user.user_metadata.full_name
				: null;

	const payload: Database["public"]["Tables"]["profiles"]["Insert"] = {
		id: user.id,
		email: user.email ?? null,
		display_name: fallbackDisplayName,
	};

	const { data, error } = await supabase
		.from("profiles")
		.upsert(payload, { onConflict: "id" })
		.select("*")
		.maybeSingle();

	if (error) {
		logger.error("AuthContext", "Failed to create profile", {
			userId: user.id,
			error,
		});
		return null;
	}

	return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [sessionAuthMethod, setSessionAuthMethod] =
		useState<SessionAuthMethod>("email_link");
	const [loading, setLoading] = useState(true);
	const lastSignedInTelemetryKeyRef = useRef<string>("");

	useEffect(() => {
		// Rehydrate session from storage on mount
		const rehydrateSession = async () => {
			try {
				const {
					data: { session },
					error,
				} = await supabase.auth.getSession();
				if (error) {
					logger.error("AuthContext", "Failed to rehydrate session", { error });
					setLoading(false);
					return;
				}

				const currentUser = session?.user ?? null;
				setUser(currentUser);
				const sessionKey = buildSessionAuthKey(
					currentUser?.id,
					session?.expires_at ?? null,
				);
				agentService.setActiveUser(
					currentUser?.id ?? null,
					currentUser?.email ?? null,
					isUserAdmin(currentUser),
				);
				agentTaskManager.setScope(currentUser?.id ?? null);

				if (currentUser) {
					const restoredMethod = readSessionAuthMethod(sessionKey);
					setSessionAuthMethod(restoredMethod ?? "email_link");
					const p = await ensureProfileForUser(currentUser);
					setProfile(p);
				} else {
					setSessionAuthMethod("email_link");
					setProfile(null);
				}
			} catch (err) {
				logger.error("AuthContext", "Rehydration error", { err });
			} finally {
				setLoading(false);
			}
		};

		rehydrateSession();

		// Listen for auth state changes
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			const currentUser = session?.user ?? null;
			setUser(currentUser);
			const sessionKey = buildSessionAuthKey(
				currentUser?.id,
				session?.expires_at ?? null,
			);
			agentService.setActiveUser(
				currentUser?.id ?? null,
				currentUser?.email ?? null,
				isUserAdmin(currentUser),
			);
			agentTaskManager.setScope(currentUser?.id ?? null);

			if (currentUser) {
				if (event === "SIGNED_IN") {
					const isPasskeySession = consumePasskeySignInPending();
					const method: SessionAuthMethod = isPasskeySession
						? "passkey"
						: "email_link";
					setSessionAuthMethod(method);
					storeSessionAuthMethod(sessionKey, method);

					const sessionIssuedAt =
						typeof session?.expires_at === "number"
							? String(session.expires_at)
							: "unknown";
					const key = `${currentUser.id}:${sessionIssuedAt}`;
					if (lastSignedInTelemetryKeyRef.current !== key) {
						lastSignedInTelemetryKeyRef.current = key;
						void logAuthMethodTelemetry(
							method,
							"sign_in_completed",
							method === "passkey"
								? "Signed in with passkey-verified authentication."
								: "Signed in with passwordless email-link authentication.",
						);
					}
				} else {
					const restoredMethod = readSessionAuthMethod(sessionKey);
					setSessionAuthMethod(restoredMethod ?? "email_link");
				}

				// Async-safe pattern: avoid deadlocks by not awaiting directly inside the callback
				(async () => {
					const p = await ensureProfileForUser(currentUser);
					setProfile(p);
				})();
			} else {
				setSessionAuthMethod("email_link");
				clearSessionAuthMarkers();
				setProfile(null);
			}
		});

		return () => {
			subscription.unsubscribe();
		};
	}, []);

	const signIn = async (email: string, options?: EmailAuthRequestOptions) => {
		await requestEmailAuthLink(email, "signin", options);
		await logAuthMethodTelemetry(
			"email_link",
			"sign_in_link_requested",
			"Sign-in email-link authentication requested.",
		);
		await logSecurityEvent(
			"auth_sign_in_success",
			"Sign-in email link requested.",
		);
	};

	const signUp = async (email: string, options?: EmailAuthRequestOptions) => {
		await requestEmailAuthLink(email, "signup", options);
		await logAuthMethodTelemetry(
			"email_link",
			"sign_up_link_requested",
			"Sign-up email-link authentication requested.",
		);
		await logSecurityEvent(
			"auth_sign_up_success",
			"Sign-up email link requested.",
		);
	};

	const signOut = async () => {
		try {
			await agentService.unpair();
		} catch (error) {
			logger.warn("Failed to clear agent pairing on sign-out", "AuthContext", {
				error,
			});
		}

		const { error } = await supabase.auth.signOut();
		if (error) throw error;
		clearSessionAuthMarkers();
		await logSecurityEvent("auth_sign_out", "User signed out current session.");
	};

	const updateProfile = async (
		updates: Partial<
			Pick<
				Database["public"]["Tables"]["profiles"]["Update"],
				"display_name" | "email"
			>
		>,
	): Promise<Profile | null> => {
		if (!user) throw new Error("Not signed in");

		const normalizedDisplayName =
			typeof updates.display_name === "string"
				? updates.display_name.trim() || null
				: undefined;
		const normalizedEmail =
			typeof updates.email === "string"
				? updates.email.trim() || null
				: undefined;

		const patch: Database["public"]["Tables"]["profiles"]["Update"] = {
			updated_at: new Date().toISOString(),
			...(normalizedDisplayName !== undefined
				? { display_name: normalizedDisplayName }
				: {}),
			...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
		};

		const { data: updated, error: updateError } = await supabase
			.from("profiles")
			.update(patch)
			.eq("id", user.id)
			.select("*")
			.maybeSingle();

		if (!updateError && updated) {
			setProfile(updated);
			return updated;
		}

		const insertPayload: Database["public"]["Tables"]["profiles"]["Insert"] = {
			id: user.id,
			email: normalizedEmail ?? user.email ?? null,
			display_name: normalizedDisplayName ?? null,
			updated_at: new Date().toISOString(),
		};

		const { data: inserted, error: insertError } = await supabase
			.from("profiles")
			.insert(insertPayload)
			.select("*")
			.maybeSingle();

		if (!insertError && inserted) {
			setProfile(inserted);
			return inserted;
		}

		const { data: authData, error: authError } = await supabase.auth.updateUser(
			{
				data:
					normalizedDisplayName !== undefined
						? { display_name: normalizedDisplayName }
						: undefined,
			},
		);

		if (authError) {
			logger.error("AuthContext", "Failed to update profile", {
				userId: user.id,
				updateError,
				insertError,
				authError,
			});
			throw authError;
		}

		if (authData.user) {
			setUser(authData.user);
		}

		setProfile((prev) => {
			if (!prev) return prev;
			return {
				...prev,
				display_name:
					normalizedDisplayName !== undefined
						? normalizedDisplayName
						: prev.display_name,
				email: normalizedEmail !== undefined ? normalizedEmail : prev.email,
				updated_at: new Date().toISOString(),
			};
		});

		logger.warn(
			"AuthContext",
			"Profiles table update unavailable; applied display name via auth metadata fallback",
			{ userId: user.id, updateError, insertError },
		);

		return null;
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				profile,
				loading,
				sessionAuthMethod,
				signIn,
				signUp,
				signOut,
				updateProfile,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export { useAuth } from "./useAuth";
