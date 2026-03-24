import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { cn } from "@/lib/utils";
import styles from "./TransmittalBuilderFileRow.module.css";

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
			className={cn(styles.panel, invalid && styles.panelInvalid)}
		>
			<div className={styles.headerRow}>
				<div className={styles.headerInfo}>
					<div className={styles.label}>{label}</div>
					{helpText && <div className={styles.helpText}>{helpText}</div>}
				</div>
				<div className={styles.actions}>
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
			<div className={styles.pickerSurface}>
				<div className={styles.uploadHint}>
					<Upload size={14} />
					<span>Browse to attach files for this section.</span>
				</div>
				<div className={styles.browseRow}>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							if (inputRef.current) {
								inputRef.current.value = "";
								inputRef.current.click();
							}
						}}
					>
						Browse
					</Button>
					<div className={styles.preview}>{previewLabel}</div>
				</div>
			</div>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				onChange={handleChange}
				className={styles.hiddenInput}
			/>
		</Panel>
	);
}
