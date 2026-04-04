import { Trash2 } from "lucide-react";
import { DialogFooter } from "@/components/system/dialog";
import { Button } from "@/components/system/base/Button";
import styles from "./EventDialogFooter.module.css";

interface EventDialogFooterProps {
	eventId: string | undefined;
	onDelete: () => void;
	onCancel: () => void;
	onSave: () => void;
}

export function EventDialogFooter({
	eventId,
	onDelete,
	onCancel,
	onSave,
}: EventDialogFooterProps) {
	return (
		<DialogFooter className={styles.root}>
			{eventId ? (
				<Button
					variant="outline"
					size="sm"
					iconOnly
					iconLeft={<Trash2 className={styles.deleteIcon} aria-hidden="true" />}
					onClick={onDelete}
					aria-label="Delete event"
					className={styles.deleteButton}
				/>
			) : null}
			<div className={styles.actions}>
				<Button variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button onClick={onSave}>Save</Button>
			</div>
		</DialogFooter>
	);
}
