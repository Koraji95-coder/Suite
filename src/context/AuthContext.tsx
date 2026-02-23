/**
 * Authentication context for the Suite application
 * Provides authentication state and methods to the application
 */
import type { User } from "@supabase/supabase-js";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
	user: User | null;
	profile: Profile | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
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
		logger.error("AuthContext", "Failed to load profile", { userId, error });
		return null;
	}
	return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [loading, setLoading] = useState(true);

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

				if (currentUser) {
					const p = await fetchProfile(currentUser.id);
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

			if (currentUser) {
				// Async-safe pattern: avoid deadlocks by not awaiting directly inside the callback
				(async () => {
					const p = await fetchProfile(currentUser.id);
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
	};

	const signUp = async (email: string, password: string) => {
		const { error } = await supabase.auth.signUp({ email, password });
		if (error) throw error;
	};

	const signOut = async () => {
		const { error } = await supabase.auth.signOut();
		if (error) throw error;
	};

	return (
		<AuthContext.Provider
			value={{ user, profile, loading, signIn, signUp, signOut }}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
