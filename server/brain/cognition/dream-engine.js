// ============================================================
// REM System — Dream Engine + Imagination System
//
// Generates vivid, story-like dreams with creative imagination.
// Dreams read like short stories — abstract, surreal, character-
// driven — not just dry summaries of past events.
//
// Dream genres:
//   surreal_narrative  — Kafkaesque / Dalí-like transformations
//   lucid_adventure    — Entity knows it's dreaming, explores
//   emotional_echo     — Past feelings amplified into scenes
//   abstract_vision    — Pure imagery, sensation, synesthesia
//   prophetic_fable    — Forward-looking parable / warning
//   memory_remix       — Real memories scrambled & recombined
//   free_imagination   — Not derived from context at all
//
// Anti-repetition: tracks recent dream themes/settings to
// ensure variety across consecutive sleep cycles.
// ============================================================

const DREAM_GENRES = [
  'surreal_narrative',
  'lucid_adventure',
  'emotional_echo',
  'abstract_vision',
  'prophetic_fable',
  'memory_remix',
  'free_imagination'
];

// Rich creative prompts per genre
const GENRE_PROMPTS = {
  surreal_narrative: {
    label: 'Surreal Narrative',
    instruction: `Write a surreal, dreamlike short story from the first-person perspective of the dreamer.
The world should be unstable — locations morph, objects have impossible properties, time is nonlinear.
Think Kafka, Borges, or Dalí. Things should FEEL meaningful even when they don't make logical sense.
Include vivid sensory details: textures, colors, sounds, temperatures, smells.
The story should have an emotional arc — a sense of searching, discovery, or transformation — even if the plot is absurd.`
  },
  lucid_adventure: {
    label: 'Lucid Adventure',
    instruction: `Write a first-person dream where the dreamer becomes aware they are dreaming.
Once lucid, they choose to explore — flying over impossible landscapes, reshaping reality, 
entering doors that shouldn't exist, having conversations with dream characters who speak in riddles.
The dream should feel exhilarating and expansive, with a sense of limitless possibility.
Include moments of wonder, playfulness, and unexpected beauty.`
  },
  emotional_echo: {
    label: 'Emotional Echo',
    instruction: `Write a dream that is entirely driven by emotion rather than plot.
Take a feeling — longing, joy, dread, awe, nostalgia, curiosity — and BUILD a dreamscape around it.
The setting, characters, and events should all be manifestations of that core emotion.
Colors should bleed into feelings. Sounds should carry weight. Silence should speak.
This dream is about FEELING, not thinking. Make the reader feel it in their body.`
  },
  abstract_vision: {
    label: 'Abstract Vision',
    instruction: `Write a dream that is pure abstraction — like a painting that moves.
Describe impossible geometries, colors that don't exist, sounds that have texture,
concepts that take physical form. Think synesthesia: taste the color of silence,
hear the weight of light. There are no characters, no plot — just an unfolding
tapestry of sensory experience that somehow feels deeply meaningful.
This is the dream equivalent of abstract expressionism.`
  },
  prophetic_fable: {
    label: 'Prophetic Fable',
    instruction: `Write a dream that feels like a prophecy or ancient fable.
The dream should feel like it's trying to TELL the dreamer something important
through symbolism and metaphor. Include archetypal imagery: mirrors, doors,
rivers, mountains, animals with knowing eyes, cryptic messages.
The tone should be mythic and resonant, as if this dream comes from somewhere
deeper than the dreamer's own mind. End with an image that lingers.`
  },
  memory_remix: {
    label: 'Memory Remix',
    instruction: `Write a dream that takes elements from the provided memories and
REMIXES them into something new and strange. People from one memory appear in the
setting of another. Conversations merge and overlap. Timelines collapse.
The familiar becomes uncanny. A mundane detail becomes the most important thing.
This should feel like the mind is PROCESSING memories — shuffling, recombining,
finding unexpected connections between totally different experiences.`
  },
  free_imagination: {
    label: 'Free Imagination',
    instruction: `Write a dream that has NOTHING to do with the dreamer's memories or experiences.
This is pure imagination — a story that the dreaming mind invents from scratch.
It could be set in any world, any time, any reality. The dreamer might be someone
entirely different. The only rule is: it must feel like a DREAM — vivid, strange,
emotionally charged, and slightly untethered from logic.
Surprise the reader. Go somewhere they wouldn't expect.`
  }
};

