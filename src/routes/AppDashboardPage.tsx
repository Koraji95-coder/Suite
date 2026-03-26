import { DashboardOverviewPanel } from "@/components/apps/dashboard/DashboardOverviewPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function AppDashboardPage() {
	useRegisterPageHeader({
		title: "Dashboard",
		subtitle:
			"Mission board for package readiness, drawing activity, and upcoming delivery timing.",
	});

	return (
		<PageFrame maxWidth="full">
			<DashboardOverviewPanel />
		</PageFrame>
	);
}
