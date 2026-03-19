import {
	LoginForm,
	LoginPageFrame,
	LoginSentState,
	LoginSessionState,
} from "./login/LoginPageSections";
import { useLoginController } from "./login/useLoginController";

export default function LoginPage() {
	const controller = useLoginController();
	const showSessionCard = controller.loading || Boolean(controller.user);

	if (showSessionCard) {
		const redirecting = Boolean(controller.user && !controller.loading);
		return (
			<LoginPageFrame>
				<LoginSessionState
					redirecting={redirecting}
					redirectMessage={controller.redirectMessage}
					redirectProgress={controller.redirectProgress}
					shouldPreloadDashboard={controller.shouldPreloadDashboard}
				/>
			</LoginPageFrame>
		);
	}

	if (controller.sent) {
		return (
			<LoginPageFrame>
				<LoginSentState
					email={controller.email}
					onSendAnother={controller.resetSent}
				/>
			</LoginPageFrame>
		);
	}

	return (
		<LoginPageFrame>
			<LoginForm
				email={controller.email}
				onEmailChange={controller.setEmail}
				captchaToken={controller.captchaToken}
				onCaptchaTokenChange={controller.setCaptchaToken}
				honeypot={controller.honeypot}
				honeypotFieldName={controller.honeypotFieldName}
				onHoneypotChange={controller.setHoneypot}
				submitting={controller.submitting}
				passkeySubmitting={controller.passkeySubmitting}
				passkeyAvailable={controller.passkeyAvailable}
				canSubmit={controller.canSubmit}
				error={controller.error}
				onPasskeySignIn={controller.onPasskeySignIn}
				onSubmit={controller.onSubmit}
			/>
		</LoginPageFrame>
	);
}
