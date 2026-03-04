import { Trash2 } from "lucide-react";
import { DialogFooter } from "@/components/apps/ui/dialog";
import { Button } from "@/components/primitives/Button";

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
		<DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
			{eventId ? (
				<Button
					variant="outline"
					size="sm"
					iconOnly
					iconLeft={<Trash2 className="h-4 w-4" aria-hidden="true" />}
					onClick={onDelete}
					aria-label="Delete event"
					className="self-start"
				/>
			) : null}
			<div className="flex w-full flex-1 justify-end gap-2">
				<Button variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button onClick={onSave}>Save</Button>
			</div>
		</DialogFooter>
	);
}
