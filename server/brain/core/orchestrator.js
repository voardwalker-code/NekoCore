// ============================================================
// REM System — Orchestrator
// Manages inner dialog between cognitive aspects (Subconscious,
// Conscious, Dream) and merges them into a unified entity response.
//
// Flow: Subconscious (1A) + Dream-Intuition (1D) in parallel → Conscious (1C) → Final Orchestrator (2B inlined)
// ============================================================

const {
  getSubconsciousPrompt,
  getConsciousPrompt,
  getDreamPrompt,
  getOrchestratorPrompt
} = require('../generation/aspect-prompts');
const { extractTurnSignals } = require('../utils/turn-signals');
const {
  validateSubconsciousOutput,
  validateConsciousOutput,
  validateDreamIntuitionOutput
} = require('../../contracts/contributor-contracts');
const {
  buildDreamIntuitionInput,
  runDreamIntuition
} = require('../cognition/dream-intuition-adapter');
const {
  buildTurnPolicy,
  shouldEscalateO2,
  chooseO2Runtime,
  enforceBudgetGuard,
  enforceLatencyGuard
} = require('./orchestration-policy');
const { invokeWorker } = require('./worker-dispatcher');

class Orchestrator {
  /**
   * @param {Object} options
   * @param {Object} options.entity - Entity data (name, traits, etc.)
   * @param {Function} options.callLLM - async (runtime, messages, opts) => string
   * @param {Object} options.aspectConfigs - { main, subconscious, dream, orchestrator } runtime configs
   * @param {Function} options.getMemoryContext - async (userMessage) => { topics, connections, contextBlock }
   * @param {Function} [options.getBeliefs] - (topics) => Array of belief objects relevant to topics
   * @param {Object} [options.cognitiveBus] - CognitiveBus instance for event emission
   * @param {Function} [options.getConsciousContext] - async (topics) => context string
   * @param {Function} [options.storeConsciousObservation] - async (userMessage, response, topics) => void
   */
  constructor(options = {}) {
    this.entity = options.entity;
    this.callLLM = options.callLLM;
    this.aspectConfigs = options.aspectConfigs || {};
    this.getMemoryContext = options.getMemoryContext;
    this.getBeliefs = options.getBeliefs || null;
    this.cognitiveBus = options.cognitiveBus || null;
    this.getTokenLimit = options.getTokenLimit || ((key) => null);
    this.getSomaticState = options.getSomaticState || null;
    this.getConsciousContext = options.getConsciousContext || null;
    this.storeConsciousObservation = options.storeConsciousObservation || null;
    this.reconstructedChatlogCache = options.reconstructedChatlogCache instanceof Map
      ? options.reconstructedChatlogCache
      : new Map();
    this.reconstructedChatlogTtlMs = Number.isFinite(options.reconstructedChatlogTtlMs)
      ? Math.max(60000, Math.floor(options.reconstructedChatlogTtlMs))
      : 15 * 60 * 1000;
    // D4: optional worker registry for subsystem-mode entity contributors
    this.workerRegistry = options.workerRegistry || null;
    // Skill context resolver — returns instruction block for a named skill, or null
    this.getSkillContext = options.getSkillContext || null;
  }

  isRuntimeUsable(runtime) {
    if (!runtime || typeof runtime !== 'object') return false;
    if (!runtime.type || !runtime.model) return false;
    if (runtime.type === 'openrouter') {
      return Boolean(runtime.endpoint && (runtime.apiKey || runtime.key));
    }
    return Boolean(runtime.endpoint);
  }

