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
import { logger } from "../lib/logger";
import { hasAdminClaim } from "../lib/roles";
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
import { sanitizeSupabaseCallbackUrlInPlace } from "./supabaseCallback";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
	user: User | null;
	profile: Profile | null;
	loading: boolean;
	profileHydrating: boolean;
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

function readBooleanEnv(value: unknown, fallback: boolean): boolean {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return fallback;
}

const SHOULD_UNPAIR_ON_SIGN_OUT = readBooleanEnv(
	import.meta.env.VITE_AGENT_SIGNOUT_UNPAIR,
	true,
);

let agentRuntimePromise:
	| Promise<{
			agentService: (typeof import("../services/agentService"))["agentService"];
			agentTaskManager: (typeof import("../services/agentTaskManager"))["agentTaskManager"];
	  }>
	| null = null;

function getAgentRuntime() {
	if (!agentRuntimePromise) {
		agentRuntimePromise = Promise.all([
			import("../services/agentService"),
			import("../services/agentTaskManager"),
		]).then(([agentServiceModule, agentTaskManagerModule]) => ({
			agentService: agentServiceModule.agentService,
			agentTaskManager: agentTaskManagerModule.agentTaskManager,
		}));
	}
	return agentRuntimePromise;
}

async function logAuthMethodTelemetryDeferred(
	method: "email_link" | "passkey",
	event:
		| "sign_in_link_requested"
		| "sign_up_link_requested"
		| "sign_in_request_failed"
		| "sign_up_request_failed"
		| "sign_in_completed"
		| "sign_in_started"
		| "sign_in_redirected"
		| "sign_in_failed"
		| "enroll_started"
		| "enroll_redirected"
		| "enroll_failed"
		| "enroll_completed",
	description: string,
) {
	const securityEventModule = await import("../services/securityEventService");
	return securityEventModule.logAuthMethodTelemetry(method, event, description);
}

