// src/routes/app/CommandCenterPage.tsx
import { Check, Copy, Lock, ShieldAlert, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Heading, Text } from "@/components/primitives/Text";
import {
	getDevAdminEmails,
	isDevAdminEmail,
	normalizeEmail,
} from "@/lib/devAccess";
import { cn } from "@/lib/utils";
import styles from "./CommandCenterPage.module.css";

type CommandPreset = {
	id: string;
	name: string;
	description: string;
	command: string;
};

type CommandGroup = {
	title: string;
	presets: CommandPreset[];
};

const COMMAND_GROUPS: CommandGroup[] = [
	{
		title: "Core Dev",
		presets: [
			{
				id: "dev",
				name: "Start Vite Dev Server",
				description: "Run frontend in development mode.",
				command: "npm run dev",
			},
			{
				id: "build",
				name: "Production Build",
				description: "Create production bundle.",
				command: "npm run build",
			},
			{
				id: "preview",
				name: "Preview Build",
				description: "Serve build output locally.",
				command: "npm run preview",
			},
		],
	},
	{
		title: "Quality",
		presets: [
			{
				id: "check",
				name: "Biome + Type Check",
				description: "Run repository validation checks.",
				command: "npm run check",
			},
			{
				id: "check-fix",
				name: "Auto-fix + Type Check",
				description: "Apply safe Biome fixes and re-check.",
				command: "npm run check:fix",
			},
			{
				id: "audit",
				name: "Dependency Audit",
				description: "Check known package vulnerabilities.",
				command: "npm run ci:audit",
			},
		],
	},
	{
		title: "Agent + Backend",
		presets: [
			{
				id: "zeroclaw",
				name: "ZeroClaw Gateway (Local)",
				description: "Start local ZeroClaw gateway service.",
				command: "./zeroclaw gateway --host 127.0.0.1 --port 3000",
			},
			{
				id: "flask",
				name: "Ground Grid Flask API",
				description: "Run Flask backend for AutoCAD workflows.",
				command: "npm run backend:coords:dev",
			},
			{
				id: "pairing",
				name: "Show Agent Health",
				description: "Validate gateway is listening.",
				command: "curl -sS http://127.0.0.1:3000/health | cat",
			},
		],
	},
	{
		title: "Npx Utilities",
		presets: [
			{
				id: "biome-check",
				name: "Biome Check",
				description: "Run Biome directly over source files.",
				command: "npx @biomejs/biome check src",
			},
			{
				id: "biome-write",
				name: "Biome Format Write",
				description: "Apply formatting and import organization.",
				command: "npx @biomejs/biome check --write src",
			},
			{
				id: "tsc",
				name: "TypeScript Check",
				description: "Run TypeScript compiler checks only.",
				command: "npx tsc --noEmit",
			},
		],
	},
];

