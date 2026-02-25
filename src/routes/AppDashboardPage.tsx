import { DashboardOverviewPanel } from "@/components/apps/dashboard/DashboardOverviewPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";

export default function AppDashboardPage() {
	return (
		<PageFrame
			title="Dashboard"
			subtitle="Your workspace overview, tasks, and deadlines."
			hideHeader
		>
			<DashboardOverviewPanel />
		</PageFrame>
	);
}
