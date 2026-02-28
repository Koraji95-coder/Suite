/**
 * Authentication context for the Suite application
 * Provides authentication state and methods to the application
 */

import type { User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useEffect, useState } from "react";
import { resolveAuthRedirect } from "./authRedirect";
import { agentTaskManager } from "../services/agentTaskManager";
import { agentService } from "../services/agentService";
import { logSecurityEvent } from "../services/securityEventService";
import { logger } from "../lib/logger";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
	user: User | null;
	profile: Profile | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string) => Promise<void>;
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
	const [loading, setLoading] = useState(true);

	const isUserAdmin = (authUser: User | null): boolean => {
		if (!authUser) return false;

		const rawRole = (authUser.app_metadata as Record<string, unknown> | undefined)
			?.role;

		if (typeof rawRole === "string") {
			return rawRole.trim().toLowerCase() === "admin";
		}

		const rawRoles = (authUser.app_metadata as Record<string, unknown> | undefined)
			?.roles;
		if (Array.isArray(rawRoles)) {
			return rawRoles.some(
				(entry) => typeof entry === "string" && entry.trim().toLowerCase() === "admin",
			);
		}

		return false;
	};

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
				agentService.setActiveUser(
					currentUser?.id ?? null,
					currentUser?.email ?? null,
					isUserAdmin(currentUser),
				);
				agentTaskManager.setScope(currentUser?.id ?? null);

				if (currentUser) {
					const p = await ensureProfileForUser(currentUser);
					setProfile(p);
				} else {
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
		} = supabase.auth.onAuthStateChange((_event, session) => {
			const currentUser = session?.user ?? null;
			setUser(currentUser);
			agentService.setActiveUser(
				currentUser?.id ?? null,
				currentUser?.email ?? null,
				isUserAdmin(currentUser),
			);
			agentTaskManager.setScope(currentUser?.id ?? null);

			if (currentUser) {
				// Async-safe pattern: avoid deadlocks by not awaiting directly inside the callback
				(async () => {
					const p = await ensureProfileForUser(currentUser);
					setProfile(p);
				})();
			} else {
				setProfile(null);
			}
		});

		return () => {
			subscription.unsubscribe();
		};
	}, []);

	const signIn = async (email: string, password: string) => {
		const { error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});
		if (error) throw error;
		await logSecurityEvent("auth_sign_in_success", "User signed in successfully.");
	};

	const signUp = async (email: string, password: string) => {
		const emailRedirectTo = resolveAuthRedirect("/login");

		const { error } = await supabase.auth.signUp({
			email,
			password,
			options: emailRedirectTo ? { emailRedirectTo } : undefined,
		});
		if (error) throw error;
		await logSecurityEvent(
			"auth_sign_up_success",
			"User sign-up initiated successfully.",
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
			value={{ user, profile, loading, signIn, signUp, signOut, updateProfile }}
		>
			{children}
		</AuthContext.Provider>
	);
}

export { useAuth } from "./useAuth";
