import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { cn } from "@/lib/utils";

interface TransmittalBuilderFileRowProps {
	label: string;
	accept: string;
	multiple?: boolean;
	files: File[];
	onFilesSelected: (files: File[]) => void;
	helpText?: string;
	invalid?: boolean;
	action?: {
		label: string;
		onClick: () => void;
		disabled?: boolean;
	};
}

export function TransmittalBuilderFileRow({
	label,
	accept,
	multiple,
	files,
	onFilesSelected,
	helpText,
	invalid,
	action,
}: TransmittalBuilderFileRowProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(event.target.files ?? []);
		onFilesSelected(selected);
	};

	const handleClear = () => {
		if (inputRef.current) inputRef.current.value = "";
		onFilesSelected([]);
	};

	const previewLabel = useMemo(() => {
		if (files.length === 0) return "No files selected";
		if (files.length <= 3) return files.map((file) => file.name).join(", ");
		const head = files
			.slice(0, 3)
			.map((file) => file.name)
			.join(", ");
		return `${head} +${files.length - 3} more`;
	}, [files]);

	return (
		<Panel
			variant="inset"
			padding="lg"
			className={cn("space-y-3", invalid && "[border-color:var(--danger)]")}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div className="text-sm font-semibold [color:var(--text)]">
						{label}
					</div>
					{helpText && (
						<div className="text-xs [color:var(--text-muted)]">{helpText}</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					{action && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={action.onClick}
							disabled={action.disabled}
						>
							{action.label}
						</Button>
					)}
					{files.length > 0 && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClear}
						>
							Clear
						</Button>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2 text-xs text-text-muted">
				<Upload size={14} />
				<span>Choose files or drag into the picker.</span>
			</div>
			<Input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				onChange={handleChange}
			/>
			<div className="text-xs [color:var(--text-muted)]">{previewLabel}</div>
		</Panel>
	);
}