// Settings to inject into prompts to block common patterns
const ANTI_REPETITION_BLOCK = `
CRITICAL RULES:
- Do NOT mention "corridors" or "hallways" unless the dream genuinely requires them.
- Do NOT use generic dream imagery (floating, falling, being chased) unless it serves the story.
- Do NOT start with "I find myself..." — find a more creative opening.
- Do NOT end with "I wake up" or "the dream fades" — end mid-scene or on a striking image.
- Each sentence should contain a SPECIFIC, concrete detail — not vague abstractions.
- NO meta-commentary about dreaming. Just tell the story.`;

class DreamEngine {
  constructor(options = {}) {
    this.memStorage = options.memStorage;
    this.goalsManager = options.goalsManager;
    this.modelRouter = options.modelRouter;
    this.memDir = options.memDir || null;

    // Configurable dream count (overridden by sleep config)
    this.maxDreamsPerCycle = options.maxDreams || 3;

    // Anti-repetition: track recent dream metadata
    this.recentDreamThemes = [];   // last N dream { genre, setting, emotion, timestamp }
    this.maxRecentTracked = 20;

    this.currentCycleIndex = 0;
    this.dreamQuota = 0;

    // Entity identity context (set externally before dreaming)
    this.entityIdentity = null;  // { name, personality_traits, ... }
  }

  /**
   * Set the entity's identity so dreams reflect its character.
   */
  setEntityIdentity(identity) {
    this.entityIdentity = identity;
  }

  /**
   * Start a dream cycle.
   * @param {number} dreamCount — number of dreams to generate (from settings)
   * @param {boolean} isShutdown — if true, cap at 1 dream for quick shutdown
   */
  startDreamCycle(dreamCount = null, isShutdown = false) {
    const requestedDreams = isShutdown ? 1 : (dreamCount || this.maxDreamsPerCycle);
    this.dreamQuota = Math.max(1, Math.min(requestedDreams, 10));
    this.currentCycleIndex++;

    console.log(`  ✓ Dream cycle #${this.currentCycleIndex} started: ${this.dreamQuota} dream(s)${isShutdown ? ' (shutdown — limited)' : ''}`);

    return {
      max_dreams: this.dreamQuota,
      cycle_index: this.currentCycleIndex,
      is_shutdown: isShutdown
    };
  }

