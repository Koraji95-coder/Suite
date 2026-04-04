import { AutoDraftStudioApp } from "@/features/autodraft-studio/ui/AutoDraftStudioApp";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
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
