import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/apps/ui/button";
import { Input } from "@/components/apps/ui/input";
import { FrameSection } from "@/components/apps/ui/PageFrame";
import { Surface } from "@/components/apps/ui/Surface";
import { cn } from "@/lib/utils";
import type { Contact, DraftState } from "./transmittalBuilderModels";

const TransmittalSection = FrameSection;

interface TransmittalBuilderContactsSectionProps {
	draft: DraftState;
	isInvalid: (key: string) => boolean;
	handleContactChange: (
		id: string,
		field: keyof Contact,
		value: string,
	) => void;
	removeContact: (id: string) => void;
	addContact: () => void;
}

export function TransmittalBuilderContactsSection({
	draft,
	isInvalid,
	handleContactChange,
	removeContact,
	addContact,
}: TransmittalBuilderContactsSectionProps) {
	return (
		<TransmittalSection title="To - Contacts">
			<div className="grid gap-3 px-2 sm:px-3">
				{draft.contacts.map((contact) => (
					<Surface
						key={contact.id}
						className={cn(
							"space-y-3 p-4",
							isInvalid("contacts") && "[border-color:var(--danger)]",
						)}
					>
						<div className="grid gap-2 sm:grid-cols-4">
							<Input
								value={contact.name}
								onChange={(event) =>
									handleContactChange(contact.id, "name", event.target.value)
								}
								placeholder="Name"
							/>
							<Input
								value={contact.company}
								onChange={(event) =>
									handleContactChange(contact.id, "company", event.target.value)
								}
								placeholder="Company"
							/>
							<Input
								value={contact.email}
								onChange={(event) =>
									handleContactChange(contact.id, "email", event.target.value)
								}
								placeholder="Email"
							/>
							<Input
								value={contact.phone}
								onChange={(event) =>
									handleContactChange(contact.id, "phone", event.target.value)
								}
								placeholder="Phone"
							/>
						</div>
						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => removeContact(contact.id)}
								disabled={draft.contacts.length <= 1}
							>
								<Trash2 size={14} />
								Remove
							</Button>
						</div>
					</Surface>
				))}
				<Button type="button" variant="outline" onClick={addContact}>
					<Plus size={16} />
					Add contact
				</Button>
			</div>
		</TransmittalSection>
	);
}