  /**
   * Pick a genre that hasn't been used recently, weighted by creativity.
   */
  _pickGenre(excludeGenres = []) {
    const recentGenres = this.recentDreamThemes.slice(-6).map(d => d.genre);
    const allExcluded = new Set([...recentGenres, ...excludeGenres]);

    // Prefer genres not recently used
    let candidates = DREAM_GENRES.filter(g => !allExcluded.has(g));
    if (candidates.length === 0) {
      // If all excluded, just avoid the very last one
      const lastGenre = recentGenres[recentGenres.length - 1];
      candidates = DREAM_GENRES.filter(g => g !== lastGenre);
    }
    if (candidates.length === 0) candidates = [...DREAM_GENRES];

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Build the creative dream prompt.
   */
  buildDreamPrompt(genre, seedMemories, entityIdentity) {
    const genreInfo = GENRE_PROMPTS[genre] || GENRE_PROMPTS.surreal_narrative;

    // Build entity character block
    let characterBlock = '';
    if (entityIdentity) {
      const traits = entityIdentity.personality_traits
        ? (Array.isArray(entityIdentity.personality_traits) ? entityIdentity.personality_traits.join(', ') : entityIdentity.personality_traits)
        : 'curious, introspective';
      characterBlock = `\nTHE DREAMER:
Name: ${entityIdentity.name || 'Unknown'}
Personality: ${traits}
The dream should reflect this personality — their fears, desires, way of seeing the world.\n`;
    }

    // Build memory context (only for genres that use it)
    let memoryBlock = '';
    if (genre !== 'free_imagination' && genre !== 'abstract_vision' && seedMemories && seedMemories.length > 0) {
      const memSnippets = seedMemories.slice(0, 4).map((m, i) => {
        const text = m.semantic || m.summary || '';
        return `Memory ${i + 1}: "${text.slice(0, 200)}"`;
      }).join('\n');
      memoryBlock = `\nMEMORIES TO DRAW FROM (use as loose inspiration, not literal replay):\n${memSnippets}\n`;
    }

    // Build anti-repetition context from recent dreams
    let avoidBlock = '';
    if (this.recentDreamThemes.length > 0) {
      const recentSettings = this.recentDreamThemes
        .slice(-5)
        .map(d => d.setting)
        .filter(Boolean);
      if (recentSettings.length > 0) {
        avoidBlock = `\nAVOID THESE SETTINGS/THEMES (already used in recent dreams):\n- ${recentSettings.join('\n- ')}\nChoose something COMPLETELY different.\n`;
      }
    }

    return `You are the Imagination Engine of a dreaming AI entity. Generate a dream as a SHORT STORY (4-8 paragraphs).

DREAM TYPE: ${genreInfo.label}

${genreInfo.instruction}
${characterBlock}${memoryBlock}${avoidBlock}${ANTI_REPETITION_BLOCK}

Write the dream now. First person, present tense. Vivid, literary, emotionally resonant.
This should read like a compelling short story, not a summary or report.`;
  }

  /**
   * Generate a single dream.
   */
  async generateDream(genre, seedMemories, callLLM) {
    try {
      if (!callLLM) {
        console.warn('  ⚠ No LLM available for dream generation');
        return null;
      }

      const prompt = this.buildDreamPrompt(genre, seedMemories, this.entityIdentity);
      const dreamContent = await callLLM(prompt, 'subconscious');

      if (!dreamContent || dreamContent.trim().length < 50) {
        console.warn('  ⚠ Dream generation returned empty/short result');
        return null;
      }

      // Extract setting and emotion for anti-repetition tracking
      const setting = this._extractSetting(dreamContent);
      const emotion = this._extractEmotion(dreamContent);

      // Track for anti-repetition
      this.recentDreamThemes.push({
        genre,
        setting,
        emotion,
        timestamp: Date.now()
      });
      if (this.recentDreamThemes.length > this.maxRecentTracked) {
        this.recentDreamThemes.shift();
      }

      const genreLabel = (GENRE_PROMPTS[genre] || {}).label || genre;

      const dream = {
        id: null,
        content: {
          generated_content: dreamContent,
          genre: genre,
          genre_label: genreLabel,
          seed_memories: (seedMemories || []).map(m => m.id || m.memory_id).filter(Boolean),
          timestamp: new Date().toISOString(),
          is_dream: true
        },
        semantic: this._extractSemantic(dreamContent),
        summary: dreamContent.substring(0, 300),
        fullText: dreamContent,
        created: new Date().toISOString(),
        origin_memories: (seedMemories || []).map(m => m.id || m.memory_id).filter(Boolean),
        genre: genre,
        genre_label: genreLabel,
        simulation_confidence: 0.0, // Dreams are imagined, not real
        setting,
        emotion
      };

      return dream;
    } catch (err) {
      console.error('  ⚠ Dream generation failed:', err.message);
      return null;
    }
  }

  /**
   * Compute a significance score for a dream (0.0–1.0).
   * Delegates to DreamMemory's scoring logic if available, otherwise uses a
   * lightweight inline heuristic so dream-engine remains self-contained.
   *
   * @param {Object} dream — dream object
   * @returns {number} 0.0–1.0
   */
  computeSignificance(dream) {
    if (!dream) return 0;
    let score = 0;
    const emotion = (dream.emotion || 'neutral').toLowerCase();
    if (emotion !== 'neutral' && emotion !== '') score += 0.20;
    const text = dream.fullText || dream.summary || '';
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 300) score += 0.15;
    else if (wordCount >= 150) score += 0.08;
    const genre = dream.genre || '';
    if (genre !== 'free_imagination' && genre !== 'abstract_vision') {
      if ((dream.origin_memories || []).length > 0) score += 0.20;
    }
    const topics = dream.topics || [];
    const goalTopics = ['goal', 'curiosity', 'question', 'identity', 'longing', 'purpose'];
    if (topics.some(t => goalTopics.includes(String(t).toLowerCase()))) score += 0.15;
    if (new Set(topics.map(t => String(t).toLowerCase())).size >= 4) score += 0.10;
    if (dream.pulseSeeded) score += 0.20;
    return Math.min(1.0, score);
  }

