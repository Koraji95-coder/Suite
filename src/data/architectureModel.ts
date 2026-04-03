import { ARCHITECTURE_SNAPSHOT } from "./architectureSnapshot.generated";

export type ArchitectureDomainId =
	| "frontend"
	| "backend"
	| "data"
	| "agent"
	| "docs";

export interface ArchitectureDomain {
	id: ArchitectureDomainId;
	label: string;
	group: string;
	summary: string;
	repoRoots: string[];
}

export interface ArchitectureModule {
	id: string;
	domainId: ArchitectureDomainId;
	label: string;
	path: string;
	summary: string;
}

export interface ArchitectureDependency {
	sourceId: string;
	targetId: string;
	weight?: number;
	kind: "calls" | "stores" | "powers" | "bridges" | "documents";
}

export interface ArchitectureFlow {
	id: string;
	title: string;
	steps: string[];
}

export interface ArchitectureFixCandidate {
	id: string;
	priority: "high" | "medium";
	title: string;
	detail: string;
	paths: string[];
}

export const ARCHITECTURE_DOMAINS: ArchitectureDomain[] = [
	{
		id: "frontend",
		label: "Frontend App",
		group: "frontend",
		summary:
			"React + Vite UI shell, route pages, app modules, and browser-side orchestration.",
		repoRoots: ["src/routes", "src/components", "src/auth", "src/services"],
	},
	{
		id: "backend",
		label: "Python Backend",
		group: "backend",
		summary:
			"Flask APIs for auth/passkeys, hosted-core workflows, and workstation-facing CAD transport boundaries.",
		repoRoots: ["backend", "dotnet/suite-cad-authoring", "dotnet/named-pipe-bridge"],
	},
	{
		id: "data",
		label: "Data Layer",
		group: "data",
		summary:
			"Supabase schema, RLS policies, and frontend data access utilities.",
		repoRoots: ["src/supabase", "supabase", "backend/supabase"],
	},
	{
		id: "agent",
		label: "Agent Platform",
		group: "agent",
		summary:
			"Suite agent UI, broker endpoints, and the Suite-native gateway boundary for brokered/direct workflows.",
		repoRoots: [
			"src/routes/agent",
			"src/services/agentService.ts",
			"scripts/suite-agent-gateway.mjs",
			"scripts/run-agent-gateway.mjs",
		],
	},
	{
		id: "docs",
		label: "Docs & Tooling",
		group: "docs",
		summary:
			"Operational docs, environment contracts, and repository quality guardrails.",
		repoRoots: ["docs", ".env.example", "scripts", "package.json"],
	},
];

