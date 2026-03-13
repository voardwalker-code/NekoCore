// ============================================================
// REM System — Dream Memory Module (Phase 9)
//
// Multi-tier dream memory store that mirrors the main MemoryStorage
// hierarchy, but scoped entirely to the entity's dream-space.
//
// Directory layout (under memories/{entityId}/dreams/):
//   episodic/   — individual dream episodes (raw generated stories)
//   semantic/   — extracted recurring symbols, themes, patterns
//   core/       — CoreDreamMemories: significant dreams kept long-term
//   index/      — topic-keyed index for fast dream retrieval
//
// Significance scoring (0.0–1.0) drives automatic CoreDream flagging:
//   - Rich emotion (non-neutral)          → +0.20
//   - Long / detailed dream text          → +0.15
//   - Seeded from real memories           → +0.20
//   - Contains curiosity/goal themes     → +0.15
//   - High topic diversity                → +0.10
//   - Recent pulse-interrupted thought   → +0.20
//
// CoreDreamMemories are readable by the imagination and diary systems.
// ============================================================

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const entityPaths = require('../../entities/entityPaths');

const SIGNIFICANCE_THRESHOLD = 0.60; // Dreams above this are flagged as CoreDreamMemories

class DreamMemory {
  /**
   * @param {Object} options
   * @param {string} options.entityId — owning entity
   */
  constructor(options = {}) {
    this.entityId = options.entityId || null;

    if (!this.entityId) throw new Error('DreamMemory requires entityId');

    this.episodicDir = entityPaths.getDreamEpisodicPath(this.entityId);
    this.semanticDir = entityPaths.getDreamSemanticPath(this.entityId);
    this.coreDir     = entityPaths.getDreamCorePath(this.entityId);
    this.indexDir    = entityPaths.getDreamIndexPath(this.entityId);
  }

  // ── Significance Scoring ──────────────────────────────────

  /**
   * Score a dream's significance on a 0.0–1.0 scale.
   * Used to decide whether to flag as a CoreDreamMemory.
   *
   * @param {Object} dream — dream object as returned by DreamEngine
   * @returns {number} 0.0–1.0
   */
  computeSignificance(dream) {
    if (!dream) return 0;
    let score = 0;

    // Emotion: non-neutral emotions add weight
    const emotion = (dream.emotion || 'neutral').toLowerCase();
    if (emotion !== 'neutral' && emotion !== '') score += 0.20;

    // Dream text richness (word count)
    const text = dream.fullText || dream.summary || '';
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 300) score += 0.15;
    else if (wordCount >= 150) score += 0.08;

    // Seeded from real memories (not free_imagination / abstract_vision)
    const genre = dream.genre || '';
    if (genre !== 'free_imagination' && genre !== 'abstract_vision') {
      const originCount = (dream.origin_memories || []).length;
      if (originCount > 0) score += 0.20;
    }

    // Curiosity/goal related topics
    const topics = dream.content?.topics || dream.topics || [];
    const goalTopics = ['goal', 'curiosity', 'question', 'identity', 'longing', 'purpose'];
    if (topics.some(t => goalTopics.includes(String(t).toLowerCase()))) score += 0.15;

    // Topic diversity (varied = richer dream)
    const uniqueTopics = new Set((topics || []).map(t => String(t).toLowerCase()));
    if (uniqueTopics.size >= 4) score += 0.10;

    // Pulse-interrupted: dream was seeded from what the entity was thinking about
    if (dream.pulseSeeded) score += 0.20;

