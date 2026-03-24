import { BlockLibrary } from "@/components/apps/block-library/BlockLibrary";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function BlockLibraryRoutePage() {
	useRegisterPageHeader({
		title: "Block Library",
		subtitle: "Manage your CAD block collection.",
	});

	return <BlockLibrary />;
}
