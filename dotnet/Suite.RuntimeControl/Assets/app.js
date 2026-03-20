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

const STATUS_LABELS = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
  pending: "Pending",
};

const DISPLAY_TIME_ZONE = "America/Chicago";
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
  splash: {
    visible: true,
    dismissing: false,
    hasSnapshot: false,
    startedAt: Date.now(),
  },
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
  splash: document.getElementById("splash"),
  appShell: document.getElementById("app-shell"),
  splashServices: document.getElementById("splash-services"),
  splashLog: document.getElementById("splash-log"),
  splashStatus: document.getElementById("splash-status"),
  splashStatusText: document.getElementById("splash-status-text"),
  splashAction: document.getElementById("splash-action"),
  splashClock: document.getElementById("splash-clock"),
  splashProgressStep: document.getElementById("splash-progress-step"),
  splashProgressPercent: document.getElementById("splash-progress-percent"),
  splashProgressFill: document.getElementById("splash-progress-fill"),
  clockDate: document.getElementById("clock-date"),
  clock: document.getElementById("clock"),
  overallStatus: document.getElementById("overall-status"),
  overallStatusText: document.getElementById("overall-status-text"),
  runningCount: document.getElementById("running-count"),
  lastBootstrap: document.getElementById("last-bootstrap"),
  servicesList: document.getElementById("services-list"),
  serviceDetail: document.getElementById("service-detail"),
  logBody: document.getElementById("log-body"),
  progressPanel: document.getElementById("progress-panel"),
  progressStep: document.getElementById("progress-step"),
  progressPercent: document.getElementById("progress-percent"),
  progressFill: document.getElementById("progress-fill"),
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