    return Math.min(1.0, score);
  }

  // ── Episodic Store ────────────────────────────────────────

  /**
   * Store a generated dream into the episodic tier.
   * Automatically computes significance and promotes to CoreDreamMemory if above threshold.
   *
   * @param {Object} dream — dream from DreamEngine
   * @returns {{ dreamId: string, significance: number, isCore: boolean }}
   */
  async store(dream) {
    const dreamId = dream.id || `dream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const significance = this.computeSignificance(dream);
    const isCore = significance >= SIGNIFICANCE_THRESHOLD;

    const dreamPath = path.join(this.episodicDir, dreamId);
    if (!fs.existsSync(dreamPath)) fs.mkdirSync(dreamPath, { recursive: true });

    // Store semantic summary
    fs.writeFileSync(
      path.join(dreamPath, 'semantic.txt'),
      dream.semantic || dream.summary || '',
      'utf8'
    );

    // Compress and store full content
    if (dream.content || dream.fullText) {
      const payload = { ...(dream.content || {}), full_text: dream.fullText || '' };
      fs.writeFileSync(
        path.join(dreamPath, 'dream.zip'),
        zlib.gzipSync(JSON.stringify(payload))
      );
    }

    // Store metadata log
    const log = {
      dream_id: dreamId,
      created: dream.created || new Date().toISOString(),
      last_accessed: new Date().toISOString(),
      access_count: 0,
      type: 'dream_episodic',
      significance,
      is_core: isCore,
      genre: dream.genre || null,
      genre_label: dream.genre_label || null,
      emotion: dream.emotion || null,
      topics: dream.topics || [],
      origin_memories: dream.origin_memories || [],
      pulse_seeded: dream.pulseSeeded || false,
      simulation_confidence: dream.simulation_confidence || 0.0
    };
    fs.writeFileSync(path.join(dreamPath, 'log.json'), JSON.stringify(log, null, 2), 'utf8');

    // Update topic index
    this._updateIndex(dreamId, log.topics);

    // Promote to CoreDreamMemories
    if (isCore) {
      await this.flagCore(dreamId, significance);
    }

    console.log(`  ✓ Dream stored: ${dreamId} (significance: ${significance.toFixed(2)}${isCore ? ' — CORE' : ''})`);
    return { dreamId, significance, isCore };
  }

  // ── Core Dream Flagging ───────────────────────────────────

  /**
   * Promote an episodic dream to a CoreDreamMemory.
   * Copies metadata + semantic text into the core/ tier.
   * Does NOT duplicate the compressed content — points to episodic for full text.
   *
   * @param {string} dreamId
   * @param {number} [significance]
   */
  async flagCore(dreamId, significance) {
    const srcPath = path.join(this.episodicDir, dreamId);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  ⚠ Cannot flag core dream — not found in episodic: ${dreamId}`);
      return false;
    }

    const corePath = path.join(this.coreDir, dreamId);
    if (!fs.existsSync(corePath)) fs.mkdirSync(corePath, { recursive: true });

    // Copy semantic summary
    const semSrc = path.join(srcPath, 'semantic.txt');
    if (fs.existsSync(semSrc)) {
      fs.copyFileSync(semSrc, path.join(corePath, 'semantic.txt'));
    }

    // Write a core-tier manifest (lightweight — full content stays in episodic)
    const logSrc = path.join(srcPath, 'log.json');
    let log = {};
    try { log = JSON.parse(fs.readFileSync(logSrc, 'utf8')); } catch (_) {}

    const coreLog = {
      ...log,
      type: 'dream_core',
      significance: significance ?? log.significance ?? 1.0,
      promoted_at: new Date().toISOString(),
      episodic_ref: dreamId   // pointer back to full content in episodic/
    };
    fs.writeFileSync(path.join(corePath, 'log.json'), JSON.stringify(coreLog, null, 2), 'utf8');

    console.log(`  ★ CoreDreamMemory flagged: ${dreamId}`);
    return true;
  }

  // ── Semantic Insights ─────────────────────────────────────

  /**
   * Store a recurring theme or symbol extracted from dreams.
   * @param {Object} insight — { theme, description, sources: dreamId[], firstSeen }
   * @returns {string} insightId
   */
  storeSemanticInsight(insight) {
    const insightId = insight.id || `dsem_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const insightPath = path.join(this.semanticDir, `${insightId}.json`);
    fs.writeFileSync(insightPath, JSON.stringify({
      id: insightId,
      theme: insight.theme || '',
      description: insight.description || '',
      sources: insight.sources || [],
      first_seen: insight.firstSeen || new Date().toISOString(),
      last_seen: new Date().toISOString(),
      count: insight.count || 1
    }, null, 2), 'utf8');
    return insightId;
  }

  // ── Topic Index ───────────────────────────────────────────

  /**
   * Update the topic index for a stored dream.
   * Each topic maps to a list of dream IDs in `index/{topic}.json`.
   */
  _updateIndex(dreamId, topics) {
    if (!topics || topics.length === 0) return;
    for (const topic of topics) {
      const key = String(topic).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (!key) continue;
      const indexFile = path.join(this.indexDir, `${key}.json`);
      let ids = [];
      try { ids = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (_) {}
      if (!ids.includes(dreamId)) {
        ids.push(dreamId);
        fs.writeFileSync(indexFile, JSON.stringify(ids), 'utf8');
      }
    }
  }

  /**
   * Look up dreams by topic.
   * @param {string} topic
   * @returns {string[]} dream IDs
   */
  getDreamsByTopic(topic) {
    const key = String(topic).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const indexFile = path.join(this.indexDir, `${key}.json`);
    try { return JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (_) { return []; }
  }

  // ── Retrieval ─────────────────────────────────────────────

  /**
   * Load a dream from the episodic tier.
   * @param {string} dreamId
   * @returns {Object|null}
   */
  getDream(dreamId) {
    const dreamPath = path.join(this.episodicDir, dreamId);
    if (!fs.existsSync(dreamPath)) return null;
    try {
      const log = JSON.parse(fs.readFileSync(path.join(dreamPath, 'log.json'), 'utf8'));
      const semantic = fs.readFileSync(path.join(dreamPath, 'semantic.txt'), 'utf8');
      let content = null;
      const zipPath = path.join(dreamPath, 'dream.zip');
      if (fs.existsSync(zipPath)) {
        content = JSON.parse(zlib.gunzipSync(fs.readFileSync(zipPath)).toString());
      }
      return { id: dreamId, ...log, semantic, content };
    } catch { return null; }
  }

  /**
   * Return the N most recent episodic dreams (newest first).
   * @param {number} limit
   * @returns {Object[]}
   */
  getRecentDreams(limit = 20) {
    try {
      return fs.readdirSync(this.episodicDir)
        .filter(name => {
          const p = path.join(this.episodicDir, name);
          return fs.statSync(p).isDirectory();
        })
        .sort().reverse()
        .slice(0, limit)
        .map(id => this.getDream(id))
        .filter(Boolean);
    } catch { return []; }
  }

  /**
   * Return the N most recent CoreDreamMemories (newest first).
   * @param {number} limit
   * @returns {Object[]}
   */
  getCoreDreams(limit = 10) {
    try {
      return fs.readdirSync(this.coreDir)
        .filter(name => {
          const p = path.join(this.coreDir, name);
          return fs.statSync(p).isDirectory();
        })
        .sort().reverse()
        .slice(0, limit)
        .map(id => {
          const corePath = path.join(this.coreDir, id);
          try {
            const log = JSON.parse(fs.readFileSync(path.join(corePath, 'log.json'), 'utf8'));
            const semantic = fs.existsSync(path.join(corePath, 'semantic.txt'))
              ? fs.readFileSync(path.join(corePath, 'semantic.txt'), 'utf8')
              : '';
            return { id, ...log, semantic };
          } catch { return null; }
        })
        .filter(Boolean);
    } catch { return []; }
  }
}

DreamMemory.SIGNIFICANCE_THRESHOLD = SIGNIFICANCE_THRESHOLD;
module.exports = DreamMemory;
