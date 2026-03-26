import { useSearchParams } from "react-router-dom";
import { TransmittalBuilderApp } from "@/components/apps/transmittal-builder/TransmittalBuilderApp";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";

export default function TransmittalBuilderRoutePage() {
	const [searchParams] = useSearchParams();
	const preferredProjectId = searchParams.get("project") || undefined;
	const preferredIssueSetId = searchParams.get("issueSet") || undefined;

	useRegisterPageHeader({
		title: "Transmittal Builder",
		subtitle:
			"Generate transmittal packages from project metadata, reviewed PDFs, and contacts.",
	});

	return (
		<TransmittalBuilderApp
			preferredProjectId={preferredProjectId}
			preferredIssueSetId={preferredIssueSetId}
		/>
	);
}
