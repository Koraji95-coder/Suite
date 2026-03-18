import { AutoDraftStudioApp } from "@/components/apps/autodraft-studio/AutoDraftStudioApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import styles from "./AutoDraftStudioRoutePage.module.css";

export default function AutoDraftStudioRoutePage() {
	return (
		<PageFrame
			maxWidth="full"
			title="AutoDraft Studio"
			description="Markup-to-CAD command center for deterministic planning, compare review, and local learning."
			className={styles.routeFrame}
		>
			<AutoDraftStudioApp />
		</PageFrame>
	);
}
