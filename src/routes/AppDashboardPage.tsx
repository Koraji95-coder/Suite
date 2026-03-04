// src/routes/app/AppDashboardPage.tsx
import { DashboardOverviewPanel } from "@/components/apps/dashboard/DashboardOverviewPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function AppDashboardPage() {
	return (
		<PageFrame maxWidth="full">
			<DashboardOverviewPanel />
		</PageFrame>
	);
}
