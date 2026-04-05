const STATUS_LABELS = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
  pending: "Pending",
  healthy: "Healthy",
  degraded: "Partial",
  down: "Down",
  booting: "Booting",
};

const WORKSPACE_META = {
  office: {
    label: "Office",
    shellTitle: "Office Workspace",
    heading: "Private workspace for communication, study, reference, and follow-through.",
    summary: "Professional Office workspace for communication, research, and local reference.",
    views: [
      { id: "chat", label: "Conversations", title: "Routed communication, transcript review, and guided next actions." },
      { id: "study", label: "Study", title: "Structured study sessions, scoring loops, and reflection." },
      { id: "library", label: "Reference", title: "Knowledge intake, source review, and indexed reference material." },
      { id: "growth", label: "Progress", title: "Research tracks, evidence, and follow-through." },
    ],
  },
  runtime: {
    label: "Runtime Control",
    shellTitle: "Runtime Control",
    heading: "Machine-local control, container observability, diagnostics, and project readiness.",
    summary: "Operational control surface for local services, Docker-backed runtime core, support export, and ACADE readiness.",
    views: [
      { id: "runtime", label: "Runtime", title: "Start, stop, and review local services." },
      { id: "watchdog", label: "Watchdog", title: "Collector health, telemetry coverage, and trust status." },
      { id: "projects", label: "Projects / ACADE", title: "Project readiness, plugin state, and Autodesk reference." },
      { id: "diagnostics", label: "Diagnostics", title: "Checks, recovery actions, and runtime evidence." },
      { id: "support", label: "Support", title: "Logs, support bundle, and workstation controls." },
    ],
  },
};

const DISPLAY_TIME_ZONE = "America/Chicago";
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
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const UTILITY_PANE_WIDTH_MODE = Object.freeze({
  wide: "wide",
  compact: "compact",
  narrow: "narrow",
});
const SHELL_DEFAULT_CONTENT_SCALE_PERCENT = 125;
const SHELL_CONTENT_SCALE_PRESETS = Object.freeze([100, 110, 125, 140]);
const UTILITY_PANE_DEFAULT_WIDTH = 440;
const UTILITY_PANE_MIN_WIDTH = 360;
const UTILITY_PANE_MAX_WIDTH = 820;
const UTILITY_PANE_COMPACT_MAX_WIDTH = 520;
const UTILITY_PANE_NARROW_MAX_WIDTH = 430;

const EMPTY_RUNTIME_CATALOG = Object.freeze({
  serviceOrder: [],
  services: {},
  workshopRouteShortcuts: {},
  supportActions: [],
});

const state = {
  activeWorkspace: "office",
  activeViews: {
    office: "chat",
    runtime: "runtime",
  },
  runtimeSnapshot: null,
  officeSnapshot: null,
  runtimeCatalog: EMPTY_RUNTIME_CATALOG,
  developerManifest: { groups: [], tools: [] },
  logs: [],
  progress: { visible: false, percent: 0, step: "" },
  bootstrap: null,
  busy: false,
  action: null,
  actionServiceId: null,
  activeUtilityTab: "context",
  utilityPaneWidth: UTILITY_PANE_DEFAULT_WIDTH,
  utilityPaneCollapsed: true,
  contentScalePercent: SHELL_DEFAULT_CONTENT_SCALE_PERCENT,
  autoScroll: true,
  commandQuery: "",
  commandFocused: false,
  displayMenuOpen: false,
  actionRegistry: new Map(),
  actionCounter: 0,
  officeActionStatus: null,
  logFilter: "",
  activeLogSourceId: "transcript",
  activeLogSource: null,
  logSources: [],
  officeDrafts: {
    chatMessage: "",
    routeOverride: "",
    threadId: "",
    studyFocus: "",
    practiceSubmission: "",
    defenseSubmission: "",
    reflection: "",
    researchPrompt: "",
    researchNotes: "",
    libraryImportPath: "",
  },
};

const dom = {
  appShell: document.getElementById("app-shell"),
  workspaceHeading: document.getElementById("workspace-heading"),
  workspaceSubheading: document.getElementById("workspace-subheading"),
  workspaceSummary: document.getElementById("workspace-summary"),
  workspaceSwitcher: document.getElementById("workspace-switcher"),
  workspaceViewNav: document.getElementById("workspace-view-nav"),
  workspaceActions: document.getElementById("workspace-actions"),
  heroPanel: document.getElementById("hero-panel"),
  workspaceContent: document.getElementById("workspace-content"),
  overallStatusPill: document.getElementById("overall-status-pill"),
  providerStatusPill: document.getElementById("provider-status-pill"),
  utilityDockBtn: document.getElementById("utility-dock-btn"),
  displayMenuButton: document.getElementById("display-menu-btn"),
  displayMenu: document.getElementById("display-menu"),
  shellScaleControls: document.getElementById("shell-scale-controls"),
  clockDate: document.getElementById("clock-date"),
  clockTime: document.getElementById("clock-time"),
  commandInput: document.getElementById("command-input"),
  commandResults: document.getElementById("command-results"),
  utilityPane: document.getElementById("utility-pane"),
  utilitySubtitle: document.getElementById("utility-subtitle"),
  utilityTabRow: document.getElementById("utility-tab-row"),
  utilityResizer: document.getElementById("utility-resizer"),
  utilityContent: document.getElementById("utility-content"),
  logBody: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDateTime(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return `${dateTimeFormatter.format(date)} CT`;
}

function tickClock() {
  const now = new Date();
  dom.clockDate.textContent = headerDateFormatter.format(now);
  dom.clockTime.textContent = `${headerTimeFormatter.format(now)} CT`;
}

function applyUtilityPaneWidth() {
  const bounds = getUtilityPaneWidthBounds();
  const width = Math.max(bounds.min, Math.min(bounds.max, Number(state.utilityPaneWidth) || UTILITY_PANE_DEFAULT_WIDTH));
  state.utilityPaneWidth = width;
  document.documentElement.style.setProperty("--utility-pane-min-width", `${bounds.min}px`);
  document.documentElement.style.setProperty("--utility-pane-width", `${width}px`);
  syncUtilityPaneLayoutState();
}

function syncShellChromeState() {
  if (dom.appShell) {
    dom.appShell.dataset.utilityCollapsed = state.utilityPaneCollapsed ? "true" : "false";
    dom.appShell.dataset.workspace = state.activeWorkspace;
  }

  if (dom.utilityPane) {
    dom.utilityPane.hidden = state.utilityPaneCollapsed;
    dom.utilityPane.setAttribute("aria-hidden", state.utilityPaneCollapsed ? "true" : "false");
  }

  if (dom.utilityDockBtn) {
    dom.utilityDockBtn.classList.toggle("is-active", !state.utilityPaneCollapsed);
    dom.utilityDockBtn.setAttribute("aria-pressed", String(!state.utilityPaneCollapsed));
    dom.utilityDockBtn.textContent = state.utilityPaneCollapsed ? "Open Dock" : "Close Dock";
  }

  if (dom.displayMenuButton) {
    dom.displayMenuButton.classList.toggle("is-active", state.displayMenuOpen);
    dom.displayMenuButton.setAttribute("aria-expanded", String(state.displayMenuOpen));
  }

  if (dom.displayMenu) {
    dom.displayMenu.classList.toggle("hidden", !state.displayMenuOpen);
  }
}

function normalizeContentScalePercent(value) {
  return Math.max(
    SHELL_CONTENT_SCALE_PRESETS[0],
    Math.min(
      SHELL_CONTENT_SCALE_PRESETS[SHELL_CONTENT_SCALE_PRESETS.length - 1],
      Number(value) || SHELL_DEFAULT_CONTENT_SCALE_PERCENT,
    ),
  );
}

function getViewportScaleProfile() {
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);

  if (viewportWidth >= 2400 || (viewportWidth >= 2200 && viewportHeight >= 1300)) {
    return {
      typeScale: 1.24,
      spaceScale: 1.18,
      navWidth: 320,
      utilityPaneMinWidth: 460,
    };
  }

  if (viewportWidth >= 1900 || viewportHeight >= 1200) {
    return {
      typeScale: 1.18,
      spaceScale: 1.13,
      navWidth: 292,
      utilityPaneMinWidth: 430,
    };
  }

  if (viewportWidth >= 1560) {
    return {
      typeScale: 1.1,
      spaceScale: 1.08,
      navWidth: 264,
      utilityPaneMinWidth: 396,
    };
  }

  return {
    typeScale: 1,
    spaceScale: 1,
    navWidth: 228,
    utilityPaneMinWidth: UTILITY_PANE_MIN_WIDTH,
  };
}

function applyShellScaleVars() {
  const userScale = normalizeContentScalePercent(state.contentScalePercent) / 100;
  const profile = getViewportScaleProfile();
  const userTypeBoost = 1 + Math.max(0, userScale - 1) * 0.5;
  const userSpaceBoost = 1 + Math.max(0, userScale - 1) * 0.3;

  document.documentElement.style.setProperty("--shell-user-scale", userScale.toFixed(3));
  document.documentElement.style.setProperty("--shell-type-scale", (profile.typeScale * userTypeBoost).toFixed(3));
  document.documentElement.style.setProperty("--shell-space-scale", (profile.spaceScale * userSpaceBoost).toFixed(3));
  document.documentElement.style.setProperty("--shell-nav-width", `${profile.navWidth}px`);
}

function getUtilityPaneWidthBounds() {
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
  const profile = getViewportScaleProfile();
  const min = Math.max(
    UTILITY_PANE_MIN_WIDTH,
    Math.min(profile.utilityPaneMinWidth, Math.max(UTILITY_PANE_MIN_WIDTH, viewportWidth - 720)),
  );
  const max = Math.max(
    min,
    Math.min(
      UTILITY_PANE_MAX_WIDTH,
      Math.round(viewportWidth * (viewportWidth >= 2200 ? 0.34 : viewportWidth >= 1700 ? 0.37 : 0.4)),
    ),
  );

  return { min, max };
}

function getUtilityPaneWidthMode() {
  if (window.matchMedia("(max-width: 1120px)").matches) {
    return UTILITY_PANE_WIDTH_MODE.narrow;
  }

  const paneWidth = Math.round(dom.utilityPane?.getBoundingClientRect().width || state.utilityPaneWidth || 0);
  if (paneWidth <= UTILITY_PANE_NARROW_MAX_WIDTH) {
    return UTILITY_PANE_WIDTH_MODE.narrow;
  }
  if (paneWidth <= UTILITY_PANE_COMPACT_MAX_WIDTH) {
    return UTILITY_PANE_WIDTH_MODE.compact;
  }

  return UTILITY_PANE_WIDTH_MODE.wide;
}

function syncUtilityPaneLayoutState() {
  const widthMode = getUtilityPaneWidthMode();
  if (dom.utilityPane) {
    dom.utilityPane.dataset.widthMode = widthMode;
    dom.utilityPane.dataset.utilityTab = state.activeUtilityTab;
  }
  if (dom.utilityContent) {
    dom.utilityContent.dataset.widthMode = widthMode;
    dom.utilityContent.dataset.utilityTab = state.activeUtilityTab;
  }

  return widthMode;
}

function getUtilitySubtitle() {
  switch (state.activeUtilityTab) {
    case "logs":
      return "Live transcript plus selected service logs without extra PowerShell windows.";
    case "inbox":
      return "Approvals, queued work, and recent results stay docked here.";
    default:
      return "Context, logs, and inbox stay docked here.";
  }
}

function setActiveUtilityTab(tabId, options = {}) {
  state.activeUtilityTab = ["context", "logs", "inbox"].includes(tabId) ? tabId : "context";
  state.displayMenuOpen = false;
  if (!options.keepCollapsed) {
    state.utilityPaneCollapsed = false;
  }
  if (!options.silent) {
    persistShellUiState();
  }
  render();
}

function setUtilityPaneCollapsed(collapsed, options = {}) {
  state.utilityPaneCollapsed = Boolean(collapsed);
  state.displayMenuOpen = false;
  if (!options.silent) {
    persistShellUiState();
  }
  render();
}

function toggleUtilityPane(options = {}) {
  setUtilityPaneCollapsed(!state.utilityPaneCollapsed, options);
}

function setActiveLogSource(logSourceId, options = {}) {
  state.activeLogSourceId = logSourceId || "transcript";
  if (!options.silent) {
    hostPost("runtime.logs.select_source", { sourceId: state.activeLogSourceId });
  }
}

function persistShellUiState() {
  hostPost("shell.window_state.update", {
    utilityPaneWidth: state.utilityPaneWidth,
    utilityPaneCollapsed: state.utilityPaneCollapsed,
    activeUtilityTab: state.activeUtilityTab,
    utilityPaneTab: state.activeUtilityTab,
    activeLogSourceId: state.activeLogSourceId,
    contentScalePercent: state.contentScalePercent,
  });
}

function setContentScalePercent(percent, options = {}) {
  state.contentScalePercent = normalizeContentScalePercent(percent);
  applyShellScaleVars();
  if (!options.silent) {
    persistShellUiState();
  }
  render();
}

function getWorkspaceMeta(workspaceId = state.activeWorkspace) {
  return WORKSPACE_META[workspaceId] || WORKSPACE_META.office;
}

function getActiveView(workspaceId = state.activeWorkspace) {
  return state.activeViews[workspaceId] || getWorkspaceMeta(workspaceId).views[0].id;
}

function getRuntimeSnapshot() {
  return state.runtimeSnapshot || {};
}

function getOfficeSnapshot() {
  return state.officeSnapshot || {};
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function getOfficeLiveState() {
  const office = getOfficeSnapshot();
  const live = office.liveState;
  if (live && typeof live === "object") {
    return live;
  }

  return {};
}

function getOfficeBroker() {
  const office = getOfficeSnapshot();
  const broker = office.broker;
  if (broker && typeof broker === "object") {
    return broker;
  }

  return {};
}

function getOfficeProviderState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  return live.provider || office.provider || {};
}

function getOfficeSuiteState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  return live.suite || office.suite || {};
}

function getOfficeResearchState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  const research = live.research || office.research || {};
  const history = toArray(firstDefined(research.history, research.runs)).map((item, index) => ({
    id: firstDefined(item?.id, `research-${index + 1}`),
    title: firstDefined(item?.title, item?.label, item?.id, `Research ${index + 1}`),
    summary: firstDefined(item?.summary, item?.detail, item?.notes, ""),
    updatedAt: firstDefined(item?.updatedAt, item?.createdAt, item?.generatedAt),
  }));
  return {
    latestReport: firstDefined(research.latestReport, {}),
    summary: firstDefined(research.summary, "Run a live research query to pull current web sources into the desk."),
    runSummary: firstDefined(research.runSummary, "No live research run yet."),
    history,
  };
}