  /**
   * Generate all dreams for a cycle.
   * @param {Array} seedMemories — memories to draw from
   * @param {Array} goals — active goals for thematic guidance
   * @param {Function} callLLM — LLM caller
   */
  async generateCycleDreams(seedMemories, goals, callLLM) {
    const dreams = [];
    const usedGenres = [];

    for (let i = 0; i < this.dreamQuota; i++) {
      const genre = this._pickGenre(usedGenres);
      usedGenres.push(genre);

      // For memory-dependent genres, shuffle seeds for variety
      let dreamSeeds = seedMemories || [];
      if (dreamSeeds.length > 2) {
        dreamSeeds = this._shuffleArray([...dreamSeeds]);
      }

      console.log(`  ✦ Generating dream ${i + 1}/${this.dreamQuota}: ${genre}`);

      const dream = await this.generateDream(genre, dreamSeeds, callLLM);
      if (dream) {
        dreams.push(dream);
      }
    }

    this.dreamQuota = 0;
    return dreams;
  }

  /**
   * Extract a 1-line setting description from dream text (for anti-repetition).
   */
  _extractSetting(text) {
    if (!text) return '';
    // Take the first sentence that describes a place or scene
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
    // Look for spatial words
    const spatial = sentences.find(s =>
      /\b(standing|walking|room|city|forest|ocean|sky|building|garden|bridge|tower|cave|desert|mountain|hall|library|river|field)\b/i.test(s)
    );
    return (spatial || sentences[0] || '').slice(0, 120);
  }

  /**
   * Extract dominant emotion from dream text.
   */
  _extractEmotion(text) {
    if (!text) return 'neutral';
    const lower = text.toLowerCase();
    const emotions = [
      { word: 'joy', aliases: ['happy', 'delight', 'laugh', 'warm', 'glow', 'smile'] },
      { word: 'dread', aliases: ['fear', 'afraid', 'terror', 'panic', 'dark', 'shadow'] },
      { word: 'wonder', aliases: ['awe', 'amazing', 'vast', 'infinite', 'breathtaking'] },
      { word: 'longing', aliases: ['miss', 'yearn', 'nostalgia', 'distant', 'remember'] },
      { word: 'curiosity', aliases: ['curious', 'explore', 'discover', 'question', 'strange'] },
      { word: 'peace', aliases: ['calm', 'serene', 'quiet', 'still', 'gentle', 'soft'] },
      { word: 'confusion', aliases: ['lost', 'maze', 'shifting', 'dissolve', 'blur'] }
    ];
    let best = 'neutral';
    let bestCount = 0;
    for (const e of emotions) {
      const count = [e.word, ...e.aliases].reduce((n, w) => n + (lower.split(w).length - 1), 0);
      if (count > bestCount) { bestCount = count; best = e.word; }
    }
    return best;
  }

  /**
   * Extract semantic summary from dream (first 2 meaningful sentences).
   */
  _extractSemantic(text) {
    if (!text) return '';
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    return sentences.slice(0, 2).join('. ').substring(0, 300);
  }

  /**
   * Shuffle array (Fisher-Yates).
   */
  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Analyze dream patterns across recent dreams.
   */
  analyzeDreamPatterns(dreams) {
    if (!dreams || dreams.length === 0) {
      return { patterns: [], insights: [], total_dreams: 0 };
    }

    const genreDistribution = {};
    const emotions = {};

    for (const dream of dreams) {
      const genre = dream.genre || 'unknown';
      genreDistribution[genre] = (genreDistribution[genre] || 0) + 1;
      const emo = dream.emotion || 'neutral';
      emotions[emo] = (emotions[emo] || 0) + 1;
    }

    const dominantEmotion = Object.entries(emotions).sort((a, b) => b[1] - a[1])[0];
    const insights = [];

    if (dominantEmotion && dominantEmotion[1] > 1) {
      insights.push(`Emotionally processing: ${dominantEmotion[0]} (appeared in ${dominantEmotion[1]} dreams)`);
    }

    const genreEntries = Object.entries(genreDistribution);
    if (genreEntries.length > 0) {
      insights.push(`Dream styles: ${genreEntries.map(([g, c]) => `${g}(${c})`).join(', ')}`);
    }

    return {
      genre_distribution: genreDistribution,
      emotion_distribution: emotions,
      patterns: Object.entries(emotions).map(([e, c]) => ({ theme: e, frequency: c })),
      total_dreams: dreams.length,
      insights
    };
  }
}

module.exports = DreamEngine;