export default function CommandCenterPage() {
	const { user } = useAuth();
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const userEmail = normalizeEmail(user?.email);
	const isAllowed = isDevAdminEmail(user?.email);
	const allowlist = useMemo(() => getDevAdminEmails(), []);

	const copyCommand = async (preset: CommandPreset) => {
		await navigator.clipboard.writeText(preset.command);
		setCopiedId(preset.id);
		setTimeout(() => {
			setCopiedId((current) => (current === preset.id ? null : current));
		}, 1500);
	};

	// Not in dev mode
	if (!import.meta.env.DEV) {
		return (
			<PageFrame maxWidth="full">
				<div className={styles.rootNarrow}>
					<PageHeader />
					<Panel variant="default" padding="lg" className={styles.topMargin}>
						<HStack gap={3} align="center">
							<div className={cn(styles.stateIcon, styles.stateIconWarning)}>
								<Lock size={20} />
							</div>
							<Stack gap={1}>
								<Text size="sm" weight="semibold">
									Development Mode Required
								</Text>
								<Text size="sm" color="muted">
									Command Center is disabled outside development mode.
								</Text>
							</Stack>
						</HStack>
					</Panel>
				</div>
			</PageFrame>
		);
	}

	// Not authorized
	if (!isAllowed) {
		return (
			<PageFrame maxWidth="full">
				<div className={styles.rootNarrow}>
					<PageHeader />
					<Panel variant="default" padding="lg" className={styles.topMargin}>
						<Stack gap={4}>
							<HStack gap={3} align="start">
								<div className={cn(styles.stateIcon, styles.stateIconDanger)}>
									<ShieldAlert size={20} />
								</div>
								<Stack gap={1}>
									<Text size="sm" weight="semibold">
										Admin Access Required
									</Text>
									<Text size="sm" color="muted">
										Set{" "}
										<code className={styles.monoCode}>
											VITE_DEV_ADMIN_EMAIL
										</code>{" "}
										or{" "}
										<code className={styles.monoCode}>
											VITE_DEV_ADMIN_EMAILS
										</code>{" "}
										in your <code className={styles.monoCode}>.env</code> to
										your account email.
									</Text>
								</Stack>
							</HStack>

							<Panel variant="inset" padding="md">
								<Stack gap={2}>
									<HStack gap={2} align="center">
										<Text size="xs" color="muted">
											Current account:
										</Text>
										<Badge variant="soft" size="sm">
											{userEmail || "(unknown)"}
										</Badge>
									</HStack>
									{allowlist.length > 0 && (
										<HStack gap={2} align="center">
											<Text size="xs" color="muted">
												Allowlist:
											</Text>
											<Text size="xs" color="muted">
												{allowlist.join(", ")}
											</Text>
										</HStack>
									)}
								</Stack>
							</Panel>
						</Stack>
					</Panel>
				</div>
			</PageFrame>
		);
	}

	// Authorized - show commands
	return (
		<PageFrame maxWidth="full">
			<div className={styles.rootWide}>
				<PageHeader />

				<div className={styles.groupsGrid}>
					{COMMAND_GROUPS.map((group) => (
						<Panel key={group.title} variant="default" padding="md">
							<Stack gap={4}>
								<HStack gap={2} align="center" className={styles.groupHead}>
									<div className={styles.groupIcon}>
										<Terminal size={14} />
									</div>
									<Text size="sm" weight="semibold">
										{group.title}
									</Text>
								</HStack>

								<Stack gap={3}>
									{group.presets.map((preset) => (
										<CommandCard
											key={preset.id}
											preset={preset}
											copied={copiedId === preset.id}
											onCopy={() => void copyCommand(preset)}
										/>
									))}
								</Stack>
							</Stack>
						</Panel>
					))}
				</div>
			</div>
		</PageFrame>
	);
}

function PageHeader() {
	return (
		<HStack gap={3} align="center" className={styles.pageHeader}>
			<div className={styles.headerIcon}>
				<Terminal size={20} />
			</div>
			<div>
				<Heading level={1}>Command Center</Heading>
				<Text size="sm" color="muted">
					Development command palette for npm, npx, and shell workflows.
				</Text>
			</div>
		</HStack>
	);
}

function CommandCard({
	preset,
	copied,
	onCopy,
}: {
	preset: CommandPreset;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<Panel variant="inset" padding="sm">
			<Stack gap={2}>
				<HStack justify="between" align="start" gap={3}>
					<Stack gap={1}>
						<Text size="sm" weight="medium">
							{preset.name}
						</Text>
						<Text size="xs" color="muted">
							{preset.description}
						</Text>
					</Stack>
					<Button
						variant={copied ? "primary" : "secondary"}
						size="sm"
						onClick={onCopy}
						iconLeft={copied ? <Check size={12} /> : <Copy size={12} />}
					>
						{copied ? "Copied" : "Copy"}
					</Button>
				</HStack>

				<pre className={styles.commandPre}>{preset.command}</pre>
			</Stack>
		</Panel>
	);
}
