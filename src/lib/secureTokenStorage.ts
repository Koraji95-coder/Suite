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

import { logger } from './logger';

interface TokenData {
  token: string;
  expiresAt: number;
  issuedAt: number;
}

class SecureTokenStorage {
  private readonly STORAGE_KEY = 'suite_auth_token';
  private readonly TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Simple XOR cipher for obfuscation
   * NOTE: This is NOT cryptographically secure, but prevents casual inspection
   * Real encryption requires a server-side key management solution
   */
  private obfuscate(data: string): string {
    const key = this.getDeviceKey();
    let result = '';
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 encode
  }

  private deobfuscate(data: string): string {
    try {
      const decoded = atob(data);
      const key = this.getDeviceKey();
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return result;
    } catch (error) {
      logger.error('Token deobfuscation failed', 'SecureTokenStorage', error);
      return '';
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

  /**
   * Store a token securely in sessionStorage
   * sessionStorage is cleared when the tab closes, unlike localStorage
   */
  setToken(token: string): void {
    try {
      const now = Date.now();
      const tokenData: TokenData = {
        token,
        issuedAt: now,
        expiresAt: now + this.TOKEN_LIFETIME_MS,
      };

      const serialized = JSON.stringify(tokenData);
      const obfuscated = this.obfuscate(serialized);
      
      // Use sessionStorage instead of localStorage for better security
      sessionStorage.setItem(this.STORAGE_KEY, obfuscated);
      
      logger.debug('Token stored securely', 'SecureTokenStorage');
    } catch (error) {
      logger.error('Failed to store token', 'SecureTokenStorage', error);
    }
  }

  /**
   * Retrieve and validate token from storage
   * Returns null if token is missing, expired, or invalid
   */
  getToken(): string | null {
    try {
      const obfuscated = sessionStorage.getItem(this.STORAGE_KEY);
      if (!obfuscated) {
        return null;
      }

      const serialized = this.deobfuscate(obfuscated);
      if (!serialized) {
        this.clearToken();
        return null;
      }

      const tokenData: TokenData = JSON.parse(serialized);

      // Check if token is expired
      if (Date.now() > tokenData.expiresAt) {
        logger.warn('Token expired', 'SecureTokenStorage');
        this.clearToken();
        return null;
      }

      return tokenData.token;
    } catch (error) {
      logger.error('Failed to retrieve token', 'SecureTokenStorage', error);
      this.clearToken();
      return null;
    }
  }

  /**
   * Remove token from storage
   */
  clearToken(): void {
    sessionStorage.removeItem(this.STORAGE_KEY);
    logger.debug('Token cleared', 'SecureTokenStorage');
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
      const obfuscated = sessionStorage.getItem(this.STORAGE_KEY);
      if (!obfuscated) return 0;

      const serialized = this.deobfuscate(obfuscated);
      if (!serialized) return 0;

      const tokenData: TokenData = JSON.parse(serialized);
      const remaining = tokenData.expiresAt - Date.now();
      return Math.max(0, remaining);
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const secureTokenStorage = new SecureTokenStorage();
