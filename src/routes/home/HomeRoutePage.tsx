import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import { HomeWorkspace } from "@/features/home/HomeWorkspace";

export default function HomeRoutePage() {
	useRegisterPageHeader({
		title: "Home",
		subtitle:
			"Calm suite board for current work, released product families, and restrained trust signals.",
	});

	return (
		<PageFrame maxWidth="full">
			<HomeWorkspace />
		</PageFrame>
	);
}