const CURATED_ARCHITECTURE_MODULES: ArchitectureModule[] = [
	{
		id: "app-router",
		domainId: "frontend",
		label: "Route Orchestrator",
		path: "src/App.tsx",
		summary: "Registers public/protected routes and lazy-loaded app pages.",
	},
	{
		id: "shell-nav",
		domainId: "frontend",
		label: "App Shell",
		path: "src/routes/AppShell.tsx",
		summary: "Sidebar/topbar shell with protected navigation and layout.",
	},
	{
		id: "auth-client",
		domainId: "frontend",
		label: "Auth Client",
		path: "src/auth",
		summary: "Passwordless + passkey session handling and callback completion.",
	},
	{
		id: "feature-routes",
		domainId: "frontend",
		label: "Feature Routes",
		path: "src/routes",
		summary:
			"Page-level route modules for dashboard, projects, apps, settings.",
	},
	{
		id: "feature-components",
		domainId: "frontend",
		label: "Feature Components",
		path: "src/components/apps",
		summary:
			"Domain apps (ground grid, transmittal, drawing list, graph, standards, calendar).",
	},
	{
		id: "ui-primitives",
		domainId: "frontend",
		label: "UI Primitives",
		path: "src/components/primitives",
		summary:
			"Shared primitives (Button/Input/Text/Panel/Stack/Container) used across app modules.",
	},
	{
		id: "pageframe-system",
		domainId: "frontend",
		label: "PageFrame + Section",
		path: "src/components/apps/ui/PageFrame.tsx",
		summary:
			"Canonical page-level layout system: PageFrame for route wrapper, Section for in-page blocks.",
	},
	{
		id: "frontend-style-tokens",
		domainId: "frontend",
		label: "Frontend Style Tokens",
		path: "src/styles/tokens.css + src/styles/globals.css",
		summary:
			"CSS variable tokens, global foundations, and spacing/radius system for long-term visual consistency.",
	},
	{
		id: "global-theme-layer",
		domainId: "frontend",
		label: "Global Theme Layer",
		path: "src/theme.css",
		summary:
			"Global CSS variable and foundation layer used by app components and CSS modules.",
	},
	{
		id: "frontend-services",
		domainId: "frontend",
		label: "Service Layer",
		path: "src/services",
		summary:
			"Backend/Supabase integration clients and task service orchestration.",
	},
	{
		id: "graph-tooling",
		domainId: "frontend",
		label: "Graph Tooling",
		path: "src/components/apps/graph",
		summary: "Architecture + memory graph visualization and inspectors.",
	},
	{
		id: "api-server",
		domainId: "backend",
		label: "Flask API Server",
		path: "backend/api_server.py",
		summary:
			"Main API surface for auth, passkeys, AutoCAD integration, agent broker, and utilities.",
	},
	{
		id: "transmittal-engine",
		domainId: "backend",
		label: "Transmittal Engine",
		path: "backend/Transmittal-Builder",
		summary: "Rendering/templates for transmittal generation workflows.",
	},
	{
		id: "cad-ops",
		domainId: "backend",
		label: "CAD Operations",
		path: "backend/coordinatesgrabber.py + backend/ground-grid.py",
		summary: "AutoCAD-focused automation scripts and geometry workflows.",
	},
	{
		id: "suite-cad-host",
		domainId: "backend",
		label: "In-Process CAD Host",
		path: "dotnet/suite-cad-authoring",
		summary:
			"In-process ACADE host for project setup, title-block apply, standards review, and other native CAD actions.",
	},
	{
		id: "dotnet-bridge",
		domainId: "backend",
		label: "Remaining CAD Pipe Bridge",
		path: "backend/dotnet_bridge.py + dotnet/named-pipe-bridge",
		summary:
			"Remaining named-pipe transport for CAD flows that have not yet moved into suite-cad-authoring.",
	},
	{
		id: "supabase-client",
		domainId: "data",
		label: "Supabase Client",
		path: "src/supabase",
		summary:
			"Frontend database/storage clients, typed models, and backup utility calls.",
	},
	{
		id: "schema-sql",
		domainId: "data",
		label: "Schema Migrations",
		path: "supabase/migrations",
		summary:
			"Primary local Supabase migration chain for schema, RLS, and storage policy setup.",
	},
	{
		id: "rls-policies",
		domainId: "data",
		label: "Fallback SQL Copies",
		path: "supabase/consolidated_migration.sql + backend/supabase",
		summary:
			"Hosted SQL Editor fallback copies kept in sync with the tracked migration chain.",
	},
	{
		id: "supabase-bootstrap",
		domainId: "data",
		label: "Backend Supabase Bootstrap",
		path: "backend/supabase",
		summary:
			"Bootstrap SQL and policy setup scripts used with backend workflows.",
	},
	{
		id: "agent-ui",
		domainId: "agent",
		label: "Agent UI + Transport",
		path: "src/routes/agent + src/services/agentService.ts",
		summary:
			"Agent route plus client-side pairing/session transport (direct and brokered modes).",
	},
	{
		id: "broker-api",
		domainId: "agent",
		label: "Broker Endpoints",
		path: "backend/api_server.py (/api/agent/*)",
		summary:
			"Pairing challenge-confirm, session health/config, and webhook ingress.",
	},
	{
		id: "suite-native-gateway",
		domainId: "agent",
		label: "Suite-Native Gateway",
		path: "scripts/suite-agent-gateway.mjs",
		summary:
			"Native gateway API surface for pairing, webhook, health, model proxying, and external passkey callback bridging.",
	},
	{
		id: "gateway-launch-boundary",
		domainId: "agent",
		label: "Gateway Launch Boundary",
		path: "scripts/run-agent-gateway.mjs",
		summary:
			"Runtime launcher that defaults to the Suite-native gateway and treats any legacy gateway process as stale drift to stop.",
	},
	{
		id: "docs-hub",
		domainId: "docs",
		label: "Docs Hub",
		path: "docs",
		summary: "Operational docs, rollout notes, and security guidance.",
	},
	{
		id: "env-contracts",
		domainId: "docs",
		label: "Environment Contracts",
		path: ".env.example + docs/security/environment-and-secrets.md",
		summary:
			"Required env variables and secret boundaries for frontend/backend/agent flows.",
	},
	{
		id: "tooling-guardrails",
		domainId: "docs",
		label: "Tooling Guardrails",
		path: "package.json + scripts/guard-eslint.mjs",
		summary: "Biome-only checks, typecheck script, and linting guardrails.",
	},
];

