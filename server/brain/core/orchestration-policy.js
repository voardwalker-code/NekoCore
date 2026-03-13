function buildTurnPolicy(turnSignals = {}, tokenUsageSoFar = {}, config = {}) {
  const maxPromptTokens = Number.isFinite(config.maxPromptTokens) ? config.maxPromptTokens : 14000;
  const maxTotalTokens = Number.isFinite(config.maxTotalTokens) ? config.maxTotalTokens : 18000;
  const maxLatencyMs = Number.isFinite(config.maxLatencyMs) ? config.maxLatencyMs : 55000;

  return {
    maxPromptTokens,
    maxTotalTokens,
    maxLatencyMs,
    allowStrongFinalEval: config.allowStrongFinalEval !== false,
    highTensionThreshold: Number.isFinite(config.highTensionThreshold) ? config.highTensionThreshold : 0.7,
    strongEscalationHints: Array.isArray(config.strongEscalationHints)
      ? config.strongEscalationHints
      : ['high_stakes', 'safety', 'critical']
  };
}

function shouldEscalateO2(inputs = {}) {
  const turnSignals = inputs.turnSignals || {};
  const policy = inputs.policy || {};
  if (!policy.allowStrongFinalEval) return { escalate: false, reason: 'none' };

  const tension = Number(turnSignals.tension || 0);
  if (tension >= Number(policy.highTensionThreshold || 0.7)) {
    return { escalate: true, reason: 'high-tension' };
  }

  const events = Array.isArray(turnSignals.events) ? turnSignals.events : [];
  if (events.includes('error_report') && events.includes('constraint')) {
    return { escalate: true, reason: 'error-constraint-combo' };
  }

  const hints = Array.isArray(turnSignals.intentHints) ? turnSignals.intentHints : [];
  if (hints.includes('planning') && hints.includes('implementation')) {
    return { escalate: true, reason: 'planning-implementation-combo' };
  }

  if (inputs.userRequestedDepth === true) {
    return { escalate: true, reason: 'user-requested-depth' };
  }

  return { escalate: false, reason: 'none' };
}

function chooseO2Runtime(defaultRuntime, strongRuntime, decision) {
  if (decision && decision.escalate && strongRuntime) return strongRuntime;
  return defaultRuntime;
}

function enforceBudgetGuard(currentUsage = {}, budgetPolicy = {}) {
  const prompt = Number(currentUsage.prompt_tokens || 0);
  const total = Number(currentUsage.total_tokens || 0);

  if (prompt > Number(budgetPolicy.maxPromptTokens || 14000)) {
    return { ok: false, reason: 'prompt-token-budget-exceeded' };
  }
  if (total > Number(budgetPolicy.maxTotalTokens || 18000)) {
    return { ok: false, reason: 'total-token-budget-exceeded' };
  }
  return { ok: true, reason: null };
}

/**
 * Wrap an async call function with a timeout ceiling.
 * On timeout, rejects with { timedOut: true }.
 *
 * @param {Function} callFn  - Async function to invoke (no args)
 * @param {number}   maxMs   - Maximum allowed milliseconds
 * @returns {Promise<any>}
 */
async function enforceLatencyGuard(callFn, maxMs) {
  const ms = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 35000;
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject({ timedOut: true, maxMs: ms });
      }
    }, ms);

    Promise.resolve()
      .then(() => callFn())
      .then((result) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(result);
        }
      })
      .catch((err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

module.exports = {
  buildTurnPolicy,
  shouldEscalateO2,
  chooseO2Runtime,
  enforceBudgetGuard,
  enforceLatencyGuard
};
