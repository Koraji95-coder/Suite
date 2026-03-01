export type MilestoneStatus =
	| "completed"
	| "in-progress"
	| "planned"
	| "future";

export type MilestoneCategory =
	| "core"
	| "apps"
	| "ai"
	| "infrastructure"
	| "enterprise"
	| "platform";

export interface Milestone {
	title: string;
	description: string;
	status: MilestoneStatus;
	category: MilestoneCategory;
}

export interface Quarter {
	id: string;
	label: string;
	period: string;
	theme: string;
	summary: string;
	milestones: Milestone[];
}

export const STATUS_META: Record<
	MilestoneStatus,
	{ label: string; color: string; bg: string }
> = {
	completed: {
		label: "Shipped",
		color: "var(--success)",
		bg: "color-mix(in oklab, var(--success) 12%, transparent)",
	},
	"in-progress": {
		label: "In Progress",
		color: "var(--primary)",
		bg: "color-mix(in oklab, var(--primary) 12%, transparent)",
	},
	planned: {
		label: "Planned",
		color: "var(--accent)",
		bg: "color-mix(in oklab, var(--accent) 12%, transparent)",
	},
	future: {
		label: "Future",
		color: "var(--text-muted)",
		bg: "color-mix(in oklab, var(--text-muted) 8%, transparent)",
	},
};

export const CATEGORY_META: Record<MilestoneCategory, { label: string }> = {
	core: { label: "Core Platform" },
	apps: { label: "Engineering Apps" },
	ai: { label: "AI & Agent" },
	infrastructure: { label: "Infrastructure" },
	enterprise: { label: "Enterprise" },
	platform: { label: "Platform" },
};