export const ARCHITECTURE_DEPENDENCIES: ArchitectureDependency[] = [
	{ sourceId: "app-router", targetId: "shell-nav", kind: "calls", weight: 1 },
	{
		sourceId: "app-router",
		targetId: "feature-routes",
		kind: "calls",
		weight: 1,
	},
	{
		sourceId: "shell-nav",
		targetId: "feature-components",
		kind: "powers",
		weight: 0.95,
	},
	{
		sourceId: "feature-routes",
		targetId: "feature-components",
		kind: "powers",
		weight: 0.9,
	},
	{
		sourceId: "feature-components",
		targetId: "ui-primitives",
		kind: "powers",
		weight: 0.93,
	},
	{
		sourceId: "feature-routes",
		targetId: "pageframe-system",
		kind: "powers",
		weight: 0.88,
	},
	{
		sourceId: "pageframe-system",
		targetId: "ui-primitives",
		kind: "powers",
		weight: 0.86,
	},
	{
		sourceId: "ui-primitives",
		targetId: "frontend-style-tokens",
		kind: "powers",
		weight: 0.9,
	},
	{
		sourceId: "global-theme-layer",
		targetId: "feature-components",
		kind: "powers",
		weight: 0.7,
	},
	{
		sourceId: "feature-components",
		targetId: "frontend-services",
		kind: "calls",
		weight: 0.9,
	},
	{
		sourceId: "graph-tooling",
		targetId: "feature-components",
		kind: "powers",
		weight: 0.8,
	},
	{
		sourceId: "auth-client",
		targetId: "frontend-services",
		kind: "calls",
		weight: 0.78,
	},
	{
		sourceId: "auth-client",
		targetId: "api-server",
		kind: "calls",
		weight: 0.82,
	},
	{
		sourceId: "frontend-services",
		targetId: "supabase-client",
		kind: "stores",
		weight: 0.85,
	},
	{
		sourceId: "frontend-services",
		targetId: "api-server",
		kind: "calls",
		weight: 0.84,
	},
	{
		sourceId: "supabase-client",
		targetId: "schema-sql",
		kind: "stores",
		weight: 0.76,
	},
	{
		sourceId: "schema-sql",
		targetId: "rls-policies",
		kind: "stores",
		weight: 0.84,
	},
	{
		sourceId: "api-server",
		targetId: "transmittal-engine",
		kind: "calls",
		weight: 0.85,
	},
	{
		sourceId: "api-server",
		targetId: "cad-ops",
		kind: "calls",
		weight: 0.88,
	},
	{
		sourceId: "api-server",
		targetId: "suite-cad-host",
		kind: "bridges",
		weight: 0.72,
	},
	{
		sourceId: "api-server",
		targetId: "dotnet-bridge",
		kind: "bridges",
		weight: 0.5,
	},
	{
		sourceId: "api-server",
		targetId: "supabase-bootstrap",
		kind: "stores",
		weight: 0.65,
	},
	{
		sourceId: "agent-ui",
		targetId: "frontend-services",
		kind: "calls",
		weight: 0.9,
	},
	{
		sourceId: "frontend-services",
		targetId: "broker-api",
		kind: "calls",
		weight: 0.8,
	},
	{
		sourceId: "broker-api",
		targetId: "suite-native-gateway",
		kind: "bridges",
		weight: 0.86,
	},
	{
		sourceId: "suite-native-gateway",
		targetId: "gateway-launch-boundary",
		kind: "powers",
		weight: 0.9,
	},
	{
		sourceId: "docs-hub",
		targetId: "env-contracts",
		kind: "documents",
		weight: 0.75,
	},
	{
		sourceId: "tooling-guardrails",
		targetId: "app-router",
		kind: "documents",
		weight: 0.6,
	},
];

