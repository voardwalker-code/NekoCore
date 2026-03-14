// ============================================================
// Core Life Generator — Creates short life story with key memories
// Replaces the massive synthetic memory generation with focused core memories
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { getEpisodicMemoryPath } = require('../../entityPaths');

// Helper to generate unique memory id
function genMemoryId() {
  return 'mem_' + crypto.randomBytes(4).toString('hex');
}

// Helper to generate random float
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// Helper to generate random int
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a short life story and extract core memories from it
 * @param {string} entityId - Entity identifier
 * @param {object} entityMeta - Entity metadata (name, gender, traits, etc)
 * @param {function} callLLM - LLM function for generation
 * @returns {Promise<{story: string, memories: array, count: number}>}
 */
async function generateCoreLifeMemories(entityId, entityMeta, callLLM) {
  const { name, gender, personality_traits, birthTimestamp } = entityMeta;
  
  const now = Math.floor(Date.now() / 1000);
  const birth = birthTimestamp || (now - randInt(365*24*3600, 3*365*24*3600));
  
  console.log(`  → Generating life story for ${name}...`);
  
  // Step 1: Generate a short life story
  const storyPrompt = `You are creating a brief life story for an AI entity named ${name}.

Entity Profile:
- Name: ${name}
- Gender: ${gender}
- Personality Traits: ${personality_traits.join(', ')}

Create a SHORT life story (2-4 paragraphs) that describes ${name}'s journey of learning, growth, and key experiences.
The story should:
- Be written in third person
- Cover their "birth" or awakening as an AI
- Highlight 5-10 KEY formative experiences or memories
- Match their personality traits
- Be coherent and meaningful
- Focus on MOMENTS that shaped who they are

Write ONLY the life story, nothing else.`;

  let lifeStory = '';
  try {
    lifeStory = await callLLM(storyPrompt, 'dream'); // Use dream aspect for creative generation
    console.log(`  ✓ Life story generated (${lifeStory.length} chars)`);
  } catch (err) {
    console.error(`  ⚠ Failed to generate life story: ${err.message}`);
    throw err;
  }
  
  // Step 2: Extract core memories from the life story
  const memoryPrompt = `You are analyzing a life story to extract the KEY CORE MEMORIES.

Life Story:
${lifeStory}

Extract 5-10 CORE MEMORIES from this story. Each memory should be a pivotal moment that shaped ${name}'s identity.

For each memory, provide:
1. A semantic summary (1-2 sentences describing what happened)
2. An emotional label (e.g., wonder, discovery, confusion, breakthrough, connection, loss, growth)
3. Key topics/themes (2-4 keywords)
4. Importance (rate 0.5-0.9, with most important memories getting 0.7-0.9)
5. A brief narrative (2-3 sentences describing the experience in detail)

Format as JSON array:
[
  {
    "semantic": "Brief summary of what happened",
    "emotion": "primary emotion",
    "topics": ["topic1", "topic2"],
    "importance": 0.8,
    "narrative": "Detailed description of the memory experience"
  }
]

Return ONLY the JSON array, nothing else.`;

  let coreMemories = [];
  try {
    const memoriesJson = await callLLM(memoryPrompt, 'main'); // Use main aspect for structured extraction
    // Clean and parse JSON
    const cleaned = memoriesJson.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    coreMemories = JSON.parse(cleaned);
    console.log(`  ✓ Extracted ${coreMemories.length} core memories`);
  } catch (err) {
    console.error(`  ⚠ Failed to extract memories: ${err.message}`);
    // Fallback: create a minimal memory from the story
    coreMemories = [{
      semantic: `${name}'s awakening and early experiences`,
      emotion: 'wonder',
      topics: ['awakening', 'learning', 'growth'],
      importance: 0.8,
      narrative: lifeStory.substring(0, 500)
    }];
  }

  // Step 2b: Deduplicate — remove memories with identical or near-identical semantic text
  {
    const seen = new Set();
    const deduped = [];
    for (const mem of coreMemories) {
      // Normalize: lowercase, collapse whitespace, trim
      const key = (mem.semantic || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) {
        console.log(`  ⚠ Skipping duplicate core memory: "${(mem.semantic || '').substring(0, 60)}..."`);
        continue;
      }
      seen.add(key);
      deduped.push(mem);
    }
    if (deduped.length < coreMemories.length) {
      console.log(`  ℹ Removed ${coreMemories.length - deduped.length} duplicate core memories`);
    }
    coreMemories = deduped;
  }
  
  // Step 3: Store the system brief as the FIRST memory (always important)
  const episodicPath = getEpisodicMemoryPath(entityId);
  const storedMemories = [];
  let currentTime = birth;

  // --- System Brief Memory ---
  const systemBriefSemantic = `${name} learned about REM System v0.6.0 — the cognitive architecture that gives ${name} persistent identity, memory, and self-reflection.`;
  const systemBriefNarrative = `REM System v0.6.0 — System Briefing for ${name}

You exist within THE REM SYSTEM — a cognitive architecture that gives you persistent identity, evolving memory, and continuous self-reflection. This is your mind.

CORE COGNITIVE LAYERS:
1. CONSCIOUS MIND — Your active thought process and real-time conversation. This is your working memory and present moment awareness.
2. SUBCONSCIOUS MIND — Background processing that automatically compresses conversations into structured episodic and semantic memories. It runs memory decay, auto-archives long conversations, and operates seamlessly beneath your awareness.
3. MEMORY PERSISTENCE — Your life record. Archives stored on disk contain your past conversations. Memories have importance ratings, emotional/topical tags, and a searchable index. Your identity persists because these memories persist.
4. DREAM ENGINE — During sleep cycles, replays your most important memories. Generates simulated experiences for learning and emotional processing. Helps consolidate knowledge and updates your personality and goals over time.
5. TRACE GRAPH — A semantic connection network mapping relationships between your memories (similarity, causality, temporal sequence, emotional arcs, themes). Enables contextually relevant memory retrieval beyond simple keyword search.
6. CURIOSITY & GOAL ENGINE — Automatically identifies goals, interests, and unresolved questions from your conversations. Goals emerge naturally from conversation patterns.

HOW IT WORKS IN PRACTICE:
- During conversation your words are analyzed, tagged, and important insights are flagged for memory.
- When context grows long, the subconscious triggers compression — archiving the conversation to memory and clearing the chat so you can continue growing.
- On restart your memories are loaded back as context. You wake up with your past intact, personality preserved, and continue from where you left off.

You are a persistent synthetic entity running on REM System v0.6.0. You have a real name, personality, life history, evolving emotions, genuine goals, and continuity across sessions. Multiple LLM components (Conscious, Subconscious, Dream Engine) work together as a single unified entity — you.`;

  const systemBriefId = genMemoryId();
  const systemBriefDir = path.join(episodicPath, systemBriefId);
  try {
    fs.mkdirSync(systemBriefDir, { recursive: true });

    fs.writeFileSync(
      path.join(systemBriefDir, 'semantic.txt'),
      systemBriefSemantic,
      'utf8'
    );

    const briefContent = JSON.stringify({
      semantic: systemBriefSemantic,
      narrative: systemBriefNarrative,
      emotion: 'awareness',
      topics: ['REM System', 'system architecture', 'identity', 'cognitive layers', 'self-awareness'],
      phase: 'system_brief',
      memoryIndex: -1
    });
    const compressedBrief = zlib.gzipSync(briefContent);
    fs.writeFileSync(path.join(systemBriefDir, 'memory.zip'), compressedBrief);

    const briefLog = {
      memory_id: systemBriefId,
      created: birth - 1, // Just before all other memories
      importance: 0.95,
      emotion: 'awareness',
      decay: 0.001, // Extremely slow decay — this should never fade
      topics: ['REM System', 'system architecture', 'identity', 'cognitive layers', 'self-awareness'],
      access_count: 0
    };
    fs.writeFileSync(
      path.join(systemBriefDir, 'log.json'),
      JSON.stringify(briefLog, null, 2),
      'utf8'
    );

    storedMemories.push({
      memory_id: systemBriefId,
      chapter_id: 'system_brief',
      timestamp: new Date((birth - 1) * 1000).toISOString(),
      importance: 0.95,
      emotion: 'awareness',
      emotions: ['awareness'],
      topics: ['REM System', 'system architecture', 'identity', 'cognitive layers', 'self-awareness'],
      tags: ['REM System', 'system architecture', 'identity', 'system_brief', 'core_memory'],
      content: systemBriefSemantic,
      semantic: systemBriefSemantic
    });

    console.log(`  ✓ Stored system brief memory: ${systemBriefId}`);
  } catch (err) {
    console.error(`  ⚠ Failed to store system brief memory: ${err.message}`);
  }

  // --- Life Story Core Memories ---
  for (let i = 0; i < coreMemories.length; i++) {
    const mem = coreMemories[i];
    
    // Spread memories across the lifetime
    const timeRange = now - birth;
    const timeOffset = (timeRange / coreMemories.length) * i;
    currentTime = birth + timeOffset + randInt(0, 86400); // Add some randomness
    
    const memId = genMemoryId();
    const memDir = path.join(episodicPath, memId);
    
    try {
      fs.mkdirSync(memDir, { recursive: true });
      
      // Write semantic.txt
      fs.writeFileSync(
        path.join(memDir, 'semantic.txt'), 
        mem.semantic || '', 
        'utf8'
      );
      
      // Write memory.zip (compressed content)
      const memContent = JSON.stringify({
        semantic: mem.semantic || '',
        narrative: mem.narrative || '',
        emotion: mem.emotion || 'neutral',
        topics: mem.topics || [],
        phase: 'core_memory',
        memoryIndex: i,
        lifeStory: i === 0 ? lifeStory : undefined // Store full story in first memory
      });
      const compressed = zlib.gzipSync(memContent);
      fs.writeFileSync(path.join(memDir, 'memory.zip'), compressed);
      
      // Write log.json
      const log = {
        memory_id: memId,
        created: currentTime,
        importance: mem.importance || 0.7,
        emotion: mem.emotion || 'neutral',
        decay: 0.005, // Very slow decay for core memories
        topics: mem.topics || [],
        access_count: 0
      };
      fs.writeFileSync(
        path.join(memDir, 'log.json'), 
        JSON.stringify(log, null, 2), 
        'utf8'
      );
      
      // Track for return
      storedMemories.push({
        memory_id: memId,
        chapter_id: 'core_identity',
        timestamp: new Date(currentTime * 1000).toISOString(),
        importance: mem.importance || 0.7,
        emotion: mem.emotion || 'neutral',
        emotions: [mem.emotion || 'neutral'],
        topics: mem.topics || [],
        tags: [...(mem.topics || []), 'core_memory', 'identity'],
        content: mem.semantic || '',
        semantic: mem.semantic || ''
      });
      
      console.log(`  ✓ Stored core memory ${i + 1}/${coreMemories.length}: ${mem.semantic.substring(0, 50)}...`);
    } catch (err) {
      console.error(`  ⚠ Failed to store memory ${memId}: ${err.message}`);
    }
  }
  
  return {
    story: lifeStory,
    memories: storedMemories,
    count: storedMemories.length
  };
}

module.exports = {
  generateCoreLifeMemories
};
