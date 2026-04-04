import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import AccountSettings from "./AccountSettings";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
	useRegisterPageHeader({
		title: "Settings",
		subtitle: "Account controls and workspace preferences.",
	});

	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<AccountSettings />
			</div>
		</PageFrame>
	);
}
