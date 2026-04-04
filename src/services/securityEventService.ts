import { logActivity } from "./activityService";

export type SecurityEventType =
	| "auth_sign_in_success"
	| "auth_sign_up_success"
	| "auth_sign_out"
	| "auth_sign_out_global";

export type AuthMethod = "email_link" | "passkey";

export type AuthMethodEvent =
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
	| "enroll_completed";

export async function logSecurityEvent(
	type: SecurityEventType,
	description: string,
): Promise<void> {
	try {
		await logActivity({
			action: `security:${type}`,
			description,
		});
	} catch {
		// Security telemetry should never block UX flows
	}
}

export async function logAuthMethodTelemetry(
	method: AuthMethod,
	event: AuthMethodEvent,
	description: string,
): Promise<void> {
	try {
		await logActivity({
			action: `security:auth_method:${method}:${event}`,
			description,
		});
	} catch {
		// Security telemetry should never block UX flows
	}
}
