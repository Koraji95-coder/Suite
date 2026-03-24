// src/routes/app/AppDashboardPage.tsx
import { DashboardOverviewPanel } from "@/components/apps/dashboard/DashboardOverviewPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function AppDashboardPage() {
	useRegisterPageHeader({
		title: "Dashboard",
		subtitle:
			"Cross-system command center for operations, architecture, and memory.",
	});

	return (
		<PageFrame maxWidth="full">
			<DashboardOverviewPanel />
		</PageFrame>
	);
}