export const ARCHITECTURE_FLOWS: ArchitectureFlow[] = [
	{
		id: "auth-session",
		title: "Passwordless + Passkey Session",
		steps: [
			"src/routes/LoginPage.tsx",
			"src/auth/*",
			"backend/api_server.py (/api/auth/*)",
			"Supabase auth + user profile tables",
		],
	},
	{
		id: "cad-automation",
		title: "CAD Tool Request Path",
		steps: [
			"src/components/apps/*",
			"src/services/*",
			"backend/api_server.py (/api/execute, /api/layers, /api/status)",
			"AutoCAD COM host + CAD scripts",
		],
	},
	{
		id: "agent-pairing",
		title: "Agent Pairing + Webhook Path",
		steps: [
			"src/routes/agent + src/services/agentService.ts",
			"backend/api_server.py (/api/agent/*)",
			"scripts/suite-agent-gateway.mjs",
			"native gateway routes + stale legacy-process detection only",
		],
	},
	{
		id: "data-governance",
		title: "Data + Access Governance",
		steps: [
			"src/supabase/client.ts",
			"supabase/migrations/*",
			"supabase/consolidated_migration.sql + backend/supabase/*",
			"per-user storage and table access controls",
		],
	},
	{
		id: "ui-modernization",
		title: "UI Modernization Path",
		steps: [
			"src/styles/tokens.css + src/styles/globals.css",
			"src/components/primitives/*",
			"src/components/apps/ui/PageFrame.tsx + Section",
			"feature apps migrated from utility classes to CSS Modules",
		],
	},
];

export const ARCHITECTURE_FIX_CANDIDATES: ArchitectureFixCandidate[] = [
	{
		id: "missing-backup-api",
		priority: "medium",
		title: "Backup API route parity should be validated end-to-end",
		detail:
			"Backup routes now exist in backend, but they should be validated with real YAML backup/restore and API-key flow checks.",
		paths: ["src/supabase/backupManager.ts", "backend/api_server.py"],
	},
	{
		id: "monolith-split",
		priority: "high",
		title: "Critical server/client files are still monolithic",
		detail:
			"Large hotspot files make refactors riskier and testing harder. Continue module extraction by feature and API domain.",
		paths: [
			"backend/api_server.py",
			"src/services/agentService.ts",
			"src/routes/LoginPage.tsx",
		],
	},
	{
		id: "case-normalization",
		priority: "medium",
		title: "Directory naming style mismatch in batch find/replace module",
		detail:
			"Mixed naming style (`Batch_find_and_replace`) differs from route slug conventions and can cause friction in imports and search.",
		paths: [
			"src/components/apps/Batch_find_and_replace",
			"src/routes/apps/batch-find-replace/BatchFindReplaceRoutePage.tsx",
		],
	},
	{
		id: "arch-drift",
		priority: "medium",
		title: "Architecture map can drift after rapid refactors",
		detail:
			"Keep this model updated whenever major modules move so the graph and route page stay trustworthy.",
		paths: ["src/data/architectureModel.ts"],
	},
	{
		id: "ui-migration-tail",
		priority: "high",
		title: "Shared primitives are mid-migration away from utility classes",
		detail:
			"Core app modules are now largely CSS-module based, but shared primitives and remaining route shells still need full convergence to the tokenized style system.",
		paths: [
			"src/components/primitives",
			"src/components/apps/ui/PageFrame.tsx",
			"src/routes",
			"src/theme.css",
		],
	},
];

const AUTO_ARCHITECTURE_MODULES: ArchitectureModule[] =
	ARCHITECTURE_SNAPSHOT.modules.map((module) => ({
		id: module.id,
		domainId: module.domainId,
		label: module.label,
		path: module.path,
		summary: module.summary,
	}));

function mergeArchitectureModules(
	curated: ArchitectureModule[],
	autoModules: ArchitectureModule[],
): ArchitectureModule[] {
	const seenByPath = new Set(curated.map((module) => module.path));
	const merged = [...curated];

	for (const module of autoModules) {
		if (seenByPath.has(module.path)) continue;
		seenByPath.add(module.path);
		merged.push(module);
	}

	return merged;
}

export const ARCHITECTURE_MODULES: ArchitectureModule[] =
	mergeArchitectureModules(
		CURATED_ARCHITECTURE_MODULES,
		AUTO_ARCHITECTURE_MODULES,
	);

export const ARCHITECTURE_AUTOGEN = {
	generatedAt: ARCHITECTURE_SNAPSHOT.generatedAt,
	hotspots: ARCHITECTURE_SNAPSHOT.hotspots,
	batchFindReplace: ARCHITECTURE_SNAPSHOT.batchFindReplace,
	backupRoutes: ARCHITECTURE_SNAPSHOT.backupRoutes,
};

export const ARCHITECTURE_MODULES_BY_DOMAIN = ARCHITECTURE_DOMAINS.map(
	(domain) => ({
		domain,
		modules: ARCHITECTURE_MODULES.filter(
			(module) => module.domainId === domain.id,
		),
	}),
);