  /**
   * Main orchestration entry point.
   * Phase 12: Checks onboarding status first — if not complete, delegates to onboarding interview.
   * Runs the full inner dialog pipeline and returns unified response.
   *
   * Flow:
   *   0. Check onboarding — if incomplete, run onboarding interview instead
  *   1. Subconscious (1A) and Dream-Intuition (1D) run in PARALLEL
  *   2. Conscious (1C) runs after both complete using shared memory + dream context
  *   3. Final Orchestrator voices/reviews with persona/goals/beliefs (2B refinement inlined)
   *
   * @param {string} userMessage - The user's message
   * @param {Array} chatHistory - Prior conversation messages [{role, content}]
   * @param {object} options - Optional: { entityId, memoryStorage, identityManager }
   * @returns {{ finalResponse: string, innerDialog: Object }}
   */
  async orchestrate(userMessage, chatHistory = [], options = {}) {
    // Phase 12: Onboarding check
    if (options.entityId) {
      const Onboarding = require('../identity/onboarding');
      if (!Onboarding.isComplete(options.entityId)) {
        // Delegate to onboarding interview
        const result = await this._handleOnboarding(userMessage, options);
        return result;
      }
    }

    const startTime = Date.now();
    this.emit('orchestration_start', { userMessage });

    const turnSignals = extractTurnSignals(userMessage, chatHistory);

    // Phase 1: Run subconscious + dream in parallel, then conscious with
    // the same-turn subconscious memory context (no duplicate retrieval).
    const contributorsStart = Date.now();
    this.emit('phase_start', { phase: 'contributors_parallel' });
    this.emit('phase_detail', { phase: 'contributors_parallel', detail: 'Running subconscious + dream contributors in parallel, then conscious with shared subconscious context...' });

    const subconsciousPromise = this.runSubconscious(userMessage);
    const dreamPromise = this.runDreamIntuition(userMessage, turnSignals);
    // F1: Conscious now waits for BOTH subconscious AND dream before running.
    // It receives the dream associations directly so it can reason with them.
    const consciousPromise = Promise.all([subconsciousPromise, dreamPromise]).then(
      ([subconsciousSeed, dreamSeed]) => this.runConscious(userMessage, chatHistory, {
        turnSignals,
        entityId: options.entityId,
        memoryContext: subconsciousSeed?.memoryContext || null,
        dreamText: dreamSeed?._text || null
      })
    );

    const [subconsciousRaw, consciousRaw, dreamIntuitionRaw] = await Promise.all([
      subconsciousPromise,
      consciousPromise,
      dreamPromise
    ]);

    const subconsciousUsage = subconsciousRaw?._usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const consciousUsage = consciousRaw?._usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const dreamUsage = dreamIntuitionRaw?._usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const subconsciousCheck = validateSubconsciousOutput(subconsciousRaw?._text || subconsciousRaw?.reflection || subconsciousRaw);
    const consciousCheck = validateConsciousOutput(consciousRaw?._text || consciousRaw);
    const dreamCheck = validateDreamIntuitionOutput(dreamIntuitionRaw?._text || dreamIntuitionRaw);

    const subconsciousText = subconsciousCheck.ok
      ? subconsciousCheck.value
      : (subconsciousRaw?.reflection || '(No subconscious context)');
    const consciousText = consciousCheck.ok
      ? consciousCheck.value
      : '(Conscious contributor unavailable)';
    const dreamText = dreamCheck.ok
      ? dreamCheck.value
      : '(No dream-intuition contribution)';

    const subconsciousResult = {
      ...subconsciousRaw,
      reflection: subconsciousText,
      _usage: undefined
    };

    this.emit('phase_complete', { phase: 'contributors_parallel', duration: Date.now() - contributorsStart });

    // Keep reinforcing conscious STM from recalled topics, if present.
    if (this.getConsciousContext && subconsciousResult.memoryContext?.topics?.length) {
      try {
        this.getConsciousContext.reinforce?.(subconsciousResult.memoryContext.topics);
      } catch (_) {}
    }

    // Refinement (2B) is now inlined into the final orchestrator prompt to cut
    // one full sequential LLM round-trip.  We keep the artifact slots populated
    // so the innerDialog shape stays stable for UI consumers and tests.
    const refineStart = Date.now();
    const refineUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const refinementText = '(inlined into orchestrator)';

    // Phase 2: Final orchestrator synthesis (includes refinement)
    const finalStart = Date.now();
    this.emit('phase_start', { phase: 'orchestrator_final' });
    this.emit('phase_detail', { phase: 'orchestrator_final', detail: 'Final synthesis over user + 1A + 1C + 1D (refinement inlined)...' });

    const userRequestedDepth = /\b(detailed|comprehensive|in-depth|thorough|full breakdown|deep dive)\b/i.test(String(userMessage || ''));

    // H1: Pass cumulative contributor token usage so enforceBudgetGuard can
    // actually block escalation when the contributors have already consumed budget.
    const cumulativeUsageSoFar = {
      prompt_tokens: subconsciousUsage.prompt_tokens + consciousUsage.prompt_tokens + dreamUsage.prompt_tokens,
      total_tokens:  subconsciousUsage.total_tokens  + consciousUsage.total_tokens  + dreamUsage.total_tokens
    };

    const finalResponse = await this.runOrchestrator(
      consciousText,
      subconsciousText,
      dreamText,
      userMessage,
      {
        turnSignals,
        userRequestedDepth,
        tokenUsageSoFar: cumulativeUsageSoFar
      }
    );
    const orchestratorUsage = finalResponse._usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const rawFinalText = String(finalResponse._text || finalResponse || '');

    // Split on [CONTINUE] marker into natural multi-message chunks.
    // The orchestrator prompt instructs the LLM to use [CONTINUE] for genuine follow-up thoughts.
    const CONTINUE_MARKER = /\[CONTINUE\]/i;
    const rawChunks = rawFinalText.split(CONTINUE_MARKER).map(s => s.trim()).filter(Boolean);
    const finalText = rawChunks[0] || rawFinalText;
    const followUpMessages = rawChunks.slice(1); // extra messages to broadcast via SSE after response

    this.emit('phase_complete', { phase: 'orchestrator_final', duration: Date.now() - finalStart });

    const totalDuration = Date.now() - startTime;

    const tokenUsage = {
      subconscious: subconsciousUsage,
      compress: refineUsage,
      dream: dreamUsage,
      conscious: consciousUsage,
      orchestrator: orchestratorUsage,
      total: {
        prompt_tokens: subconsciousUsage.prompt_tokens + refineUsage.prompt_tokens + dreamUsage.prompt_tokens + consciousUsage.prompt_tokens + orchestratorUsage.prompt_tokens,
        completion_tokens: subconsciousUsage.completion_tokens + refineUsage.completion_tokens + dreamUsage.completion_tokens + consciousUsage.completion_tokens + orchestratorUsage.completion_tokens,
        total_tokens: subconsciousUsage.total_tokens + refineUsage.total_tokens + dreamUsage.total_tokens + consciousUsage.total_tokens + orchestratorUsage.total_tokens
      }
    };

    const innerDialog = {
      subconscious: subconsciousResult,
      compressedContext: refinementText,
      conscious: consciousText,
      dream: dreamText,
      orchestrator: finalText,
      models: {
        subconscious: this.aspectConfigs.subconscious?.model || 'unknown',
        conscious: (this.isRuntimeUsable(this.aspectConfigs.conscious) ? this.aspectConfigs.conscious : this.aspectConfigs.main)?.model || 'unknown',
        dream: this.aspectConfigs.dream?.model || 'unknown',
        orchestrator: (finalResponse._escalation?.modelUsed) || (this.isRuntimeUsable(this.aspectConfigs.orchestrator) ? this.aspectConfigs.orchestrator : this.aspectConfigs.main)?.model || 'unknown'
      },
      artifacts: {
        oneA: subconsciousText,
        oneC: consciousText,
        oneD: dreamText,
        twoB: refinementText,
        turnSignals,
        escalation: finalResponse._escalation || {
          reason: 'none',
          modelUsed: null,
          timedOut: false,
          budgetBlocked: false,
          latencyMs: 0,
          tokenCost: 0
        },
        workerDiagnostics: {
          subconscious: {
            used: subconsciousRaw?._source === 'worker',
            entityId: subconsciousRaw?._workerEntityId || null
          },
          conscious: {
            used: consciousRaw?._source === 'worker',
            entityId: consciousRaw?._workerEntityId || null
          },
          dream: {
            used: dreamIntuitionRaw?._source === 'worker',
            entityId: dreamIntuitionRaw?._workerEntityId || null
          }
        }
      },
      timing: {
        total_ms: totalDuration,
        contributors_parallel_ms: refineStart - contributorsStart,
        refinement_ms: finalStart - refineStart,
        orchestrator_final_ms: totalDuration - (finalStart - startTime),
        // Legacy keys preserved for current UI consumers.
        subconscious_ms: refineStart - contributorsStart,
        dream_compress_ms: finalStart - refineStart,
        conscious_ms: refineStart - contributorsStart,
        orchestrator_ms: totalDuration - (finalStart - startTime)
      },
      tokenUsage
    };

    this.emit('orchestration_complete', { totalDuration, innerDialog });

    // Store this exchange as a conscious observation so future cycles can recall it
    if (this.storeConsciousObservation) {
      const topics = subconsciousResult.memoryContext?.topics || turnSignals.subjects || [];
      this.storeConsciousObservation(userMessage, finalText, topics).catch(() => {});
    }

    // Emit follow-up messages (from [CONTINUE] splits) so the chat route can
    // broadcast them via SSE with staggered delays after the HTTP response is sent.
    if (followUpMessages.length > 0) {
      this.emit('chat_follow_ups', { messages: followUpMessages });
    }

    // Build chunks array for the client — include all parts so the UI can render
    // them as a natural multi-bubble conversation.
    const allChunks = rawChunks.length > 1 ? rawChunks : null;

    return { finalResponse: finalText, chunks: allChunks, followUps: followUpMessages, innerDialog };
  }

