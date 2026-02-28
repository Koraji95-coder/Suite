import { logActivity } from "./activityService";

export type SecurityEventType =
	| "auth_sign_in_success"
	| "auth_sign_up_success"
	| "auth_sign_out"
	| "auth_sign_out_global"
	| "auth_password_update_success"
	| "auth_password_update_failed"
	| "agent_pair_success"
	| "agent_pair_failed"
	| "agent_restore_success"
	| "agent_restore_failed"
	| "agent_unpair"
	| "agent_task_blocked_non_admin"
	| "agent_webhook_secret_rejected"
	| "agent_request_unauthorized";

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
