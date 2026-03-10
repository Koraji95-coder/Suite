// src/routes/app/settings/EmailConfig.tsx
import yaml from "js-yaml";
import { FileCode, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { APP_NAME } from "@/appMeta";
import { cn } from "@/lib/utils";
import styles from "./EmailConfig.module.css";

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
		<div className={styles.root}>
			<h3 className={styles.title}>
				Email
				<span className={styles.titleNote}>
					YAML config stored locally. Passwords are intentionally unsupported.
				</span>
			</h3>

			<div className={styles.panel}>
				<div className={styles.introRow}>
					<FileCode size={16} />
					<div>
						<div className={styles.introTitle}>Email configuration</div>
						<div className={styles.introCopy}>
							Form edits basics; YAML edits templates too.
						</div>
					</div>
				</div>

				<div className={styles.modeRow}>
					<button
						type="button"
						className={cn(
							styles.modeButton,
							viewMode === "form"
								? styles.modeButtonActive
								: styles.modeButtonInactive,
						)}
						onClick={() => setViewMode("form")}
					>
						Form
					</button>
					<button
						type="button"
						className={cn(
							styles.modeButton,
							viewMode === "yaml"
								? styles.modeButtonActive
								: styles.modeButtonInactive,
						)}
						onClick={() => setViewMode("yaml")}
					>
						YAML
					</button>
				</div>

				{viewMode === "form" ? (
					<div className={styles.formGrid}>
						<div className={styles.field}>
							<label className={styles.label} htmlFor="smtp-host">
								SMTP Host
							</label>
							<input
								id="smtp-host"
								className={styles.input}
								value={config.smtp.host}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, host: e.target.value },
									}))
								}
								placeholder="smtp.example.com"
							name="smtp-host"
							/>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="smtp-port">
								SMTP Port
							</label>
							<input
								id="smtp-port"
								className={styles.input}
								type="number"
								value={config.smtp.port}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, port: Number(e.target.value) || 587 },
									}))
								}
							name="smtp-port"
							/>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="smtp-user">
								SMTP Username
							</label>
							<input
								id="smtp-user"
								className={styles.input}
								value={config.smtp.auth.user}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, auth: { user: e.target.value } },
									}))
								}
								placeholder="user@example.com"
							name="smtp-user"
							/>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="smtp-secure">
								SMTP Secure
							</label>
							<select
								id="smtp-secure"
								className={styles.select}
								value={config.smtp.secure ? "true" : "false"}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										smtp: { ...c.smtp, secure: e.target.value === "true" },
									}))
								}
							 name="smtp-secure">
								<option value="false">false</option>
								<option value="true">true</option>
							</select>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="from">
								From
							</label>
							<input
								id="from"
								className={styles.input}
								value={config.defaults.from}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										defaults: { ...c.defaults, from: e.target.value },
									}))
								}
								placeholder={`noreply@${APP_SLUG}.com`}
							name="from"
							/>
						</div>

						<div className={styles.field}>
							<label className={styles.label} htmlFor="replyto">
								Reply-To
							</label>
							<input
								id="replyto"
								className={styles.input}
								value={config.defaults.replyTo}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										defaults: { ...c.defaults, replyTo: e.target.value },
									}))
								}
								placeholder={`support@${APP_SLUG}.com`}
							name="replyto"
							/>
						</div>

						<div className={cn(styles.field, styles.fieldFull)}>
							<label className={styles.label} htmlFor="subj">
								Subject Prefix
							</label>
							<input
								id="subj"
								className={styles.input}
								value={config.defaults.subject_prefix}
								onChange={(e) =>
									setConfig((c) => ({
										...c,
										defaults: { ...c.defaults, subject_prefix: e.target.value },
									}))
								}
							name="subj"
							/>
						</div>

						<div className={styles.templatesHint}>
							Templates live in YAML mode under <code>templates:</code>.
						</div>
					</div>
				) : (
					<textarea
						className={styles.textarea}
						value={yamlText}
						onChange={(e) => setYamlText(e.target.value)}
					name="emailconfig_textarea_365"
					/>
				)}

				{error ? <div className={styles.error}>{error}</div> : null}

				<button
					type="button"
					className={styles.saveButton}
					onClick={handleSave}
				>
					<Save className={styles.saveIcon} />
					{saved ? "Saved" : "Save"}
				</button>
			</div>
		</div>
	);
}