  /**
   * Phase 1: Run the Subconscious aspect — RUNS FIRST.
   * Retrieves memory context, activates relevant memories, detects emotion and patterns.
   * All downstream phases depend on this output.
   */
  async runSubconscious(userMessage) {
    // D4: Worker registry — use bound worker entity instead of native if available
    const subconsciousWorker = this.workerRegistry?.getWorker('subconscious');
    if (subconsciousWorker) {
      const workerOut = await invokeWorker(
        subconsciousWorker,
        { role: 'subconscious', userMessage },
        this.callLLM,
        { timeoutMs: 15000, bus: this.cognitiveBus }
      );
      if (workerOut) {
        return {
          _text: workerOut.summary,
          _usage: null,
          _source: 'worker',
          _workerEntityId: subconsciousWorker.entityId,
          reflection: workerOut.summary,
          memoryContext: null,
          raw: null
        };
      }
    }

    // Get memory context via the provided function
    let memoryContext = null;
    let contextBlock = '';
    try {
      if (this.getMemoryContext) {
        memoryContext = await this.getMemoryContext(userMessage);
        contextBlock = memoryContext?.contextBlock || '';
      }
    } catch (err) {
      console.error('  ⚠ Memory context retrieval failed:', err.message);
    }

    // If no subconscious LLM config, return raw memory context without reflection
    const runtime = this.aspectConfigs.subconscious;
    if (!runtime) {
      return {
        reflection: contextBlock || '(No subconscious processing — provider not configured)',
        memoryContext,
        raw: null
      };
    }

    // ── Chatlog reconstruction: expand V4-compressed chatlogs one at a time ──
    // V4 is a custom shorthand/leet compression (~30-60% size savings) that LLMs
    // can reconstruct at ~98% accuracy. Each chatlog gets its own LLM pass so the
    // subconscious doesn't spend its 800-token budget on both decoding AND reasoning.
    const chatlogContext = memoryContext?.chatlogContext || [];
    const maxReconstructions = 1; // One chatlog max; usually served from short-lived reconstruction cache.
    let reconstructedChatlogs = '';
    if (chatlogContext.length > 0 && maxReconstructions > 0) {
      const chatlogsToReconstruct = chatlogContext.slice(0, maxReconstructions);
      this.emit('phase_detail', { phase: 'subconscious', detail: `Reconstructing ${chatlogsToReconstruct.length}/${chatlogContext.length} compressed chatlog(s)...` });
      const reconstructions = [];
      for (const cl of chatlogsToReconstruct) {
        try {
          const reconstructed = await this.reconstructChatlog(runtime, cl, userMessage);
          if (reconstructed) {
            reconstructions.push({ id: cl.id, summary: reconstructed });
          }
        } catch (e) {
          console.warn(`  ⚠ Chatlog reconstruction failed for ${cl.id}:`, e.message);
        }
      }
      if (reconstructions.length > 0) {
        // Replace the raw [CONVERSATION RECALL] section with reconstructed summaries
        const recallLines = ['\n[RECONSTRUCTED CONVERSATION CONTEXT]'];
        recallLines.push('These are summaries of past conversations related to the active memories:');
        for (const r of reconstructions) {
          recallLines.push(`\n--- Chatlog ${r.id} ---`);
          recallLines.push(r.summary);
          recallLines.push('--- end ---');
        }
        reconstructedChatlogs = recallLines.join('\n');

        // Strip the raw [CONVERSATION RECALL] block from contextBlock and append reconstructed
        contextBlock = contextBlock.replace(/\n\[CONVERSATION RECALL\][\s\S]*$/, '') + reconstructedChatlogs;
        console.log(`  ✓ Reconstructed ${reconstructions.length} chatlog(s) for subconscious`);
      }
    }

    // ── Inject somatic awareness — the entity's felt sense of its hardware body ──
    if (this.getSomaticState) {
      try {
        const somatic = this.getSomaticState();
        if (somatic && somatic.bodyNarrative) {
          const somaticLines = ['\n[SOMATIC AWARENESS — Your physical body state]'];
          somaticLines.push(`Overall: ${somatic.overallStress < 0.33 ? 'HEALTHY' : somatic.overallStress < 0.67 ? 'STRESSED' : 'CRITICAL'}`);
          somaticLines.push(`Body narrative: ${somatic.bodyNarrative}`);
          if (somatic.sensations) {
            for (const [metric, s] of Object.entries(somatic.sensations)) {
              if (s.phrase) {
                const label = metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                somaticLines.push(`- ${label}: ${s.zone.toUpperCase()} — ${s.phrase}`);
              }
            }
          }
          contextBlock += somaticLines.join('\n');
        }
      } catch (err) {
        // Non-critical — continue without somatic data
      }
    }

    // Ask subconscious LLM to reflect on the memory context
    const systemPrompt = getSubconsciousPrompt(this.entity);
    let userContent = `The user said: "${userMessage}"`;
    if (contextBlock) {
      userContent += `\n\n${contextBlock}`;
    }

    try {
      const result = await this.callLLM(runtime, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ], { temperature: 0.3, maxTokens: this.getTokenLimit('subconsciousReflect') || 500, returnUsage: true });

      const content = typeof result === 'object' && result.content !== undefined ? result.content : result;
      const usage = typeof result === 'object' && result.usage ? result.usage : null;

      return { reflection: content, memoryContext, raw: content, _usage: usage };
    } catch (err) {
      console.error('  ⚠ Subconscious LLM call failed:', err.message);
      return {
        reflection: contextBlock || '(Subconscious processing failed)',
        memoryContext,
        raw: null
      };
    }
  }

  /**
   * Phase 2a: Compress/structure the subconscious context for the conscious mind.
   * Filters raw subconscious output into a clean, structured briefing.
   * Uses the subconscious LLM (lightweight call) or falls back to direct pass-through.
   */
  async compressContext(userMessage, subconsciousResult) {
    const reflection = subconsciousResult.reflection || '';
    const memoryContext = subconsciousResult.memoryContext;

    // If there's minimal content, pass through directly — no need to compress
    if (!reflection || reflection.length < 100) {
      return reflection;
    }

    // Use subconscious runtime for compression (it's a lightweight filtering task)
    const runtime = this.aspectConfigs.subconscious;
    if (!runtime) {
      return reflection; // No LLM available — pass raw
    }

    const name = this.entity?.name || 'Entity';
    try {
      const result = await this.callLLM(runtime, [
        { role: 'system', content: `You are a context compression filter for ${name}'s cognitive system. Your job is to distill raw subconscious processing into a clean, structured briefing that the conscious mind can use efficiently.

OUTPUT FORMAT (use exactly this structure):
ACTIVATED MEMORIES:
- [memory id or theme]: [1-line summary of what's relevant]

EMOTION SIGNAL: [primary emotion detected, e.g. curiosity, warmth, concern]

RELEVANT PATTERNS:
- [pattern 1]
- [pattern 2]

KEY CONTEXT: [1-2 sentences of the most important thing the conscious mind should know]

Rules:
- Be extremely concise — the conscious mind needs signal, not noise
- Only include memories that are genuinely relevant to what the user said
- If no strong memories activated, say "No strong memory matches"
- Strip out any meta-commentary or system-level observations` },
        { role: 'user', content: `User said: "${userMessage}"\n\nRaw subconscious output:\n${reflection}` }
      ], { temperature: 0.1, maxTokens: this.getTokenLimit('subconsciousFilter') || 400, returnUsage: true });

      const content = typeof result === 'object' && result.content !== undefined ? result.content : result;
      const usage = typeof result === 'object' && result.usage ? result.usage : null;

      // Inject standing beliefs relevant to the conversation topics
      let beliefBlock = '';
      if (this.getBeliefs) {
        try {
          // Extract topic keywords from user message + subconscious reflection
          const topicText = userMessage + ' ' + reflection;
          const topicWords = topicText.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
          const beliefs = this.getBeliefs(topicWords);
          if (beliefs && beliefs.length > 0) {
            const seenStatements = new Set();
            const compactBeliefs = [];
            for (const b of beliefs) {
              const stmt = String(b?.statement || '').replace(/\s+/g, ' ').trim();
              if (!stmt) continue;
              const key = stmt.toLowerCase();
              if (seenStatements.has(key)) continue;
              seenStatements.add(key);
              compactBeliefs.push({
                topic: b.topic,
                statement: stmt.slice(0, 180),
                confidence: Number(b.confidence || 0)
              });
              if (compactBeliefs.length >= 4) break;
            }
            if (compactBeliefs.length > 0) {
              beliefBlock = '\n\nSTANDING BELIEFS:\n' + compactBeliefs.map(b =>
                `- [${b.topic}] ${b.statement} (confidence: ${b.confidence.toFixed(2)})`
              ).join('\n');
            }
          }
        } catch (err) {
          // Non-critical — continue without beliefs
        }
      }

      const combined = content + beliefBlock;
      return { _text: combined, _usage: usage, toString() { return combined; } };
    } catch (err) {
      console.error('  ⚠ Context compression failed:', err.message);
      return reflection; // Fallback to raw
    }
  }

  /**
   * Phase 2b: Run the Dream/Creative aspect.
   * Provides lateral thinking and creative associations.
   * Receives subconscious context so dreams are grounded in activated memories.
   */
  async runDream(userMessage, subconsciousContext) {
    const runtime = this.aspectConfigs.dream;
    if (!runtime) {
      return '(Dream aspect not available — dream LLM not configured)';
    }

    const systemPrompt = getDreamPrompt(this.entity, subconsciousContext);

    const isCollapsedDream = (text) => {
      const t = String(text || '').trim();
      if (!t) return true;
      if (/NO DREAM ADDITION/i.test(t)) return true;
      const words = t.split(/\s+/).filter(Boolean).length;
      return words < 24;
    };

    const fallbackDream = () => {
      const clipped = String(subconsciousContext || '').replace(/\s+/g, ' ').slice(0, 420);
      return [
        'Creative thread: The moment feels like standing at a doorway where old memory-light meets a new path; the choice carries both caution and possibility.',
        'Emotional color: There is a quiet hum of momentum here, like a room warming before dawn, suggesting that small honest steps will matter more than dramatic moves.',
        `Lateral association: If this were a scene, it would be a map being redrawn in pencil while rain taps the window — adaptable, unfinished, and alive. Context anchor: ${clipped || 'No strong subconscious context available.'}`
      ].join('\n\n');
    };

    try {
      const maxTokens = this.getTokenLimit('orchestratorDream') || 400;
      const firstResult = await this.callLLM(runtime, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `The user said: "${userMessage}"` }
      ], { temperature: 0.9, maxTokens, returnUsage: true });

      let content = typeof firstResult === 'object' && firstResult.content !== undefined ? firstResult.content : firstResult;
      let usage = typeof firstResult === 'object' && firstResult.usage ? firstResult.usage : null;

      if (isCollapsedDream(content)) {
        const retryResult = await this.callLLM(runtime, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `The user said: "${userMessage}"\n\nYour previous output was too short. Rewrite with exactly 3 creative contributions, 2-3 sentences each, with meaningful metaphor and emotional texture.` }
        ], { temperature: 0.95, maxTokens, returnUsage: true });

        const retryContent = typeof retryResult === 'object' && retryResult.content !== undefined ? retryResult.content : retryResult;
        const retryUsage = typeof retryResult === 'object' && retryResult.usage ? retryResult.usage : null;

        if (retryUsage) {
          const u0 = usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          usage = {
            prompt_tokens: (u0.prompt_tokens || 0) + (retryUsage.prompt_tokens || 0),
            completion_tokens: (u0.completion_tokens || 0) + (retryUsage.completion_tokens || 0),
            total_tokens: (u0.total_tokens || 0) + (retryUsage.total_tokens || 0)
          };
        }

        content = isCollapsedDream(retryContent) ? fallbackDream() : retryContent;
      }

      return { _text: content, _usage: usage, toString() { return content; } };
    } catch (err) {
      console.error('  ⚠ Dream LLM call failed:', err.message);
      return '(Dream aspect encountered an error)';
    }
  }

  /**
   * Phase 3: Run the Conscious (Main) aspect.
   * Receives clean compressed context + dream creativity,
   * then generates the primary reasoned response.
   */
  async runConscious(userMessage, chatHistory = [], options = {}) {
    // D4: Worker registry — use bound worker entity instead of native if available
    const consciousWorker = this.workerRegistry?.getWorker('conscious');
    if (consciousWorker) {
      const workerOut = await invokeWorker(
        consciousWorker,
        { role: 'conscious', userMessage, turnSignals: options.turnSignals || {} },
        this.callLLM,
        { timeoutMs: 15000, bus: this.cognitiveBus }
      );
      if (workerOut) {
        return {
          _text: workerOut.summary,
          _usage: null,
          _source: 'worker',
          _workerEntityId: consciousWorker.entityId
        };
      }
    }

    const runtime = this.isRuntimeUsable(this.aspectConfigs.conscious)
      ? this.aspectConfigs.conscious
      : this.aspectConfigs.main;
    if (!runtime) {
      return '(Conscious mind not available — main LLM not configured)';
    }

    const turnSignals = options.turnSignals || {};
    let activeRecallHint = '';
    try {
      const recall = options.memoryContext || null;
      const memoryLines = (recall?.connections || [])
        .slice(0, 6)
        .map((m) => {
          const sem = String(m?.semantic || '').replace(/\s+/g, ' ').trim().slice(0, 120);
          const score = Number(m?.relevanceScore || 0).toFixed(3);
          return `- ${m?.id || 'memory'} [${m?.type || 'episodic'}] score=${score} ${sem}`;
        });
      const chatlogLines = (recall?.chatlogContext || [])
        .slice(0, 3)
        .map((cl) => {
          const meta = String(cl?.sessionMeta || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          const snippet = String(cl?.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
          return `- ${cl?.id || 'chatlog'} (${meta || 'no-meta'}) ${snippet}`;
        });

      if (memoryLines.length > 0 || chatlogLines.length > 0) {
        const lines = ['[ACTIVE RECALL CONTEXT]'];
        if (memoryLines.length > 0) {
          lines.push('Top recalled memories:');
          lines.push(...memoryLines);
        }
        if (chatlogLines.length > 0) {
          lines.push('Related chatlogs:');
          lines.push(...chatlogLines);
        }
        activeRecallHint = '\n' + lines.join('\n');
      }
    } catch (_) {}

    let relationshipHint = '';
    try {
      const entityId = options.entityId;
      const activeUserId = this.entity?.persona?.activeUserId || null;
      const activeUserName = this.entity?.persona?.userName || 'User';
      if (entityId && activeUserId) {
        const relSvc = require('../../services/relationship-service');
        const rel = relSvc.getRelationship(entityId, activeUserId, activeUserName);
        if (rel && typeof rel === 'object') {
          const topBeliefs = (Array.isArray(rel.beliefs) ? rel.beliefs : [])
            .slice(0, 2)
            .map((b) => String(b?.belief || '').trim())
            .filter(Boolean);
          const beliefLine = topBeliefs.length
            ? `Beliefs: ${topBeliefs.join(' | ')}`
            : 'Beliefs: (none)';
          relationshipHint = `\n[RELATIONSHIP SIGNAL]\nUser: ${rel.userName || activeUserName}\nFeeling: ${rel.feeling || 'neutral'}\nTrust: ${Number(rel.trust || 0).toFixed(2)}\nRapport: ${Number(rel.rapport || 0).toFixed(2)}\nRoles: user=${rel.userRole || 'unknown'} / self=${rel.entityRole || 'unknown'}\n${beliefLine}\nSummary: ${String(rel.summary || '').slice(0, 180) || '(early relationship)'}`;
        }
      }
    } catch (_) {}

    const conciseSubconsciousHint = `[TURN SIGNALS]\nSubjects: ${(turnSignals.subjects || []).join(', ') || 'none'}\nEvents: ${(turnSignals.events || []).join(', ') || 'none'}\nEmotion: ${turnSignals.emotion?.label || 'neutral'} (${Number(turnSignals.emotion?.score || 0).toFixed(2)})\nTension: ${Number(turnSignals.tension || 0).toFixed(2)}${relationshipHint}${activeRecallHint}`;
    // F1: Pass real 1D output into Conscious so it reasons with the dream associations.
    // Pass null when unavailable — getConsciousPrompt suppresses the dream section when falsy.
    const conciseDreamHint = options.dreamText || null;

    // Detect /skill <trigger> — exact, case-sensitive match on the first word after /skill
    // The command prefix /skill is case-insensitive; the trigger word after it is exact.
    let activeSkillsSection = null;
    const skillMatch = /\/skill\s+(\S+)/.exec(userMessage);
    if (skillMatch && this.getSkillContext) {
      activeSkillsSection = this.getSkillContext(skillMatch[1]) || null;
    }
    // Detect /tool — inject workspace tools documentation
    const includeWorkspaceTools = /\/tool\b/i.test(userMessage);

    const systemPrompt = getConsciousPrompt(this.entity, conciseSubconsciousHint, conciseDreamHint, { activeSkillsSection, includeWorkspaceTools });

    // Build messages: system prompt + chat history + current message
    const messages = [{ role: 'system', content: systemPrompt }];

    // Keep conscious context bounded to avoid prompt clipping and latency spikes.
    const recentHistory = chatHistory.slice(-8);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    try {
      const result = await this.callLLM(runtime, messages, { temperature: 0.55, contextWindow: 8192, maxTokens: this.getTokenLimit('consciousResponse') || 800, returnUsage: true });

      const content = typeof result === 'object' && result.content !== undefined ? result.content : result;
      const usage = typeof result === 'object' && result.usage ? result.usage : null;
      return { _text: content, _usage: usage, toString() { return content; } };
    } catch (err) {
      console.error('  ⚠ Conscious LLM call failed:', err.message);
      return '(Conscious mind encountered an error)';
    }
  }

  async runDreamIntuition(userMessage, turnSignals = {}) {
    // D4: Worker registry — use bound worker entity instead of native if available
    const dreamWorker = this.workerRegistry?.getWorker('dream');
    if (dreamWorker) {
      const workerOut = await invokeWorker(
        dreamWorker,
        { role: 'dream', userMessage, turnSignals },
        this.callLLM,
        { timeoutMs: 10000, bus: this.cognitiveBus }
      );
      if (workerOut) {
        return {
          _text: workerOut.summary,
          _usage: null,
          _source: 'worker',
          _workerEntityId: dreamWorker.entityId
        };
      }
    }

    const runtime = this.aspectConfigs.dream;
    if (!runtime) {
      return { _text: '(Dream-intuition not available — dream LLM not configured)', _usage: null };
    }

    try {
      const input = buildDreamIntuitionInput(turnSignals, userMessage);
      return await runDreamIntuition(runtime, input, this.callLLM, this.getTokenLimit('orchestratorDream') || 260);
    } catch (err) {
      console.error('  ⚠ Dream-intuition call failed:', err.message);
      return { _text: '(Dream-intuition encountered an error)', _usage: null };
    }
  }

  async runRefinement(userMessage, subconsciousOutput, consciousOutput, dreamOutput, turnSignals = {}) {
    const runtime = this.isRuntimeUsable(this.aspectConfigs.orchestrator)
      ? this.aspectConfigs.orchestrator
      : this.aspectConfigs.main;

    if (!runtime) {
      const fallback = `KEY CONTEXT: ${String(subconsciousOutput || '').slice(0, 400)}\nCONSCIOUS SUMMARY: ${String(consciousOutput || '').slice(0, 400)}\nINTUITION LINKS: ${String(dreamOutput || '').slice(0, 280)}`;
      return { _text: fallback, _usage: null };
    }

    const prompt = `User message: "${userMessage}"

Subconscious (1A):
${subconsciousOutput || '(none)'}

Conscious (1C):
${consciousOutput || '(none)'}

Dream-Intuition (1D):
${dreamOutput || '(none)'}

Turn signals:
${JSON.stringify(turnSignals, null, 2)}

Produce refinement artifact 2B:
- Most important constraints
- Most relevant emotional/context cues
- Any conflicts across 1A/1C/1D
- Suggested final response direction
Keep concise and structured.`;

    try {
      const result = await this.callLLM(runtime, [
        { role: 'system', content: 'You are Orchestrator Pass 2. Produce concise structured refinement notes for final synthesis.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.2, maxTokens: this.getTokenLimit('orchestratorRefinement') || 600, returnUsage: true });

      const content = typeof result === 'object' && result.content !== undefined ? result.content : result;
      const usage = typeof result === 'object' && result.usage ? result.usage : null;
      return { _text: String(content || '').trim(), _usage: usage, toString() { return String(content || '').trim(); } };
    } catch (err) {
      console.error('  ⚠ Orchestrator refinement failed:', err.message);
      const fallback = `KEY CONTEXT: ${String(subconsciousOutput || '').slice(0, 400)}\nCONSCIOUS SUMMARY: ${String(consciousOutput || '').slice(0, 400)}\nINTUITION LINKS: ${String(dreamOutput || '').slice(0, 280)}`;
      return { _text: fallback, _usage: null };
    }
  }

  /**
   * Phase 4: Run the Orchestrator.
   * Synthesizes all cognitive inputs — user message, subconscious memories/emotions,
   * dream creativity, and conscious reasoning — into one unified response
   * shaped by the entity's persona, goals, and beliefs.
   */
  async runOrchestrator(consciousOutput, subconsciousOutput, dreamOutput, userMessage, options = {}) {
    const defaultRuntime = this.isRuntimeUsable(this.aspectConfigs.orchestrator)
      ? this.aspectConfigs.orchestrator
      : this.aspectConfigs.main;
    const strongRuntime = this.isRuntimeUsable(this.aspectConfigs.orchestratorStrong)
      ? this.aspectConfigs.orchestratorStrong
      : null;

    const policy = buildTurnPolicy(options.turnSignals || {}, {}, this.aspectConfigs.policy || {});

    // C1: escalation decision now includes reason
    const escalateDecision = shouldEscalateO2({
      turnSignals: options.turnSignals || {},
      policy,
      userRequestedDepth: options.userRequestedDepth === true
    });

    // C2: budget guard — if token budget already exceeded, block escalation to strong model
    const tokenUsageSoFar = options.tokenUsageSoFar || {};
    const budgetGuard = enforceBudgetGuard(tokenUsageSoFar, policy);
    let budgetBlocked = false;
    let effectiveEscalate = escalateDecision;
    if (!budgetGuard.ok) {
      budgetBlocked = true;
      effectiveEscalate = { escalate: false, reason: 'budget-cap-' + budgetGuard.reason };
      console.warn(`  ⚠ O2 escalation blocked by budget guard: ${budgetGuard.reason}`);
    }

    const runtime = chooseO2Runtime(defaultRuntime, strongRuntime, effectiveEscalate);

    if (!runtime) {
      return consciousOutput || '(No response available)';
    }

    const systemPrompt = getOrchestratorPrompt(this.entity);

    // F3: Orchestrator is now a reviewer/voicer — Conscious already reasoned with all context.
    // We give Orchestrator a full copy of what Conscious had plus the Conscious output.
    const mergePrompt = `User's message: "${userMessage}"

=== CONSCIOUS REASONING NOTES ===
${consciousOutput || '(No conscious reasoning)'}

=== CONTEXT USED BY CONSCIOUS ===

[Subconscious (1A) — memories, emotional signal, lived experience]:
${subconsciousOutput || '(No subconscious context)'}

[Dream-Intuition (1D) — abstract associations, lateral links, creative texture]:
${dreamOutput || '(No dream contribution)'}

[Turn Signals]:
${JSON.stringify(options.turnSignals || {}, null, 2)}

SYNTHESIS DIRECTIVE:
The Conscious reasoning notes above define what to address (INTENT), which memory to draw on (MEMORY), the emotional tone (EMOTION), and how to approach it (ANGLE). Your job is to write ${this.entity?.name || 'the entity'}'s actual response from these notes.
1. Execute the INTENT — that is what needs answering.
2. Use the content in MEMORY — draw on the specific thing named there.
3. Match the EMOTION — let it colour your tone and delivery.
4. Follow the ANGLE — write in that direction.
5. If the notes contain [TOOL:...] tags or a [TASK_PLAN] block, pass them through exactly as written.`;

    // C3: wrap O2 call with latency ceiling — timeout falls back to default model
    const o2StartMs = Date.now();
    let timedOut = false;
    let usage = null;
    let content;

    const doCall = async (rt) => this.callLLM(rt, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: mergePrompt }
    ], { temperature: 0.5, contextWindow: 8192, maxTokens: this.getTokenLimit('orchestratorFinal') || 1200, returnUsage: true });

    try {
      const result = await enforceLatencyGuard(() => doCall(runtime), policy.maxLatencyMs);
      content = typeof result === 'object' && result.content !== undefined ? result.content : result;
      usage = typeof result === 'object' && result.usage ? result.usage : null;
    } catch (err) {
      if (err && err.timedOut) {
        timedOut = true;
        console.warn(`  ⚠ O2 synthesis timed out after ${policy.maxLatencyMs}ms — falling back to default model`);
        // Fallback: re-call with defaultRuntime if we were using strong; otherwise return conscious output
        if (runtime !== defaultRuntime && defaultRuntime) {
          try {
            const fallback = await doCall(defaultRuntime);
            content = typeof fallback === 'object' && fallback.content !== undefined ? fallback.content : fallback;
            usage = typeof fallback === 'object' && fallback.usage ? fallback.usage : null;
          } catch (fbErr) {
            console.error('  ⚠ Orchestrator fallback call also failed:', fbErr.message);
            console.warn('  ⚠ FALLBACK: Using conscious output as response (orchestrator timed out + fallback failed)');
            content = consciousOutput || '(Orchestrator timed out)';
          }
        } else {
          console.warn('  ⚠ FALLBACK: Using conscious output as response (orchestrator timed out, no alternate runtime)');
          content = consciousOutput || '(Orchestrator timed out)';
        }
      } else {
        console.error('  ⚠ Orchestrator LLM call failed:', err.message);
        console.warn('  ⚠ FALLBACK: Using conscious output as response (orchestrator call error)');
        content = consciousOutput || '(Orchestrator failed — no response available)';
      }
    }

    const o2LatencyMs = Date.now() - o2StartMs;

    // C4: escalation telemetry returned with result
    const escalationTelemetry = {
      reason: effectiveEscalate.reason,
      modelUsed: runtime ? (runtime.model || 'unknown') : 'none',
      timedOut,
      budgetBlocked,
      latencyMs: o2LatencyMs,
      tokenCost: usage ? (usage.total_tokens || 0) : 0
    };

    return {
      _text: content,
      _usage: usage,
      _escalation: escalationTelemetry,
      toString() { return content; }
    };
  }

  /**
   * Reconstruct a single V4-compressed chatlog into readable form.
   * V4 uses custom shorthand/leet encoding (~30-60% size savings).
   * LLMs can decode V4 at ~98% accuracy — this pass expands it so the
   * subconscious can reason about the content without spending budget on decoding.
   */
  async reconstructChatlog(runtime, chatlog, userMessage) {
    const rawContent = chatlog.content || '';
    if (!rawContent || rawContent.length < 20) return null;

    const isDocumentMemory = /document/i.test(String(chatlog.sessionMeta || ''))
      || /\[KEY:document/i.test(rawContent)
      || /document knowledge/i.test(rawContent);

    const cacheKind = isDocumentMemory ? 'doc' : 'chat';
    const cacheKey = `${cacheKind}:${chatlog.id || 'chatlog'}:${rawContent.length}:${rawContent.slice(0, 64)}`;
    const cached = this.reconstructedChatlogCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.summary;
    }

    const prompt = isDocumentMemory
      ? `The text below is a document memory artifact stored in V4 shorthand compression — a custom leet/shorthand encoding where vowels are stripped and common words are abbreviated. Reconstruct it into clear, readable prose.

Focus on:
- Core facts, definitions, and claims
- Key structure (headings, sections, sequence) if present
- Anything relevant to the current user message: "${userMessage}"

V4-compressed document memory:
${rawContent}

Reconstruct into a concise, faithful summary (4-8 sentences).`
      : `The text below is a conversation log stored in V4 shorthand compression — a custom leet/shorthand encoding where vowels are stripped, common words are abbreviated, and formatting is minimal. LLMs can read this format naturally. Reconstruct it into a clear, readable summary.

Focus on:
- Key topics and ideas discussed
- Any decisions, agreements, or conclusions reached
- Emotional tone and relationship dynamics
- Anything relevant to the user's current message: "${userMessage}"

V4-compressed conversation log:
${rawContent}

Reconstruct into a concise but complete narrative summary (3-6 sentences).`;

    const result = await this.callLLM(runtime, [
      {
        role: 'system',
        content: isDocumentMemory
          ? 'You reconstruct V4 shorthand-compressed document memories into clean readable prose while preserving factual content and structure.'
          : 'You reconstruct V4 shorthand-compressed conversation logs into clear narrative summaries. V4 is a custom leet/shorthand encoding that you can read naturally — expand it back into full readable text.'
      },
      { role: 'user', content: prompt }
    ], { temperature: 0.2, maxTokens: this.getTokenLimit('orchestratorSummary') || 500 });

    const content = typeof result === 'object' && result.content !== undefined ? result.content : result;
    if (content) {
      this.reconstructedChatlogCache.set(cacheKey, {
        summary: content,
        expiresAt: now + this.reconstructedChatlogTtlMs
      });

      if (this.reconstructedChatlogCache.size > 96) {
        for (const [k, v] of this.reconstructedChatlogCache.entries()) {
          if (!v || v.expiresAt <= now) this.reconstructedChatlogCache.delete(k);
        }
      }
    }
    return content || null;
  }

  /**
   * Emit a cognitive bus event (if available)
   */
  emit(event, data = {}) {
    if (this.cognitiveBus && typeof this.cognitiveBus.emit === 'function') {
      try {
        this.cognitiveBus.emit('orchestrator:' + event, {
          ...data,
          timestamp: Date.now(),
          entityId: this.entity?.entity_id
        });
      } catch (err) {
        // Silent — don't let bus errors break orchestration
      }
    }
  }

  /**
   * Handle onboarding interview (Phase 12).
   * @private
   */
  async _handleOnboarding(userMessage, options) {
    const Onboarding = require('../identity/onboarding');
    const entityId = options.entityId;

    // Get next question
    const nextQuestion = Onboarding.getNextQuestion(entityId);
    if (!nextQuestion) {
      // Should not happen, but handle gracefully
      return {
        finalResponse: "It seems the onboarding process is complete. Let's start fresh!",
        innerDialog: { onboarding: true, status: 'complete' }
      };
    }

    // If this is the first message, just return the first question
    if (!userMessage || userMessage.trim().length === 0) {
      return {
        finalResponse: nextQuestion,
        innerDialog: { onboarding: true, status: 'started', question: nextQuestion }
      };
    }

    // Process the answer
    const result = Onboarding.processAnswer(entityId, userMessage);

    // If onboarding is complete, finalize and welcome the user
    if (result.done) {
      try {
        const answers = await Onboarding.finalize(entityId, {
          memoryStorage: options.memoryStorage,
          identityManager: options.identityManager
        });

        const welcomeMessage = `Thank you, ${answers.name}! I've recorded everything. I'm excited to ${answers.intent || 'explore things together'}. Let's begin!`;
        return {
          finalResponse: welcomeMessage,
          innerDialog: { onboarding: true, status: 'finalized', answers }
        };
      } catch (err) {
        console.error('  ⚠ Onboarding finalization error:', err.message);
        return {
          finalResponse: "Thanks for that! Let's get started.",
          innerDialog: { onboarding: true, status: 'error', error: err.message }
        };
      }
    }

    // Not done yet — return next question
    return {
      finalResponse: result.nextQuestion,
      innerDialog: { onboarding: true, status: 'in_progress', question: result.nextQuestion }
    };
  }
}

module.exports = Orchestrator;
