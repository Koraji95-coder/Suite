/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_AUTH_REDIRECT_URL?: string;
	readonly VITE_AUTH_ALLOWED_ORIGINS?: string;
	readonly VITE_AUTH_HONEYPOT_FIELD?: string;
	readonly VITE_AUTH_PASSKEY_ENABLED?: string;
	readonly VITE_JAM_METADATA_ENABLED?: string;
	readonly VITE_TURNSTILE_SITE_KEY?: string;
}