function tickClock() {
  const now = new Date();
  const timeText = `${headerTimeFormatter.format(now)} CT`;
  dom.clockDate.textContent = headerDateFormatter.format(now);
  dom.clock.textContent = timeText;
  dom.splashClock.textContent = timeText;
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
      state: service?.state || (state.splash.hasSnapshot ? "stopped" : "pending"),
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

function getSplashPercent() {
  if (state.progress.visible) {
    return Math.max(4, Math.min(100, Number(state.progress.percent || 0)));
  }

  if (!state.splash.hasSnapshot) {
    return 6;
  }

  const runningCount = state.services.filter((service) => service.state === "running").length;
  const total = Math.max(state.services.length, SERVICE_ORDER.length, 1);
  return state.busy ? Math.max(14, Math.round((runningCount / total) * 100)) : 100;
}

function getSplashStepText() {
  if (state.progress.visible && state.progress.step) {
    return state.progress.step;
  }

  if (state.busy) {
    return `${presentAction(state.action)}…`;
  }

  if (!state.splash.hasSnapshot) {
    return "Collecting runtime status…";
  }

  if (state.overall.state === "healthy") {
    return "Runtime ready.";
  }

  return "Reviewing local services…";
}

function getSplashStatusModel() {
  if (!state.splash.hasSnapshot) {
    return { state: "booting", text: "Initializing runtime shell…" };
  }

  if (state.busy || state.progress.visible) {
    return { state: "booting", text: getSplashStepText() };
  }

  if (state.overall.state === "healthy") {
    return { state: "healthy", text: "Runtime ready." };
  }

  if (state.overall.state === "down") {
    return { state: "down", text: "Runtime offline." };
  }

  return { state: "degraded", text: "Runtime needs attention." };
}

function renderSplash() {
  const orderedServices = getOrderedServices();
  dom.splashServices.innerHTML = orderedServices
    .map((service) => {
      const stateClass = service.state || "pending";
      const badgeLabel = STATUS_LABELS[stateClass] || String(stateClass).toUpperCase();
      const description = service.description || service.summary;
      const subtitle = service.summary || description;
      return `
        <article class="splash-service ${escapeHtml(stateClass)}">
          <div class="splash-node">${escapeHtml(service.shortLabel)}</div>
          <div class="splash-service-copy">
            <div class="splash-service-head">
              <div>
                <div class="splash-service-name">${escapeHtml(service.name)}</div>
                <div class="splash-service-desc">${escapeHtml(description)}</div>
              </div>
              <div class="splash-service-badge ${escapeHtml(stateClass)}">
                <span class="splash-node-dot"></span>
                ${escapeHtml(badgeLabel)}
              </div>
            </div>
            <div class="detail-text">${escapeHtml(subtitle)}</div>
          </div>
        </article>`;
    })
    .join("");

  if (!state.logs.length) {
    dom.splashLog.innerHTML = '<div class="log-empty splash-empty">Waiting for runtime output…</div>';
  } else {
    dom.splashLog.innerHTML = state.logs
      .slice(-18)
      .map((entry) => {
        const tone = entry.tone ? ` tone-${entry.tone}` : "";
        return `
          <div class="splash-log-entry${tone}">
            <span class="timestamp">${escapeHtml(entry.timestamp || "--:--:--")}</span>
            <span class="tag">${escapeHtml(entry.tag || "INFO")}</span>
            <span class="message">${escapeHtml(entry.message || "")}</span>
          </div>`;
      })
      .join("");
    dom.splashLog.scrollTop = dom.splashLog.scrollHeight;
  }

  const splashStatus = getSplashStatusModel();
  dom.splashStatus.className = `splash-status ${splashStatus.state}`;
  dom.splashStatusText.textContent = splashStatus.text;
  dom.splashAction.textContent = getSplashStepText();
  dom.splashProgressStep.textContent = getSplashStepText();
  dom.splashProgressPercent.textContent = `${getSplashPercent()}%`;
  dom.splashProgressFill.style.width = `${getSplashPercent()}%`;
}

function updateButtonState() {
  const disable = state.busy;
  dom.bootstrapButton.disabled = disable;
  dom.startAllButton.disabled = disable;
  dom.stopAllButton.disabled = disable;
  dom.refreshButton.disabled = disable;
  dom.clearLogButton.disabled = false;
  dom.autoscrollButton.textContent = `Auto-scroll ${state.autoScroll ? "ON" : "OFF"}`;
  dom.actionLabel.textContent = state.busy ? presentAction(state.action) : "Idle";
}

function renderHeader(orderedServices) {
  dom.overallStatus.className = `overall-status ${state.overall.state || "booting"}`;
  dom.overallStatusText.textContent = state.overall.text || "BOOTING";
  const runningCount = orderedServices.filter((service) => service.state === "running").length;
  dom.runningCount.textContent = `${runningCount} / ${orderedServices.length || SERVICE_ORDER.length} running`;
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
        {
          label: "Port",
          value: runtime.port > 0 ? String(runtime.port) : "—",
        },
        {
          label: "Uptime",
          value: fmtUptime(runtime.uptimeSeconds),
        },
      ]
        .filter((item) => item.value && item.value !== "—")
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

function renderQuickChips(service, serviceState) {
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
  ].filter(Boolean);

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

function renderServiceDetail(orderedServices) {
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

        ${renderQuickChips(service, serviceState)}

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

function renderProgress() {
  dom.progressPanel.classList.toggle("hidden", !state.progress.visible);
  dom.progressStep.textContent = state.progress.step || "Working…";
  dom.progressPercent.textContent = `${state.progress.percent || 0}%`;
  dom.progressFill.style.width = `${state.progress.percent || 0}%`;
}

function render() {
  const orderedServices = getOrderedServices();
  ensureSelectedServiceId(orderedServices);
  updateButtonState();
  renderHeader(orderedServices);
  renderServiceRail(orderedServices);
  renderServiceDetail(orderedServices);
  renderLogs();
  renderProgress();
  renderSplash();
}

function maybeDismissSplash() {
  if (!state.splash.visible || state.splash.dismissing || !state.splash.hasSnapshot) {
    return;
  }

  if (state.busy || state.progress.visible) {
    return;
  }

  state.splash.dismissing = true;
  const elapsed = Date.now() - state.splash.startedAt;
  const delay = Math.max(250, 1100 - elapsed);
  window.setTimeout(() => {
    dom.splash.classList.add("hidden");
    dom.appShell.classList.add("ready");
    window.setTimeout(() => {
      state.splash.visible = false;
      dom.splash.setAttribute("aria-hidden", "true");
    }, 420);
  }, delay);
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
      state.splash.hasSnapshot = true;
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
  maybeDismissSplash();
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
tickClock();
render();
