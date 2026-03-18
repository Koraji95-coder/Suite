import { Check, X } from "lucide-react";
import { useId } from "react";
import type { CSSProperties } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import type {
	PlacementSuggestion,
	SuggestionCoords,
} from "./GridManualEditorModels";
import styles from "./GridManualEditorSuggestionDialog.module.css";

interface GridManualEditorSuggestionDialogProps {
	suggestion: PlacementSuggestion | null;
	suggestionCoords: SuggestionCoords;
	mutedTextColor: string;
	inputStyle: CSSProperties;
	btnStyle: (active: boolean) => CSSProperties;
	onSuggestionCoordsChange: (next: SuggestionCoords) => void;
	onCancel: () => void;
	onConfirm: () => void;
}

export function GridManualEditorSuggestionDialog({
	suggestion,
	suggestionCoords,
	mutedTextColor,
	inputStyle,
	btnStyle,
	onSuggestionCoordsChange,
	onCancel,
	onConfirm,
}: GridManualEditorSuggestionDialogProps) {
	const descriptionId = useId();
	const updateCoords = (partial: Partial<SuggestionCoords>) => {
		onSuggestionCoordsChange({ ...suggestionCoords, ...partial });
	};

	return (
		<Dialog
			open={Boolean(suggestion)}
			onOpenChange={(open) => !open && onCancel()}
		>
			<DialogContent
				className={styles.content}
				aria-describedby={`${descriptionId}-description`}
			>
				<DialogHeader>
					<DialogTitle>
						{suggestion?.type === "add-rod"
							? "Place Rod"
							: suggestion?.type === "add-conductor"
								? "Place Conductor"
								: suggestion?.type === "add-tee"
									? "Place Tee"
							: "Place Cross"}
					</DialogTitle>
					<DialogDescription id={`${descriptionId}-description`}>
						Enter the coordinates or endpoints for the suggested geometry and confirm.
					</DialogDescription>
				</DialogHeader>
				<div className={styles.fieldColumn}>
					<div className={styles.fieldRow}>
						<label
							htmlFor="grid-suggestion-x1"
							className={styles.fieldLabel}
							style={{ color: mutedTextColor }}
						>
							{suggestion?.type === "add-conductor" ? "X1" : "X"}
						</label>
						<input
							className={styles.fieldInput}
							id="grid-suggestion-x1"
							name="grid_suggestion_x1"
							value={suggestionCoords.x}
							onChange={(e) => updateCoords({ x: e.target.value })}
							style={inputStyle}
							autoFocus
						/>
					</div>
					<div className={styles.fieldRow}>
						<label
							htmlFor="grid-suggestion-y1"
							className={styles.fieldLabel}
							style={{ color: mutedTextColor }}
						>
							{suggestion?.type === "add-conductor" ? "Y1" : "Y"}
						</label>
						<input
							className={styles.fieldInput}
							id="grid-suggestion-y1"
							name="grid_suggestion_y1"
							value={suggestionCoords.y}
							onChange={(e) => updateCoords({ y: e.target.value })}
							style={inputStyle}
						/>
					</div>
					{suggestion?.type === "add-conductor" && (
						<>
							<div className={styles.fieldRow}>
								<label
									htmlFor="grid-suggestion-x2"
									className={styles.fieldLabel}
									style={{ color: mutedTextColor }}
								>
									X2
								</label>
								<input
									className={styles.fieldInput}
									id="grid-suggestion-x2"
									name="grid_suggestion_x2"
									value={suggestionCoords.endX}
									onChange={(e) => updateCoords({ endX: e.target.value })}
									style={inputStyle}
								/>
							</div>
							<div className={styles.fieldRow}>
								<label
									htmlFor="grid-suggestion-y2"
									className={styles.fieldLabel}
									style={{ color: mutedTextColor }}
								>
									Y2
								</label>
								<input
									className={styles.fieldInput}
									id="grid-suggestion-y2"
									name="grid_suggestion_y2"
									value={suggestionCoords.endY}
									onChange={(e) => updateCoords({ endY: e.target.value })}
									style={inputStyle}
								/>
							</div>
						</>
					)}
				</div>
				<DialogFooter className={styles.footer}>
					<button
						onClick={onCancel}
						style={{ ...btnStyle(false), justifyContent: "center" }}
					>
						<X size={12} /> Cancel
					</button>
					<button
						onClick={onConfirm}
						style={{ ...btnStyle(true), justifyContent: "center" }}
					>
						<Check size={12} /> Confirm
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
