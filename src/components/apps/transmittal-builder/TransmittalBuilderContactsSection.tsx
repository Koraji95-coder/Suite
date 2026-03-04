import { Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/apps/ui/PageFrame";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { cn } from "@/lib/utils";
import styles from "./TransmittalBuilderContactsSection.module.css";
import type { Contact, DraftState } from "./transmittalBuilderModels";

const TransmittalSection = Section;

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
			<div className={styles.root}>
				{draft.contacts.map((contact) => (
					<Panel
						key={contact.id}
						variant="inset"
						padding="md"
						className={cn(
							styles.contactPanel,
							isInvalid("contacts") && styles.contactPanelInvalid,
						)}
					>
						<div className={styles.fields}>
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
						<div className={styles.actionsRow}>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								iconLeft={<Trash2 size={14} />}
								onClick={() => removeContact(contact.id)}
								disabled={draft.contacts.length <= 1}
							>
								Remove
							</Button>
						</div>
					</Panel>
				))}
				<Button
					type="button"
					variant="outline"
					className={styles.addButton}
					onClick={addContact}
					iconLeft={<Plus size={16} />}
				>
					Add contact
				</Button>
			</div>
		</TransmittalSection>
	);
}