export const ROADMAP_QUARTERS: Quarter[] = [
	{
		id: "q1-2026",
		label: "Q1 2026",
		period: "January -- March 2026",
		theme: "Foundation Launch",
		summary:
			"Suite v3.0 ships with the core engineering workspace: project management, AutoCAD-integrated ground grid tooling, transmittal generation, drawing list management, and the Koro Agent gateway.",
		milestones: [
			{
				title: "Project Manager with full lifecycle",
				description:
					"Complete CRUD for projects and tasks, drag-and-drop reordering, file uploads to Supabase Storage, Markdown export, and per-project calendar views.",
				status: "completed",
				category: "core",
			},
			{
				title: "Ground Grid Generator + Coordinates Grabber",
				description:
					"Live WebSocket connection to AutoCAD COM backend. Extract polyline/block coordinates from drawings, configure grid layouts, export to Excel.",
				status: "completed",
				category: "apps",
			},
			{
				title: "Transmittal Builder",
				description:
					"Assemble engineering transmittal packages with contacts, document lists, PE profiles, and configurable options. Output DOCX and PDF formats.",
				status: "completed",
				category: "apps",
			},
			{
				title: "Drawing List Manager",
				description:
					"Parse, validate, and export structured drawing lists from DWG/PDF folders. Naming convention enforcement, auto-renumbering, and Excel export.",
				status: "completed",
				category: "apps",
			},
			{
				title: "Calendar with event management",
				description:
					"Month, week, day, and agenda views with drag-and-drop scheduling, event categories (deadline, milestone, reminder), urgency color coding, and project linking.",
				status: "completed",
				category: "core",
			},
			{
				title: "Koro Agent pairing via ZeroClaw",
				description:
					"6-digit pairing code flow, direct and brokered transport modes, task execution console, agent health monitoring, and predefined task templates.",
				status: "completed",
				category: "ai",
			},
			{
				title: "Whiteboard with persistence",
				description:
					"Freehand drawing canvas with pen, eraser, shapes, and text tools. Save to Supabase with title and tags, export as PNG.",
				status: "completed",
				category: "apps",
			},
			{
				title: "Dashboard and workspace shell",
				description:
					"Overview panel with project stats, calendar widget, recent activity feed, recent files, and upcoming deadlines. Five-theme color system.",
				status: "completed",
				category: "core",
			},
			{
				title: "Auth system with profiles and RLS",
				description:
					"Supabase email/password auth, user profiles, display name management, session handling, security event logging, and row-level security across all tables.",
				status: "completed",
				category: "infrastructure",
			},
			{
				title: "Graph Explorer",
				description:
					"Interactive 2D node-link visualization merging architecture topology with agent memory. Search, filter by source, and inspect node details.",
				status: "completed",
				category: "apps",
			},
		],
	},
	{
		id: "q2-2026",
		label: "Q2 2026",
		period: "April -- June 2026",
		theme: "Intelligence & Validation",
		summary:
			"Replace simulated results with real engineering validation engines, ship the Block Library, expand the math tools, and deepen the agent memory graph.",
		milestones: [
			{
				title: "Standards Checker: real NEC/IEEE/IEC validation",
				description:
					"Replace randomized pass/fail with a rule-based validation engine. Structured rulesets for NEC 210/220/250, IEEE 80/141/1584, and IEC 60909/61439/60364.",
				status: "in-progress",
				category: "apps",
			},
			{
				title: "Block Library general availability",
				description:
					"Complete Supabase Storage file upload pipeline, thumbnail generation, download flow, usage tracking, and search/filter by category and tags.",
				status: "in-progress",
				category: "apps",
			},
			{
				title: "Math Tools library launch",
				description:
					"Ship Vector Calculator, Three-Phase Calculator, Sinusoidal/Per-Unit Calculator, Symmetrical Components, and general-purpose Calculator Panel as standalone tools.",
				status: "in-progress",
				category: "apps",
			},
			{
				title: "Agent memory graph expansion",
				description:
					"Build out preference, knowledge, pattern, and relationship memory types. Visualize memory connections in the Graph Explorer with strength-based sizing.",
				status: "planned",
				category: "ai",
			},
			{
				title: "QA/QC annotation pipeline",
				description:
					"Drawing annotations with issue tracking, status workflow (pending, reviewed, approved, rejected), and per-project QA dashboards.",
				status: "planned",
				category: "apps",
			},
			{
				title: "Batch Find & Replace enhancements",
				description:
					"Extended file format support, regex group replacements, change report export to styled Excel workbooks, and session history.",
				status: "planned",
				category: "apps",
			},
		],
	},
	{
		id: "q3-2026",
		label: "Q3 2026",
		period: "July -- September 2026",
		theme: "Collaboration & Productivity",
		summary:
			"Introduce team workspaces and shared projects, bring the File Manager online with real storage, and expand agent capabilities for documentation and research.",
		milestones: [
			{
				title: "Team workspaces and shared projects",
				description:
					"Role-based access control for projects (owner, editor, viewer). Invite team members, assign tasks, and share files within a workspace.",
				status: "planned",
				category: "core",
			},
			{
				title: "Real-time whiteboard collaboration",
				description:
					"Multi-user cursors and drawing on the same whiteboard canvas. Presence indicators and conflict-free merge of drawing actions.",
				status: "planned",
				category: "apps",
			},
			{
				title: "File Manager connected to Supabase Storage",
				description:
					"Replace the static mockup with a functional file browser. Upload, download, rename, move, and delete files across project buckets.",
				status: "planned",
				category: "core",
			},
			{
				title: "Email notification system",
				description:
					"SMTP configuration in settings, project deadline alerts, task assignment notifications, and digest emails for weekly activity summaries.",
				status: "planned",
				category: "infrastructure",
			},
			{
				title: "Agent documentation and regulation analysis",
				description:
					"Koro Agent can generate calculation sheets, project reports, and analyze regulatory requirements. Research standards and return structured findings.",
				status: "planned",
				category: "ai",
			},
			{
				title: "Mobile-responsive refinement",
				description:
					"Optimize all app views for tablet and mobile breakpoints. Collapsible sidebar, touch-friendly controls, and responsive data tables.",
				status: "planned",
				category: "core",
			},
		],
	},
	{
		id: "q4-2026",
		label: "Q4 2026",
		period: "October -- December 2026",
		theme: "Automation & Workflows",
		summary:
			"Ship the automation engine for scheduled calculations and reports, upgrade the ground grid tool to IEEE 80 compliance, and launch the AI configuration panel.",
		milestones: [
			{
				title: "Automation Workflows engine",
				description:
					"Define and schedule automation workflows (calculation, integration, report, custom). Trigger on events or cron schedules, track run history and status.",
				status: "planned",
				category: "platform",
			},
			{
				title: "Drawing annotation and QA review system",
				description:
					"Full approval workflow for drawing annotations. Reviewer assignments, comment threads, issue resolution tracking, and audit trail.",
				status: "planned",
				category: "apps",
			},
			{
				title: "IEEE 80 ground grid compliance reports",
				description:
					"Automated step/touch potential calculations, soil resistivity modeling, conductor sizing validation, and generated PDF compliance reports.",
				status: "planned",
				category: "apps",
			},
			{
				title: "Agent-driven project scaffolding",
				description:
					"Koro Agent generates project structures from templates. Auto-populate task lists, drawing conventions, and standard deliverable sets based on project type.",
				status: "planned",
				category: "ai",
			},
			{
				title: "Scheduled reports and deadline reminders",
				description:
					"Automated project status reports on configurable intervals. Deadline reminders via email and in-app notification center.",
				status: "future",
				category: "infrastructure",
			},
			{
				title: "AI Configuration panel in Settings",
				description:
					"Configure model provider (OpenAI, Anthropic, Ollama), prompt system instructions, response format preferences, and token usage tracking.",
				status: "future",
				category: "ai",
			},
		],
	},
	{
		id: "q1-2027",
		label: "Q1 2027",
		period: "January -- March 2027",
		theme: "Analytics & Reporting",
		summary:
			"Launch project analytics dashboards with burndown charts, expand the formula bank, and open a developer access portal for API consumers.",
		milestones: [
			{
				title: "Project analytics dashboard",
				description:
					"Burndown charts, velocity tracking, task completion trends, and bottleneck detection across all projects with time-range filtering.",
				status: "future",
				category: "core",
			},
			{
				title: "Resource allocation and workload balancing",
				description:
					"Visualize team member workloads, identify over-allocation, and rebalance tasks. Calendar heatmap for capacity planning.",
				status: "future",
				category: "core",
			},
			{
				title: "Automated compliance report generation",
				description:
					"One-click generation of NEC, IEEE, and IEC compliance reports from project data. Structured output with findings, recommendations, and evidence references.",
				status: "future",
				category: "apps",
			},
			{
				title: "Formula Bank expansion",
				description:
					"Full engineering calculation sheets for voltage drop, short circuit, arc flash, cable sizing, transformer sizing, and motor starting analysis.",
				status: "future",
				category: "apps",
			},
			{
				title: "Circuit Generator with component library",
				description:
					"Expanded component palette, drag-and-drop schematic editor, netlist export, and integration with calculation tools for automated analysis.",
				status: "future",
				category: "apps",
			},
			{
				title: "Developer portal and API documentation",
				description:
					"Public-facing API reference with authentication guides, rate limit documentation, and example integrations for third-party tools.",
				status: "future",
				category: "platform",
			},
		],
	},
	{
		id: "q2-2027",
		label: "Q2 2027",
		period: "April -- June 2027",
		theme: "Enterprise Readiness",
		summary:
			"Prepare for enterprise adoption with SSO, organization management, audit logging, advanced permissions, and custom branding.",
		milestones: [
			{
				title: "SSO/SAML authentication",
				description:
					"Enterprise single sign-on via SAML 2.0 and OIDC. Directory sync with Azure AD, Okta, and Google Workspace.",
				status: "future",
				category: "enterprise",
			},
			{
				title: "Organization management and billing",
				description:
					"Create organizations with teams and departments. Seat-based billing, usage dashboards, and invoice management.",
				status: "future",
				category: "enterprise",
			},
			{
				title: "Audit logging and compliance trail",
				description:
					"Comprehensive event log for all user actions across the platform. Exportable audit reports for SOC 2 and ISO 27001 preparation.",
				status: "future",
				category: "enterprise",
			},
			{
				title: "Advanced role-based permissions",
				description:
					"Granular roles (viewer, editor, admin, owner) with per-resource permission overrides. Permission inheritance across team hierarchies.",
				status: "future",
				category: "enterprise",
			},
			{
				title: "Custom branding and white-label support",
				description:
					"Upload organization logos, configure brand colors, and set custom domain aliases for client-facing deployments.",
				status: "future",
				category: "enterprise",
			},
			{
				title: "Agent plugin marketplace",
				description:
					"Community-contributed tool plugins for the Koro Agent. Install, configure, and manage plugins from a curated marketplace.",
				status: "future",
				category: "ai",
			},
		],
	},
	{
		id: "q3-2027",
		label: "Q3 2027",
		period: "July -- September 2027",
		theme: "Platform Expansion",
		summary:
			"Ship the desktop application for offline access, add 3D model viewing, and introduce multi-agent coordination and document version control.",
		milestones: [
			{
				title: "Desktop application (Tauri)",
				description:
					"Native desktop app for Windows, macOS, and Linux. Offline access to projects and files, direct AutoCAD integration without COM bridge, and local agent gateway.",
				status: "future",
				category: "platform",
			},
			{
				title: "3D model viewer",
				description:
					"View substation layouts, equipment models, and cable routing in an interactive 3D viewport. Import from IFC, STEP, and DWG formats.",
				status: "future",
				category: "apps",
			},
			{
				title: "Multi-agent coordination",
				description:
					"Parallel task execution across multiple Koro Agent instances. Agent-to-agent delegation, result aggregation, and coordinated workflows.",
				status: "future",
				category: "ai",
			},
			{
				title: "Document version control",
				description:
					"Track revision history for all engineering documents and drawings. Diff views, rollback, branching for design alternatives, and approval gates.",
				status: "future",
				category: "core",
			},
			{
				title: "Template marketplace",
				description:
					"Browse and install community-shared templates for transmittals, calculation sheets, drawing lists, and project structures.",
				status: "future",
				category: "platform",
			},
			{
				title: "Advanced search across all data",
				description:
					"Full-text search spanning projects, tasks, files, drawings, calculations, and agent memory. Faceted filtering and saved search presets.",
				status: "future",
				category: "core",
			},
		],
	},
	{
		id: "q4-2027",
		label: "Q4 2027",
		period: "October -- December 2027",
		theme: "Scale & Ecosystem",
		summary:
			"Open the platform with a public API, self-hosted deployment, third-party integrations, and internationalization for global engineering teams.",
		milestones: [
			{
				title: "Public REST API and webhook system",
				description:
					"Fully documented API for all platform resources. Webhook subscriptions for events (task completed, file uploaded, deadline approaching) with retry and delivery logs.",
				status: "future",
				category: "platform",
			},
			{
				title: "Self-hosted deployment",
				description:
					"Docker Compose and Kubernetes Helm chart for on-premises deployment. Air-gapped installation support for secure government and utility environments.",
				status: "future",
				category: "infrastructure",
			},
			{
				title: "Third-party integrations",
				description:
					"Native connectors for SharePoint, BIM 360, Procore, Bluebeam, and AutoDesk Construction Cloud. Bi-directional sync for files and project data.",
				status: "future",
				category: "platform",
			},
			{
				title: "Internationalization",
				description:
					"Multi-language support starting with Spanish, French, and Portuguese. Locale-aware date/number formatting and right-to-left layout support.",
				status: "future",
				category: "core",
			},
			{
				title: "Performance optimization at scale",
				description:
					"Lazy loading, virtual scrolling, and query optimization for portfolios with 500+ projects. Background sync, edge caching, and CDN distribution.",
				status: "future",
				category: "infrastructure",
			},
			{
				title: "Community extensions SDK",
				description:
					"Published SDK for building custom apps, tools, and integrations. Extension registry, sandboxed execution, and contribution guidelines.",
				status: "future",
				category: "platform",
			},
		],
	},
];
