import { Settings as SettingsIcon } from "lucide-react";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Heading, Text } from "@/components/primitives/Text";
import AccountSettings from "./AccountSettings";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
	return (
		<PageFrame maxWidth="full">
			<div className={styles.root}>
				<div className={styles.header}>
					<HStack gap={3} align="center" className={styles.headerRow}>
						<div className={styles.headerIcon}>
							<SettingsIcon size={20} />
						</div>
						<div>
							<Heading level={1}>Settings</Heading>
							<Text size="sm" color="muted">
								Account and security controls for your workspace.
							</Text>
						</div>
					</HStack>
				</div>

				<Stack gap={4}>
					<AccountSettings />
				</Stack>
			</div>
		</PageFrame>
	);
}
