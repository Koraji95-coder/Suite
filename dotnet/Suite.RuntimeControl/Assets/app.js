const STATUS_LABELS = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
  pending: "Pending",
};

const SECTION_META = {
  runtime: {
    title: "Runtime",
    subtitle: "Local runtime, collectors, and transcript.",
  },
  watchdog: {
    title: "Watchdog",
    subtitle: "Collector health surfaces and watchdog route launch.",
  },
  "developer-tools": {
    title: "Developer Tools",
    subtitle: "Developer workshop for local Suite development routes.",
  },
  diagnostics: {
    title: "Diagnostics",
    subtitle: "Incident and telemetry launch points for local debugging.",
  },
  support: {
    title: "Support",
    subtitle: "Support exports, logs, and companion apps like Office.",
  },
};

const EMPTY_RUNTIME_CATALOG = Object.freeze({
  serviceOrder: [],
  services: {},
  bootstrapStepOrder: [],
  bootstrapSteps: {},
  workshopRouteShortcuts: {},
  supportActions: [],
});

const RELEASE_STATE_LABELS = {
  released: "Released",
  developer_beta: "Developer beta",
  lab: "Lab",
};

const DISPLAY_TIME_ZONE = "America/Chicago";
const bootstrapDisplayApi = globalThis.SuiteRuntimeControlBootstrapDisplayProgress || null;
const state = {
  activeSection: "runtime",
  autoScroll: true,
  busy: false,
  action: null,
  actionServiceId: null,
  selectedServiceId: null,
  overall: { state: "booting", text: "BOOTING" },
  services: [],
  logs: [],
  progress: { visible: false, percent: 0, step: "" },
  lastBootstrap: "Waiting for status…",
  bootstrap: null,
  bootstrapDisplay: {
    percent: 0,
    percentExact: 0,
    floorPercent: 0,
    ceilingPercent: 0,
    pulse: false,
    currentStepId: null,
    timestampMs: 0,
  },
  doctor: null,
  runtimeMeta: null,
  supportMeta: null,
  companionApps: [],
  runtimeCatalog: EMPTY_RUNTIME_CATALOG,
  developerToolsManifest: { groups: [], tools: [] },
  hasSnapshot: false,
};

const headerDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const headerTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});
const bootstrapTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const logTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const dom = {
  headerSubtitle: document.getElementById("header-subtitle"),
  clockDate: document.getElementById("clock-date"),
  clock: document.getElementById("clock"),
  overallStatus: document.getElementById("overall-status"),
  overallStatusText: document.getElementById("overall-status-text"),
  sectionNav: document.getElementById("section-nav"),
  runtimeToolbar: document.getElementById("runtime-toolbar"),
  runtimeMain: document.getElementById("runtime-main"),
  workshopMain: document.getElementById("workshop-main"),
  workshopSubtitle: document.getElementById("workshop-subtitle"),
  workshopContent: document.getElementById("workshop-content"),
  runningCount: document.getElementById("running-count"),
  lastBootstrap: document.getElementById("last-bootstrap"),
  servicesList: document.getElementById("services-list"),
  serviceDetail: document.getElementById("service-detail"),
  logBody: document.getElementById("log-body"),
  actionLabel: document.getElementById("action-label"),
  autoscrollButton: document.getElementById("autoscroll-btn"),
  bootstrapButton: document.getElementById("bootstrap-btn"),
  startAllButton: document.getElementById("start-all-btn"),
  stopAllButton: document.getElementById("stop-all-btn"),
  refreshButton: document.getElementById("refresh-btn"),
  clearLogButton: document.getElementById("clear-log-btn"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtUptime(seconds) {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatHeaderTimestamp(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return `${bootstrapTimestampFormatter.format(date)} CT`;
  } catch {
    return "";
  }
}

function formatLogTimestamp(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "--:--:--";
    }

    return logTimestampFormatter.format(date);
  } catch {
    return "--:--:--";
  }
}

function syncBootstrapDisplay(nowMs = Date.now()) {
  const previous = state.bootstrapDisplay || null;

  if (!bootstrapDisplayApi?.computeBootstrapDisplayProgress) {
    const percent = Math.max(0, Math.min(100, Number(state.bootstrap?.percent || 0)));
    state.bootstrapDisplay = {
      percent,
      percentExact: percent,
      floorPercent: percent,
      ceilingPercent: percent,
      pulse: false,
      currentStepId: state.bootstrap?.currentStepId || null,
      timestampMs: nowMs,
    };
    return !previous || previous.percent !== percent || previous.currentStepId !== state.bootstrapDisplay.currentStepId;
  }

  const next = bootstrapDisplayApi.computeBootstrapDisplayProgress(previous, state.bootstrap, nowMs);
  state.bootstrapDisplay = next;

  return (
    !previous ||
    previous.percent !== next.percent ||
    previous.pulse !== next.pulse ||
    previous.currentStepId !== next.currentStepId ||
    previous.floorPercent !== next.floorPercent ||
    previous.ceilingPercent !== next.ceilingPercent
  );
}

function tickClock() {
  const now = new Date();
  dom.clockDate.textContent = headerDateFormatter.format(now);
  dom.clock.textContent = `${headerTimeFormatter.format(now)} CT`;
}

function normalizeNotes(items, fallbackLabel, fallbackValue) {
  const normalizedItems = Array.isArray(items)
    ? items
    : items?.label && items?.value
      ? [items]
      : [];
  const notes = normalizedItems.filter((item) => item?.label && item?.value);

  if (!notes.length && fallbackValue) {
    notes.push({ label: fallbackLabel || "Details", value: fallbackValue });
  }

  return notes;
}

function renderNotesPanel(items, title = "Notes", className = "") {
  if (!items.length) {
    return "";
  }

  const rows = items
    .map(
      (item) => `
        <div class="note-row">
          <div class="note-label">${escapeHtml(item.label)}</div>
          <div class="note-value">${escapeHtml(item.value)}</div>
        </div>`,
    )
    .join("");

  const classes = className ? `notes-panel ${className}` : "notes-panel";
  return `
    <section class="${classes}">
      <div class="detail-label">${escapeHtml(title)}</div>
      <div class="notes-list">${rows}</div>
    </section>`;
}

function renderSupportCard(label, value, options = {}) {
  if (!value) {
    return "";
  }

  return `
    <section class="support-card">
      <div class="support-header">
        <div class="support-label">${escapeHtml(label)}</div>
      </div>
      <div class="support-value${options.mono ? " mono" : ""}">${escapeHtml(value)}</div>
    </section>`;
}