async function logSecurityEventDeferred(
	type:
		| "auth_sign_in_success"
		| "auth_sign_up_success"
		| "auth_sign_out"
		| "auth_sign_out_global"
		| "agent_pair_success"
		| "agent_pair_failed"
		| "agent_restore_success"
		| "agent_restore_failed"
		| "agent_unpair"
		| "agent_task_blocked_non_admin"
		| "agent_webhook_secret_rejected"
		| "agent_request_unauthorized",
	description: string,
) {
	const securityEventModule = await import("../services/securityEventService");
	return securityEventModule.logSecurityEvent(type, description);
}

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
	const [profileHydrating, setProfileHydrating] = useState(false);
	const lastSignedInTelemetryKeyRef = useRef<string>("");

	useEffect(() => {
		let isActive = true;
		let lastBootstrapSessionKey = "";

		const restoreAgentPairing = async (
			context: "rehydrate" | "auth-change",
		): Promise<void> => {
			try {
				const { agentService } = await getAgentRuntime();
				const result = await agentService.restorePairingForActiveUser();
				logger.debug("Agent pairing restore evaluated", "AuthContext", {
					context,
					restored: result.restored,
					reason: result.reason,
				});
			} catch (error) {
				logger.warn("Agent pairing restore failed", "AuthContext", {
					context,
					error,
				});
			}
		};

		const syncSessionShellState = (
			currentUser: User | null,
			sessionExpiresAt: number | null,
		): string => {
			const sessionKey = buildSessionAuthKey(currentUser?.id, sessionExpiresAt);
			setUser(currentUser);
			if (currentUser || agentRuntimePromise) {
				void getAgentRuntime()
					.then(({ agentService, agentTaskManager }) => {
						agentService.setActiveUser(
							currentUser?.id ?? null,
							currentUser?.email ?? null,
							isUserAdmin(currentUser),
						);
						agentTaskManager.setScope(currentUser?.id ?? null);
					})
					.catch((error) => {
						logger.warn(
							"Failed to sync agent runtime scope with auth session",
							"AuthContext",
							{ error, userId: currentUser?.id ?? null },
						);
					});
			}

			if (currentUser) {
				const restoredMethod = readSessionAuthMethod(sessionKey);
				setSessionAuthMethod(restoredMethod ?? "email_link");
			} else {
				setSessionAuthMethod("email_link");
				setProfile(null);
				setProfileHydrating(false);
				clearSessionAuthMarkers();
				lastSignedInTelemetryKeyRef.current = "";
				lastBootstrapSessionKey = "";
			}

			return sessionKey;
		};

		const bootstrapSignedInSession = (
			currentUser: User | null,
			sessionKey: string,
			context: "rehydrate" | "auth-change",
		): void => {
			if (!currentUser) {
				return;
			}
			if (lastBootstrapSessionKey === sessionKey) {
				return;
			}
			lastBootstrapSessionKey = sessionKey;
			setProfileHydrating(true);

			void (async () => {
				await restoreAgentPairing(context);
				const nextProfile = await ensureProfileForUser(currentUser);
				if (!isActive) {
					return;
				}
				setProfile(nextProfile);
			})().catch((error) => {
				logger.error("AuthContext", "Deferred session bootstrap failed", {
					context,
					userId: currentUser.id,
					error,
				});
			}).finally(() => {
				if (isActive) {
					setProfileHydrating(false);
				}
			});
		};

		// Rehydrate session from storage on mount
		const rehydrateSession = async () => {
			try {
				const {
					data: { session },
					error,
				} = await supabase.auth.getSession();
				if (error) {
					logger.error("AuthContext", "Failed to rehydrate session", { error });
					return;
				}

				const currentUser = session?.user ?? null;
				const sessionKey = syncSessionShellState(
					currentUser,
					session?.expires_at ?? null,
				);
				setLoading(false);
				bootstrapSignedInSession(currentUser, sessionKey, "rehydrate");

				sanitizeSupabaseCallbackUrlInPlace();
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
			const sessionKey = syncSessionShellState(
				currentUser,
				session?.expires_at ?? null,
			);
			setLoading(false);

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
						void logAuthMethodTelemetryDeferred(
							method,
							"sign_in_completed",
							method === "passkey"
								? "Signed in with passkey-verified authentication."
								: "Signed in with passwordless email-link authentication.",
						);
					}

					sanitizeSupabaseCallbackUrlInPlace();
				} else {
					const restoredMethod = readSessionAuthMethod(sessionKey);
					setSessionAuthMethod(restoredMethod ?? "email_link");
				}

				bootstrapSignedInSession(currentUser, sessionKey, "auth-change");
			}
		});

		return () => {
			isActive = false;
			subscription.unsubscribe();
		};
	}, []);

	const signIn = async (email: string, options?: EmailAuthRequestOptions) => {
		await requestEmailAuthLink(email, "signin", options);
		await logAuthMethodTelemetryDeferred(
			"email_link",
			"sign_in_link_requested",
			"Sign-in email-link authentication requested.",
		);
		await logSecurityEventDeferred(
			"auth_sign_in_success",
			"Sign-in email link requested.",
		);
	};

	const signUp = async (email: string, options?: EmailAuthRequestOptions) => {
		await requestEmailAuthLink(email, "signup", options);
		await logAuthMethodTelemetryDeferred(
			"email_link",
			"sign_up_link_requested",
			"Sign-up email-link authentication requested.",
		);
		await logSecurityEventDeferred(
			"auth_sign_up_success",
			"Sign-up email link requested.",
		);
	};

	const signOut = async () => {
		if (SHOULD_UNPAIR_ON_SIGN_OUT) {
			try {
				const { agentService } = await getAgentRuntime();
				await agentService.unpair();
			} catch (error) {
				logger.warn(
					"Failed to clear agent pairing on sign-out",
					"AuthContext",
					{
						error,
					},
				);
			}
		} else {
			logger.info(
				"Preserving agent pairing on sign-out (VITE_AGENT_SIGNOUT_UNPAIR=false)",
				"AuthContext",
			);
		}

		const { error } = await supabase.auth.signOut();
		if (error) throw error;
		clearSessionAuthMarkers();
		await logSecurityEventDeferred(
			"auth_sign_out",
			"User signed out current session.",
		);
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
				profileHydrating,
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
