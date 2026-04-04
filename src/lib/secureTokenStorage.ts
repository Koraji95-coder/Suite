/**
 * Secure token storage utility
 * Provides encrypted storage for authentication tokens
 *
 * NOTE: This is a client-side security improvement.
 * For production, tokens should be stored in HttpOnly cookies
 * set by the backend server. This implementation provides
 * defense-in-depth for scenarios where HttpOnly cookies
 * cannot be used.
 */

import { getSessionStorageApi } from "./browserStorage";
import { logger } from "./logger";

interface TokenData {
	token: string;
	expiresAt: number | null;
	issuedAt: number;
}

const DEFAULT_TOKEN_LIFETIME_HOURS = 24;
const MAX_TOKEN_LIFETIME_HOURS = 24 * 365;

function resolveTokenLifetimeHours(): number | null {
	return Math.min(MAX_TOKEN_LIFETIME_HOURS, DEFAULT_TOKEN_LIFETIME_HOURS);
}

class SecureTokenStorage {
	private readonly STORAGE_KEY_PREFIX = "suite_auth_token";
	private readonly tokenLifetimeHours = resolveTokenLifetimeHours();
	private scope = "anon";

	setScope(scope: string | null): void {
		this.scope = scope?.trim() || "anon";
	}

	private getStorageKey(): string {
		return `${this.STORAGE_KEY_PREFIX}:${this.scope}`;
	}

	private getStorage() {
		return getSessionStorageApi();
	}

	/**
	 * Simple XOR cipher for obfuscation
	 * NOTE: This is NOT cryptographically secure, but prevents casual inspection
	 * Real encryption requires a server-side key management solution
	 */
	private obfuscate(data: string): string {
		const key = this.getDeviceKey();
		let result = "";
		for (let i = 0; i < data.length; i++) {
			result += String.fromCharCode(
				data.charCodeAt(i) ^ key.charCodeAt(i % key.length),
			);
		}
		return btoa(result); // Base64 encode
	}

	private deobfuscate(data: string): string {
		try {
			const decoded = atob(data);
			const key = this.getDeviceKey();
			let result = "";
			for (let i = 0; i < decoded.length; i++) {
				result += String.fromCharCode(
					decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length),
				);
			}
			return result;
		} catch (error) {
			logger.error("Token deobfuscation failed", "SecureTokenStorage", error);
			return "";
		}
	}

	/**
	 * Generate a device-specific key for obfuscation
	 * Uses browser fingerprinting (userAgent + screen)
	 */
	private getDeviceKey(): string {
		const ua = navigator.userAgent;
		const screen = `${window.screen.width}x${window.screen.height}`;
		return btoa(`${ua}${screen}`).substring(0, 32);
	}

	getDeviceFingerprint(): string {
		return btoa(this.getDeviceKey()).slice(0, 24);
	}

	/**
	 * Store a token securely in sessionStorage
	 * sessionStorage is cleared when the tab closes, unlike localStorage
	 */
	setToken(token: string): void {
		try {
			const storage = this.getStorage();
			if (!storage) {
				return;
			}
			const now = Date.now();
			const tokenData: TokenData = {
				token,
				issuedAt: now,
				expiresAt:
					this.tokenLifetimeHours === null
						? null
						: now + this.tokenLifetimeHours * 60 * 60 * 1000,
			};

			const serialized = JSON.stringify(tokenData);
			const obfuscated = this.obfuscate(serialized);

			// Use sessionStorage instead of localStorage for better security
			storage.setItem(this.getStorageKey(), obfuscated);

			logger.debug("Token stored securely", "SecureTokenStorage");
		} catch (error) {
			logger.error("Failed to store token", "SecureTokenStorage", error);
		}
	}

	/**
	 * Retrieve and validate token from storage
	 * Returns null if token is missing, expired, or invalid
	 */
	getToken(): string | null {
		try {
			const storage = this.getStorage();
			if (!storage) {
				return null;
			}
			const obfuscated = storage.getItem(this.getStorageKey());
			if (!obfuscated) {
				return null;
			}

			const serialized = this.deobfuscate(obfuscated);
			if (!serialized) {
				this.clearToken();
				return null;
			}

			const tokenData: TokenData = JSON.parse(serialized);
			const expiresAt =
				typeof tokenData.expiresAt === "number" ? tokenData.expiresAt : null;

			// Check if token is expired
			if (expiresAt !== null && Date.now() > expiresAt) {
				logger.warn("Token expired", "SecureTokenStorage");
				this.clearToken();
				return null;
			}

			return tokenData.token;
		} catch (error) {
			logger.error("Failed to retrieve token", "SecureTokenStorage", error);
			this.clearToken();
			return null;
		}
	}

	/**
	 * Remove token from storage
	 */
	clearToken(): void {
		const storage = this.getStorage();
		if (!storage) {
			return;
		}
		try {
			storage.removeItem(this.getStorageKey());
			logger.debug("Token cleared", "SecureTokenStorage");
		} catch (error) {
			logger.warn("Failed to clear token", "SecureTokenStorage", { error });
		}
	}

	/**
	 * Check if a valid token exists
	 */
	hasToken(): boolean {
		return this.getToken() !== null;
	}

	/**
	 * Get time remaining until token expiration (in milliseconds)
	 * Returns 0 if no token or token is expired
	 */
	getTimeUntilExpiry(): number {
		try {
			const storage = this.getStorage();
			if (!storage) return 0;
			const obfuscated = storage.getItem(this.getStorageKey());
			if (!obfuscated) return 0;

			const serialized = this.deobfuscate(obfuscated);
			if (!serialized) return 0;

			const tokenData: TokenData = JSON.parse(serialized);
			const expiresAt =
				typeof tokenData.expiresAt === "number" ? tokenData.expiresAt : null;
			if (expiresAt === null) return Number.POSITIVE_INFINITY;
			const remaining = expiresAt - Date.now();
			return Math.max(0, remaining);
		} catch {
			return 0;
		}
	}

	exportOpaqueToken(): string | null {
		try {
			const storage = this.getStorage();
			if (!storage) return null;
			const current = storage.getItem(this.getStorageKey());
			return typeof current === "string" ? current : null;
		} catch {
			return null;
		}
	}

	importOpaqueToken(obfuscated: string): boolean {
		if (!obfuscated?.trim()) return false;
		try {
			const storage = this.getStorage();
			if (!storage) {
				return false;
			}
			const serialized = this.deobfuscate(obfuscated);
			if (!serialized) return false;

			const tokenData: TokenData = JSON.parse(serialized);
			const expiresAt =
				typeof tokenData.expiresAt === "number" ? tokenData.expiresAt : null;
			if (!tokenData?.token || (expiresAt !== null && Date.now() > expiresAt)) {
				return false;
			}

			storage.setItem(this.getStorageKey(), obfuscated);
			return true;
		} catch (error) {
			logger.warn("Failed to import opaque token", "SecureTokenStorage", {
				error,
			});
			return false;
		}
	}
}

// Export singleton instance
export const secureTokenStorage = new SecureTokenStorage();