function renderSubstatusCard(substatus) {
  if (!substatus) {
    return "";
  }

  const stateClass = substatus.state || "stopped";
  const badgeLabel = STATUS_LABELS[stateClass] || String(stateClass).toUpperCase();
  const substatusNotes = normalizeNotes(
    substatus.notes,
    stateClass === "error" ? "Issue" : "Details",
    substatus.details,
  );

  return `
    <section class="substatus">
      <div class="support-header">
        <div>
          <div class="detail-label">${escapeHtml(substatus.name || "Detail")}</div>
          <div class="detail-text">${escapeHtml(substatus.summary || "")}</div>
        </div>
        <div class="status-pill ${escapeHtml(stateClass)}">
          <span class="service-dot"></span>
          ${escapeHtml(badgeLabel)}
        </div>
      </div>
      ${renderNotesPanel(substatusNotes, `${substatus.name || "Detail"} Notes`, "plugin-notes")}
    </section>`;
}

function presentCompanionStatus(companion) {
  if (!companion?.enabled) {
    return { label: "Disabled", className: "stopped" };
  }
  if (!companion?.executableFound) {
    return { label: "Missing executable", className: "error" };
  }
  if (companion?.running) {
    return {
      label: companion.startedOutsideRuntimeControl ? "Started outside Runtime Control" : "Running",
      className: companion.startedOutsideRuntimeControl ? "pending" : "running",
    };
  }

  switch (companion?.lastLaunchStatus) {
    case "runtime_gate_timeout":
      return { label: "Waiting on Suite runtime", className: "pending" };
    case "launch_failed":
    case "relaunch_failed":
      return { label: "Launch failed", className: "error" };
    case "launch_requested":
    case "relaunch_requested":
      return { label: "Launch requested", className: "pending" };
    default:
      return { label: "Not running", className: "stopped" };
  }
}

function renderCompanionAppCards() {
  const companionApps = Array.isArray(state.companionApps) ? state.companionApps : [];
  if (!companionApps.length) {
    return "";
  }

  const cards = companionApps
    .map((companion) => {
      const status = presentCompanionStatus(companion);
      const executableText = companion.executableFound
        ? companion.executablePath || "Executable path not reported."
        : companion.executablePath || "Executable path not configured.";
      const details = [
        companion.launchMode ? { label: "Launch mode", value: String(companion.launchMode).replaceAll("_", " ") } : null,
        companion.configSource ? { label: "Config source", value: String(companion.configSource).replaceAll("_", " ") } : null,
        companion.configPath ? { label: "Config path", value: String(companion.configPath) } : null,
        companion.rootDirectory ? { label: "Daily root", value: String(companion.rootDirectory) } : null,
        companion.pid ? { label: "PID", value: String(companion.pid) } : null,
        companion.launchSource ? { label: "Launch source", value: String(companion.launchSource).replaceAll("_", " ") } : null,
        companion.lastLaunchAt ? { label: "Last event", value: formatHeaderTimestamp(companion.lastLaunchAt) || companion.lastLaunchAt } : null,
      ].filter(Boolean);

      return `
        <section class="support-card companion-card">
          <div class="support-header">
            <div>
              <div class="support-label">${escapeHtml(companion.title || companion.id || "Companion app")}</div>
              <div class="detail-text">${escapeHtml(companion.lastLaunchMessage || "Managed by Runtime Control after the Suite runtime is ready.")}</div>
            </div>
            <div class="status-pill ${escapeHtml(status.className)}">
              <span class="service-dot"></span>
              ${escapeHtml(status.label)}
            </div>
          </div>
          <div class="support-value mono">${escapeHtml(executableText)}</div>
          ${details.length ? renderNotesPanel(details, "Companion Details", "companion-notes") : ""}
          <div class="companion-action-row">
            <button type="button" class="shell-btn small" data-companion-action="launch" data-companion-id="${escapeHtml(companion.id)}">Open Office</button>
            <button type="button" class="shell-btn small subtle" data-companion-action="relaunch" data-companion-id="${escapeHtml(companion.id)}">Relaunch Office</button>
            <button type="button" class="shell-btn small subtle" data-companion-action="open-folder" data-companion-id="${escapeHtml(companion.id)}">Open Daily folder</button>
          </div>
        </section>`;
    })
    .join("");

  return `
    <section class="launch-group">
      <div class="launch-group-title">Companion Apps</div>
      <div class="launch-group-description">Managed desktop companions launch after Suite is ready so they do not race the local runtime at sign-in.</div>
      <div class="detail-support-grid companion-grid">
        ${cards}
      </div>
    </section>`;
}

