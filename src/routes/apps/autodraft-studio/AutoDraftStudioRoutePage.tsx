import { AutoDraftStudioApp } from "@/components/apps/autodraft-studio/AutoDraftStudioApp";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import styles from "./AutoDraftStudioRoutePage.module.css";

export default function AutoDraftStudioRoutePage() {
	useRegisterPageHeader({
		title: "AutoDraft Studio",
		subtitle:
			"Bluebeam markup recognition and CAD action planning through a .NET-ready API pipeline.",
	});

	return (
		<PageFrame maxWidth="full" className={styles.routeFrame}>
			<AutoDraftStudioApp />
		</PageFrame>
	);
}
