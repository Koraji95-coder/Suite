// src/routes/app/settings/EmailConfig.tsx
import yaml from "js-yaml";
import { FileCode, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { APP_NAME } from "@/app";

const STORAGE_KEY = "app-email-config-yaml";
const APP_SLUG = APP_NAME.toLowerCase().replace(/\s+/g, "");

type EmailConfigState = {
	smtp: {
		host: string;
		port: number;
		secure: boolean;
		auth: {
			user: string;
		};
	};
	defaults: {
		from: string;
		replyTo: string;
		subject_prefix: string;
	};
	notifications: {
		project_updates: boolean;
		task_reminders: boolean;
		calendar_alerts: boolean;
	};
	templates?: Record<string, unknown>;
};

const DEFAULT_CONFIG: EmailConfigState = {
	smtp: {
		host: "",
		port: 587,
		secure: false,
		auth: { user: "" },
	},
	defaults: {
		from: "",
		replyTo: "",
		subject_prefix: `[${APP_NAME}]`,
	},
	notifications: {
		project_updates: true,
		task_reminders: true,
		calendar_alerts: true,
	},
	templates: {
		welcome_email: {
			subject: `Welcome to ${APP_NAME}`,
			body: "Hi {{name}}, welcome aboard!",
		},
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(v: unknown, fallback = ""): string {
	return typeof v === "string" ? v : fallback;
}

function getNumber(v: unknown, fallback: number): number {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function getBoolean(v: unknown, fallback: boolean): boolean {
	return typeof v === "boolean" ? v : fallback;
}

function sanitizeConfig(value: unknown): EmailConfigState {
	const root = isRecord(value) ? value : {};

	const smtp = isRecord(root.smtp) ? root.smtp : {};
	const smtpAuth = isRecord(smtp.auth) ? smtp.auth : {};

	// Drop any pasted password field by simply not reading it.
	const safe: EmailConfigState = {
		smtp: {
			host: getString(smtp.host, DEFAULT_CONFIG.smtp.host),
			port:
				getNumber(smtp.port, DEFAULT_CONFIG.smtp.port) ||
				DEFAULT_CONFIG.smtp.port,
			secure: getBoolean(smtp.secure, DEFAULT_CONFIG.smtp.secure),
			auth: {
				user: getString(smtpAuth.user, DEFAULT_CONFIG.smtp.auth.user),
			},
		},
		defaults: (() => {
			const d = isRecord(root.defaults) ? root.defaults : {};
			return {
				from: getString(d.from, DEFAULT_CONFIG.defaults.from),
				replyTo: getString(d.replyTo, DEFAULT_CONFIG.defaults.replyTo),
				subject_prefix: getString(
					d.subject_prefix,
					DEFAULT_CONFIG.defaults.subject_prefix,
				),
			};
		})(),
		notifications: (() => {
			const n = isRecord(root.notifications) ? root.notifications : {};
			return {
				project_updates: getBoolean(
					n.project_updates,
					DEFAULT_CONFIG.notifications.project_updates,
				),
				task_reminders: getBoolean(
					n.task_reminders,
					DEFAULT_CONFIG.notifications.task_reminders,
				),
				calendar_alerts: getBoolean(
					n.calendar_alerts,
					DEFAULT_CONFIG.notifications.calendar_alerts,
				),
			};
		})(),
		templates: (() => {
			const t = root.templates;
			return isRecord(t) ? t : DEFAULT_CONFIG.templates;
		})(),
	};

	return safe;
}

function dumpYaml(config: EmailConfigState): string {
	return yaml.dump(config, { indent: 2, lineWidth: 80, noRefs: true });
}

function loadYaml(): { config: EmailConfigState; yamlText: string } {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) {
			return { config: DEFAULT_CONFIG, yamlText: dumpYaml(DEFAULT_CONFIG) };
		}
		const parsed = yaml.load(stored);
		const safe = sanitizeConfig(parsed);
		return { config: safe, yamlText: dumpYaml(safe) };
	} catch {
		return { config: DEFAULT_CONFIG, yamlText: dumpYaml(DEFAULT_CONFIG) };
	}
}

export default function EmailConfig() {
	const initial = useMemo(() => loadYaml(), []);
	const [config, setConfig] = useState<EmailConfigState>(initial.config);
	const [yamlText, setYamlText] = useState<string>(initial.yamlText);
	const [viewMode, setViewMode] = useState<"form" | "yaml">("form");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (viewMode !== "form") return;
		setYamlText(dumpYaml(config));
	}, [config, viewMode]);

	const handleSave = () => {
		setError("");
		try {
			if (viewMode === "yaml") {
				const parsed = yaml.load(yamlText);
				const safe = sanitizeConfig(parsed);
				const normalized = dumpYaml(safe);

				setConfig(safe);
				setYamlText(normalized);
				localStorage.setItem(STORAGE_KEY, normalized);
			} else {
				const normalized = dumpYaml(config);
				localStorage.setItem(STORAGE_KEY, normalized);
			}

			setSaved(true);
			window.setTimeout(() => setSaved(false), 1500);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to save config");
		}
	};

	return (
		<div className="grid gap-3">
			<h3 className="text-lg font-semibold tracking-tight [color:var(--text)]">
				Email
				<span className="ml-2 text-sm font-normal [color:var(--text-muted)]">
					YAML config stored locally. Passwords are intentionally unsupported.
				</span>
			</h3>

			<div className="grid gap-3 rounded-2xl border p-4 [border-color:var(--border)] [background:var(--surface)]">
				<div className="flex items-start gap-2">
					<FileCode size={16} />
					<div>
						<div className="text-sm font-semibold [color:var(--text)]">
							Email configuration
						</div>
						<div className="text-xs [color:var(--text-muted)]">
							Form edits basics; YAML edits templates too.
						</div>
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className={`inline-flex items-center justify-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
							viewMode === "form"
								? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]"
								: "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:var(--surface-2)] hover:[color:var(--text)]"
						}`}
						onClick={() => setViewMode("form")}
					>
						Form
					</button>
					<button
						type="button"
						className={`inline-flex items-center justify-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
							viewMode === "yaml"
								? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_18%,transparent)] [color:var(--text)]"
								: "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[background:var(--surface-2)] hover:[color:var(--text)]"
						}`}
						onClick={() => setViewMode("yaml")}
					>
						YAML
					</button>
				</div>

				{viewMode === "form" ? (
					<div className="grid gap-3 md:grid-cols-2">
						<div>
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="smtp-host"
							>
								SMTP Host
							</label>
							<input
								id="smtp-host"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								value={config.smtp.host}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, host: e.target.value },
									}))
								}
								placeholder="smtp.example.com"
							/>
						</div>

						<div>
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="smtp-port"
							>
								SMTP Port
							</label>
							<input
								id="smtp-port"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								type="number"
								value={config.smtp.port}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, port: Number(e.target.value) || 587 },
									}))
								}
							/>
						</div>

						<div>
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="smtp-user"
							>
								SMTP Username
							</label>
							<input
								id="smtp-user"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								value={config.smtp.auth.user}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, auth: { user: e.target.value } },
									}))
								}
								placeholder="user@example.com"
							/>
						</div>

						<div>
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="smtp-secure"
							>
								SMTP Secure
							</label>
							<select
								id="smtp-secure"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								value={config.smtp.secure ? "true" : "false"}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, secure: e.target.value === "true" },
									}))
								}
							>
								<option value="false">false</option>
								<option value="true">true</option>
							</select>
						</div>

						<div>
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="from"
							>
								From
							</label>
							<input
								id="from"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								value={config.defaults.from}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										defaults: { ...c.defaults, from: e.target.value },
									}))
								}
								placeholder={`noreply@${APP_SLUG}.com`}
							/>
						</div>

						<div>
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="replyto"
							>
								Reply-To
							</label>
							<input
								id="replyto"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								value={config.defaults.replyTo}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										defaults: { ...c.defaults, replyTo: e.target.value },
									}))
								}
								placeholder={`support@${APP_SLUG}.com`}
							/>
						</div>

						<div className="md:col-span-2">
							<label
								className="mb-1.5 block text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]"
								htmlFor="subj"
							>
								Subject Prefix
							</label>
							<input
								id="subj"
								className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
								value={config.defaults.subject_prefix}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										defaults: { ...c.defaults, subject_prefix: e.target.value },
									}))
								}
							/>
						</div>

						<div className="text-xs [color:var(--text-muted)] md:col-span-2">
							Templates live in YAML mode under <code>templates:</code>.
						</div>
					</div>
				) : (
					<textarea
						className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
						value={yamlText}
						onChange={(e) => setYamlText(e.target.value)}
						style={{
							minHeight: 340,
							fontFamily:
								"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
							lineHeight: 1.6,
						}}
					/>
				)}

				{error ? (
					<div className="rounded-xl border px-3 py-2 text-sm [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]">
						{error}
					</div>
				) : null}

				<button
					type="button"
					className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition [background:var(--primary)] [color:var(--primary-contrast)]"
					onClick={handleSave}
				>
					<Save size={14} />
					{saved ? "Saved" : "Save"}
				</button>
			</div>
		</div>
	);
}
