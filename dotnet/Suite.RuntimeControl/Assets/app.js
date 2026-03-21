const SERVICE_ORDER = [
  "supabase",
  "backend",
  "gateway",
  "frontend",
  "watchdog-filesystem",
  "watchdog-autocad",
];

const SERVICE_META = {
  supabase: {
    shortLabel: "SB",
    bootLabel: "Supabase",
    description: "PostgreSQL, Auth, Storage, and local APIs",
  },
  backend: {
    shortLabel: "BE",
    bootLabel: "Watchdog Backend",
    description: "API server and runtime jobs",
  },
  gateway: {
    shortLabel: "GW",
    bootLabel: "API Gateway",
    description: "Local transport and auth edge",
  },
  frontend: {
    shortLabel: "UI",
    bootLabel: "Suite Frontend",
    description: "Vite shell and local app routes",
  },
  "watchdog-filesystem": {
    shortLabel: "FS",
    bootLabel: "Filesystem Collector",
    description: "Filesystem watcher and activity intake",
  },
  "watchdog-autocad": {
    shortLabel: "AC",
    bootLabel: "AutoCAD Collector",
    description: "Drawing tracker and plugin heartbeat",
  },
};

const BOOTSTRAP_STEP_ORDER = [
  "docker-ready",
  "supabase-start",
  "supabase-env",
  "watchdog-filesystem",
  "watchdog-autocad-startup",
  "watchdog-autocad-plugin",
  "backend",
  "gateway",
  "frontend",
];

const BOOTSTRAP_STEP_META = {
  "docker-ready": { label: "Docker Engine", shortLabel: "DK" },
  "supabase-start": { label: "Supabase", shortLabel: "SB" },
  "supabase-env": { label: "Supabase Env", shortLabel: "SE" },
  "watchdog-filesystem": { label: "Filesystem Collector", shortLabel: "FS" },
  "watchdog-autocad-startup": { label: "AutoCAD Collector", shortLabel: "AC" },
  "watchdog-autocad-plugin": { label: "AutoCAD Plugin", shortLabel: "AP" },
  backend: { label: "Watchdog Backend", shortLabel: "BE" },
  gateway: { label: "API Gateway", shortLabel: "GW" },
  frontend: { label: "Suite Frontend", shortLabel: "UI" },
};

const STATUS_LABELS = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
  pending: "Pending",
};

const DISPLAY_TIME_ZONE = "America/Chicago";
const bootstrapDisplayApi = globalThis.SuiteRuntimeControlBootstrapDisplayProgress || null;
const state = {
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
  clockDate: document.getElementById("clock-date"),
  clock: document.getElementById("clock"),
  overallStatus: document.getElementById("overall-status"),
  overallStatusText: document.getElementById("overall-status-text"),
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
  return SERVICE_ORDER.map((serviceId) => {
    const service = byId.get(serviceId);
    const meta = SERVICE_META[serviceId] || {};
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

  return SERVICE_META[serviceId]?.bootLabel || serviceId;
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

  return `
    <section class="activity-sequence">
      ${BOOTSTRAP_STEP_ORDER.map((stepId) => {
        const meta = BOOTSTRAP_STEP_META[stepId] || { label: stepId, shortLabel: stepId.slice(0, 2).toUpperCase() };
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
      { text: `Completed • ${completedCount} / ${BOOTSTRAP_STEP_ORDER.length}` },
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
  dom.runningCount.textContent = `${runningCount} / ${orderedServices.length || SERVICE_ORDER.length} running`;

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
  updateButtonState();
  renderHeader(orderedServices);
  renderServiceRail(orderedServices);
  renderServiceDetail(orderedServices);
  renderLogs();
}

function hostPost(type, payload = {}) {
  if (!window.chrome?.webview) {
    return;
  }

  window.chrome.webview.postMessage({ type, payload });
}

function pushLog(entry) {
  state.logs.push(entry);
  if (state.logs.length > 500) {
    state.logs = state.logs.slice(-500);
  }
}

function handleHostMessage(message) {
  switch (message.type) {
    case "runtime.snapshot": {
      const payload = message.payload || {};
      state.overall = payload.overall || state.overall;
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
