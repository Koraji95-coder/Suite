import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/apps/ui/button";
import { Input } from "@/components/apps/ui/input";
import { Surface } from "@/components/apps/ui/Surface";
import { hexToRgba, useTheme } from "@/lib/palette";

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
	const { palette } = useTheme();
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
		<Surface
			className="p-5 space-y-3"
			style={{
				border: `1px solid ${hexToRgba(
					invalid ? palette.accent : palette.primary,
					invalid ? 0.45 : 0.14,
				)}`,
			}}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<div
						className="text-sm font-semibold"
						style={{ color: hexToRgba(palette.text, 0.82) }}
					>
						{label}
					</div>
					{helpText ? (
						<div
							className="text-xs"
							style={{ color: hexToRgba(palette.textMuted, 0.9) }}
						>
							{helpText}
						</div>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{action ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={action.onClick}
							disabled={action.disabled}
						>
							{action.label}
						</Button>
					) : null}
					{files.length > 0 ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClear}
						>
							Clear
						</Button>
					) : null}
				</div>
			</div>
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
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
			<div
				className="text-xs"
				style={{ color: hexToRgba(palette.textMuted, 0.9) }}
			>
				{previewLabel}
			</div>
		</Surface>
	);
}
