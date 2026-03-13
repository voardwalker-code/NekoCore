// ============================================================
// REM System — Memory Graph Builder Module
// Loads stored memories from disk and builds associative graph.
// ============================================================

const fs = require('fs');
const path = require('path');
const MemoryGraph = require('./memory-graph');
const ThoughtTypes = require('../bus/thought-types');

class MemoryGraphBuilder {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories/Memory2');
    this.semanticDir = options.semanticDir || null;
    this.ltmDir = options.ltmDir || null;
    this.dreamsDir = options.dreamsDir || null;
    this.cognitiveBus = options.cognitiveBus;
    this.memoryGraph = new MemoryGraph({ cognitiveBus: options.cognitiveBus });
    this.loadCount = 0;
    this.linkCount = 0;
  }

  /**
   * Load all memories from disk and build the graph
   */
  buildGraph() {
    try {
      if (!fs.existsSync(this.memDir)) {
        console.warn(`  ⚠ Memory directory not found: ${this.memDir}`);
        return this.memoryGraph;
      }

      const memoryFolders = fs.readdirSync(this.memDir)
        .filter(f => fs.statSync(path.join(this.memDir, f)).isDirectory());

      console.log(`  ↓ Building memory graph from ${memoryFolders.length} memories...`);

      // Phase 1: Load all memory nodes (episodic)
      const memories = [];
      const loadedIds = new Set(); // Track loaded IDs to avoid duplicates
      for (const folder of memoryFolders) {
        // Skip LTM duplicates in episodic dir — they'll be loaded from ltm/ as chatlog type
        if (folder.startsWith('ltm_') && this.ltmDir) continue;
        const logFile = path.join(this.memDir, folder, 'log.json');
        if (fs.existsSync(logFile)) {
          try {
            const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            // Ensure memory_id is always set (LTM entries may use ltm_id instead)
            if (!log.memory_id) log.memory_id = log.ltm_id || folder;
            // Tag LTM entries found in episodic dir as chatlog
            if (folder.startsWith('ltm_')) log.type = 'chatlog';
            memories.push(log);
            loadedIds.add(folder);
            this.memoryGraph.addMemoryNode({
              id: folder,
              ...log
            });
            this.loadCount++;
          } catch (e) {
            console.warn(`  ⚠ Failed to load memory ${folder}:`, e.message);
          }
        }
      }

      // Phase 1b: Load semantic knowledge memories
      if (this.semanticDir && fs.existsSync(this.semanticDir)) {
        const semFolders = fs.readdirSync(this.semanticDir)
          .filter(f => { try { return fs.statSync(path.join(this.semanticDir, f)).isDirectory(); } catch { return false; } });
        for (const folder of semFolders) {
          const logFile = path.join(this.semanticDir, folder, 'log.json');
          if (fs.existsSync(logFile)) {
            try {
              const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
              if (!log.memory_id) log.memory_id = folder;
              memories.push(log);
              this.memoryGraph.addMemoryNode({ id: folder, ...log });
              this.loadCount++;
            } catch (e) {
              console.warn(`  ⚠ Failed to load semantic memory ${folder}:`, e.message);
            }
          }
        }
      }

      // Phase 1c: Load chatlog memories from LTM directory
      if (this.ltmDir && fs.existsSync(this.ltmDir)) {
        const ltmFolders = fs.readdirSync(this.ltmDir)
          .filter(f => { try { return fs.statSync(path.join(this.ltmDir, f)).isDirectory(); } catch { return false; } });
        for (const folder of ltmFolders) {
          if (loadedIds.has(folder)) continue; // Skip if already loaded from episodic
          const logFile = path.join(this.ltmDir, folder, 'log.json');
          if (fs.existsSync(logFile)) {
            try {
              const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
              if (!log.memory_id) log.memory_id = log.ltm_id || folder;
              log.type = 'chatlog'; // Force chatlog type for LTM entries
              memories.push(log);
              loadedIds.add(folder);
              this.memoryGraph.addMemoryNode({ id: folder, ...log });
              this.loadCount++;
            } catch (e) {
              console.warn(`  ⚠ Failed to load LTM ${folder}:`, e.message);
            }
          }
        }
        console.log(`  ✓ Loaded ${ltmFolders.length} chatlog memories from LTM directory`);
      }

      // Phase 1d: Load dream memories from dreams directory
      if (this.dreamsDir && fs.existsSync(this.dreamsDir)) {
        const dreamFolders = fs.readdirSync(this.dreamsDir)
          .filter(f => { try { return fs.statSync(path.join(this.dreamsDir, f)).isDirectory(); } catch { return false; } });
        for (const folder of dreamFolders) {
          if (loadedIds.has(folder)) continue;
          const logFile = path.join(this.dreamsDir, folder, 'log.json');
          if (fs.existsSync(logFile)) {
            try {
              const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
              if (!log.memory_id) log.memory_id = folder;
              // Ensure dream type is set correctly
              if (!log.type || log.type === 'episodic') log.type = 'dream_memory';
              memories.push(log);
              loadedIds.add(folder);
              this.memoryGraph.addMemoryNode({ id: folder, ...log });
              this.loadCount++;
            } catch (e) {
              console.warn(`  ⚠ Failed to load dream ${folder}:`, e.message);
            }
          }
        }
        console.log(`  ✓ Loaded ${dreamFolders.length} dream memories from dreams directory`);
      }

      console.log(`  ✓ Loaded ${this.loadCount} memory nodes`);

      // Phase 2: Build associative links based on shared topics
      this.buildTopicLinks(memories);

      // Phase 3: Build temporal links (recency clusters)
      this.buildTemporalLinks(memories);

      // Emit completion event
      if (this.cognitiveBus) {
        this.cognitiveBus.emitThought({
          type: ThoughtTypes.SYSTEM_LOG,
          source: 'memory_graph_builder',
          message: `Memory graph built: ${this.loadCount} nodes, ${this.linkCount} connections`,
          importance: 0.5
        });
      }

      return this.memoryGraph;
    } catch (err) {
      console.error('  ⚠ Graph build failed:', err.message);
      if (this.cognitiveBus) {
        this.cognitiveBus.emitThought({
          type: ThoughtTypes.SYSTEM_ERROR,
          source: 'memory_graph_builder',
          error: err.message,
          importance: 0.7
        });
      }
      throw err;
    }
  }

  /**
   * Build links between memories that share topics
   */
  buildTopicLinks(memories) {
    const topicIndex = new Map(); // topic -> [memory_ids]

    // Build topic index
    for (const mem of memories) {
      if (!mem.topics || mem.topics.length === 0) continue;
      for (const topic of mem.topics) {
        if (!topicIndex.has(topic)) {
          topicIndex.set(topic, []);
        }
        topicIndex.get(topic).push(mem.memory_id);
      }
    }

    // Create links between memories sharing topics
    // Limit per-topic links to avoid combinatorial explosion in large topic groups
    const MAX_LINKS_PER_TOPIC = 10; // max connections per memory within a topic group
    for (const [topic, memIds] of topicIndex.entries()) {
      if (memIds.length < 2) continue;

      if (memIds.length <= MAX_LINKS_PER_TOPIC) {
        // Small group — link all pairs
        for (let i = 0; i < memIds.length; i++) {
          for (let j = i + 1; j < memIds.length; j++) {
            const strength = 0.6;
            this.memoryGraph.linkMemories(memIds[i], memIds[j], strength);
            this.linkCount++;
          }
        }
      } else {
        // Large group — each memory links to its nearest neighbors only
        for (let i = 0; i < memIds.length; i++) {
          const start = Math.max(0, i - Math.floor(MAX_LINKS_PER_TOPIC / 2));
          const end = Math.min(memIds.length, start + MAX_LINKS_PER_TOPIC);
          for (let j = start; j < end; j++) {
            if (j === i) continue;
            const strength = 0.6;
            this.memoryGraph.linkMemories(memIds[i], memIds[j], strength);
            this.linkCount++;
          }
        }
      }
    }

    console.log(`  ✓ Built ${this.linkCount} topic-based links`);
  }

  /**
   * Build temporal links (memories close in time are related)
   */
  buildTemporalLinks(memories) {
    const sortedByTime = [...memories]
      .filter(m => m.created)
      .sort((a, b) => new Date(a.created) - new Date(b.created));

    // Link nearby memories in time
    const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
    for (let i = 0; i < sortedByTime.length; i++) {
      const mem = sortedByTime[i];
      const memTime = new Date(mem.created).getTime();

      for (let j = i + 1; j < sortedByTime.length; j++) {
        const nextMem = sortedByTime[j];
        const nextTime = new Date(nextMem.created).getTime();

        if (nextTime - memTime > timeWindow) break;

        // Strength decreases with time distance
        const timeDiff = nextTime - memTime;
        const strength = 0.4 * (1 - timeDiff / timeWindow);

        if (strength > 0.05) {
          this.memoryGraph.linkMemories(mem.memory_id, nextMem.memory_id, strength);
          this.linkCount++;
        }
      }
    }

    console.log(`  ✓ Built ${this.linkCount} total temporal links`);
  }

  /**
   * Add a new memory and integrate it into the graph
   */
  addMemoryToGraph(memory) {
    const node = this.memoryGraph.addMemoryNode(memory);

    // Link to existing memories with shared topics
    if (memory.topics && memory.topics.length > 0) {
      const linkedMemories = [];
      for (const topic of memory.topics) {
        const similar = this.memoryGraph.findByTopic(topic, 5);
        linkedMemories.push(...similar);
      }

      // Link to unique similar memories
      const unique = Array.from(new Set(linkedMemories.map(m => m.memory_id)));
      for (const memId of unique) {
        this.memoryGraph.linkMemories(memory.id, memId, 0.5);
      }
    }

    return node;
  }

  /**
   * Get the built graph
   */
  getGraph() {
    return this.memoryGraph;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      loaded_memories: this.loadCount,
      created_links: this.linkCount,
      graph_stats: this.memoryGraph.getStats()
    };
  }
}

module.exports = MemoryGraphBuilder;
