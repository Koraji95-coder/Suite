import { BlockLibrary } from "@/features/block-library/ui/BlockLibrary";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";

export default function BlockLibraryRoutePage() {
	useRegisterPageHeader({
		title: "Block Library",
		subtitle: "Manage your CAD block collection.",
	});

	return <BlockLibrary />;
}