function getOfficeChatState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  const chat = live.chat || office.chat || {};
  const routeOptions = toArray(firstDefined(chat.routeOptions, chat.routes, chat.availableRoutes)).map((item) => {
    if (typeof item === "string") {
      return { id: item, label: item };
    }
    return {
      id: firstDefined(item?.id, item?.route, item?.name, item?.value) || "default",
      label: firstDefined(item?.label, item?.title, item?.name, item?.route) || "Route",
      title: firstDefined(item?.label, item?.title, item?.name, item?.route) || "Route",
      perspective: firstDefined(item?.perspective, ""),
      summary: firstDefined(item?.summary, item?.detail, item?.description, ""),
    };
  });
  const threads = toArray(chat.threads).map((item, index) => ({
    id: firstDefined(item?.id, item?.threadId, `thread-${index + 1}`),
    label: firstDefined(item?.displayTitle, item?.title, item?.label, item?.id, item?.threadId, `Thread ${index + 1}`),
    title: firstDefined(item?.displayTitle, item?.title, item?.label, item?.id, item?.threadId, `Thread ${index + 1}`),
    updatedAt: firstDefined(item?.updatedAt, item?.lastMessageAt, item?.lastWriteAt),
    messages: toArray(firstDefined(item?.messages, item?.transcript)),
  }));
  const currentThreadId = firstDefined(
    state.officeDrafts.threadId,
    chat.activeThreadId,
    chat.currentThreadId,
    threads[0]?.id,
  ) || "";
  const activeThread = threads.find((item) => item.id === currentThreadId) || threads[0] || null;
  const transcript = toArray(firstDefined(chat.transcript, chat.messages, activeThread?.messages)).map((item, index) => ({
    id: firstDefined(item?.id, item?.messageId, `message-${index + 1}`),
    role: firstDefined(item?.role, item?.speaker, "system"),
    text: firstDefined(item?.text, item?.message, item?.content, ""),
    timestamp: firstDefined(item?.timestamp, item?.createdAt, item?.time),
  }));
  const currentRoute = firstDefined(
    state.officeDrafts.routeOverride,
    chat.currentRoute,
    chat.route,
    routeOptions[0]?.id,
    "default",
  );
  const activeRouteOption = routeOptions.find((item) => item.id === currentRoute) || routeOptions[0] || null;
  const suggestedMoves = toArray(firstDefined(chat.suggestedMoves, live.suggestedMoves)).map((item) => {
    if (typeof item === "string") {
      return item;
    }
    return firstDefined(item?.label, item?.title, item?.text, item?.summary) || "Suggested move";
  });
  const suiteContext = toArray(firstDefined(live.suiteContext, chat.suiteContext, live.context)).map((item) => {
    if (typeof item === "string") {
      return item;
    }
    return firstDefined(item?.label, item?.title, item?.summary, item?.text) || "Suite context";
  });
  const studyState = firstDefined(live.study, office.study, {});
  return {
    currentRoute,
    currentRouteTitle: firstDefined(chat.currentRouteTitle, activeRouteOption?.title, activeRouteOption?.label, currentRoute),
    routeReason: firstDefined(chat.routeReason, activeRouteOption?.summary, ""),
    routeOptions,
    threads,
    currentThreadId,
    currentThreadTitle: firstDefined(activeThread?.label, activeThread?.title, currentThreadId, "Thread"),
    transcript,
    suggestedMoves,
    suiteContext,
    suitePulse: firstDefined(getOfficeSuiteState().pulse, ""),
    suiteTrustSummary: firstDefined(getOfficeSuiteState().trustSummary, ""),
    studyState,
  };
}

function getOfficeStudyState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  const study = live.study || office.study || {};
  const session = firstDefined(study.session, {});
  const history = firstDefined(study.history, {});
  const sequence = toArray(firstDefined(study.sequence, study.steps)).map((item, index) => ({
    id: firstDefined(item?.id, item?.key, `step-${index + 1}`),
    title: firstDefined(item?.title, item?.label, item?.name, `Step ${index + 1}`),
    detail: firstDefined(item?.detail, item?.summary, item?.description, ""),
    status: firstDefined(item?.status, item?.state, "pending"),
  }));

  return {
    sequence,
    stage: firstDefined(session.stage, ""),
    stageSummary: firstDefined(session.stageSummary, ""),
    focus: firstDefined(study.focus, session?.focus, ""),
    difficulty: firstDefined(study.difficulty, session?.difficulty, "Mixed"),
    questionCount: Number(firstDefined(study.questionCount, session?.questionCount, 6)) || 6,
    practicePrompt: firstDefined(study.practicePrompt, study.practice?.prompt, ""),
    practiceQuestions: toArray(firstDefined(study.practiceQuestions, study.activePracticeTest?.questions)),
    defensePrompt: firstDefined(study.defensePrompt, study.defense?.prompt, ""),
    defenseScenario: firstDefined(study.activeDefenseScenario, study.defense, {}),
    latestScore: firstDefined(study.latestScore, study.score, study.practice?.score, study.defense?.score, ""),
    latestReflection: firstDefined(study.latestReflection, study.reflection, history?.reflectionSummary, ""),
    reflection: firstDefined(study.latestReflection, study.reflection, ""),
    hints: toArray(firstDefined(study.hints, study.coachingNotes)),
    practiceResultSummary: firstDefined(study.practiceResultSummary, ""),
    defenseScoreSummary: firstDefined(study.defenseScoreSummary, ""),
    defenseFeedbackSummary: firstDefined(study.defenseFeedbackSummary, ""),
    reflectionContextSummary: firstDefined(study.reflectionContextSummary, ""),
    historySummary: firstDefined(history.overallSummary, ""),
    reviewQueueSummary: firstDefined(history.reviewQueueSummary, ""),
    defenseHistorySummary: firstDefined(history.defenseSummary, ""),
    historyPath: firstDefined(session.historyFilePath, ""),
    historyExists: Boolean(firstDefined(session.historyExists, false)),
    lastHistoryWriteAt: firstDefined(session.lastHistoryWriteAt, ""),
  };
}

function getOfficeLibraryState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  const library = live.library || office.library || {};
  const documents = toArray(firstDefined(library.documents, library.items, library.recent, office.knowledge?.recentDocuments)).map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `document-${index + 1}`,
        title: item,
        path: item,
        summary: "",
        updatedAt: "",
      };
    }
    return {
      id: firstDefined(item?.id, item?.path, `document-${index + 1}`),
      title: firstDefined(item?.title, item?.name, item?.fileName, item?.id, `Document ${index + 1}`),
      path: firstDefined(item?.path, item?.location, item?.source, ""),
      summary: firstDefined(item?.summary, item?.displaySummary, ""),
      updatedAt: firstDefined(item?.updatedAt, item?.lastWriteTime, item?.indexedAt),
    };
  });
  const roots = toArray(firstDefined(library.roots, office.knowledge?.additionalRoots, [office.knowledge?.primaryRoot].filter(Boolean))).map((item, index) => {
    if (typeof item === "string") {
      return {
        label: index === 0 ? "Primary root" : `Additional root ${index}`,
        path: item,
        exists: true,
        isPrimary: index === 0,
        documentCount: 0,
      };
    }
    return {
      label: firstDefined(item?.label, item?.title, item?.isPrimary ? "Primary root" : `Library root ${index + 1}`),
      path: firstDefined(item?.path, item?.location, ""),
      exists: item?.exists !== false,
      isPrimary: Boolean(firstDefined(item?.isPrimary, false)),
      documentCount: Number(firstDefined(item?.documentCount, 0)) || 0,
    };
  });
  const summary = firstDefined(library.summary, library.status, "");
  const totalDocuments = Number(firstDefined(library.totalDocumentCount, library.total, office.knowledge?.totalDocumentCount, 0)) || 0;
  return {
    summary: summary || (totalDocuments > 0
      ? "Library roots are indexed and ready."
      : "Blank-slate library ready for the first import."),
    totalDocuments,
    documents,
    roots,
    topicHeadlines: toArray(firstDefined(library.library?.topicHeadlines, office.knowledge?.topicHeadlines)),
    profileSummary: firstDefined(library.profile?.summary, office.knowledge?.summary, ""),
  };
}

function getOfficeGrowthState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  const growth = live.growth || office.growth || {};
  const research = getOfficeResearchState();
  return {
    tracks: toArray(firstDefined(growth.proofTracks, growth.tracks, office.growth?.proofTracks)),
    signals: toArray(firstDefined(growth.signals, growth.highlights)),
    highlights: toArray(firstDefined(growth.highlights, growth.signals)),
    focus: toArray(firstDefined(growth.focusAreas, [
      office.growth?.engineeringFocus,
      office.growth?.cadFocus,
      office.growth?.businessFocus,
      office.growth?.careerFocus,
    ].filter(Boolean))),
    researchRuns: toArray(firstDefined(growth.researchRuns, research.history, [])),
    careerProgressSummary: firstDefined(growth.careerEngineProgressSummary, ""),
    watchlistSummary: firstDefined(growth.watchlistSummary, ""),
    approvalInboxSummary: firstDefined(growth.approvalInboxSummary, ""),
    suggestionsSummary: firstDefined(growth.suggestionsSummary, ""),
    watchlists: toArray(firstDefined(growth.watchlists, [])).map((item, index) => ({
      id: firstDefined(item?.id, item?.topic, `watchlist-${index + 1}`),
      topic: firstDefined(item?.topic, item?.title, `Watchlist ${index + 1}`),
      dueSummary: firstDefined(item?.dueSummary, item?.summary, ""),
      frequency: firstDefined(item?.frequency, ""),
      nextDueAt: firstDefined(item?.nextDueAt, item?.dueAt),
      isDue: Boolean(firstDefined(item?.isDue, false)),
    })),
  };
}

function getOfficeInboxState() {
  const office = getOfficeSnapshot();
  const live = getOfficeLiveState();
  const inbox = live.inbox || office.inbox || {};
  const approvals = toArray(firstDefined(inbox.approvals, inbox.pendingApprovals, inbox.pendingApproval));
  const queuedReady = [
    ...toArray(firstDefined(inbox.queuedReady)),
    ...toArray(firstDefined(inbox.open)),
    ...toArray(firstDefined(inbox.approved)),
    ...toArray(firstDefined(inbox.queue, inbox.queued, inbox.queuedWork)),
  ];
  const recentResults = toArray(firstDefined(inbox.recentResults, inbox.results, inbox.recent, office.inboxItems));
  return { approvals, queuedReady, recentResults };
}

function getRuntimeServices() {
  const services = getRuntimeSnapshot().services;
  return Array.isArray(services) ? services : [];
}

function getOfficeActions() {
  const actions = getOfficeSnapshot().actions;
  return Array.isArray(actions) ? actions : [];
}

function getCompanionApp() {
  const apps = Array.isArray(getRuntimeSnapshot().companionApps) ? getRuntimeSnapshot().companionApps : [];
  return apps.find((item) => item?.id === "office") || null;
}

function getCompanionStatus() {
  const companion = getCompanionApp();
  if (!companion?.enabled) {
    return { label: "Disabled", tone: "stopped" };
  }
  if (companion?.launchMode === "embedded_shell" || companion?.legacyClientRetired) {
    return {
      label: companion?.brokerEnabled ? "Integrated" : "Limited",
      tone: companion?.brokerEnabled ? "running" : "pending",
    };
  }
  if (!companion?.executableFound) {
    return { label: "Unavailable", tone: "error" };
  }
  if (companion?.running) {
    return {
      label: companion.startedOutsideRuntimeControl ? "Running externally" : "Running",
      tone: companion.startedOutsideRuntimeControl ? "pending" : "running",
    };
  }
  return { label: "Not running", tone: "stopped" };
}

function getOverallStatus() {
  return getRuntimeSnapshot().overall || { state: "booting", text: "Booting" };
}

function getDoctor() {
  return getRuntimeSnapshot().doctor || { overallState: "booting", actionableIssueCount: 0, recommendations: [] };
}

function getDockerSummary() {
  return getRuntimeSnapshot().dockerSummary || { containers: [], importantVolumes: [] };
}

function getToolingSummary() {
  return getRuntimeSnapshot().toolingSummary || { activeMcpServers: [], recommendedSkills: [] };
}

function getWorkstationContext() {
  return getRuntimeSnapshot().workstationContext || {};
}

function getWorkstationIdentity() {
  return getWorkstationContext().workstation || {};
}

function getStartupOwner() {
  return getWorkstationContext().startupOwner || {};
}

function getShellHealth() {
  return getRuntimeSnapshot().shell || getWorkstationContext().shell || {};
}

function getEnvDriftSummary() {
  return getWorkstationContext().envDrift?.summary || {};
}

function getAdminContinuity() {
  return getWorkstationContext().adminContinuity || {};
}

function getDropboxContext() {
  return getWorkstationContext().dropbox || {};
}

function formatWorkstationIdentity() {
  const workstation = getWorkstationIdentity();
  return [workstation.workstationId, workstation.workstationLabel, workstation.workstationRole].filter(Boolean).join(" | ") || "Workstation not reported";
}

function getShellStatusTone(shell = getShellHealth()) {
  switch ((shell?.status || "").toLowerCase()) {
    case "healthy":
      return "running";
    case "starting":
      return "pending";
    case "missing":
    case "stale":
      return "error";
    default:
      return "pending";
  }
}

function getRuntimeOwnershipSummary() {
  const services = getOrderedServices();
  const runtimeCoreServices = services.filter((item) => ["backend", "frontend"].includes(item.id));
  const dockerManagedCount = runtimeCoreServices.filter((item) => item.service?.startupMode === "docker_compose" && item.state === "running").length;
  const nativeDriftCount = runtimeCoreServices.filter((item) => item.service?.startupMode === "native_process").length;
  const supabase = services.find((item) => item.id === "supabase");
  const collectorCount = services.filter((item) => item.id.startsWith("watchdog")).length;
  return {
    headline: `${dockerManagedCount}/${runtimeCoreServices.length || 0} runtime-core services on Docker`,
    detail: `Supabase ${supabase?.service?.startupMode || "unknown"}; ${collectorCount} native collector lanes${nativeDriftCount ? `; ${nativeDriftCount} drifting native core services` : ""}.`,
  };
}

function getProviderStatus() {
  const broker = getOfficeBroker();
  const provider = getOfficeProviderState();
  const label = provider.primaryProviderLabel || provider.activeProviderLabel || "Local model support";
  if (provider.ready) {
    return { text: broker.enabled && broker.healthy ? `${label} ready` : `${label} standby`, tone: "running" };
  }
  return { text: `${label} unavailable`, tone: "pending" };
}

function getOrderedServices() {
  const catalog = state.runtimeCatalog || EMPTY_RUNTIME_CATALOG;
  const services = new Map(getRuntimeServices().map((service) => [service.id, service]));
  const ids = Array.isArray(catalog.serviceOrder) && catalog.serviceOrder.length
    ? catalog.serviceOrder
    : [...services.keys()];

  return ids.map((serviceId) => {
    const service = services.get(serviceId) || {};
    const meta = catalog.services?.[serviceId] || {};
    return {
      id: serviceId,
      name: service.name || meta.bootLabel || serviceId,
      description: meta.description || "",
      summary: service.summary || meta.description || "Waiting for runtime snapshot.",
      state: service.state || "pending",
      service,
    };
  });
}

function getWatchdogServices() {
  return getOrderedServices().filter((item) => item.id.startsWith("watchdog"));
}

function getActionableChecks() {
  return getRuntimeServices().flatMap((service) =>
    (Array.isArray(service.checks) ? service.checks : [])
      .filter((check) => check?.actionable)
      .map((check) => ({
        id: `${service.id}:${check.key || check.label}`,
        serviceId: service.id,
        serviceName: service.name || service.id,
        label: check.label || "Runtime issue",
        detail: check.detail || service.summary || "",
        severity: check.severity || "pending",
      })),
  );
}

function findOfficeAction(actionId) {
  return getOfficeActions().find((item) => item?.id === actionId) || null;
}

function beginActionRegistration() {
  state.actionRegistry = new Map();
  state.actionCounter = 0;
}

function registerAction(action) {
  const id = `action-${++state.actionCounter}`;
  state.actionRegistry.set(id, action);
  return id;
}

function renderActionButton(label, action, className = "action-btn") {
  const actionId = registerAction(action);
  return `<button type="button" class="${className}" data-action-id="${actionId}">${escapeHtml(label)}</button>`;
}

function setActiveWorkspace(workspaceId, viewId = null) {
  if (!WORKSPACE_META[workspaceId]) {
    return;
  }

  state.activeWorkspace = workspaceId;
  state.displayMenuOpen = false;
  if (viewId) {
    state.activeViews[workspaceId] = viewId;
  }
  render();
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

function logLocalAction(message) {
  pushLog({
    timestamp: fmtDateTime(new Date()),
    tag: "SYS",
    tone: "sys",
    message,
  });
}

function executeAction(action) {
  if (!action) {
    return;
  }

  if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
    return;
  }

  state.displayMenuOpen = false;

  switch (action.kind) {
    case "workspace":
      setActiveWorkspace(action.workspace, action.view);
      break;
    case "local":
      if (action.action === "open_inbox") {
        setActiveUtilityTab("inbox");
      } else if (action.action === "open_logs") {
        setActiveUtilityTab("logs");
        if (action.logSourceId) {
          setActiveLogSource(action.logSourceId);
        }
      } else if (action.action === "open_context") {
        setActiveUtilityTab("context");
      } else if (action.action === "set_scale") {
        setContentScalePercent(action.percent);
      } else if (action.action === "toggle_utility_pane") {
        toggleUtilityPane();
      } else {
        render();
      }
      break;
    case "message":
      hostPost(action.type, action.payload || {});
      break;
    case "companion":
      hostPost(`suite.companion.${action.action}`, { companionAppId: action.companionAppId || "office" });
      break;
    case "support":
      hostPost(`suite.support.${action.action}`, {});
      break;
    case "route":
      hostPost("suite.route.open", {
        routeId: action.routeId || null,
        routePath: action.routePath || null,
        routeTitle: action.routeTitle || action.label || null,
      });
      break;
    case "path":
      hostPost("shell.open_path", { path: action.path });
      break;
    case "external":
      hostPost("shell.open_external", { target: action.target });
      break;
    default:
      break;
  }

  if (action.label) {
    logLocalAction(action.label);
  }

  if (action.closeInbox) {
    setActiveUtilityTab("context", { silent: true });
    render();
  }
}