function presentAction(action) {
  if (!action) {
    return "Idle";
  }

  return String(action)
    .replaceAll("runtime.", "")
    .replaceAll("service.", "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getOrderedServices() {
  const byId = new Map(state.services.map((service) => [service.id, service]));
  return getCatalogServiceOrder().map((serviceId) => {
    const service = byId.get(serviceId);
    const meta = getCatalogServiceMeta(serviceId);
    return {
      id: serviceId,
      name: service?.name || meta.bootLabel || serviceId,
      summary: service?.summary || meta.description || "Waiting for runtime status…",
      state: service?.state || (state.hasSnapshot ? "stopped" : "pending"),
      shortLabel: meta.shortLabel || serviceId.slice(0, 2).toUpperCase(),
      description: meta.description || "",
      service,
    };
  });
}

function ensureSelectedServiceId(orderedServices) {
  const serviceIds = new Set(orderedServices.map((service) => service.id));
  if (state.selectedServiceId && serviceIds.has(state.selectedServiceId)) {
    return;
  }

  state.selectedServiceId = orderedServices[0]?.id || null;
}

function getSelectedServiceModel(orderedServices) {
  ensureSelectedServiceId(orderedServices);
  return orderedServices.find((service) => service.id === state.selectedServiceId) || null;
}

function getServiceName(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  if (service?.name) {
    return service.name;
  }

  return getCatalogServiceMeta(serviceId)?.bootLabel || serviceId;
}

function getSectionMeta(sectionId) {
  return SECTION_META[sectionId] || SECTION_META.runtime;
}

function mapDoctorStateToStatusClass(doctorState) {
  switch (doctorState) {
    case "ready":
      return "running";
    case "background":
      return "pending";
    case "needs-attention":
      return "error";
    case "unavailable":
      return "stopped";
    default:
      return "pending";
  }
}

function flattenDoctorChecks(orderedServices) {
  return orderedServices.flatMap((service) => {
    const checks = Array.isArray(service.service?.checks) ? service.service.checks : [];
    return checks
      .filter((check) => check?.label)
      .map((check) => ({
        serviceName: service.name,
        label: check.label,
        detail: check.detail || check.description || "",
        severity: check.severity || "background",
        actionable: check.actionable !== false && (check.severity || "background") !== "ready",
      }));
  });
}

function renderDoctorCheckCards(orderedServices) {
  const actionableChecks = flattenDoctorChecks(orderedServices)
    .filter((check) => check.actionable)
    .slice(0, 6);

  if (!actionableChecks.length) {
    return `
      <section class="launch-group">
        <div class="launch-group-title">Actionable Checks</div>
        <div class="doctor-empty">Suite Doctor is clear. No workstation or local-runtime issues need action right now.</div>
      </section>`;
  }

  const cards = actionableChecks
    .map((check) => `
      <article class="doctor-check-card ${escapeHtml(mapDoctorStateToStatusClass(check.severity))}">
        <div class="doctor-check-head">
          <div>
            <div class="doctor-check-service">${escapeHtml(check.serviceName)}</div>
            <div class="doctor-check-title">${escapeHtml(check.label)}</div>
          </div>
          <div class="status-pill ${escapeHtml(mapDoctorStateToStatusClass(check.severity))}">
            <span class="service-dot"></span>
            ${escapeHtml(check.severity === "needs-attention" ? "Needs attention" : check.severity === "unavailable" ? "Unavailable" : "Background")}
          </div>
        </div>
        <div class="doctor-check-detail">${escapeHtml(check.detail || "Review the local runtime doctor for more detail.")}</div>
      </article>`)
    .join("");

  return `
    <section class="launch-group">
      <div class="launch-group-title">Actionable Checks</div>
      <div class="doctor-check-grid">
        ${cards}
      </div>
    </section>`;
}

function normalizeRuntimeCatalog(payload) {
  const serviceOrder = Array.isArray(payload?.serviceOrder)
    ? payload.serviceOrder.filter(Boolean).map((item) => String(item))
    : [];
  const services = Object.fromEntries(
    Object.entries(payload?.services || {})
      .filter(([serviceId, meta]) => Boolean(serviceId && meta?.bootLabel))
      .map(([serviceId, meta]) => [
        String(serviceId),
        {
          shortLabel: meta?.shortLabel ? String(meta.shortLabel) : "",
          bootLabel: String(meta.bootLabel),
          description: meta?.description ? String(meta.description) : "",
        },
      ]),
  );
  const bootstrapStepOrder = Array.isArray(payload?.bootstrapStepOrder)
    ? payload.bootstrapStepOrder.filter(Boolean).map((item) => String(item))
    : [];
  const bootstrapSteps = Object.fromEntries(
    Object.entries(payload?.bootstrapSteps || {})
      .filter(([stepId, meta]) => Boolean(stepId && meta?.label))
      .map(([stepId, meta]) => [
        String(stepId),
        {
          label: String(meta.label),
          shortLabel: meta?.shortLabel ? String(meta.shortLabel) : "",
        },
      ]),
  );
  const workshopRouteShortcuts = Object.fromEntries(
    Object.entries(payload?.workshopRouteShortcuts || {})
      .filter(([routeId, route]) => Boolean(routeId && route?.title && route?.path))
      .map(([routeId, route]) => [
        String(routeId),
        {
          title: String(route.title),
          path: String(route.path),
          description: route?.description ? String(route.description) : "",
        },
      ]),
  );
  const supportActions = Array.isArray(payload?.supportActions)
    ? payload.supportActions
        .filter((action) => action?.id && action?.label)
        .map((action) => ({
          id: String(action.id),
          label: String(action.label),
          description: action?.description ? String(action.description) : "",
        }))
    : [];

  return {
    serviceOrder,
    services,
    bootstrapStepOrder,
    bootstrapSteps,
    workshopRouteShortcuts,
    supportActions,
  };
}

function getRuntimeCatalog() {
  return state.runtimeCatalog || EMPTY_RUNTIME_CATALOG;
}

function getCatalogServiceOrder() {
  const serviceOrder = getRuntimeCatalog().serviceOrder || [];
  return serviceOrder.length
    ? serviceOrder
    : state.services.map((service) => service.id).filter(Boolean);
}

function getCatalogServiceMeta(serviceId) {
  return getRuntimeCatalog().services?.[serviceId] || {};
}

function getCatalogBootstrapStepOrder() {
  return getRuntimeCatalog().bootstrapStepOrder || [];
}

function getCatalogBootstrapStepMeta(stepId) {
  return getRuntimeCatalog().bootstrapSteps?.[stepId] || null;
}

function getWorkshopRouteShortcuts() {
  return getRuntimeCatalog().workshopRouteShortcuts || {};
}

function getSupportActions() {
  return getRuntimeCatalog().supportActions || [];
}

function setActiveSection(sectionId) {
  state.activeSection = SECTION_META[sectionId] ? sectionId : "runtime";
}

function normalizeReleaseState(releaseState) {
  if (releaseState === "developer_beta") {
    return "developer_beta";
  }
  if (releaseState === "lab") {
    return "lab";
  }
  return "released";
}

function formatReleaseStateLabel(releaseState) {
  return RELEASE_STATE_LABELS[normalizeReleaseState(releaseState)] || "Developer beta";
}

function normalizeDeveloperToolsManifest(payload) {
  const groups = Array.isArray(payload?.groups)
    ? payload.groups
        .filter((group) => group?.id && group?.title)
        .map((group) => ({
          id: String(group.id),
          title: String(group.title),
          description: group.description ? String(group.description) : "",
        }))
    : [];
  const tools = Array.isArray(payload?.tools)
    ? payload.tools
        .filter((tool) => tool?.id && tool?.title && tool?.route && tool?.group)
        .map((tool) => ({
          id: String(tool.id),
          title: String(tool.title),
          description: tool.description ? String(tool.description) : "",
          route: String(tool.route),
          group: String(tool.group),
          audience: tool.audience === "dev" ? "dev" : "dev",
          releaseState: normalizeReleaseState(
            typeof tool.releaseState === "string" ? tool.releaseState : "developer_beta",
          ),
          futureProduct: Boolean(tool.futureProduct),
          runtimeRequirements: Array.isArray(tool.runtimeRequirements)
            ? tool.runtimeRequirements.filter(Boolean).map((item) => String(item))
            : [],
        }))
    : [];

  return { groups, tools };
}

function getDeveloperToolGroups() {
  const manifest = state.developerToolsManifest || { groups: [], tools: [] };
  return manifest.groups
    .map((group) => ({
      ...group,
      items: manifest.tools.filter((tool) => tool.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

function mapDeveloperToolToRouteItem(tool) {
  return {
    id: tool.id,
    title: tool.title,
    path: tool.route,
    description: tool.description,
    releaseState: tool.releaseState,
    futureProduct: tool.futureProduct,
    runtimeRequirements: tool.runtimeRequirements,
  };
}

function routeItemById(routeId) {
  const tool = state.developerToolsManifest.tools.find((item) => item.id === routeId);
  if (tool) {
    return mapDeveloperToolToRouteItem(tool);
  }

  return getWorkshopRouteShortcuts()[routeId] || null;
}

function renderLaunchCards(routeIds, options = {}) {
  return routeIds
    .map((routeId) => {
      const route = routeItemById(routeId);
      if (!route) {
        return "";
      }

      const releaseMeta = options.showMeta && route.releaseState
        ? `<span class="launch-card-tag">${escapeHtml(formatReleaseStateLabel(route.releaseState))}</span>`
        : "";
      const futureProductMeta = options.showMeta && route.futureProduct
        ? '<span class="launch-card-tag accent">Future product</span>'
        : "";
      const requirementMeta = options.showMeta && Array.isArray(route.runtimeRequirements) && route.runtimeRequirements.length
        ? route.runtimeRequirements
            .map((item) => `<span class="launch-card-tag subtle">${escapeHtml(item)}</span>`)
            .join("")
        : "";
      const metaRow = releaseMeta || futureProductMeta || requirementMeta
        ? `<div class="launch-card-meta">${releaseMeta}${futureProductMeta}${requirementMeta}</div>`
        : "";

      return `
        <button type="button" class="launch-card" data-launch-route="${escapeHtml(routeId)}">
          <div class="launch-card-title">${escapeHtml(route.title)}</div>
          <div class="launch-card-path">${escapeHtml(route.path)}</div>
          <div class="launch-card-desc">${escapeHtml(route.description)}</div>
          ${metaRow}
        </button>`;
    })
    .filter(Boolean)
    .join("");
}

function renderLaunchGroups(groups, options = {}) {
  return groups
    .map((group) => {
      const cards = renderLaunchCards(group.items || [], options);
      if (!cards) {
        return "";
      }

      return `
        <section class="launch-group">
          <div class="launch-group-title">${escapeHtml(group.title || "Tools")}</div>
          ${group.description ? `<div class="launch-group-description">${escapeHtml(group.description)}</div>` : ""}
          <div class="launch-grid">
            ${cards}
          </div>
        </section>`;
    })
    .filter(Boolean)
    .join("");
}

function renderWorkshopSection(orderedServices) {
  const runningCount = orderedServices.filter((service) => service.state === "running").length;
  const totalCount = orderedServices.length || getCatalogServiceOrder().length;
  const healthChip = `${runningCount}/${totalCount} services running`;
  const overallChip = state.overall.text || "BOOTING";
  const section = state.activeSection;
  const meta = getSectionMeta(section);
  const doctor = state.doctor || {
    overallState: "background",
    actionableIssueCount: 0,
    severityCounts: {
      ready: 0,
      background: 0,
      "needs-attention": 0,
      unavailable: 0,
    },
    recommendations: [],
  };
  const doctorStateClass = mapDoctorStateToStatusClass(doctor.overallState);
  const doctorRecommendations = Array.isArray(doctor.recommendations)
    ? doctor.recommendations.filter(Boolean).slice(0, 2)
    : [];
  const runtimeMeta = state.runtimeMeta || {};
  const supportMeta = state.supportMeta || {};
  const developerToolGroups = getDeveloperToolGroups().map((group) => ({
    title: group.title,
    description: group.description,
    items: group.items.map((item) => item.id),
  }));

  if (section === "developer-tools") {
    dom.workshopContent.innerHTML = `
      <article class="workshop-card">
        <header class="workshop-card-header">
          <div>
            <div class="detail-eyebrow">Developer Workshop</div>
            <div class="workshop-card-title">Developer Tools</div>
            <div class="workshop-card-subtitle">Launch developer-only Suite surfaces from Runtime Control.</div>
          </div>
          <div class="status-pill ${escapeHtml(state.overall.state || "booting")}">
            <span class="service-dot"></span>
            ${escapeHtml(overallChip)}
          </div>
        </header>
        <div class="detail-quick-row">
          <span class="quick-chip">${escapeHtml(`Runtime • ${healthChip}`)}</span>
          <span class="quick-chip">${escapeHtml(`Section • ${meta.title}`)}</span>
        </div>
        ${developerToolGroups.length
          ? renderLaunchGroups(developerToolGroups, { showMeta: true })
          : '<div class="doctor-empty">Developer tool manifest is not available yet. Refresh the workstation shell after the Suite repo is available locally.</div>'}
      </article>`;
    return;
  }

  if (section === "watchdog") {
    dom.workshopContent.innerHTML = `
      <article class="workshop-card">
        <header class="workshop-card-header">
          <div>
            <div class="detail-eyebrow">Observability</div>
            <div class="workshop-card-title">Watchdog</div>
            <div class="workshop-card-subtitle">Open collector health views and related developer portals.</div>
          </div>
          <div class="status-pill ${escapeHtml(state.overall.state || "booting")}">
            <span class="service-dot"></span>
            ${escapeHtml(overallChip)}
          </div>
        </header>
        <div class="detail-quick-row">
          <span class="quick-chip">${escapeHtml(`Runtime • ${healthChip}`)}</span>
        </div>
        ${renderLaunchGroups([
          {
            title: "Watchdog Surfaces",
            description: "Customer-safe runtime observability plus the closest developer workshop routes.",
            items: ["watchdog", "developer-portal", "command-center"],
          },
        ])}
      </article>`;
    return;
  }

  if (section === "diagnostics") {
    dom.workshopContent.innerHTML = `
      <article class="workshop-card">
        <header class="workshop-card-header">
          <div>
            <div class="detail-eyebrow">Suite Doctor</div>
            <div class="workshop-card-title">Diagnostics</div>
            <div class="workshop-card-subtitle">Use one shared doctor view for workstation health, local runtime drift, and the fastest next diagnostic step.</div>
          </div>
          <div class="status-pill ${escapeHtml(doctorStateClass)}">
            <span class="service-dot"></span>
            ${escapeHtml(doctor.overallState === "ready" ? "Ready" : doctor.overallState === "background" ? "Background" : doctor.overallState === "needs-attention" ? "Needs attention" : "Unavailable")}
          </div>
        </header>
        <section class="detail-callout">
          <div class="detail-callout-copy">
            <div class="detail-callout-title">Suite doctor</div>
            <div class="detail-callout-text">${escapeHtml(
              doctor.actionableIssueCount > 0
                ? `${doctor.actionableIssueCount} actionable issue${doctor.actionableIssueCount === 1 ? "" : "s"} need attention before you rely on workstation-sensitive flows.`
                : "All shared runtime and workstation checks are clear right now."
            )}</div>
          </div>
        </section>
        <div class="detail-quick-row">
          <span class="quick-chip">${escapeHtml(`Runtime • ${healthChip}`)}</span>
          <span class="quick-chip${doctor.actionableIssueCount > 0 ? " emphasis" : ""}">${escapeHtml(`Actionable • ${doctor.actionableIssueCount || 0}`)}</span>
          <span class="quick-chip">${escapeHtml(`Ready • ${doctor.severityCounts?.ready || 0}`)}</span>
          <span class="quick-chip">${escapeHtml(`Background • ${doctor.severityCounts?.background || 0}`)}</span>
          <span class="quick-chip${(doctor.severityCounts?.["needs-attention"] || 0) > 0 ? " emphasis" : ""}">${escapeHtml(`Needs attention • ${doctor.severityCounts?.["needs-attention"] || 0}`)}</span>
          <span class="quick-chip${(doctor.severityCounts?.unavailable || 0) > 0 ? " emphasis" : ""}">${escapeHtml(`Unavailable • ${doctor.severityCounts?.unavailable || 0}`)}</span>
        </div>
        ${doctorRecommendations.length ? renderNotesPanel(doctorRecommendations.map((item, index) => ({ label: `Recommendation ${index + 1}`, value: item })), "Recommendations") : ""}
        ${renderDoctorCheckCards(orderedServices)}
        ${renderLaunchGroups([
          {
            title: "Diagnostics Routes",
            description: "Open the heavyweight tools only when the shared doctor says the workstation needs a deeper look.",
            items: ["command-center", "watchdog", "developer-portal"],
          },
        ])}
      </article>`;
    return;
  }

  dom.workshopContent.innerHTML = `
    <article class="workshop-card">
      <header class="workshop-card-header">
        <div>
          <div class="detail-eyebrow">Support</div>
          <div class="workshop-card-title">Support</div>
          <div class="workshop-card-subtitle">Workstation-facing evidence, local paths, and the fastest routes into support-safe Suite surfaces.</div>
        </div>
      </header>
      <div class="detail-quick-row">
        <span class="quick-chip">${escapeHtml(`Runtime • ${healthChip}`)}</span>
        <span class="quick-chip">${escapeHtml(`Doctor • ${doctor.actionableIssueCount || 0} actionable`)}</span>
      </div>
      <section class="detail-support-grid">
        ${renderSupportCard(
          "Workstation",
          supportMeta.workstation?.workstationLabel
            ? `${supportMeta.workstation.workstationId || supportMeta.workstation.workstationLabel} — ${supportMeta.workstation.workstationLabel}`
            : supportMeta.workstation?.workstationId || "",
          { mono: false },
        )}
        ${renderSupportCard(
          "Gateway mode",
          supportMeta.config?.gatewayMode || "Suite-native",
          { mono: false },
        )}
        ${renderSupportCard("Codex config", supportMeta.config?.codexConfigPath || supportMeta.workstation?.codexConfigPath || "", { mono: true })}
        ${renderSupportCard("Stable Suite root", supportMeta.config?.stableSuiteRoot || "", { mono: true })}
        ${renderSupportCard("Daily root", supportMeta.config?.dailyRoot || "", { mono: true })}
        ${renderSupportCard("Office executable", supportMeta.config?.officeExecutablePath || "", { mono: true })}
        ${renderSupportCard("Bootstrap log", supportMeta.paths?.bootstrapLogPath || runtimeMeta.logPath, { mono: true })}
        ${renderSupportCard("Status directory", supportMeta.paths?.statusDir || runtimeMeta.statusDir, { mono: true })}
        ${renderSupportCard("Last bootstrap", runtimeMeta.lastBootstrap?.summary || "", { mono: false })}
        ${renderSupportCard("Supabase config", supportMeta.config?.supabaseConfigPath || "", { mono: true })}
      </section>
      ${renderCompanionAppCards()}
      <section class="launch-group">
        <div class="launch-group-title">Support Actions</div>
        <div class="launch-group-description">Open the local runtime evidence directly or copy a concise support handoff without leaving the desktop shell.</div>
        <div class="launch-grid support-action-grid">
          ${getSupportActions().map((action) => `
            <button type="button" class="launch-card" data-support-action="${escapeHtml(action.id)}">
              <div class="launch-card-title">${escapeHtml(action.label)}</div>
              <div class="launch-card-desc">${escapeHtml(action.description)}</div>
            </button>`).join("")}
        </div>
      </section>
      ${renderLaunchGroups([
        {
          title: "Workshop Shortcuts",
          description: "Support-safe routes that stay useful during debugging without dumping the full developer workshop into the customer app.",
          items: ["developer-portal", "command-center", "watchdog"],
        },
      ])}
    </article>`;
}

function renderSectionChrome(orderedServices) {
  const runtimeActive = state.activeSection === "runtime";
  const sectionMeta = getSectionMeta(state.activeSection);

  if (dom.headerSubtitle) {
    dom.headerSubtitle.textContent = sectionMeta.subtitle;
  }

  dom.runtimeToolbar.classList.toggle("hidden", !runtimeActive);
  dom.runtimeMain.classList.toggle("hidden", !runtimeActive);
  dom.workshopMain.classList.toggle("hidden", runtimeActive);
  dom.workshopSubtitle.textContent = sectionMeta.subtitle;

  if (dom.sectionNav) {
    const tabs = dom.sectionNav.querySelectorAll("button[data-section]");
    tabs.forEach((tab) => {
      const sectionId = tab.getAttribute("data-section");
      tab.classList.toggle("active", sectionId === state.activeSection);
    });
  }

  if (!runtimeActive) {
    renderWorkshopSection(orderedServices);
  }
}

function renderQuickChips(items) {
  const chips = items.filter(Boolean);
  if (!chips.length) {
    return "";
  }

  return `
    <div class="detail-quick-row">
      ${chips
        .map(
          (chip) => `
            <span class="quick-chip${chip.emphasis ? " emphasis" : ""}">
              ${escapeHtml(chip.text)}
            </span>`,
        )
        .join("")}
    </div>`;
}

function renderBootstrapSequence(bootstrap) {
  const completed = new Set(Array.isArray(bootstrap.completedStepIds) ? bootstrap.completedStepIds : []);
  const failed = new Set(Array.isArray(bootstrap.failedStepIds) ? bootstrap.failedStepIds : []);
  const currentStepId = bootstrap.running ? bootstrap.currentStepId : null;
  const bootstrapStepOrder = getCatalogBootstrapStepOrder();

  return `
    <section class="activity-sequence">
      ${bootstrapStepOrder.map((stepId) => {
        const meta = getCatalogBootstrapStepMeta(stepId) || { label: stepId, shortLabel: stepId.slice(0, 2).toUpperCase() };
        let stepState = "pending";
        if (failed.has(stepId)) {
          stepState = "error";
        } else if (currentStepId === stepId) {
          stepState = "starting";
        } else if (completed.has(stepId)) {
          stepState = "running";
        }

        return `
          <div class="activity-step ${escapeHtml(stepState)}">
            <div class="activity-step-node">${escapeHtml(meta.shortLabel)}</div>
            <div class="activity-step-copy">
              <div class="activity-step-label">${escapeHtml(meta.label)}</div>
              <div class="activity-step-state">${escapeHtml(STATUS_LABELS[stepState] || stepState.toUpperCase())}</div>
            </div>
          </div>`;
      }).join("")}
    </section>`;
}

function renderActivityCard() {
  const bootstrap = state.bootstrap;
  if (bootstrap?.showCard) {
    const bootstrapProgress = state.bootstrapDisplay || {
      percent: Math.max(0, Math.min(100, Number(bootstrap.percent || 0))),
      pulse: false,
    };
    const completedCount = Array.isArray(bootstrap.completedStepIds) ? bootstrap.completedStepIds.length : 0;
    const failedLabels = Array.isArray(bootstrap.failedStepLabels) ? bootstrap.failedStepLabels : [];
    const bootstrapNotes = [
      failedLabels.length
        ? { label: "Failed Steps", value: failedLabels.join(", ") }
        : null,
      !bootstrap.running && !bootstrap.ok
        ? { label: "Recovery", value: "Use Bootstrap All to retry the local runtime bootstrap." }
        : null,
    ].filter(Boolean);
    const supportCards = [
      bootstrapNotes.length ? renderNotesPanel(bootstrapNotes, "Bootstrap Notes") : "",
      renderSupportCard("Started", formatHeaderTimestamp(bootstrap.startedAt)),
      renderSupportCard("Updated", formatHeaderTimestamp(bootstrap.updatedAt)),
    ]
      .filter(Boolean)
      .join("");
    const chips = [
      bootstrap.maxAttempts > 0
        ? { text: `Attempt • ${Math.max(bootstrap.attempt || 1, 1)} / ${bootstrap.maxAttempts}` }
        : null,
      { text: `Completed • ${completedCount} / ${getCatalogBootstrapStepOrder().length || completedCount}` },
      failedLabels.length ? { text: `Failed • ${failedLabels.length}`, emphasis: true } : null,
    ];

    return `
      <article class="detail-card activity-card ${escapeHtml(bootstrap.statusState || "starting")}">
        <div class="detail-card-body">
          <header class="service-detail-head">
            <div class="detail-title-group">
              <div class="detail-eyebrow">Runtime Boot</div>
              <div class="detail-title">${escapeHtml(bootstrap.running ? "Booting Local Runtime" : "Bootstrap Needs Attention")}</div>
              <div class="detail-subtitle">Single-pass workstation bootstrap with real milestone progress and live service state.</div>
            </div>
            <div class="status-pill ${escapeHtml(bootstrap.statusState || "starting")}">
              <span class="service-dot"></span>
              ${escapeHtml(bootstrap.statusText || "BOOTING")}
            </div>
          </header>

          <section class="detail-callout">
            <div class="detail-callout-copy">
              <div class="detail-callout-title">Current Phase</div>
              <div class="detail-callout-text">${escapeHtml(bootstrap.summary || bootstrap.currentStepLabel || "Bootstrapping local runtime.")}</div>
            </div>
          </section>

          ${renderQuickChips(chips)}

          <section class="activity-progress-panel${bootstrap.running ? " live" : ""}">
            <div class="progress-copy">
              <span>${escapeHtml(bootstrap.currentStepLabel || bootstrap.summary || "Bootstrapping local runtime.")}</span>
              <span>${escapeHtml(`${bootstrapProgress.percent || 0}%`)}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill${bootstrap.running ? " live" : ""}${bootstrapProgress.pulse ? " pulse" : ""}" style="width: ${Math.max(0, Math.min(100, Number(bootstrapProgress.percent || 0)))}%"></div>
            </div>
          </section>

          ${renderBootstrapSequence(bootstrap)}

          ${supportCards ? `<section class="detail-support-grid">${supportCards}</section>` : ""}
        </div>
      </article>`;
  }

  if (!state.progress.visible) {
    return "";
  }

  const isServiceAction = Boolean(state.actionServiceId);
  const actionTarget = isServiceAction ? getServiceName(state.actionServiceId) : "Local Runtime";
  const actionTitle = state.action === "start_all"
    ? "Starting Local Services"
    : state.action === "stop_all"
      ? "Stopping Local Services"
      : state.action === "bootstrap_all"
        ? "Booting Local Runtime"
        : `${presentAction(state.action)} ${actionTarget}`;
  const actionSubtitle = isServiceAction
    ? `Live action progress for ${actionTarget}.`
    : "Live action progress for the local runtime.";
  const chips = [
    isServiceAction ? { text: `Target • ${actionTarget}` } : null,
    state.action ? { text: `Action • ${presentAction(state.action)}` } : null,
  ];

  return `
    <article class="detail-card activity-card starting">
      <div class="detail-card-body">
        <header class="service-detail-head">
          <div class="detail-title-group">
            <div class="detail-eyebrow">Runtime Activity</div>
            <div class="detail-title">${escapeHtml(actionTitle)}</div>
            <div class="detail-subtitle">${escapeHtml(actionSubtitle)}</div>
          </div>
          <div class="status-pill starting">
            <span class="service-dot"></span>
            WORKING
          </div>
        </header>

        <section class="detail-callout">
          <div class="detail-callout-copy">
            <div class="detail-callout-title">Current Phase</div>
            <div class="detail-callout-text">${escapeHtml(state.progress.step || "Working…")}</div>
          </div>
        </section>

        ${renderQuickChips(chips)}

        <section class="activity-progress-panel">
          <div class="progress-copy">
            <span>${escapeHtml(state.progress.step || "Working…")}</span>
            <span>${escapeHtml(`${state.progress.percent || 0}%`)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${Math.max(0, Math.min(100, Number(state.progress.percent || 0)))}%"></div>
          </div>
        </section>
      </div>
    </article>`;
}

function renderServiceDetail(orderedServices) {
  const activityCard = renderActivityCard();
  if (activityCard) {
    dom.serviceDetail.innerHTML = activityCard;
    return;
  }

  const selectedModel = getSelectedServiceModel(orderedServices);
  if (!selectedModel || !selectedModel.service) {
    dom.serviceDetail.innerHTML = '<div class="log-empty">Waiting for runtime snapshot…</div>';
    return;
  }

  const service = selectedModel.service;
  const serviceState = service.state || "stopped";
  const badgeLabel = STATUS_LABELS[serviceState] || String(serviceState).toUpperCase();
  const serviceNotes = normalizeNotes(service.notes, "Details", service.details);
  const logTargetValue = service.logTarget?.target
    ? `${service.logTarget.label || "Target"}: ${service.logTarget.target}`
    : "";
  const canStart = !state.busy && (service.state === "stopped" || service.state === "error");
  const canStop = !state.busy && (service.state === "running" || service.state === "starting" || service.state === "error");
  const canRestart = !state.busy;
  const supportCards = [
    renderNotesPanel(serviceNotes, "Service Notes"),
    renderSubstatusCard(service.substatus),
    renderSupportCard("Log Target", logTargetValue, { mono: true }),
  ]
    .filter(Boolean)
    .join("");
  const chips = [
    {
      text: `State • ${STATUS_LABELS[serviceState] || String(serviceState).toUpperCase()}`,
      emphasis: serviceState === "starting" || serviceState === "error",
    },
    service.startupMode ? { text: `Startup • ${service.startupMode}` } : null,
    service.processLabel ? { text: `Process • ${service.processLabel}` } : null,
    state.busy && state.actionServiceId === service.id && state.action
      ? { text: `Action • ${presentAction(state.action)}`, emphasis: true }
      : null,
  ];

  dom.serviceDetail.innerHTML = `
    <article class="detail-card ${escapeHtml(serviceState)}">
      <div class="detail-card-body">
        <header class="service-detail-head">
          <div class="detail-title-group">
            <div class="detail-eyebrow">Selected Service</div>
            <div class="detail-title">${escapeHtml(service.name)}</div>
            <div class="detail-subtitle">${escapeHtml(selectedModel.description || selectedModel.summary)}</div>
          </div>
          <div class="status-pill ${escapeHtml(serviceState)}">
            <span class="service-dot"></span>
            ${escapeHtml(badgeLabel)}
          </div>
        </header>

        <section class="detail-callout">
          <div class="detail-callout-copy">
            <div class="detail-callout-title">Current Status</div>
            <div class="detail-callout-text">${escapeHtml(service.summary || selectedModel.summary || "Waiting for runtime status…")}</div>
          </div>
        </section>

        ${renderQuickChips(chips)}

        <section class="detail-metrics">
          <div class="metric-card">
            <div class="meta-key">Port</div>
            <div class="meta-value">${service.port > 0 ? escapeHtml(service.port) : "—"}</div>
          </div>
          <div class="metric-card">
            <div class="meta-key">PID</div>
            <div class="meta-value">${service.processId ? escapeHtml(service.processId) : "—"}</div>
          </div>
          <div class="metric-card">
            <div class="meta-key">Process</div>
            <div class="meta-value">${service.processLabel ? escapeHtml(service.processLabel) : "—"}</div>
          </div>
          <div class="metric-card">
            <div class="meta-key">Uptime</div>
            <div class="meta-value">${escapeHtml(fmtUptime(service.uptimeSeconds))}</div>
          </div>
          <div class="metric-card">
            <div class="meta-key">Startup</div>
            <div class="meta-value">${escapeHtml(service.startupMode || "—")}</div>
          </div>
        </section>

        ${supportCards ? `<section class="detail-support-grid">${supportCards}</section>` : ""}

        <div class="detail-actions">
          <button class="shell-btn primary" ${canStart ? "" : "disabled"} data-action="start" data-service-id="${escapeHtml(service.id)}">Start</button>
          <button class="shell-btn danger" ${canStop ? "" : "disabled"} data-action="stop" data-service-id="${escapeHtml(service.id)}">Stop</button>
          <button class="shell-btn" ${canRestart ? "" : "disabled"} data-action="restart" data-service-id="${escapeHtml(service.id)}">Restart</button>
          <button class="shell-btn subtle" ${state.busy ? "disabled" : ""} data-action="open-logs" data-service-id="${escapeHtml(service.id)}">Logs</button>
        </div>
      </div>
    </article>`;
}

function renderLogs() {
  if (!state.logs.length) {
    dom.logBody.innerHTML = '<div class="log-empty">No output yet.</div>';
    return;
  }

  dom.logBody.innerHTML = state.logs
    .map((entry) => {
      const tone = entry.tone ? ` tone-${entry.tone}` : "";
      return `
        <div class="log-entry${tone}">
          <span class="timestamp">${escapeHtml(entry.timestamp || "--:--:--")}</span>
          <span class="tag">${escapeHtml(entry.tag || "INFO")}</span>
          <span class="message">${escapeHtml(entry.message || "")}</span>
        </div>`;
    })
    .join("");

  if (state.autoScroll) {
    dom.logBody.scrollTop = dom.logBody.scrollHeight;
  }
}

function updateButtonState() {
  const disable = state.busy;
  dom.bootstrapButton.disabled = disable;
  dom.startAllButton.disabled = disable;
  dom.stopAllButton.disabled = disable;
  dom.refreshButton.disabled = disable;
  dom.clearLogButton.disabled = false;
  dom.autoscrollButton.textContent = `Auto-scroll ${state.autoScroll ? "ON" : "OFF"}`;

  if (state.bootstrap?.running) {
    dom.actionLabel.textContent = state.bootstrap.currentStepLabel || state.bootstrap.summary || "Booting local runtime";
    return;
  }

  if (state.bootstrap?.showCard) {
    dom.actionLabel.textContent = state.bootstrap.summary || "Runtime bootstrap needs attention";
    return;
  }

  dom.actionLabel.textContent = state.busy ? presentAction(state.action) : "Standing By";
}

function renderHeader(orderedServices) {
  dom.overallStatus.className = `overall-status ${state.overall.state || "booting"}`;
  dom.overallStatusText.textContent = state.overall.text || "BOOTING";
  const runningCount = orderedServices.filter((service) => service.state === "running").length;
  dom.runningCount.textContent = `${runningCount} / ${orderedServices.length || getCatalogServiceOrder().length} running`;

  if (state.bootstrap?.running) {
    const attempt = Math.max(state.bootstrap.attempt || 1, 1);
    const maxAttempts = Math.max(state.bootstrap.maxAttempts || attempt, attempt);
    dom.lastBootstrap.textContent = `Booting now • Attempt ${attempt}/${maxAttempts}`;
    return;
  }

  if (state.bootstrap?.showCard) {
    dom.lastBootstrap.textContent = state.bootstrap.summary || "Runtime bootstrap needs attention.";
    return;
  }

  dom.lastBootstrap.textContent = state.lastBootstrap;
}

function renderServiceRail(orderedServices) {
  if (!orderedServices.length) {
    dom.servicesList.innerHTML = '<div class="log-empty">Waiting for runtime snapshot…</div>';
    return;
  }

  dom.servicesList.innerHTML = orderedServices
    .map((service) => {
      const serviceState = service.state || "pending";
      const badgeLabel = STATUS_LABELS[serviceState] || String(serviceState).toUpperCase();
      const runtime = service.service || {};
      const metaChips = [
        runtime.port > 0
          ? { label: "Port", value: String(runtime.port) }
          : null,
        runtime.uptimeSeconds
          ? { label: "Uptime", value: fmtUptime(runtime.uptimeSeconds) }
          : null,
      ]
        .filter(Boolean)
        .map(
          (item) => `
            <span class="mini-chip">
              <span class="mini-label">${escapeHtml(item.label)}</span>
              <span>${escapeHtml(item.value)}</span>
            </span>`,
        )
        .join("");

      return `
        <button type="button" class="service-row ${escapeHtml(serviceState)}${state.selectedServiceId === service.id ? " selected" : ""}" data-service-select="${escapeHtml(service.id)}">
          <div class="service-row-head">
            <div class="service-row-main">
              <div class="service-row-title">${escapeHtml(service.name)}</div>
              <div class="service-row-subtitle">${escapeHtml(service.description || service.summary)}</div>
            </div>
            <div class="service-state-pill ${escapeHtml(serviceState)}">
              <span class="service-dot"></span>
              ${escapeHtml(badgeLabel)}
            </div>
          </div>
          <div class="service-row-summary">${escapeHtml(service.summary || "")}</div>
          ${metaChips ? `<div class="service-row-meta">${metaChips}</div>` : ""}
        </button>`;
    })
    .join("");
}

function render() {
  syncBootstrapDisplay();
  const orderedServices = getOrderedServices();
  ensureSelectedServiceId(orderedServices);
  renderSectionChrome(orderedServices);
  renderHeader(orderedServices);

  if (state.activeSection === "runtime") {
    updateButtonState();
    renderServiceRail(orderedServices);
    renderServiceDetail(orderedServices);
    renderLogs();
  }
}

function hostPost(type, payload = {}) {
  if (!window.chrome?.webview) {
    return;
  }

  window.chrome.webview.postMessage({ type, payload });
}

function requestRouteLaunch(routeId) {
  const route = routeItemById(routeId);
  if (!route) {
    return;
  }

  hostPost("suite.route.open", {
    routeId,
    routePath: route.path,
    routeTitle: route.title,
  });
}

function pushLog(entry) {
  state.logs.push(entry);
  if (state.logs.length > 500) {
    state.logs = state.logs.slice(-500);
  }
}

function handleHostMessage(message) {
  switch (message.type) {
    case "runtime.catalog":
      state.runtimeCatalog = normalizeRuntimeCatalog(message.payload);
      break;
    case "developer.manifest":
      state.developerToolsManifest = normalizeDeveloperToolsManifest(message.payload);
      break;
    case "runtime.snapshot": {
      const payload = message.payload || {};
      state.overall = payload.overall || state.overall;
      state.doctor = payload.doctor || null;
      state.runtimeMeta = payload.runtime || null;
      state.supportMeta = payload.support || null;
      state.companionApps = Array.isArray(payload.companionApps) ? payload.companionApps : [];
      state.services = Array.isArray(payload.services) ? payload.services : [];
      state.hasSnapshot = true;
      const lastBootstrap = payload.runtime?.lastBootstrap;
      if (lastBootstrap?.summary) {
        const formattedTimestamp = formatHeaderTimestamp(lastBootstrap.timestamp);
        state.lastBootstrap = formattedTimestamp
          ? `Updated ${formattedTimestamp} • ${lastBootstrap.summary}`
          : lastBootstrap.summary;
      } else {
        state.lastBootstrap = "Waiting for status…";
      }
      ensureSelectedServiceId(getOrderedServices());
      break;
    }
    case "runtime.bootstrap_state":
      state.bootstrap = message.payload?.available ? message.payload : null;
      syncBootstrapDisplay(Date.now());
      break;
    case "runtime.log":
      if (message.payload?.reset) {
        state.logs = [];
      } else {
        pushLog(message.payload || {});
      }
      break;
    case "runtime.progress":
      state.progress = {
        visible: Boolean(message.payload?.visible),
        percent: Number(message.payload?.percent || 0),
        step: message.payload?.step || "Working…",
      };
      break;
    case "runtime.action_state":
      state.busy = Boolean(message.payload?.busy);
      state.action = message.payload?.action || null;
      state.actionServiceId = message.payload?.serviceId || null;
      if (message.payload?.serviceId) {
        state.selectedServiceId = message.payload.serviceId;
      }
      break;
    case "runtime.error":
      pushLog({
        timestamp: formatLogTimestamp(new Date()),
        tag: "ERR",
        tone: "err",
        message: `${message.payload?.message || "Runtime error."} ${message.payload?.details || ""}`.trim(),
      });
      break;
  }

  render();
}

window.chrome?.webview?.addEventListener("message", (event) => {
  handleHostMessage(event.data);
});

dom.bootstrapButton.addEventListener("click", () => hostPost("runtime.bootstrap_all"));
dom.startAllButton.addEventListener("click", () => hostPost("runtime.start_all"));
dom.stopAllButton.addEventListener("click", () => hostPost("runtime.stop_all"));
dom.refreshButton.addEventListener("click", () => hostPost("runtime.refresh"));
dom.clearLogButton.addEventListener("click", () => hostPost("runtime.clear_log"));
dom.autoscrollButton.addEventListener("click", () => {
  state.autoScroll = !state.autoScroll;
  render();
});

dom.sectionNav?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-section]");
  if (!button) {
    return;
  }

  const sectionId = button.getAttribute("data-section");
  if (!sectionId) {
    return;
  }

  setActiveSection(sectionId);
  render();
});

dom.workshopContent?.addEventListener("click", (event) => {
  const supportButton = event.target.closest("button[data-support-action]");
  if (supportButton) {
    const supportAction = supportButton.getAttribute("data-support-action");
    if (supportAction) {
      hostPost(`suite.support.${supportAction}`);
    }
    return;
  }

  const companionButton = event.target.closest("button[data-companion-action]");
  if (companionButton) {
    const companionAction = companionButton.getAttribute("data-companion-action");
    const companionId = companionButton.getAttribute("data-companion-id");
    if (companionAction && companionId) {
      hostPost(`suite.companion.${companionAction}`, { companionAppId: companionId });
    }
    return;
  }

  const button = event.target.closest("button[data-launch-route]");
  if (!button) {
    return;
  }

  const routeId = button.getAttribute("data-launch-route");
  if (!routeId) {
    return;
  }

  requestRouteLaunch(routeId);
});

dom.servicesList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-service-select]");
  if (!button) {
    return;
  }

  const serviceId = button.getAttribute("data-service-select");
  if (!serviceId) {
    return;
  }

  state.selectedServiceId = serviceId;
  render();
});

dom.serviceDetail.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.getAttribute("data-action");
  const serviceId = button.getAttribute("data-service-id");
  if (!action || !serviceId) {
    return;
  }

  if (action === "open-logs") {
    hostPost("runtime.service.open_logs", { serviceId });
    return;
  }

  hostPost(`runtime.service.${action}`, { serviceId });
});

setInterval(tickClock, 1000);
setInterval(() => {
  if (!state.bootstrap?.running || !state.bootstrap?.showCard) {
    return;
  }

  if (syncBootstrapDisplay(Date.now())) {
    render();
  }
}, 180);
tickClock();
render();
