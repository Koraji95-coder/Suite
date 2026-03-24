import { TransmittalBuilderApp } from "@/components/apps/transmittal-builder/TransmittalBuilderApp";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function TransmittalBuilderRoutePage() {
	useRegisterPageHeader({
		title: "Transmittal Builder",
		subtitle:
			"Generate transmittal packages from project metadata, reviewed PDFs, and contacts.",
	});

	return <TransmittalBuilderApp />;
}
