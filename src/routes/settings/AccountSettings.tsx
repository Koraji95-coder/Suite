import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import { agentService } from "@/services/agentService";
import {
	AccountAgentPairingSection,
	AccountProfileSection,
	AccountSecurityOverviewSection,
	AccountSessionActionsSection,
} from "./AccountSettingsSections";
import {
	buildAgentGatewayStatus,
	buildAgentModeStatus,
	buildAgentPairingStatus,
	buildPasskeyAuthStatus,
	buildPasskeyBackendStatus,
	buildPasskeyBrowserStatus,
	buildPasskeyFrontendStatus,
	buildSessionAuthStatus,
} from "./accountSettingsUtils";
import {
	useAccountAgentPairingState,
	useAccountPasskeyState,
	useAccountProfileState,
	useAccountSessionActions,
} from "./accountSettingsHooks";

export default function AccountSettings() {
	const { user, profile, signOut, sessionAuthMethod, updateProfile } =
		useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const usesBroker = useMemo(() => agentService.usesBroker(), []);

	const profileState = useAccountProfileState({
		profile,
		user,
		updateProfile,
	});
	const sessionActions = useAccountSessionActions();
	const passkeyState = useAccountPasskeyState({ location, navigate });
	const agentPairing = useAccountAgentPairingState({
		userId: user?.id ?? null,
		usesBroker,
		location,
		navigate,
	});

	const sessionAuthStatus = buildSessionAuthStatus(sessionAuthMethod);
	const passkeyAuthStatus = buildPasskeyAuthStatus(sessionAuthMethod);
	const passkeyBrowserStatus = buildPasskeyBrowserStatus(
		passkeyState.browserPasskeySupported,
	);
	const passkeyFrontendStatus = buildPasskeyFrontendStatus(
		passkeyState.frontendPasskeyEnabled,
	);
	const passkeyBackendStatus = buildPasskeyBackendStatus(
		passkeyState.passkeyCapability,
		passkeyState.passkeyLoading,
	);
	const agentGatewayStatus = buildAgentGatewayStatus(agentPairing.agentHealthy);
	const agentPairingStatus = buildAgentPairingStatus(agentPairing.agentPaired);
	const agentModeStatus = buildAgentModeStatus(usesBroker);

	return (
		<Stack gap={4}>
			<div>
				<Text size="lg" weight="semibold">
					Account
				</Text>
				<Text size="sm" color="muted">
					Authentication, identity, and trusted device controls.
				</Text>
			</div>

			<AccountSecurityOverviewSection
				passkeyAuthStatus={passkeyAuthStatus}
				sessionAuthStatus={sessionAuthStatus}
				passkeyBrowserStatus={passkeyBrowserStatus}
				passkeyFrontendStatus={passkeyFrontendStatus}
				passkeyBackendStatus={passkeyBackendStatus}
				agentGatewayStatus={agentGatewayStatus}
				agentPairingStatus={agentPairingStatus}
				agentModeStatus={agentModeStatus}
			/>

			<AccountProfileSection
				displayName={profileState.displayName}
				accountEmail={profileState.accountEmail}
				canSaveProfile={profileState.canSaveProfile}
				isSavingProfile={profileState.isSavingProfile}
				profileSaved={profileState.profileSaved}
				profileError={profileState.profileError}
				onDisplayNameChange={profileState.setDisplayName}
				onAccountEmailChange={profileState.setAccountEmail}
				onSaveProfile={profileState.saveAccountProfile}
			/>

			<AccountAgentPairingSection
				usesBroker={usesBroker}
				agentHealthy={agentPairing.agentHealthy}
				agentPaired={agentPairing.agentPaired}
				agentLoading={agentPairing.agentLoading}
				agentPairingCode={agentPairing.agentPairingCode}
				isAgentActionBusy={agentPairing.isAgentActionBusy}
				effectiveAgentError={agentPairing.effectiveAgentError}
				agentNotice={agentPairing.agentNotice}
				agentVerificationCooldownSeconds={
					agentPairing.agentVerificationCooldownSeconds
				}
				lastAgentVerificationAction={
					agentPairing.lastAgentVerificationAction
				}
				onAgentPairingCodeChange={agentPairing.setAgentPairingCode}
				onPairAgent={agentPairing.pairAgent}
				onUnpairAgent={agentPairing.unpairAgent}
				onResendVerification={agentPairing.resendAgentVerification}
				onRefreshAgentStatus={agentPairing.refreshAgentStatus}
			/>

			<AccountSessionActionsSection
				signOut={signOut}
				onSignOutAllSessions={sessionActions.signOutAllSessions}
				isSigningOutAll={sessionActions.isSigningOutAll}
				accountActionMessage={sessionActions.accountActionMessage}
				lastSignInAt={user?.last_sign_in_at}
				userEmail={user?.email}
			/>
		</Stack>
	);
}
