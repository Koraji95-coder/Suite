(function attachBootstrapDisplayProgress(globalObject) {
  const STEP_ORDER = [
    "docker-ready",
    "supabase-start",
    "supabase-env",
    "watchdog-filesystem",
    "watchdog-autocad-startup",
    "watchdog-autocad-plugin",
    "backend",
    "frontend",
  ];

  const STEP_WEIGHTS = {
    "docker-ready": 15,
    "supabase-start": 25,
    "supabase-env": 5,
    "watchdog-filesystem": 10,
    "watchdog-autocad-startup": 10,
    "watchdog-autocad-plugin": 5,
    backend: 15,
    frontend: 15,
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeStepIds(stepIds) {
    const source = Array.isArray(stepIds) ? stepIds : [];
    const seen = new Set();
    const normalized = [];

    for (const stepId of STEP_ORDER) {
      if (source.includes(stepId) && !seen.has(stepId)) {
        seen.add(stepId);
        normalized.push(stepId);
      }
    }

    for (const stepId of source) {
      if (!stepId || seen.has(stepId)) {
        continue;
      }

      seen.add(stepId);
      normalized.push(stepId);
    }

    return normalized;
  }

  function getCompletedFloorPercent(stepIds) {
    return normalizeStepIds(stepIds).reduce((total, stepId) => total + (STEP_WEIGHTS[stepId] || 0), 0);
  }

  function areAllStepsComplete(stepIds) {
    const completed = new Set(normalizeStepIds(stepIds));
    return STEP_ORDER.every((stepId) => completed.has(stepId));
  }

  function getActiveStepId(bootstrap, completedStepIds, failedStepIds) {
    if (!bootstrap?.running || !bootstrap.currentStepId) {
      return null;
    }

    const currentStepId = String(bootstrap.currentStepId);
    if (!STEP_WEIGHTS[currentStepId]) {
      return null;
    }

    if (completedStepIds.includes(currentStepId) || failedStepIds.includes(currentStepId)) {
      return null;
    }

    return currentStepId;
  }

  function getRealPercent(bootstrap, completedStepIds) {
    const floorPercent = getCompletedFloorPercent(completedStepIds);
    const allComplete = areAllStepsComplete(completedStepIds);
    if (bootstrap?.done && bootstrap?.ok && allComplete) {
      return 100;
    }

    return clamp(Math.max(Number(bootstrap?.percent || 0), floorPercent), 0, 99);
  }

  function getCurrentStepCeilingPercent(activeStepId, floorPercent, realPercent) {
    if (!activeStepId || !STEP_WEIGHTS[activeStepId]) {
      return realPercent;
    }

    return clamp(floorPercent + STEP_WEIGHTS[activeStepId] - 1, floorPercent, 99);
  }

  function computeBootstrapDisplayProgress(previousState, bootstrap, nowMs = Date.now()) {
    const completedStepIds = normalizeStepIds(bootstrap?.completedStepIds);
    const failedStepIds = normalizeStepIds(bootstrap?.failedStepIds);
    const floorPercent = getCompletedFloorPercent(completedStepIds);
    const realPercent = getRealPercent(bootstrap, completedStepIds);
    const activeStepId = getActiveStepId(bootstrap, completedStepIds, failedStepIds);
    const ceilingPercent = getCurrentStepCeilingPercent(activeStepId, floorPercent, realPercent);
    const previousPercentExact = Number.isFinite(previousState?.percentExact)
      ? previousState.percentExact
      : realPercent;
    const previousFloorPercent = Number.isFinite(previousState?.floorPercent)
      ? previousState.floorPercent
      : floorPercent;
    const previousTimestampMs = Number.isFinite(previousState?.timestampMs)
      ? previousState.timestampMs
      : nowMs;
    const elapsedMs = clamp(nowMs - previousTimestampMs, 0, 4_000);
    const sameActiveStep = Boolean(activeStepId) && previousState?.currentStepId === activeStepId;
    const floorAdvanced = floorPercent > previousFloorPercent;

    let percentExact = Math.max(realPercent, previousPercentExact);

    if (bootstrap?.done && bootstrap?.ok && areAllStepsComplete(completedStepIds)) {
      percentExact = 100;
    } else if (activeStepId) {
      if (!sameActiveStep || floorAdvanced) {
        percentExact = Math.max(realPercent, Math.min(ceilingPercent, floorPercent + 0.35));
      }

      if (percentExact < ceilingPercent) {
        const smoothingFactor = Math.min(0.22, elapsedMs / 1_800);
        const minimumDrift = elapsedMs > 0 ? 0.1 * (elapsedMs / 150) : 0;
        const increment = Math.max((ceilingPercent - percentExact) * smoothingFactor, minimumDrift);
        percentExact = Math.min(ceilingPercent, percentExact + increment);
      }

      percentExact = clamp(percentExact, floorPercent, ceilingPercent);
    } else {
      percentExact = clamp(Math.max(realPercent, previousPercentExact), floorPercent, 99);
    }

    percentExact = Math.max(realPercent, percentExact);
    const percent = clamp(Math.floor(percentExact), 0, 100);
    const pulse = Boolean(activeStepId && bootstrap?.running && percent >= ceilingPercent);

    return {
      percent,
      percentExact,
      floorPercent,
      ceilingPercent,
      pulse,
      currentStepId: activeStepId,
      timestampMs: nowMs,
    };
  }

  globalObject.SuiteRuntimeControlBootstrapDisplayProgress = {
    STEP_ORDER,
    STEP_WEIGHTS,
    getCompletedFloorPercent,
    areAllStepsComplete,
    computeBootstrapDisplayProgress,
  };
})(globalThis);