function actionFromOfficePath(actionId) {
  const officeAction = findOfficeAction(actionId);
  if (!officeAction?.targetPath) {
    return null;
  }

  return {
    kind: "path",
    path: officeAction.targetPath,
    label: officeAction.label,
  };
}

function buildRouteActions() {
  const shortcuts = state.runtimeCatalog?.workshopRouteShortcuts || {};
  return Object.entries(shortcuts).map(([routeId, route]) => ({
    kind: "route",
    routeId,
    routePath: route.path,
    routeTitle: route.title,
    label: route.title,
    description: route.description,
  }));
}

function buildSupportAction(actionId, fallbackLabel) {
  const match = (state.runtimeCatalog?.supportActions || []).find((item) => item.id === actionId);
  return {
    kind: "support",
    action: actionId,
    label: match?.label || fallbackLabel,
    description: match?.description || "",
  };
}

function buildCommandActions() {
  const officeKnowledge = actionFromOfficePath("open-knowledge-library");
  const officeSettings = actionFromOfficePath("open-office-settings");
  const officeTraining = actionFromOfficePath("open-training-history");
  const officeMemory = actionFromOfficePath("open-operator-memory");

  return [
    { kind: "workspace", workspace: "office", view: "chat", label: "Go to Office Workspace", description: "Open the primary Office workspace." },
    { kind: "workspace", workspace: "office", view: "study", label: "Go to Office Study", description: "Open guided study and scoring workflow." },
    { kind: "workspace", workspace: "office", view: "library", label: "Go to Office Library", description: "Open live library and import lane." },
    { kind: "workspace", workspace: "runtime", view: "runtime", label: "Go to Runtime", description: "Open service health and bootstrap." },
    { kind: "workspace", workspace: "runtime", view: "projects", label: "Go to Projects / ACADE", description: "Open project and Autodesk reference lane." },
    { kind: "message", type: "runtime.bootstrap_all", label: "Start runtime services", description: "Start the full local runtime stack." },
    { kind: "message", type: "runtime.start_all", label: "Start local services", description: "Start all runtime services." },
    { kind: "message", type: "runtime.stop_all", label: "Stop local services", description: "Stop all runtime services." },
    {
      kind: "message",
      type: "runtime.reset_all",
      label: "Reset runtime services",
      description: "Stop and restart the local runtime stack without clearing data.",
      confirmMessage: "Reset all local runtime services now? This keeps local data intact but will restart the runtime stack.",
    },
    { kind: "message", type: "runtime.refresh", label: "Refresh runtime status", description: "Refresh the runtime snapshot." },
    {
      kind: "local",
      action: "toggle_utility_pane",
      label: state.utilityPaneCollapsed ? "Show utility dock" : "Hide utility dock",
      description: "Expand or collapse the docked context, logs, and inbox rail.",
    },
    { kind: "local", action: "set_scale", percent: 100, label: "Shell scale 100%", description: "Use the standard shell content scale." },
    { kind: "local", action: "set_scale", percent: 110, label: "Shell scale 110%", description: "Use the balanced larger shell content scale." },
    { kind: "local", action: "set_scale", percent: 125, label: "Shell scale 125%", description: "Use the roomier shell content scale." },
    { kind: "local", action: "set_scale", percent: 140, label: "Shell scale 140%", description: "Use the largest preset shell content scale." },
    { kind: "message", type: "office.state.refresh", label: "Refresh Office state", description: "Refresh Office workspace state." },
    { kind: "message", type: "office.broker.start", label: "Start Office service", description: "Start the local Office service for live workspace routing." },
    { kind: "message", type: "office.broker.restart", label: "Restart Office service", description: "Restart the local Office service if live actions are stale." },
    {
      kind: "message",
      type: "office.history.reset",
      payload: { clearTrainingHistory: true },
      label: "Reset Office local history",
      description: "Clear Office chat, inbox, activities, and training history to start fresh.",
    },
    {
      kind: "message",
      type: "office.workspace.reset",
      label: "Reset Office workspace",
      description: "Wipe Office-owned knowledge, broker state, inbox/watchlists, and training history for a blank slate.",
    },
    { kind: "message", type: "office.chat.list_threads", label: "Refresh Office threads", description: "Reload live chat threads from the Office broker." },
    { kind: "message", type: "office.inbox.list", label: "Refresh Office inbox", description: "Reload approvals, queue, and results from the Office broker." },
    { kind: "local", action: "open_inbox", label: "Open shared inbox", description: "Open the shared inbox for Office and Runtime actions." },
    { kind: "local", action: "open_logs", logSourceId: "transcript", label: "Open integrated logs", description: "Open the docked log console inside the shell." },
    { kind: "workspace", workspace: "office", view: "chat", label: "Open Office workspace", description: "Focus the main Office workspace inside the shared shell." },
    { kind: "companion", action: "open-folder", label: "Open Office folder", description: "Open the published Office folder." },
    officeKnowledge && { ...officeKnowledge, description: "Open the active knowledge library path." },
    officeTraining && { ...officeTraining, description: "Open the training history store." },
    officeMemory && { ...officeMemory, description: "Open the operator memory store." },
    officeSettings && { ...officeSettings, description: "Open the Office settings file." },
    { kind: "path", path: "autodesk-project-flow-reference", label: "Open Autodesk project-flow reference", description: "Open the curated ACADE project-flow reference." },
    buildSupportAction("open-bootstrap-log", "Open bootstrap log"),
    buildSupportAction("open-status-dir", "Open status folder"),
    buildSupportAction("copy-summary", "Copy support summary"),
    ...buildRouteActions(),
  ].filter(Boolean);
}

function getFilteredCommandActions() {
  const actions = buildCommandActions();
  if (!state.commandQuery.trim()) {
    return actions.slice(0, 10);
  }

  const query = state.commandQuery.trim().toLowerCase();
  return actions.filter((action) =>
    (action.label || "").toLowerCase().includes(query)
    || (action.description || "").toLowerCase().includes(query),
  ).slice(0, 12);
}

function renderWorkspaceNav() {
  const meta = getWorkspaceMeta();
  const activeView = getActiveView();
  const office = getOfficeSnapshot();
  const broker = getOfficeBroker();
  const runtime = getRuntimeSnapshot();

  dom.workspaceHeading.textContent = meta.shellTitle || `${meta.label} Workspace`;
  dom.workspaceSubheading.textContent = meta.heading;
  dom.workspaceSummary.textContent = state.activeWorkspace === "office"
    ? firstDefined(
      office.today?.objective,
      office.chat?.summary,
      broker.healthy ? "Office workspace is connected." : "Office workspace is using snapshot mode.",
      meta.summary,
    )
    : runtime.support?.text?.split("\n")[0] || meta.summary;

  dom.workspaceSwitcher.querySelectorAll("[data-workspace]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.workspace === state.activeWorkspace);
  });

  dom.workspaceViewNav.innerHTML = meta.views
    .map((view) => {
      const action = {
        kind: "workspace",
        workspace: state.activeWorkspace,
        view: view.id,
        label: `${meta.label}: ${view.label}`,
      };
      const actionId = registerAction(action);
      return `
        <button type="button" class="view-link${view.id === activeView ? " is-active" : ""}" data-action-id="${actionId}">
          <span>${escapeHtml(view.label)}</span>
          <small>${escapeHtml(view.title)}</small>
        </button>`;
    })
    .join("");

  const pinnedActions = state.activeWorkspace === "office"
    ? [
        { kind: "workspace", workspace: "office", view: "chat", label: "Open Office workspace" },
        actionFromOfficePath("open-knowledge-library"),
        { kind: "message", type: "office.state.refresh", label: "Refresh Office state" },
      ]
    : [
        { kind: "message", type: "runtime.bootstrap_all", label: "Bootstrap All" },
        {
          kind: "message",
          type: "runtime.reset_all",
          label: "Reset All",
          confirmMessage: "Reset all local runtime services now? This keeps local data intact but will restart the runtime stack.",
        },
        { kind: "route", routeId: "watchdog", routePath: "/app/watchdog", routeTitle: "Watchdog", label: "Open Watchdog route" },
      ];

  dom.workspaceActions.innerHTML = pinnedActions
    .filter(Boolean)
    .map((action) => renderActionButton(action.label, action, "nav-action-btn"))
    .join("") + `<p class="nav-helper">More actions live in Command Deck.</p>`;
}

function renderHeroPanel() {
  const overall = getOverallStatus();
  const doctor = getDoctor();
  const office = getOfficeSnapshot();
  const broker = getOfficeBroker();
  const provider = getOfficeProviderState();
  const study = getOfficeStudyState();
  const library = getOfficeLibraryState();
  const growth = getOfficeGrowthState();
  const companionStatus = getCompanionStatus();
  const activeView = getActiveView();
  const startupOwner = getStartupOwner();
  const runtimeOwnership = getRuntimeOwnershipSummary();

  if (state.activeWorkspace === "office") {
    const heroHeadline = firstDefined(
      office.today?.headline,
      office.today?.objectiveTitle,
      "Private operator desk",
    );
    const heroSummary = firstDefined(
      office.today?.objective,
      "Communication, study, reference, and follow-through in one private workspace.",
    );
    const chips = [
      `Runtime | ${overall.text || STATUS_LABELS[overall.state] || "Unknown"}`,
      `Reference | ${library.totalDocuments || 0} documents`,
      `Watchlists | ${growth.watchlists.length || 0} active`,
    ];
    const brokerStateLabel = broker.enabled
      ? broker.healthy
        ? "Connected"
        : "Snapshot mode"
      : "Disabled";

    dom.heroPanel.innerHTML = `
      <section class="hero-shell office-hero">
        <div class="hero-copy">
          <div class="hero-kicker">Office workspace</div>
          <h1>${escapeHtml(heroHeadline || "Private operator desk")}</h1>
          <p>${escapeHtml(heroSummary || "")}</p>
          <div class="hero-chip-row">${chips.map((chip) => `<span class="hero-chip">${escapeHtml(chip)}</span>`).join("")}</div>
          <div class="hero-actions">
            ${renderActionButton("Open workspace", { kind: "workspace", workspace: "office", view: "chat", label: "Open Office workspace" }, "action-btn primary")}
            ${renderActionButton("Refresh", { kind: "message", type: "office.state.refresh", label: "Refresh Office state" }, "action-btn subtle")}
          </div>
        </div>
        <div class="hero-side">
          <div class="hero-metric">
            <span>Workspace mode</span>
            <strong>${escapeHtml(companionStatus.label)}</strong>
          </div>
          <div class="hero-metric">
            <span>Model support</span>
            <strong>${escapeHtml(provider.ready ? "Ready" : "Unavailable")}</strong>
          </div>
          <div class="hero-metric">
            <span>Service state</span>
            <strong>${escapeHtml(brokerStateLabel)}</strong>
          </div>
          <div class="hero-metric">
            <span>Last recorded update</span>
            <strong>${escapeHtml(fmtDateTime(firstDefined(study.lastHistoryWriteAt, office.training?.lastWriteAt)))}</strong>
          </div>
        </div>
      </section>`;
    return;
  }

  const chips = [
    `Overall | ${overall.text || STATUS_LABELS[overall.state] || "Unknown"}`,
    `Actionable | ${doctor.actionableIssueCount || 0} issues`,
    `Office | ${companionStatus.label}`,
  ];
  const runtimeHeadline = firstDefined(
    getRuntimeSnapshot().runtime?.headline,
    "Runtime operations",
  );
  const runtimeSummary = firstDefined(
    getRuntimeSnapshot().runtime?.lastBootstrap?.summary,
    getWorkspaceMeta().summary,
    "Monitor local service health, diagnostics, and project readiness from one control surface.",
  );

  dom.heroPanel.innerHTML = `
    <section class="hero-shell runtime-hero">
      <div class="hero-copy">
        <div class="hero-kicker">Runtime control</div>
        <h1>${escapeHtml(runtimeHeadline)}</h1>
        <p>${escapeHtml(runtimeSummary)}</p>
        <div class="hero-chip-row">${chips.map((chip) => `<span class="hero-chip">${escapeHtml(chip)}</span>`).join("")}</div>
        <div class="hero-actions">
          ${renderActionButton("Start All", { kind: "message", type: "runtime.bootstrap_all", label: "Start runtime services" }, "action-btn primary")}
          ${renderActionButton("Reset All", {
            kind: "message",
            type: "runtime.reset_all",
            label: "Reset runtime services",
            confirmMessage: "Reset all local runtime services now? This keeps local data intact but will restart the runtime stack.",
          }, "action-btn")}
          ${renderActionButton("Stop All", { kind: "message", type: "runtime.stop_all", label: "Stop runtime services" }, "action-btn warning")}
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-metric">
          <span>Health</span>
          <strong>${escapeHtml(doctor.overallState || "booting")}</strong>
        </div>
        <div class="hero-metric">
          <span>Workspace focus</span>
          <strong>${escapeHtml(getWorkspaceMeta().views.find((view) => view.id === activeView)?.label || "Runtime")}</strong>
        </div>
        <div class="hero-metric">
          <span>Runtime owner</span>
          <strong>${escapeHtml(firstDefined(startupOwner.owner, runtimeOwnership.headline, "unknown"))}</strong>
        </div>
        <div class="hero-metric">
          <span>Last bootstrap</span>
          <strong>${escapeHtml(fmtDateTime(getRuntimeSnapshot().runtime?.lastBootstrap?.timestamp))}</strong>
        </div>
      </div>
    </section>`;
}

function renderMetricPanel(label, value, detail) {
  return `
    <article class="mini-panel">
      <div class="panel-eyebrow">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <p>${escapeHtml(detail)}</p>
    </article>`;
}

function renderFocusPanel(label, body) {
  return `
    <article class="mini-panel">
      <div class="panel-eyebrow">${escapeHtml(label)}</div>
      <p>${escapeHtml(body || "No focus recorded.")}</p>
    </article>`;
}

