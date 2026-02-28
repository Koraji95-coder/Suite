import { useMemo, useState } from "react";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { useAuth } from "../auth/useAuth";
import {
	getDevAdminEmails,
	isDevAdminEmail,
	normalizeEmail,
} from "../lib/devAccess";

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
	const pageSubtitle =
		"Development-only command palette for npm, npx, and shell workflows. Commands are copied to clipboard for manual terminal execution.";

	const allowlist = useMemo(() => getDevAdminEmails(), []);

	const copyCommand = async (preset: CommandPreset) => {
		await navigator.clipboard.writeText(preset.command);
		setCopiedId(preset.id);
		setTimeout(() => {
			setCopiedId((current) => (current === preset.id ? null : current));
		}, 1500);
	};

	if (!import.meta.env.DEV) {
		return (
			<PageFrame title="Command Center" subtitle={pageSubtitle}>
				<FrameSection>
					<div className="text-sm [color:var(--text-muted)]">
						Command Center is disabled outside development mode.
					</div>
				</FrameSection>
			</PageFrame>
		);
	}

	if (!isAllowed) {
		return (
			<PageFrame title="Command Center" subtitle={pageSubtitle}>
				<FrameSection title="Admin access required">
					<div className="text-sm [color:var(--text-muted)]">
						Set <code>VITE_DEV_ADMIN_EMAIL</code> or{" "}
						<code>VITE_DEV_ADMIN_EMAILS</code> in your <code>.env</code> to your
						account email.
					</div>
					<div className="mt-2 text-xs [color:var(--text-muted)]">
						Current account: {userEmail || "(unknown)"}
					</div>
					{allowlist.length > 0 ? (
						<div className="mt-1 text-xs [color:var(--text-muted)]">
							Configured admin allowlist: {allowlist.join(", ")}
						</div>
					) : null}
				</FrameSection>
			</PageFrame>
		);
	}

	return (
		<PageFrame title="Command Center" subtitle={pageSubtitle}>
			<FrameSection title="Command Groups">
				<div className="grid gap-4 md:grid-cols-2">
					{COMMAND_GROUPS.map((group) => (
						<section
							key={group.title}
							className="rounded-xl border p-4 [border-color:var(--border)] [background:var(--bg-mid)]"
						>
							<h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
							<div className="space-y-3">
								{group.presets.map((preset) => (
									<div
										key={preset.id}
										className="rounded-xl border p-3 [border-color:var(--border)] [background:var(--surface-2)]"
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<div className="text-sm font-medium">{preset.name}</div>
												<p className="mt-1 text-xs [color:var(--text-muted)]">
													{preset.description}
												</p>
											</div>
											<button
												type="button"
												onClick={() => void copyCommand(preset)}
												className="rounded-md border px-3 py-1.5 text-xs transition hover:[background:var(--surface)] [border-color:var(--border)] [color:var(--text)]"
											>
												{copiedId === preset.id ? "Copied" : "Copy"}
											</button>
										</div>
										<pre className="mt-2 overflow-x-auto rounded-md border p-2 text-xs [border-color:var(--border)] [background:var(--bg-heavy)] [color:var(--accent)]">
											{preset.command}
										</pre>
									</div>
								))}
							</div>
						</section>
					))}
				</div>
			</FrameSection>
		</PageFrame>
	);
}