function renderSummaryPill(label, value, tone = "") {
  return `
    <div class="summary-pill${tone ? ` tone-${escapeHtml(tone)}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>`;
}

function renderServiceCard(item, options = {}) {
  const service = item.service || {};
  const stateLabel = STATUS_LABELS[item.state] || item.state;
  const notes = Array.isArray(service.notes) ? service.notes : service.notes ? [service.notes] : [];
  return `
    <article class="service-card tone-${escapeHtml(item.state)}${options.compact ? " compact" : ""}">
      <div class="service-head">
        <div>
          <div class="panel-eyebrow">${escapeHtml(item.name)}</div>
          <h3>${escapeHtml(stateLabel)}</h3>
        </div>
        <span class="state-pill ${escapeHtml(item.state)}">${escapeHtml(stateLabel)}</span>
      </div>
      <p>${escapeHtml(item.summary)}</p>
      <div class="service-meta">
        <span>Port ${escapeHtml(service.port > 0 ? String(service.port) : "-")}</span>
        <span>PID ${escapeHtml(service.processId ? String(service.processId) : "-")}</span>
        <span>${escapeHtml(item.description || "Local runtime service")}</span>
      </div>
      ${notes.length ? `<div class="note-block">${notes.map((note) => `<div><strong>${escapeHtml(note.label || "Note")}</strong><small>${escapeHtml(note.value || "")}</small></div>`).join("")}</div>` : ""}
      <div class="button-row">
        ${renderActionButton("Start", { kind: "message", type: "runtime.service.start", payload: { serviceId: item.id }, label: `Start ${item.name}` }, "action-btn")}
        ${renderActionButton("Stop", { kind: "message", type: "runtime.service.stop", payload: { serviceId: item.id }, label: `Stop ${item.name}` }, "action-btn")}
        ${renderActionButton("Restart", { kind: "message", type: "runtime.service.restart", payload: { serviceId: item.id }, label: `Restart ${item.name}` }, "action-btn subtle")}
        ${renderActionButton("Logs", { kind: "message", type: "runtime.service.open_logs", payload: { serviceId: item.id }, label: `Open logs for ${item.name}` }, "action-btn ghost")}
      </div>
    </article>`;
}

function renderOfficeView() {
  const office = getOfficeSnapshot();
  const broker = getOfficeBroker();
  const provider = getOfficeProviderState();
  const knowledge = office.knowledge || {};
  const training = office.training || {};
  const view = getActiveView();
  const chatState = getOfficeChatState();
  const studyState = getOfficeStudyState();
  const libraryState = getOfficeLibraryState();
  const growthState = getOfficeGrowthState();
  const researchState = getOfficeResearchState();
  const inbox = getOfficeInboxState();

  if (view === "chat") {
    const routeOptions = chatState.routeOptions.length
      ? chatState.routeOptions
      : [{ id: chatState.currentRoute || "default", label: chatState.currentRoute || "default" }];
    const threadOptions = chatState.threads.length
      ? chatState.threads
      : [{ id: chatState.currentThreadId || "default-thread", label: "Default thread" }];
    const transcriptRows = chatState.transcript.length
      ? chatState.transcript
      : [{ role: "system", text: "No transcript is available yet. Snapshot mode remains available until the live service returns." }];
    const suiteSignals = [...new Set([
      chatState.suitePulse,
      chatState.suiteTrustSummary,
      ...toArray(chatState.suiteContext),
    ].filter(Boolean))];
    const selectedRoute = routeOptions.find((item) => item.id === chatState.currentRoute) || routeOptions[0] || null;

    dom.workspaceContent.innerHTML = `
      <section class="content-grid office-chat-grid office-chat-shell">
        <article class="content-panel spotlight-panel">
          <div class="lane-header">
            <div>
              <div class="panel-eyebrow">Active route</div>
              <h2>${escapeHtml(chatState.currentRouteTitle || chatState.currentRoute || "default")}</h2>
              <p>${escapeHtml(chatState.routeReason || "The current mode remains visible and can be adjusted before sending a message.")}</p>
            </div>
            <span class="state-pill ${escapeHtml(broker.healthy ? "running" : "pending")}">${escapeHtml(broker.healthy ? "connected" : "snapshot mode")}</span>
          </div>
          <div class="summary-pill-row">
            ${renderSummaryPill("Threads", String(chatState.threads.length || 0))}
            ${renderSummaryPill("Transcript", `${transcriptRows.length || 0} rows`)}
            ${renderSummaryPill("Pending review", `${inbox.approvals.length || 0} approvals`)}
            ${renderSummaryPill("Model support", provider.ready ? "Ready" : "Unavailable", provider.ready ? "running" : "pending")}
          </div>
          <div class="transcript-stage">
            <div class="transcript-stage-head">
              <div>
                <div class="panel-eyebrow">Current thread</div>
                <strong>${escapeHtml(chatState.currentThreadTitle || "Current thread")}</strong>
                <small>${escapeHtml(`${chatState.threads.length || 0} thread(s) available. Routing remains visible before sending.`)}</small>
              </div>
              <div class="button-row">
                <button type="button" class="action-btn subtle" data-office-message="office.chat.list_threads">Refresh threads</button>
                <button type="button" class="action-btn ghost" data-office-message="office.inbox.list">Refresh inbox</button>
              </div>
            </div>
            <div class="office-transcript">
              ${transcriptRows.map((entry) => `
                <div class="office-transcript-row">
                  <div class="office-transcript-meta">
                    <strong>${escapeHtml((entry.role || "system").toUpperCase())}</strong>
                    <small>${escapeHtml(fmtDateTime(entry.timestamp))}</small>
                  </div>
                  <p>${escapeHtml(entry.text || "")}</p>
                </div>`).join("")}
            </div>
          </div>
          <form data-office-form="chat-send" class="office-form composer-form">
            <div class="form-split">
              <div>
                <label for="office-chat-thread">Thread</label>
                <select id="office-chat-thread" data-office-bind="threadId">
                  ${threadOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === chatState.currentThreadId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
                </select>
              </div>
            </div>
            <label for="office-chat-message">Message</label>
            <textarea id="office-chat-message" data-office-bind="chatMessage" placeholder="Send a message to the Office workspace..." rows="4">${escapeHtml(state.officeDrafts.chatMessage || "")}</textarea>
            <div class="button-row">
              <button type="submit" class="action-btn primary">Send</button>
              ${renderActionButton("Open Growth", { kind: "workspace", workspace: "office", view: "growth", label: "Open Growth lane" }, "action-btn")}
              <button type="button" class="action-btn subtle" data-office-message="office.state.refresh">Refresh state</button>
            </div>
          </form>
        </article>
        <div class="office-side-stack">
          <article class="content-panel quiet rail-panel route-console-panel">
            <div class="lane-header compact">
              <div>
                <div class="panel-eyebrow">Routing controls</div>
                <h2>Selection and context</h2>
              </div>
            </div>
            <form data-office-form="chat-route" class="office-form">
              <label for="office-chat-route">Workspace mode</label>
              <select id="office-chat-route" data-office-bind="routeOverride">
                ${routeOptions.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === chatState.currentRoute ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
              </select>
              <div class="inline-hint">${escapeHtml(firstDefined(
                selectedRoute?.summary,
                selectedRoute?.perspective,
                "Choose a mode explicitly or keep the current selection.",
              ) || "")}</div>
              <div class="button-row">
                <button type="submit" class="action-btn">Apply selection</button>
              </div>
            </form>
            <div class="route-console-section">
              <div class="panel-eyebrow">Current context</div>
              <ul class="signal-list compact-list">${suiteSignals.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No suite context was supplied by broker state.</li>"}</ul>
            </div>
            <div class="route-console-section">
              <div class="panel-eyebrow">Recommended next actions</div>
              <ul class="signal-list compact-list">${(chatState.suggestedMoves || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>Recommended next actions will appear here when available.</li>"}</ul>
            </div>
          </article>
        </div>
      </section>
      <section class="content-grid insight-grid">
        ${renderMetricPanel("Study loop", `${training.practiceAttemptCount || 0}/${training.defenseAttemptCount || 0}`, studyState.stageSummary || "No study stage is active yet.")}
        ${renderMetricPanel("Reference library", `${libraryState.totalDocuments || 0} docs`, libraryState.profileSummary || "Knowledge library is ready for imports and local reference work.")}
        ${renderMetricPanel("Watchlists", `${growthState.watchlists.length || 0} active`, growthState.watchlistSummary || "No watchlist summary was reported.")}
      </section>`;
    return;
  }

  if (view === "study") {
    const sequence = studyState.sequence.length
      ? studyState.sequence
      : [
        { id: "start", title: "Start session", detail: "Initialize study state.", status: "pending" },
        { id: "practice", title: "Generate + score practice", detail: "Run practice loop with scoring.", status: "pending" },
        { id: "defense", title: "Generate + score defense", detail: "Run defense loop with scoring.", status: "pending" },
        { id: "reflection", title: "Save reflection", detail: "Persist post-study reflection.", status: "pending" },
      ];
    const practiceQuestions = studyState.practiceQuestions || [];
    const defenseScenario = studyState.defenseScenario || {};
    dom.workspaceContent.innerHTML = `
      <section class="content-grid study-shell">
        <article class="content-panel spotlight-panel">
          <div class="lane-header">
            <div>
              <div class="panel-eyebrow">Guided sequence</div>
              <h2>Broker-driven study loop</h2>
              <p>${escapeHtml(studyState.stageSummary || "The study lane keeps one focused loop from practice through proof output.")}</p>
            </div>
            <span class="state-pill ${escapeHtml(studyState.latestScore ? "running" : "pending")}">${escapeHtml(studyState.latestScore ? "active history" : "fresh start")}</span>
          </div>
          <div class="summary-pill-row">
            ${renderSummaryPill("Focus", studyState.focus || "Focus not set")}
            ${renderSummaryPill("Difficulty", `${studyState.difficulty || "Mixed"} difficulty`)}
            ${renderSummaryPill("Questions", `${studyState.questionCount || 0}`)}
            ${renderSummaryPill("History", studyState.historySummary ? "Loaded" : "Fresh", studyState.historySummary ? "running" : "pending")}
          </div>
          <div class="stack-list">
            ${sequence.map((step) => `
              <div class="stack-row tone-${escapeHtml(step.status || "pending")}">
                <div>
                  <strong>${escapeHtml(step.title)}</strong>
                  <small>${escapeHtml(step.detail || "")}</small>
                </div>
                <span class="state-pill ${escapeHtml(step.status || "pending")}">${escapeHtml(step.status || "pending")}</span>
              </div>`).join("")}
          </div>
          <form data-office-form="study-start" class="office-form">
            <label for="office-study-focus">Session focus</label>
            <input id="office-study-focus" data-office-bind="studyFocus" type="text" placeholder="Set study focus" value="${escapeHtml(state.officeDrafts.studyFocus || studyState.focus || "")}">
            <div class="button-row">
              <button type="submit" class="action-btn primary">Start study</button>
              <button type="button" class="action-btn" data-office-message="office.study.generate_practice">Generate practice</button>
              <button type="button" class="action-btn subtle" data-office-message="office.study.generate_defense">Generate defense</button>
            </div>
          </form>
        </article>
        <article class="content-panel quiet rail-panel">
          <div class="lane-header compact">
            <div>
              <div class="panel-eyebrow">Scoring + reflection</div>
              <h2>Review loop</h2>
            </div>
          </div>
          <p>${escapeHtml(studyState.latestScore ? `Latest score: ${studyState.latestScore}` : "No study score recorded yet.")}</p>
          <p>${escapeHtml(studyState.practiceResultSummary || "Generate practice and choose answers inside the live broker loop.")}</p>
          <div class="stack-list">
            ${studyState.hints.map((hint) => `
              <div class="stack-row">
                <div>
                  <strong>Hint</strong>
                  <small>${escapeHtml(hint)}</small>
                </div>
              </div>`).join("") || '<div class="empty-state small">No study hints were reported yet.</div>'}
          </div>
          <form data-office-form="study-score-practice" class="office-form">
            <label>Practice scoring</label>
            <div class="inline-hint">${escapeHtml(practiceQuestions.length ? "Submit the selected answers from the question set on the left." : "Generate practice first to score a question set.")}</div>
            <div class="button-row">
              <button type="submit" class="action-btn" ${practiceQuestions.length ? "" : "disabled"}>Score practice</button>
            </div>
          </form>
          <form data-office-form="study-score-defense" class="office-form">
            <label for="office-defense-submission">Defense submission</label>
            <textarea id="office-defense-submission" data-office-bind="defenseSubmission" rows="3" placeholder="Paste defense response">${escapeHtml(state.officeDrafts.defenseSubmission || "")}</textarea>
            <div class="inline-hint">${escapeHtml(firstDefined(defenseScenario?.prompt, studyState.defensePrompt, studyState.defenseScoreSummary, "Generate defense to get a prompt, then score your answer.") || "")}</div>
            <div class="button-row">
              <button type="submit" class="action-btn">Score defense</button>
            </div>
          </form>
          <form data-office-form="study-reflection" class="office-form">
            <label for="office-study-reflection">Reflection</label>
            <textarea id="office-study-reflection" data-office-bind="reflection" rows="3" placeholder="Save reflection">${escapeHtml(state.officeDrafts.reflection || "")}</textarea>
            <div class="inline-hint">${escapeHtml(studyState.reflectionContextSummary || "Reflection is available after scoring practice or defense.")}</div>
            <div class="button-row">
              <button type="submit" class="action-btn subtle">Save reflection</button>
            </div>
          </form>
          ${studyState.defenseFeedbackSummary ? `<div class="stack-row"><div><strong>Defense feedback</strong><small>${escapeHtml(studyState.defenseFeedbackSummary)}</small></div></div>` : ""}
          ${studyState.latestReflection ? `<div class="stack-row"><div><strong>Latest reflection</strong><small>${escapeHtml(studyState.latestReflection)}</small></div></div>` : ""}
          ${studyState.historySummary ? `<div class="stack-row"><div><strong>History</strong><small>${escapeHtml(studyState.historySummary)}</small></div></div>` : ""}
          ${studyState.reviewQueueSummary ? `<div class="stack-row"><div><strong>Review queue</strong><small>${escapeHtml(studyState.reviewQueueSummary)}</small></div></div>` : ""}
          ${studyState.historyPath ? `<div class="inline-hint">${escapeHtml(`${studyState.historyExists ? "History file" : "History path"}: ${studyState.historyPath}`)}</div>` : ""}
        </article>
      </section>
      <section class="content-grid question-grid">
        ${practiceQuestions.map((question, index) => `
          <div class="study-question-card">
            <div class="panel-eyebrow">${escapeHtml(firstDefined(question?.metaSummary, `${question?.topic || "Topic"} | ${question?.difficulty || "Mixed"}`) || "")}</div>
            <strong>${escapeHtml(question?.prompt || `Question ${index + 1}`)}</strong>
            <div class="study-option-list">
              ${toArray(question?.options).map((option) => `
                <label class="study-option">
                  <input
                    type="radio"
                    name="practice-answer-${index}"
                    value="${escapeHtml(option?.key || "")}"
                    data-practice-answer-index="${index}"
                    ${firstDefined(state.officeDrafts[getPracticeDraftKey(index)], question?.selectedOptionKey, "") === option?.key ? "checked" : ""}
                  >
                  <span><strong>${escapeHtml(option?.displayLabel || option?.label || option?.key || "Option")}</strong> ${escapeHtml(option?.text || option?.summary || "")}</span>
                </label>`).join("")}
            </div>
            ${question?.resultText ? `<p class="study-result-text">${escapeHtml(question.resultText)}</p>` : ""}
          </div>`).join("") || '<div class="empty-state">Generate practice to receive a guided question set.</div>'}
      </section>
      <section class="content-grid role-grid">
        ${toArray(provider.roleModels).map((item) => `
          <article class="mini-panel${item.installed ? " tone-running" : " tone-pending"}">
            <div class="mini-header">
              <span>${escapeHtml(item.role)}</span>
              <strong>${escapeHtml(item.installed ? "Ready" : "Missing")}</strong>
            </div>
            <div class="mini-body">${escapeHtml(item.modelName)}</div>
          </article>`).join("") || '<div class="empty-state">No role-model data was provided.</div>'}
      </section>`;
    return;
  }

  if (view === "library") {
    const roots = libraryState.roots.length
      ? libraryState.roots
      : [knowledge.primaryRoot, ...(toArray(knowledge.additionalRoots))].filter(Boolean);
    const docs = libraryState.documents.length ? libraryState.documents : toArray(knowledge.recentDocuments);
    const libraryIsBlank = (libraryState.totalDocuments || 0) === 0;
    dom.workspaceContent.innerHTML = `
      <section class="content-grid library-shell">
        <article class="content-panel spotlight-panel">
          <div class="lane-header">
            <div>
              <div class="panel-eyebrow">Live library state</div>
              <h2>${escapeHtml(`${libraryState.totalDocuments || 0} tracked documents`)}</h2>
              <p>${escapeHtml(libraryState.summary || "Broker library state is active when available; snapshot roots remain visible as fallback.")}</p>
            </div>
            <span class="state-pill ${escapeHtml((libraryState.totalDocuments || 0) > 0 ? "running" : "pending")}">${escapeHtml((libraryState.totalDocuments || 0) > 0 ? "indexed" : "empty")}</span>
          </div>
          <div class="summary-pill-row">
            ${renderSummaryPill("Roots", String(roots.length || 0))}
            ${renderSummaryPill("Topics", String((libraryState.topicHeadlines || []).length || 0))}
            ${renderSummaryPill("Primary", roots.find((item) => item?.isPrimary)?.label || "Library")}
          </div>
          ${libraryState.profileSummary ? `<div class="inline-hint">${escapeHtml(libraryState.profileSummary)}</div>` : ""}
          <form data-office-form="library-import" class="office-form">
            <label for="office-library-import">Import path</label>
            <input id="office-library-import" data-office-bind="libraryImportPath" type="text" placeholder="Local file or folder path" value="${escapeHtml(state.officeDrafts.libraryImportPath || "")}">
            <div class="button-row">
              <button type="submit" class="action-btn primary">Import</button>
              ${renderActionButton("Open Knowledge", actionFromOfficePath("open-knowledge-library") || { kind: "workspace", workspace: "office", view: "library", label: "Open Knowledge" }, "action-btn subtle")}
            </div>
          </form>
          ${libraryIsBlank ? `
            <div class="note-block">
              <div>
                <strong>Blank-slate library</strong>
                <small>Import a class note, CAD standard, PDF, or markup guide first. Growth research briefs and study reflections will start filling this lane after the first real run.</small>
              </div>
              <div>
                <strong>Recommended first moves</strong>
                <small>1. Import one source file. 2. Run one targeted research brief in Growth. 3. Save that brief back into the local library.</small>
              </div>
            </div>` : ""}
          <div class="document-feed">
            ${roots.map((root) => `
              <div class="document-row">
                <div>
                  <strong>${escapeHtml(root?.label || (root?.isPrimary ? "Primary root" : "Library root"))}</strong>
                  <small>${escapeHtml(root?.path || root?.location || "Path not reported")}</small>
                </div>
                <span>${escapeHtml(root?.documentCount ? `${root.documentCount} docs` : (root?.exists === false ? "Missing" : "Ready"))}</span>
              </div>`).join("") || '<div class="empty-state">No library roots were reported.</div>'}
          </div>
        </article>
        <article class="content-panel quiet rail-panel">
          <div class="lane-header compact">
            <div>
              <div class="panel-eyebrow">Recent library material</div>
              <h2>Indexed documents</h2>
            </div>
          </div>
          <div class="document-feed">
            ${docs.map((doc) => `
              <div class="document-row">
                <div>
                  <strong>${escapeHtml(firstDefined(doc?.name, doc?.title, doc?.id, "Document"))}</strong>
                  <small>${escapeHtml(firstDefined(doc?.path, doc?.location, doc?.source, ""))}</small>
                  ${firstDefined(doc?.summary, "") ? `<small>${escapeHtml(firstDefined(doc?.summary, ""))}</small>` : ""}
                </div>
                <span>${escapeHtml(fmtDateTime(firstDefined(doc?.lastWriteTime, doc?.updatedAt, doc?.indexedAt)))}</span>
            </div>`).join("") || '<div class="empty-state">Fresh library. Import the first source or save the first research brief to seed this workspace.</div>'}
          </div>
          ${libraryState.topicHeadlines?.length ? `<div class="topic-pill-row">${libraryState.topicHeadlines.map((item) => `<span class="topic-pill">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        </article>
      </section>`;
    return;
  }

  const growthIsBlank = !growthState.tracks.length
    && !growthState.focus.length
    && !growthState.highlights.length
    && !growthState.watchlists.length
    && !growthState.researchRuns.length;
  dom.workspaceContent.innerHTML = `
    <section class="content-grid growth-shell">
      <article class="content-panel spotlight-panel">
        <div class="lane-header">
          <div>
            <div class="panel-eyebrow">Growth signals</div>
            <h2>Proof, discipline, and next leverage</h2>
            <p>${escapeHtml(growthState.careerProgressSummary || "Career and proof-of-growth summary will accumulate here as Office activity grows.")}</p>
          </div>
          <span class="state-pill ${escapeHtml(growthState.watchlists.some((item) => item.isDue) ? "pending" : "running")}">${escapeHtml(growthState.watchlists.some((item) => item.isDue) ? "attention due" : "steady")}</span>
        </div>
        <div class="summary-pill-row">
          ${renderSummaryPill("Approvals", growthState.approvalInboxSummary || "None")}
          ${renderSummaryPill("Suggestions", growthState.suggestionsSummary || "No queue")}
          ${renderSummaryPill("Research runs", `${growthState.researchRuns.length || 0}`)}
        </div>
        ${growthIsBlank ? `
          <div class="note-block">
            <div>
              <strong>Fresh growth lane</strong>
              <small>This lane is intentionally empty now. Use it to turn real study, CAD judgment, and project-management work into proof artifacts instead of carrying old office baggage forward.</small>
            </div>
            <div>
              <strong>Recommended first moves</strong>
              <small>Run one research brief, save one result to the library, then capture one reflection or proof item tied to school, drafting, or EE reasoning.</small>
            </div>
          </div>` : ""}
        <div class="signal-columns">
          <div class="signal-column">
            <div class="panel-eyebrow">Proof tracks</div>
            <ul class="signal-list compact-list">${growthState.tracks.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : firstDefined(item?.label, item?.title, item?.text, "Track"))}</li>`).join("") || "<li>No growth tracks were reported.</li>"}</ul>
          </div>
          <div class="signal-column">
            <div class="panel-eyebrow">Focus areas</div>
            <ul class="signal-list compact-list">${growthState.focus.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : firstDefined(item?.label, item?.title, item?.text, "Focus"))}</li>`).join("") || "<li>No focus areas were reported.</li>"}</ul>
          </div>
        </div>
        <div class="signal-column">
          <div class="panel-eyebrow">Highlights</div>
          <ul class="signal-list compact-list">${growthState.highlights.map((item) => `<li>${escapeHtml(typeof item === "string" ? item : firstDefined(item?.label, item?.title, item?.text, "Highlight"))}</li>`).join("") || "<li>No growth highlights were reported.</li>"}</ul>
        </div>
      </article>
      <article class="content-panel quiet rail-panel">
        <div class="lane-header compact">
          <div>
            <div class="panel-eyebrow">Watchlists</div>
            <h2>Operator watchlist lane</h2>
          </div>
        </div>
        <p>${escapeHtml(growthState.watchlistSummary || "No watchlist summary was reported.")}</p>
        <div class="watchlist-list">
          ${growthState.watchlists.map((item) => `
            <div class="watchlist-row${item.isDue ? " tone-pending" : ""}">
              <div>
                <strong>${escapeHtml(item.topic)}</strong>
                <small>${escapeHtml(firstDefined(item.dueSummary, item.frequency, "Watchlist cadence not reported."))}</small>
              </div>
              <div class="stack-row-actions">
                <span>${escapeHtml(item.isDue ? "Due now" : fmtDateTime(item.nextDueAt))}</span>
                ${renderActionButton("Run now", {
                  kind: "message",
                  type: "office.watchlist.run",
                  payload: {
                    watchlistId: item.id,
                  },
                  label: `Run watchlist ${item.topic}`,
                  closeInbox: false,
                }, "action-btn ghost")}
              </div>
            </div>`).join("") || '<div class="empty-state">No watchlists yet. Start with one deliberate research run before you add recurring monitoring.</div>'}
        </div>
      </article>
    </section>
    <section class="content-grid two-up research-ops-grid">
      <article class="content-panel">
        <div class="panel-eyebrow">Research run</div>
        <p>${escapeHtml(researchState.summary || "Run a live research query to pull current web sources into the desk.")}</p>
        <form data-office-form="research-run" class="office-form">
          <label for="office-research-prompt">Prompt</label>
          <textarea id="office-research-prompt" data-office-bind="researchPrompt" rows="3" placeholder="Research direction">${escapeHtml(state.officeDrafts.researchPrompt || "")}</textarea>
          <div class="button-row">
            <button type="submit" class="action-btn primary">Run research</button>
            <button type="button" class="action-btn subtle" data-office-message="office.inbox.list">Refresh inbox</button>
          </div>
        </form>
      </article>
      <article class="content-panel quiet">
        <div class="panel-eyebrow">Research save</div>
        <p>${escapeHtml(researchState.runSummary || "Save the latest research run into the local library with operator notes.")}</p>
        <form data-office-form="research-save" class="office-form">
          <label for="office-research-notes">Notes</label>
          <textarea id="office-research-notes" data-office-bind="researchNotes" rows="3" placeholder="Save research notes">${escapeHtml(state.officeDrafts.researchNotes || "")}</textarea>
          <div class="button-row">
            <button type="submit" class="action-btn">Save research</button>
          </div>
        </form>
      </article>
    </section>
    <section class="content-panel quiet research-feed-panel">
      <div class="panel-eyebrow">Recent research results</div>
      <div class="document-feed">
        ${growthState.researchRuns.map((item) => `
          <div class="document-row">
            <div>
              <strong>${escapeHtml(firstDefined(item?.title, item?.label, item?.id, "Research run"))}</strong>
              <small>${escapeHtml(firstDefined(item?.summary, item?.notes, item?.result, ""))}</small>
            </div>
            <span>${escapeHtml(fmtDateTime(firstDefined(item?.updatedAt, item?.createdAt)))}</span>
          </div>`).join("") || '<div class="empty-state">No research runs were reported.</div>'}
      </div>
    </section>`;
}

function renderRuntimeView() {
  const orderedServices = getOrderedServices();
  const view = getActiveView();
  const routeActions = buildRouteActions();
  const support = getRuntimeSnapshot().support || {};
  const runtime = getRuntimeSnapshot().runtime || {};
  const docker = getDockerSummary();
  const tooling = getToolingSummary();
  const workstation = getWorkstationIdentity();
  const shell = getShellHealth();
  const startupOwner = getStartupOwner();
  const envDrift = getEnvDriftSummary();
  const adminContinuity = getAdminContinuity();
  const dropbox = getDropboxContext();
  const ownership = getRuntimeOwnershipSummary();
  const companionStatus = getCompanionStatus();
  const broker = getOfficeBroker();
  const doctor = getDoctor();
  const runningCount = orderedServices.filter((item) => item.state === "running").length;
  const attentionCount = orderedServices.filter((item) => item.state === "error" || item.state === "pending" || item.state === "stopped").length;
  const startingCount = orderedServices.filter((item) => item.state === "starting" || item.state === "booting").length;

  if (view === "runtime") {
    dom.workspaceContent.innerHTML = `
      <section class="content-grid runtime-summary-grid">
        ${renderMetricPanel("Services", `${runningCount}/${orderedServices.length || 0} running`, `${attentionCount} need attention, ${startingCount} are starting or booting.`)}
        ${renderMetricPanel("Diagnostics", doctor.overallState || "booting", `${doctor.actionableIssueCount || 0} actionable checks are currently open.`)}
        ${renderMetricPanel("Shared shell", shell.status || "unknown", firstDefined(shell.detail, shell.statusMessage, shell.phase, "Shell health is not reported yet.") || "")}
        ${renderMetricPanel("Office integration", companionStatus.label, broker.enabled ? (broker.healthy ? "Office is available through the live local service." : "Office is available in snapshot mode while the live service recovers.") : "Office service is disabled.")}
      </section>
      <section class="content-grid service-grid">
        ${orderedServices.map((item) => renderServiceCard(item)).join("")}
      </section>`;
    return;
  }

  if (view === "watchdog") {
    const watchdogServices = getWatchdogServices();
    dom.workspaceContent.innerHTML = `
      <section class="content-grid runtime-summary-grid">
        ${renderMetricPanel("Collectors", `${watchdogServices.length || 0}`, "Watchdog services stay operator-facing and review-first.")}
        ${renderMetricPanel("Healthy", `${watchdogServices.filter((item) => item.state === "running").length || 0}`, "Collector health is reflected here before you jump to the Suite route.")}
        ${renderMetricPanel("Actionable", `${watchdogServices.filter((item) => item.state !== "running").length || 0}`, "Use the route handoff when a collector needs deeper UI context.")}
      </section>
      <section class="content-grid two-up">
        ${watchdogServices.map((item) => renderServiceCard(item)).join("")}
      </section>
      <section class="content-panel quiet">
        <div class="panel-eyebrow">Route handoff</div>
        <h2>Use the Suite watchdog route for project activity and live collector reporting.</h2>
        <div class="button-row">
          ${renderActionButton("Open Watchdog route", routeActions.find((item) => item.routeId === "watchdog") || { kind: "route", routeId: "watchdog", routePath: "/app/watchdog", routeTitle: "Watchdog", label: "Open Watchdog route" })}
        </div>
      </section>`;
      return;
  }

  if (view === "projects") {
    const autocad = orderedServices.find((item) => item.id === "watchdog-autocad");
    dom.workspaceContent.innerHTML = `
      <section class="content-grid project-lane-grid">
        ${autocad ? renderServiceCard(autocad) : '<div class="empty-state">AutoCAD collector state is not available.</div>'}
        <article class="content-panel spotlight-panel">
          <div class="lane-header">
            <div>
              <div class="panel-eyebrow">ACADE reference</div>
              <h2>Project creation and activation stay ACADE-owned.</h2>
              <p>Use the curated Autodesk project-flow reference while planning project creation, activation, and plugin behavior. This workspace is the readiness surface, not the place where CAD automation is authored.</p>
            </div>
            <span class="state-pill ${escapeHtml(autocad?.state === "running" ? "running" : "pending")}">${escapeHtml(autocad?.state === "running" ? "collector live" : "collector not ready")}</span>
          </div>
          <div class="summary-pill-row">
            ${renderSummaryPill("Collector", autocad?.name || "AutoCAD")}
            ${renderSummaryPill("State", STATUS_LABELS[autocad?.state] || autocad?.state || "Unknown", autocad?.state || "pending")}
            ${renderSummaryPill("Reference", "Curated local doc")}
          </div>
          <div class="button-row">
            ${renderActionButton("Open Autodesk reference", { kind: "path", path: "autodesk-project-flow-reference", label: "Open Autodesk project-flow reference" }, "action-btn primary")}
            ${renderActionButton("Open Watchdog route", routeActions.find((item) => item.routeId === "watchdog") || { kind: "route", routeId: "watchdog", routePath: "/app/watchdog", routeTitle: "Watchdog", label: "Open Watchdog route" }, "action-btn")}
          </div>
        </article>
      </section>
      <section class="content-grid two-up">
        ${renderFocusPanel("Readiness rule", "Runtime and shell lanes can surface trust, status, and reference material, but ACADE still owns project creation and activation.")}
        ${renderFocusPanel("Next move", "Use the Autodesk reference plus collector state to confirm the next ACADE interaction before changing plugin or project behavior.")}
      </section>`;
    return;
  }

  if (view === "diagnostics") {
    const checks = getActionableChecks();
    dom.workspaceContent.innerHTML = `
      <section class="content-grid runtime-summary-grid">
        ${renderMetricPanel("Doctor state", doctor.overallState || "booting", `${doctor.actionableIssueCount || 0} actionable checks reported.`)}
        ${renderMetricPanel("Checks", `${checks.length || 0}`, "Diagnostics keeps the recovery list tighter than the service grid.")}
        ${renderMetricPanel("Routes", `${routeActions.length || 0}`, "Use direct Suite routes when a problem needs the full app surface.")}
        ${renderMetricPanel("Docker", `${docker.containers?.length || 0} containers`, docker.containers?.some((item) => item.health === "restarting") ? "A container is restarting and needs attention." : "Container status is readable from the shell now.")}
      </section>
      <section class="content-grid two-up">
        <article class="content-panel">
          <div class="panel-eyebrow">Actionable checks</div>
          <div class="stack-list">
            ${checks.map((check) => `
              <div class="stack-row tone-${escapeHtml(check.severity)}">
                <div>
                  <strong>${escapeHtml(check.serviceName)} / ${escapeHtml(check.label)}</strong>
                  <small>${escapeHtml(check.detail)}</small>
                </div>
                ${renderActionButton("Open lane", { kind: "workspace", workspace: "runtime", view: check.serviceId.startsWith("watchdog") ? "watchdog" : "runtime", label: `Open ${check.serviceName}` }, "action-btn ghost")}
              </div>`).join("") || '<div class="empty-state">Runtime doctor is clear.</div>'}
          </div>
        </article>
        <article class="content-panel quiet">
          <div class="panel-eyebrow">Suite routes</div>
          <div class="stack-list">
            ${routeActions.map((action) => `
              <div class="stack-row">
                <div>
                  <strong>${escapeHtml(action.label)}</strong>
                  <small>${escapeHtml(action.description || "")}</small>
                </div>
                ${renderActionButton("Open", action, "action-btn ghost")}
              </div>`).join("")}
          </div>
        </article>
      </section>`;
      return;
  }

  dom.workspaceContent.innerHTML = `
    <section class="content-grid support-grid">
      <article class="content-panel">
        <div class="panel-eyebrow">Support surfaces</div>
        <div class="stack-list">
          <div class="stack-row">
            <div>
              <strong>Bootstrap log</strong>
              <small>${escapeHtml(runtime.logPath || "Not reported")}</small>
            </div>
            ${renderActionButton("Focus", { kind: "local", action: "open_logs", logSourceId: "bootstrap", label: "Focus bootstrap logs" }, "action-btn ghost")}
          </div>
          <div class="stack-row">
            <div>
              <strong>Status directory</strong>
              <small>${escapeHtml(runtime.statusDir || "Not reported")}</small>
            </div>
            ${renderActionButton("Open", buildSupportAction("open-status-dir", "Open status folder"), "action-btn ghost")}
          </div>
          <div class="stack-row">
            <div>
              <strong>Support summary</strong>
              <small>${escapeHtml((support.lines || [])[0] || "Copy runtime support summary.")}</small>
            </div>
            ${renderActionButton("Copy", buildSupportAction("copy-summary", "Copy support summary"), "action-btn ghost")}
          </div>
          <div class="stack-row">
            <div>
              <strong>Workstation profile</strong>
              <small>Re-apply workstation identity and local MCP environment block.</small>
            </div>
            ${renderActionButton("Apply", buildSupportAction("apply-workstation-profile", "Apply workstation profile"), "action-btn ghost")}
          </div>
          <div class="stack-row">
            <div>
              <strong>Workstation</strong>
              <small>${escapeHtml(formatWorkstationIdentity())}</small>
            </div>
            <span class="state-pill ${escapeHtml(workstation.workstationId ? "running" : "pending")}">${escapeHtml(workstation.workstationId || "unknown")}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Shared shell</strong>
              <small>${escapeHtml(firstDefined(shell.detail, shell.statusMessage, shell.phase, "Shell health was not reported.") || "")}</small>
            </div>
            <span class="state-pill ${escapeHtml(getShellStatusTone(shell))}">${escapeHtml(shell.status || "unknown")}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Startup owner</strong>
              <small>${escapeHtml(firstDefined(startupOwner.owner, "unknown"))}</small>
            </div>
            <span class="state-pill ${escapeHtml(startupOwner.owner && startupOwner.owner !== "none" ? "running" : "pending")}">${escapeHtml(startupOwner.owner || "none")}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Runtime ownership</strong>
              <small>${escapeHtml(ownership.detail)}</small>
            </div>
            <span class="state-pill ${escapeHtml(ownership.headline.includes("0/") || ownership.headline.includes("/0") ? "pending" : "running")}">${escapeHtml(ownership.headline)}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Env drift</strong>
              <small>${escapeHtml(`${envDrift.driftedFileCount || 0} file drift, ${envDrift.driftedUserEnvCount || 0} env drift, ${envDrift.missingUserEnvCount || 0} missing.`)}</small>
            </div>
            <span class="state-pill ${escapeHtml(envDrift.overall === "aligned" ? "running" : envDrift.overall === "missing" ? "pending" : "error")}">${escapeHtml(envDrift.overall || "unknown")}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Admin continuity</strong>
              <small>${escapeHtml(firstDefined(adminContinuity.detail, adminContinuity.summary, "Admin continuity was not reported."))}</small>
            </div>
            <span class="state-pill ${escapeHtml(adminContinuity.overall === "ok" || adminContinuity.overall === "aligned" ? "running" : adminContinuity.overall ? "pending" : "error")}">${escapeHtml(adminContinuity.overall || "unknown")}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Office Dropbox roots</strong>
              <small>${escapeHtml([dropbox.knowledgeRoot, dropbox.stateRoot].filter(Boolean).join(" | ") || "Office Dropbox roots were not reported.")}</small>
            </div>
            <span class="state-pill ${escapeHtml(dropbox.knowledgeRootExists && dropbox.stateRootExists ? "running" : "pending")}">${escapeHtml(dropbox.knowledgeRootExists && dropbox.stateRootExists ? "ready" : "needs setup")}</span>
          </div>
          <div class="stack-row">
            <div>
              <strong>Support bundle</strong>
              <small>Package runtime logs and local evidence into one archive.</small>
            </div>
            ${renderActionButton("Export", buildSupportAction("export-bundle", "Export support bundle"), "action-btn ghost")}
          </div>
          <div class="stack-row">
            <div>
              <strong>Office broker</strong>
              <small>${escapeHtml(`${broker.baseUrl || "http://127.0.0.1:57420"} ${broker.statePath || "/state"}`)}</small>
            </div>
            <span class="state-pill ${escapeHtml(broker.enabled ? (broker.healthy ? "running" : "pending") : "stopped")}">${escapeHtml(broker.enabled ? (broker.healthy ? "healthy" : "fallback") : "disabled")}</span>
          </div>
          <div class="button-row">
            <button type="button" class="action-btn subtle" data-office-message="office.broker.start">Start broker</button>
            <button type="button" class="action-btn ghost" data-office-message="office.broker.restart">Restart broker</button>
          </div>
        </div>
      </article>
      <article class="content-panel quiet">
        <div class="lane-header compact">
          <div>
            <div class="panel-eyebrow">Office service</div>
            <h2>${escapeHtml(companionStatus.label)}</h2>
          </div>
        </div>
        <p>Office now lives in the shared shell through the local broker. The old standalone client is retired from normal runtime flow.</p>
        <div class="summary-pill-row">
          ${renderSummaryPill("Broker", broker.enabled ? (broker.healthy ? "Healthy" : "Fallback") : "Disabled", broker.enabled ? (broker.healthy ? "running" : "pending") : "stopped")}
          ${renderSummaryPill("Support", support.lines?.length ? "Loaded" : "Minimal")}
          ${renderSummaryPill("Shell", shell.status || "unknown", getShellStatusTone(shell))}
          ${renderSummaryPill("Workstation", workstation.workstationId || "Unknown", workstation.workstationId ? "running" : "pending")}
          ${renderSummaryPill("Admin", adminContinuity.overall || "unknown", adminContinuity.overall === "ok" || adminContinuity.overall === "aligned" ? "running" : "pending")}
        </div>
        <div class="button-row">
          ${renderActionButton("Open Office", { kind: "workspace", workspace: "office", view: "chat", label: "Open Office workspace" }, "action-btn primary")}
          ${renderActionButton("Open Office folder", { kind: "companion", action: "open-folder", label: "Open Office folder" }, "action-btn")}
          <button type="button" class="action-btn subtle" data-office-message="office.workspace.reset">Reset Office workspace</button>
        </div>
      </article>
    </section>
    <section class="content-grid two-up">
      <article class="content-panel">
        <div class="lane-header compact">
          <div>
            <div class="panel-eyebrow">Docker observability</div>
            <h2>${escapeHtml(`${docker.containers?.length || 0} containers observed`)}</h2>
            <p>Runtime can read container state, ports, restart loops, and the Supabase Studio jump without becoming a Docker control panel.</p>
          </div>
        </div>
        <div class="stack-list">
          ${(docker.containers || []).map((container) => `
            <div class="stack-row tone-${escapeHtml(container.health === "restarting" || container.health === "unhealthy" ? "error" : container.health === "running" || container.health === "healthy" ? "running" : "pending")}">
              <div>
                <strong>${escapeHtml(container.name)}</strong>
                <small>${escapeHtml([container.image, container.status, container.ports].filter(Boolean).join(" | "))}</small>
              </div>
              <span class="state-pill ${escapeHtml(container.health === "restarting" || container.health === "unhealthy" ? "error" : container.health === "running" || container.health === "healthy" ? "running" : "pending")}">${escapeHtml(container.health || "unknown")}</span>
            </div>`).join("") || '<div class="empty-state">No Docker container data was reported.</div>'}
        </div>
        <div class="note-block">
          <div>
            <strong>Named volumes</strong>
            <small>${escapeHtml((docker.importantVolumes || []).join(" | ") || "No important named volumes were reported.")}</small>
          </div>
        </div>
        <div class="button-row">
          ${docker.supabaseStudioUrl ? renderActionButton("Open Supabase Studio", { kind: "path", path: docker.supabaseStudioUrl, label: "Open Supabase Studio" }, "action-btn") : ""}
          ${docker.dockerDesktopPath ? renderActionButton("Open Docker Desktop", { kind: "path", path: docker.dockerDesktopPath, label: "Open Docker Desktop" }, "action-btn ghost") : ""}
          ${renderActionButton("Focus backend logs", { kind: "local", action: "open_logs", logSourceId: "backend", label: "Focus backend logs" }, "action-btn ghost")}
        </div>
      </article>
      <article class="content-panel quiet">
        <div class="lane-header compact">
          <div>
            <div class="panel-eyebrow">Workstation continuity</div>
            <h2>${escapeHtml(workstation.workstationId || "Workstation")}</h2>
            <p>Identity, startup ownership, Dropbox live roots, and Codex state stay visible here so the combined shell carries the workstation transition story directly.</p>
          </div>
        </div>
        <div class="signal-columns">
          <div class="signal-column">
            <div class="panel-eyebrow">Continuity</div>
            <ul class="signal-list compact-list">
              <li>${escapeHtml(`Shared shell: ${shell.status || "unknown"}`)}</li>
              <li>${escapeHtml(`Startup owner: ${startupOwner.owner || "unknown"}`)}</li>
              <li>${escapeHtml(`Env drift: ${envDrift.overall || "unknown"}`)}</li>
              <li>${escapeHtml(`Admin continuity: ${adminContinuity.overall || "unknown"}`)}</li>
              <li>${escapeHtml(ownership.headline)}</li>
            </ul>
          </div>
          <div class="signal-column">
            <div class="panel-eyebrow">Dropbox + Codex</div>
            <ul class="signal-list compact-list">
              <li>${escapeHtml(`Knowledge root: ${dropbox.knowledgeRoot || "not reported"}`)}</li>
              <li>${escapeHtml(`State root: ${dropbox.stateRoot || "not reported"}`)}</li>
              <li>${escapeHtml(`Active MCP: ${(tooling.activeMcpServers || []).length || 0}`)}</li>
              <li>${escapeHtml(`Skills suggested: ${(tooling.recommendedSkills || []).length || 0}`)}</li>
            </ul>
          </div>
        </div>
      </article>
    </section>`;
}

function renderWorkspaceContent() {
  if (state.activeWorkspace === "office") {
    renderOfficeView();
    return;
  }

  renderRuntimeView();
}

function buildContextUtilityHtml() {
  const broker = getOfficeBroker();
  const provider = getOfficeProviderState();
  const library = getOfficeLibraryState();
  const growth = getOfficeGrowthState();
  const doctor = getDoctor();
  const workstation = getWorkstationIdentity();
  const shell = getShellHealth();
  const startupOwner = getStartupOwner();
  const envDrift = getEnvDriftSummary();
  const adminContinuity = getAdminContinuity();
  const dropbox = getDropboxContext();
  const ownership = getRuntimeOwnershipSummary();
  const companionStatus = getCompanionStatus();
  const runtimeSnapshot = getRuntimeSnapshot();
  const staleMessage = runtimeSnapshot.snapshotStale
    ? `Runtime snapshot is stale. ${runtimeSnapshot.snapshotError || "The last refresh did not return clean JSON, so the shell is holding the last good state."}`
    : "";

  if (state.activeWorkspace === "office") {
    return `
      <section class="utility-shell">
      ${staleMessage ? `
        <article class="context-card tone-pending">
          <div class="panel-eyebrow">Snapshot state</div>
          <strong>Stale</strong>
          <p>${escapeHtml(staleMessage)}</p>
        </article>` : ""}
      <article class="context-card">
        <div class="panel-eyebrow">Broker health</div>
        <strong>${escapeHtml(broker.enabled ? (broker.healthy ? "Healthy" : "Fallback mode") : "Disabled")}</strong>
        <p>${escapeHtml(firstDefined(broker.lastError, `${broker.baseUrl || "http://127.0.0.1:57420"}${broker.statePath || "/state"}`) || "")}</p>
      </article>
      <article class="context-card">
        <div class="panel-eyebrow">Provider</div>
        <strong>${escapeHtml(provider.primaryProviderLabel || provider.activeProviderLabel || "Office provider")}</strong>
        <p>${escapeHtml(provider.ready ? `${provider.installedModelCount || 0} models available locally.` : "Local provider is configured, but the current model roster is incomplete.")}</p>
      </article>
      <article class="context-card">
        <div class="panel-eyebrow">Knowledge</div>
        <strong>${escapeHtml(`${library.totalDocuments || 0} tracked docs`)}</strong>
        <p>${escapeHtml(firstDefined(library.profileSummary, library.summary, "Knowledge path not configured.") || "")}</p>
      </article>
      <article class="context-card">
        <div class="panel-eyebrow">Operator queue</div>
        <strong>${escapeHtml(`${inbox.approvals.length || 0} approvals`)}</strong>
        <p>${escapeHtml(firstDefined(growth.watchlistSummary, `${growth.watchlists.length || 0} tracked watchlists.`) || "")}</p>
      </article>
      <article class="context-card">
        <div class="panel-eyebrow">Chat route</div>
        <strong>${escapeHtml(chat.currentRouteTitle || chat.currentRoute || "default")}</strong>
        <p>${escapeHtml(firstDefined(chat.routeReason, `${chat.threads.length || 0} threads with ${chat.transcript.length || 0} transcript rows.`) || "")}</p>
      </article>
      <article class="context-card tone-${escapeHtml(companionStatus.tone)}">
        <div class="panel-eyebrow">Office service</div>
        <strong>${escapeHtml(companionStatus.label)}</strong>
        <p>Office now opens inside the shared shell after runtime trust is established.</p>
      </article>
      </section>`;
  }

  const actionableChecks = getActionableChecks();
  const runningCount = getOrderedServices().filter((item) => item.state === "running").length;
  return `
    <section class="utility-shell">
    ${staleMessage ? `
      <article class="context-card tone-pending">
        <div class="panel-eyebrow">Snapshot state</div>
        <strong>Stale</strong>
        <p>${escapeHtml(staleMessage)}</p>
      </article>` : ""}
    <article class="context-card">
      <div class="panel-eyebrow">Runtime doctor</div>
      <strong>${escapeHtml(doctor.overallState || "booting")}</strong>
      <p>${escapeHtml(`${doctor.actionableIssueCount || 0} actionable issues across ${getOrderedServices().length} services, ${runningCount} running.`)}</p>
    </article>
    <article class="context-card">
      <div class="panel-eyebrow">Actionable checks</div>
      <strong>${escapeHtml(String(actionableChecks.length))}</strong>
      <p>${escapeHtml((doctor.recommendations || [])[0] || "Use Bootstrap All or targeted service controls to reconcile the stack.")}</p>
    </article>
    <article class="context-card">
      <div class="panel-eyebrow">Workstation</div>
      <strong>${escapeHtml(workstation.workstationId || "unknown")}</strong>
      <p>${escapeHtml(formatWorkstationIdentity())}</p>
    </article>
    <article class="context-card tone-${escapeHtml(getShellStatusTone(shell))}">
      <div class="panel-eyebrow">Shared shell</div>
      <strong>${escapeHtml(shell.status || "unknown")}</strong>
      <p>${escapeHtml(firstDefined(shell.detail, shell.statusMessage, shell.phase, "Shell health is not reported yet.") || "")}</p>
    </article>
    <article class="context-card">
      <div class="panel-eyebrow">Ownership</div>
      <strong>${escapeHtml(ownership.headline)}</strong>
      <p>${escapeHtml(`${startupOwner.owner || "unknown"} startup owner; ${ownership.detail}`)}</p>
    </article>
    <article class="context-card">
      <div class="panel-eyebrow">Continuity</div>
      <strong>${escapeHtml(`${envDrift.overall || "unknown"} env / ${adminContinuity.overall || "unknown"} admin`)}</strong>
      <p>${escapeHtml([dropbox.knowledgeRoot, dropbox.stateRoot].filter(Boolean).join(" | ") || "Dropbox Office roots were not reported.")}</p>
    </article>
    <article class="context-card tone-${escapeHtml(companionStatus.tone)}">
      <div class="panel-eyebrow">Office service</div>
      <strong>${escapeHtml(companionStatus.label)}</strong>
      <p>Runtime keeps Office embedded in the shared shell instead of launching a separate standalone client.</p>
    </article>
    <article class="context-card tone-${escapeHtml(broker.enabled ? (broker.healthy ? "running" : "pending") : "stopped")}">
      <div class="panel-eyebrow">Office broker</div>
      <strong>${escapeHtml(broker.enabled ? (broker.healthy ? "Healthy" : "Snapshot fallback") : "Disabled")}</strong>
      <p>${escapeHtml(firstDefined(broker.lastError, `${broker.baseUrl || "http://127.0.0.1:57420"}${broker.statePath || "/state"}`) || "")}</p>
    </article>
    <article class="context-card">
      <div class="panel-eyebrow">Reference lane</div>
      <strong>ACADE project flow</strong>
      <p>Open the curated Autodesk reference directly from this shell when planning project and plugin work.</p>
      <div class="button-row">
        ${renderActionButton("Open reference", { kind: "path", path: "autodesk-project-flow-reference", label: "Open Autodesk project-flow reference" }, "action-btn ghost")}
      </div>
    </article>
    </section>`;
}

function getInboxOutcomeStatus(item) {
  return firstDefined(item?.outcome?.status, item?.status, "pending") || "pending";
}

function getInboxEntryTone(item, fallback = "pending") {
  const executionStatus = firstDefined(item?.executionStatus, "not_queued");
  const status = getInboxOutcomeStatus(item);
  if (executionStatus === "failed" || status === "rejected") {
    return "error";
  }
  if (executionStatus === "completed") {
    return "running";
  }
  if (executionStatus === "queued" || executionStatus === "running") {
    return "pending";
  }
  if (status === "accepted") {
    return "running";
  }
  return fallback;
}

function getInboxBadgeText(item) {
  const executionStatus = firstDefined(item?.executionStatus, "not_queued");
  const status = getInboxOutcomeStatus(item);
  if (executionStatus === "queued") {
    return "queued";
  }
  if (executionStatus === "running") {
    return "running";
  }
  if (executionStatus === "completed") {
    return "completed";
  }
  if (executionStatus === "failed") {
    return "needs retry";
  }
  if (status === "accepted") {
    return "approved next";
  }
  if (status === "rejected") {
    return "rejected";
  }
  if (status === "deferred") {
    return "deferred";
  }
  return "pending";
}

function getInboxDetailLines(item) {
  const lines = [];
  const priority = firstDefined(item?.priority, "medium");
  const sourceAgent = firstDefined(item?.sourceAgent, "Office");
  const linkedArea = firstDefined(item?.linkedArea, "");
  lines.push({
    label: "Route",
    value: [sourceAgent, priority, linkedArea].filter(Boolean).join(" | "),
  });

  [
    ["Why", firstDefined(item?.rationale, "")],
    ["Benefit", firstDefined(item?.expectedBenefit, "")],
    ["Learn", firstDefined(item?.whatYouLearn, "")],
    ["Career", firstDefined(item?.careerValue, "")],
    ["Product", firstDefined(item?.productImpact, "")],
    ["Execution", firstDefined(item?.executionSummary, "")],
    ["Result", firstDefined(item?.latestResultSummary, "")],
    ["Detail", firstDefined(item?.latestResultDetail, "")],
  ].forEach(([label, value]) => {
    if (value) {
      lines.push({ label, value });
    }
  });

  const sources = toArray(item?.latestResultSources);
  if (sources.length) {
    lines.push({
      label: "Sources",
      value: sources.join(" | "),
    });
  }

  if (item?.latestResultPath) {
    lines.push({
      label: "Output",
      value: item.latestResultPath,
    });
  }

  return lines;
}

function collectInboxEntries() {
  const inbox = getOfficeInboxState();
  const approvals = inbox.approvals.map((item, index) => {
    const suggestionId = firstDefined(item?.id, item?.queueId, item?.key, `approval-${index + 1}`);
    return {
      id: suggestionId,
      title: firstDefined(item?.title, item?.label, "Approval pending"),
      summary: firstDefined(item?.summary, item?.detail, item?.rationale, ""),
      tone: getInboxEntryTone(item),
      badgeText: getInboxBadgeText(item),
      detailLines: getInboxDetailLines(item),
      actions: [
        {
          kind: "message",
          type: "office.inbox.resolve",
          payload: {
            suggestionId,
            status: "accepted",
            reason: "Accepted from the shared inbox.",
            note: "",
          },
          label: "Accept approval",
          closeInbox: false,
        },
        {
          kind: "message",
          type: "office.inbox.resolve",
          payload: {
            suggestionId,
            status: "deferred",
            reason: "Deferred from the shared inbox.",
            note: "",
          },
          label: "Defer approval",
          closeInbox: false,
        },
        {
          kind: "message",
          type: "office.inbox.resolve",
          payload: {
            suggestionId,
            status: "rejected",
            reason: "Rejected from the shared inbox.",
            note: "",
          },
          label: "Reject approval",
          closeInbox: false,
        },
      ],
    };
  });
  const queuedReady = inbox.queuedReady.map((item, index) => {
    const suggestionId = firstDefined(item?.id, item?.queueId, item?.key, `queued-${index + 1}`);
    const executionStatus = firstDefined(item?.executionStatus, "not_queued");
    const isResearchFollowup = firstDefined(item?.actionType, "") === "research_followup";
    const queueLabel = isResearchFollowup
      ? (executionStatus === "failed"
          ? "Run again"
          : executionStatus === "queued" || executionStatus === "running"
            ? "Refresh state"
            : "Run follow-through")
      : (executionStatus === "failed"
          ? "Re-queue"
          : executionStatus === "queued"
            ? "Refresh queue"
            : "Queue now");
    return {
      id: suggestionId,
      title: firstDefined(item?.title, item?.label, "Queued and ready"),
      summary: firstDefined(
        item?.executionSummary,
        item?.latestResultSummary,
        item?.summary,
        item?.detail,
        item?.rationale,
        "",
      ),
      tone: getInboxEntryTone(item),
      badgeText: getInboxBadgeText(item),
      detailLines: getInboxDetailLines(item),
      actions: [
        ...(item?.latestResultPath
          ? [{
              kind: "path",
              path: item.latestResultPath,
              label: "Open brief",
              closeInbox: false,
            }]
          : []),
        {
          kind: "message",
          type: "office.inbox.queue",
          payload: {
            suggestionId,
            approveFirst: true,
          },
          label: queueLabel,
          closeInbox: false,
        },
        {
          kind: "workspace",
          workspace: "office",
          view: "growth",
          label: "Open Growth",
          closeInbox: true,
        },
      ],
    };
  });
  const runtimeChecks = getActionableChecks().map((check, index) => ({
    id: `runtime-${index + 1}`,
    title: `${check.serviceName}: ${check.label}`,
    summary: check.detail,
    tone: check.severity || "pending",
    badgeText: check.severity || "pending",
    detailLines: [],
    actions: [
      { kind: "workspace", workspace: "runtime", view: check.serviceId.startsWith("watchdog") ? "watchdog" : "runtime", label: `Open ${check.serviceName}`, closeInbox: true },
    ],
  }));
  const recentResults = [
    ...inbox.recentResults.map((item, index) => ({
      id: firstDefined(item?.id, `result-${index + 1}`),
      title: firstDefined(item?.title, item?.label, "Recent result"),
      summary: firstDefined(item?.latestResultSummary, item?.executionSummary, item?.summary, item?.detail, ""),
      tone: getInboxEntryTone(item, "running"),
      badgeText: getInboxBadgeText(item),
      detailLines: getInboxDetailLines(item),
      actions: [
        ...(item?.latestResultPath
          ? [{
              kind: "path",
              path: item.latestResultPath,
              label: "Open brief",
              closeInbox: false,
            }]
          : []),
        { kind: "workspace", workspace: "office", view: "chat", label: "Open Office Chat", closeInbox: true },
        { kind: "workspace", workspace: "office", view: "growth", label: "Open Growth", closeInbox: true },
      ],
    })),
    ...runtimeChecks,
  ];

  return { approvals, queuedReady, recentResults };
}

function buildInboxUtilityHtml() {
  const groups = collectInboxEntries();
  const total = groups.approvals.length + groups.queuedReady.length + groups.recentResults.length;
  const renderGroup = (title, entries, fallback) => `
    <section class="drawer-group">
      <div class="panel-eyebrow">${escapeHtml(title)}</div>
      ${entries.length
    ? entries.map((entry) => `
          <article class="drawer-card tone-${escapeHtml(entry.tone)}">
            <div class="drawer-card-head">
              <strong>${escapeHtml(entry.title)}</strong>
              <span class="state-pill ${escapeHtml(entry.tone)}">${escapeHtml(entry.badgeText || "open")}</span>
            </div>
            <p>${escapeHtml(entry.summary)}</p>
            ${entry.detailLines?.length
              ? `<div class="note-block">${entry.detailLines.map((line) => `
                  <div>
                    <strong>${escapeHtml(line.label || "Detail")}</strong>
                    <small>${escapeHtml(line.value || "")}</small>
                  </div>`).join("")}</div>`
              : ""}
            <div class="button-row drawer-card-actions">
              ${(entry.actions || []).map((action, index) =>
                renderActionButton(
                  action.label || `Action ${index + 1}`,
                  action,
                  index === 0 ? "action-btn" : "action-btn ghost",
                )).join("")}
            </div>
          </article>`).join("")
    : `<div class="empty-state small">${escapeHtml(fallback)}</div>`}
    </section>`;

  return `
    <section class="utility-shell">
      <article class="content-panel quiet">
        <div class="lane-header compact">
          <div>
            <div class="panel-eyebrow">Shared Inbox</div>
            <h2>${escapeHtml(total ? `${total} shared item${total === 1 ? "" : "s"}` : "Inbox clear")}</h2>
            <p>${escapeHtml(total
              ? `${total} shared inbox items across approvals, queued-ready, and recent results.`
              : "No open Office or Runtime inbox items.")}</p>
          </div>
        </div>
      </article>
      <div class="drawer-content">
    ${renderGroup("Approvals", groups.approvals, "No pending approvals.")}
    ${renderGroup("Queued / Ready", groups.queuedReady, "No queued-ready actions.")}
    ${renderGroup("Recent Results", groups.recentResults, "No recent results.")}
    <div class="button-row">
      <button type="button" class="action-btn subtle" data-office-message="office.inbox.list">Refresh inbox</button>
    </div>
      </div>
    </section>`;
}

function renderCommandResults() {
  const shouldShow = state.commandFocused || state.commandQuery.trim().length > 0;
  dom.commandResults.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    dom.commandResults.innerHTML = "";
    return;
  }

  const actions = getFilteredCommandActions();
  dom.commandResults.innerHTML = actions.length
    ? actions.map((action) => `
      <button type="button" class="command-result" data-action-id="${registerAction(action)}">
        <strong>${escapeHtml(action.label)}</strong>
        <span>${escapeHtml(action.description || "")}</span>
      </button>`).join("")
    : '<div class="empty-state small">No matching commands.</div>';
}

function getLogSources() {
  const runtimeSources = Array.isArray(getRuntimeSnapshot().logSources) ? getRuntimeSnapshot().logSources : state.logSources;
  const shellSource = {
    id: "transcript",
    label: "Shell transcript",
    kind: "virtual",
    description: "Action and host events emitted by the operator shell itself.",
  };
  return [
    shellSource,
    ...runtimeSources.filter((item) => item?.id && item.id !== shellSource.id),
  ];
}

function getFilteredShellTranscriptEntries() {
  const filter = state.logFilter.trim().toLowerCase();
  const entries = state.logs.length
    ? state.logs
    : [{ timestamp: "--:--:--", tag: "SYS", tone: "sys", message: "No runtime transcript yet." }];
  if (!filter) {
    return entries;
  }

  return entries.filter((entry) =>
    `${entry.timestamp || ""} ${entry.tag || ""} ${entry.message || ""}`.toLowerCase().includes(filter));
}

function buildLogsUtilityHtml() {
  const sources = getLogSources();
  const selectedSource = sources.find((item) => item.id === state.activeLogSourceId) || sources[0];
  const sourceState = state.activeLogSource && state.activeLogSource.id === selectedSource?.id
    ? state.activeLogSource
    : null;
  const filter = state.logFilter.trim().toLowerCase();
  const transcriptEntries = selectedSource?.id === "transcript"
    ? getFilteredShellTranscriptEntries()
    : [];
  const rawText = selectedSource?.id === "transcript"
    ? ""
    : toArray(sourceState?.lines).join("\n");
  const allLogLines = rawText ? rawText.split(/\r?\n/) : [];
  const filteredLogLines = !filter
    ? allLogLines
    : allLogLines.filter((line) => line.toLowerCase().includes(filter));
  const filteredText = filteredLogLines.join("\n");
  const emptyText = sourceState?.error
    || (selectedSource?.kind === "url"
      ? "This source opens externally. Use the external open action if you need the linked UI."
      : "No log content is available for the selected source yet.");
  const visibleCopyText = selectedSource?.id === "transcript"
    ? transcriptEntries.map((entry) => `${entry.timestamp || "--:--:--"} ${entry.tag || "SYS"} ${entry.message || ""}`.trim()).join("\n")
    : (filteredText || emptyText);
  const fullCopyText = selectedSource?.id === "transcript"
    ? state.logs.map((entry) => `${entry.timestamp || "--:--:--"} ${entry.tag || "SYS"} ${entry.message || ""}`.trim()).join("\n")
    : (rawText || emptyText);

  return `
    <section class="utility-shell">
      <article class="content-panel quiet logs-utility-panel">
        <div class="lane-header compact">
          <div>
            <div class="panel-eyebrow">Integrated Logs</div>
            <h2>${escapeHtml(selectedSource?.label || "Logs")}</h2>
            <p>${escapeHtml(selectedSource?.description || "Service and shell output stays inside the dock unless you explicitly open it externally.")}</p>
          </div>
        </div>
        <div class="utility-toolbar utility-toolbar-controls">
          <select data-log-source-select class="stretch">
            ${sources.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedSource?.id ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
          </select>
          <input type="search" data-log-filter class="stretch" placeholder="Filter log lines" value="${escapeHtml(state.logFilter)}">
        </div>
        <div class="utility-toolbar utility-toolbar-actions">
          <button type="button" class="top-btn small" data-log-autoscroll>${escapeHtml(`Auto-scroll ${state.autoScroll ? "ON" : "OFF"}`)}</button>
          <button type="button" class="top-btn small" data-office-message="office.state.refresh">Refresh</button>
          <button type="button" class="top-btn small" data-runtime-message="runtime.clear_log">Clear transcript</button>
          <button type="button" class="top-btn small" data-copy-log-selected>Copy selected</button>
          <button type="button" class="top-btn small" data-copy-log-scope="visible" data-copy-log-text="${escapeHtml(visibleCopyText)}">Copy visible</button>
          <button type="button" class="top-btn small" data-copy-log-scope="all" data-copy-log-text="${escapeHtml(fullCopyText)}">Copy all</button>
          <button type="button" class="top-btn small" data-log-open-external>Open external</button>
        </div>
        <div class="log-meta">
          <div class="log-source-header">
            <div>
              <strong>${escapeHtml(selectedSource?.label || "Logs")}</strong>
              <small>${escapeHtml(sourceState?.path || selectedSource?.path || selectedSource?.description || "No log path reported.")}</small>
            </div>
            <span class="state-pill ${escapeHtml(getRuntimeSnapshot().snapshotStale ? "pending" : "running")}">${escapeHtml(getRuntimeSnapshot().snapshotStale ? "stale" : "live tail")}</span>
          </div>
        </div>
        <div class="log-file-body ${escapeHtml(selectedSource?.id === "transcript" ? "is-transcript" : "is-raw")}" id="utility-log-body">
          ${selectedSource?.id === "transcript"
            ? transcriptEntries.map((entry) => `
              <div class="log-entry tone-${escapeHtml(entry.tone || "sys")}">
                <span class="log-time">${escapeHtml(entry.timestamp || "--:--:--")}</span>
                <span class="log-tag">${escapeHtml(entry.tag || "SYS")}</span>
                <span class="log-message">${escapeHtml(entry.message || "")}</span>
              </div>`).join("")
            : `<pre class="log-file-text">${escapeHtml(filteredText || emptyText)}</pre>`}
        </div>
      </article>
    </section>`;
}

function renderUtilityPane() {
  applyUtilityPaneWidth();
  dom.utilitySubtitle.textContent = getUtilitySubtitle();
  dom.utilityTabRow.querySelectorAll("[data-utility-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.utilityTab === state.activeUtilityTab);
  });

  syncShellChromeState();

  if (state.utilityPaneCollapsed) {
    dom.utilityContent.innerHTML = "";
    dom.logBody = null;
    syncUtilityPaneLayoutState();
    return;
  }

  if (state.activeUtilityTab === "logs") {
    dom.utilityContent.innerHTML = buildLogsUtilityHtml();
  } else if (state.activeUtilityTab === "inbox") {
    dom.utilityContent.innerHTML = buildInboxUtilityHtml();
  } else {
    dom.utilityContent.innerHTML = buildContextUtilityHtml();
  }

  syncUtilityPaneLayoutState();
  dom.logBody = document.getElementById("utility-log-body");
  if (state.activeUtilityTab === "logs" && state.autoScroll && dom.logBody) {
    dom.logBody.scrollTop = dom.logBody.scrollHeight;
  }
}

function renderScaleControls() {
  if (!dom.shellScaleControls) {
    return;
  }

  dom.shellScaleControls.querySelectorAll("[data-scale-preset]").forEach((button) => {
    const preset = Number(button.dataset.scalePreset);
    button.classList.toggle("is-active", preset === state.contentScalePercent);
  });
}

function renderHeaderPills() {
  const overall = getOverallStatus();
  const provider = getProviderStatus();
  dom.overallStatusPill.className = `status-pill ${overall.state || "booting"}`;
  dom.overallStatusPill.textContent = overall.text || STATUS_LABELS[overall.state] || "Booting";
  dom.providerStatusPill.className = `status-pill ${provider.tone}`;
  dom.providerStatusPill.textContent = provider.text;
  renderScaleControls();
  syncShellChromeState();
}

function render() {
  beginActionRegistration();
  renderHeaderPills();
  renderWorkspaceNav();
  renderHeroPanel();
  renderWorkspaceContent();
  renderUtilityPane();
  renderCommandResults();
}

function sendOfficeMessage(type, payload = {}) {
  hostPost(type, payload);
  logLocalAction(type);
}

function getPracticeDraftKey(index) {
  return `practiceAnswer_${index}`;
}

function collectPracticeAnswers() {
  const questions = getOfficeStudyState().practiceQuestions || [];
  return questions.map((question, index) => ({
    questionIndex: index,
    selectedOptionKey: firstDefined(
      state.officeDrafts[getPracticeDraftKey(index)],
      question?.selectedOptionKey,
      "",
    ) || "",
  }));
}

function readOfficeDraftValue(bindKey) {
  return state.officeDrafts[bindKey] || "";
}

function onOfficeFormSubmit(formType) {
  switch (formType) {
    case "chat-route":
      sendOfficeMessage("office.chat.set_route", {
        route: readOfficeDraftValue("routeOverride"),
        threadId: readOfficeDraftValue("threadId"),
      });
      break;
    case "chat-send":
      sendOfficeMessage("office.chat.send", {
        routeOverride: readOfficeDraftValue("routeOverride"),
        prompt: readOfficeDraftValue("chatMessage"),
      });
      state.officeDrafts.chatMessage = "";
      break;
    case "study-start":
      sendOfficeMessage("office.study.start", {
        focus: readOfficeDraftValue("studyFocus"),
        route: readOfficeDraftValue("routeOverride"),
        threadId: readOfficeDraftValue("threadId"),
      });
      break;
    case "study-score-practice":
      sendOfficeMessage("office.study.score_practice", {
        answers: collectPracticeAnswers(),
      });
      break;
    case "study-score-defense":
      sendOfficeMessage("office.study.score_defense", {
        answer: readOfficeDraftValue("defenseSubmission"),
      });
      break;
    case "study-reflection":
      sendOfficeMessage("office.study.save_reflection", {
        reflection: readOfficeDraftValue("reflection"),
        focus: readOfficeDraftValue("studyFocus"),
      });
      break;
    case "research-run":
      sendOfficeMessage("office.research.run", {
        query: readOfficeDraftValue("researchPrompt"),
      });
      break;
    case "research-save":
      sendOfficeMessage("office.research.save", {
        notes: readOfficeDraftValue("researchNotes"),
      });
      break;
    case "library-import":
      sendOfficeMessage("office.library.import", {
        paths: readOfficeDraftValue("libraryImportPath")
          ? [readOfficeDraftValue("libraryImportPath")]
          : [],
      });
      break;
    default:
      break;
  }
}

function handleHostMessage(message) {
  switch (message.type) {
    case "runtime.catalog":
      state.runtimeCatalog = message.payload || EMPTY_RUNTIME_CATALOG;
      break;
    case "developer.manifest":
      state.developerManifest = message.payload || { groups: [], tools: [] };
      break;
    case "runtime.snapshot":
      state.runtimeSnapshot = message.payload || null;
      break;
    case "shell.window_state":
    case "shell.preferences":
      state.utilityPaneWidth = Number(firstDefined(message.payload?.utilityPaneWidth, state.utilityPaneWidth)) || state.utilityPaneWidth;
      state.utilityPaneCollapsed = Boolean(firstDefined(message.payload?.utilityPaneCollapsed, state.utilityPaneCollapsed));
      state.activeUtilityTab = firstDefined(message.payload?.activeUtilityTab, message.payload?.utilityPaneTab, state.activeUtilityTab) || "context";
      state.activeLogSourceId = firstDefined(message.payload?.activeLogSourceId, state.activeLogSourceId) || "transcript";
      state.contentScalePercent = normalizeContentScalePercent(
        firstDefined(message.payload?.contentScalePercent, state.contentScalePercent),
      );
      applyShellScaleVars();
      applyUtilityPaneWidth();
      break;
    case "runtime.log_sources":
      state.logSources = Array.isArray(message.payload?.sources)
        ? message.payload.sources
        : Array.isArray(message.payload)
          ? message.payload
          : [];
      break;
    case "runtime.log_view":
    case "runtime.log_source":
      state.activeLogSource = message.payload || null;
      state.activeLogSourceId = firstDefined(message.payload?.sourceId, message.payload?.id, state.activeLogSourceId) || "transcript";
      break;
    case "runtime.log_focus":
      if (message.payload?.sourceId) {
        state.activeLogSourceId = message.payload.sourceId;
      }
      if (message.payload?.utilityTab) {
        state.activeUtilityTab = message.payload.utilityTab;
      }
      state.utilityPaneCollapsed = false;
      break;
    case "shell.utility_state":
      state.utilityPaneCollapsed = Boolean(firstDefined(message.payload?.utilityPaneCollapsed, state.utilityPaneCollapsed));
      state.activeUtilityTab = firstDefined(message.payload?.activeUtilityTab, message.payload?.utilityTab, state.activeUtilityTab) || "context";
      state.activeLogSourceId = firstDefined(message.payload?.activeLogSourceId, message.payload?.sourceId, state.activeLogSourceId) || "transcript";
      break;
    case "office.snapshot":
      state.officeSnapshot = message.payload || null;
      {
        const routeOptions = toArray(firstDefined(
          message.payload?.liveState?.chat?.routeOptions,
          message.payload?.chat?.routeOptions,
        )).map((item) => firstDefined(item?.id, item?.route, item?.name, item?.value, ""));
        const activeRoute = firstDefined(
          message.payload?.liveState?.chat?.currentRoute,
          message.payload?.chat?.currentRoute,
          "",
        ) || "";
        if (!state.officeDrafts.routeOverride || (routeOptions.length && !routeOptions.includes(state.officeDrafts.routeOverride))) {
          state.officeDrafts.routeOverride = activeRoute;
        }

        const threads = toArray(firstDefined(
          message.payload?.liveState?.chat?.threads,
          message.payload?.chat?.threads,
        )).map((item) => firstDefined(item?.id, item?.threadId, ""));
        const activeThread = firstDefined(
          message.payload?.liveState?.chat?.activeThreadId,
          message.payload?.chat?.activeThreadId,
          "",
        ) || "";
        if (!state.officeDrafts.threadId || (threads.length && !threads.includes(state.officeDrafts.threadId))) {
          state.officeDrafts.threadId = activeThread;
        }
      }
      break;
    case "office.action.result":
      state.officeActionStatus = message.payload || null;
      pushLog({
        timestamp: fmtDateTime(new Date()),
        tag: message.payload?.ok ? "OFF" : "WARN",
        tone: message.payload?.ok ? "info" : "warn",
        message: `${message.payload?.ok ? "Office action completed" : "Office action needs attention"}: ${message.payload?.messageType || "office.action"}${message.payload?.details ? ` | ${message.payload.details}` : ""}`,
      });
      break;
    case "runtime.bootstrap_state":
      state.bootstrap = message.payload?.available ? message.payload : null;
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
        step: message.payload?.step || "",
      };
      break;
    case "runtime.action_state":
      state.busy = Boolean(message.payload?.busy);
      state.action = message.payload?.action || null;
      state.actionServiceId = message.payload?.serviceId || null;
      break;
    case "runtime.error":
      pushLog({
        timestamp: fmtDateTime(new Date()),
        tag: "ERR",
        tone: "err",
        message: `${message.payload?.message || "Runtime error."} ${message.payload?.details || ""}`.trim(),
      });
      break;
    default:
      break;
  }

  render();
}

window.chrome?.webview?.addEventListener("message", (event) => {
  handleHostMessage(event.data);
});

function bindActionContainer(element) {
  element.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action-id]");
    if (!button) {
      return;
    }
    executeAction(state.actionRegistry.get(button.dataset.actionId));
  });
}

bindActionContainer(dom.workspaceViewNav);
bindActionContainer(dom.workspaceActions);
bindActionContainer(dom.heroPanel);
bindActionContainer(dom.workspaceContent);
bindActionContainer(dom.commandResults);
bindActionContainer(dom.utilityContent);

function bindOfficeMessageContainer(element) {
  element.addEventListener("click", (event) => {
    const button = event.target.closest("[data-office-message]");
    if (!button) {
      return;
    }

    const messageType = button.dataset.officeMessage;
    if (!messageType) {
      return;
    }

    sendOfficeMessage(messageType, {});
    if (messageType === "office.chat.list_threads") {
      state.officeDrafts.threadId = "";
    }
  });
}

bindOfficeMessageContainer(dom.workspaceContent);
bindOfficeMessageContainer(dom.utilityContent);

dom.utilityContent.addEventListener("click", (event) => {
  const runtimeButton = event.target.closest("[data-runtime-message]");
  if (runtimeButton?.dataset.runtimeMessage) {
    hostPost(runtimeButton.dataset.runtimeMessage, {});
    return;
  }

  if (event.target.closest("[data-log-autoscroll]")) {
    state.autoScroll = !state.autoScroll;
    render();
    return;
  }

  if (event.target.closest("[data-log-open-external]")) {
    hostPost("runtime.logs.open_external", { sourceId: state.activeLogSourceId });
    return;
  }

  if (event.target.closest("[data-copy-log-selected]")) {
    const selectedText = window.getSelection?.().toString() || "";
    const text = selectedText.trim() || "No log text is currently selected.";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => hostPost("shell.copy_text", { text }));
    } else {
      hostPost("shell.copy_text", { text });
    }
    return;
  }

  const copyButton = event.target.closest("[data-copy-log-scope]");
  if (copyButton) {
    const text = copyButton.dataset.copyLogText || "";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => hostPost("shell.copy_text", { text }));
    } else {
      hostPost("shell.copy_text", { text });
    }
    return;
  }
});

dom.utilityContent.addEventListener("input", (event) => {
  const field = event.target.closest("[data-log-filter]");
  if (!field) {
    return;
  }

  state.logFilter = field.value || "";
  render();
});

dom.utilityContent.addEventListener("change", (event) => {
  const selector = event.target.closest("[data-log-source-select]");
  if (!selector) {
    return;
  }

  setActiveLogSource(selector.value || "transcript");
  setActiveUtilityTab("logs", { silent: true });
  render();
});

dom.workspaceContent.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-office-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  onOfficeFormSubmit(form.dataset.officeForm || "");
  render();
});

dom.workspaceContent.addEventListener("input", (event) => {
  const field = event.target.closest("[data-office-bind]");
  if (!field) {
    return;
  }

  const bindKey = field.dataset.officeBind;
  if (!bindKey || !Object.prototype.hasOwnProperty.call(state.officeDrafts, bindKey)) {
    return;
  }

  state.officeDrafts[bindKey] = field.value || "";
});

dom.workspaceContent.addEventListener("change", (event) => {
  const practiceAnswer = event.target.closest("[data-practice-answer-index]");
  if (practiceAnswer) {
    const answerIndex = practiceAnswer.dataset.practiceAnswerIndex;
    if (answerIndex) {
      state.officeDrafts[getPracticeDraftKey(answerIndex)] = practiceAnswer.value || "";
    }
  }

  const field = event.target.closest("[data-office-bind]");
  if (!field) {
    return;
  }

  const bindKey = field.dataset.officeBind;
  if (!bindKey || !Object.prototype.hasOwnProperty.call(state.officeDrafts, bindKey)) {
    return;
  }

  state.officeDrafts[bindKey] = field.value || "";
  if (bindKey === "threadId") {
    render();
  }
});

dom.workspaceSwitcher.addEventListener("click", (event) => {
  const button = event.target.closest("[data-workspace]");
  if (!button) {
    return;
  }
  setActiveWorkspace(button.dataset.workspace);
});

dom.utilityDockBtn?.addEventListener("click", () => {
  toggleUtilityPane();
});

dom.displayMenuButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  state.displayMenuOpen = !state.displayMenuOpen;
  renderHeaderPills();
});

dom.displayMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
});

dom.utilityTabRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-utility-tab]");
  if (!button) {
    return;
  }

  setActiveUtilityTab(button.dataset.utilityTab || "context");
});

dom.shellScaleControls?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scale-preset]");
  if (!button) {
    return;
  }

  state.displayMenuOpen = false;
  setContentScalePercent(button.dataset.scalePreset);
});

document.addEventListener("click", (event) => {
  if (!state.displayMenuOpen) {
    return;
  }

  const target = event.target;
  if (dom.displayMenu?.contains(target) || dom.displayMenuButton?.contains(target)) {
    return;
  }

  state.displayMenuOpen = false;
  renderHeaderPills();
});

dom.commandInput.addEventListener("input", (event) => {
  state.commandQuery = event.target.value || "";
  render();
});

dom.commandInput.addEventListener("focus", () => {
  state.commandFocused = true;
  render();
});

dom.commandInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    state.commandFocused = false;
    render();
  }, 120);
});

dom.utilityResizer.addEventListener("pointerdown", (event) => {
  if (window.matchMedia("(max-width: 1120px)").matches) {
    return;
  }

  const startX = event.clientX;
  const startWidth = state.utilityPaneWidth;
  dom.utilityResizer.setPointerCapture(event.pointerId);

  const onMove = (moveEvent) => {
    const delta = startX - moveEvent.clientX;
    const bounds = getUtilityPaneWidthBounds();
    state.utilityPaneWidth = Math.max(bounds.min, Math.min(bounds.max, startWidth + delta));
    applyUtilityPaneWidth();
  };

  const onUp = (upEvent) => {
    dom.utilityResizer.releasePointerCapture(upEvent.pointerId);
    dom.utilityResizer.removeEventListener("pointermove", onMove);
    dom.utilityResizer.removeEventListener("pointerup", onUp);
    dom.utilityResizer.removeEventListener("pointercancel", onUp);
    persistShellUiState();
    render();
  };

  dom.utilityResizer.addEventListener("pointermove", onMove);
  dom.utilityResizer.addEventListener("pointerup", onUp);
  dom.utilityResizer.addEventListener("pointercancel", onUp);
});

window.addEventListener("resize", () => {
  applyShellScaleVars();
  applyUtilityPaneWidth();
});

setInterval(tickClock, 1000);
tickClock();
applyShellScaleVars();
applyUtilityPaneWidth();
render();
