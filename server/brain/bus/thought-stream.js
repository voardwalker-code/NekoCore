// ============================================================
// REM System — Thought Stream Debug Console Module
// Visualizes all thoughts flowing through the cognitive bus.
// ============================================================

const ThoughtTypes = require('./thought-types');

class ThoughtStream {
  constructor(options = {}) {
    this.cognitiveBus = options.cognitiveBus;
    this.maxDisplaySize = options.maxDisplaySize || 100;
    this.displayThoughts = [];
    this.filterTypes = options.filterTypes || null; // null = show all
    this.colorEnabled = options.colorEnabled !== false;
    this.startTime = Date.now();
  }

  /**
   * Start listening to the cognitive bus
   */
  start() {
    if (!this.cognitiveBus) {
      console.warn('  ⚠ Thought stream requires cognitive bus');
      return;
    }

    this.cognitiveBus.subscribeToAll((thought) => {
      this.processThought(thought);
    });

    console.log('  ✓ Thought stream debug console active');
  }

  /**
   * Process and log a thought
   */
  processThought(thought) {
    // Filter by type if specified
    if (this.filterTypes && !this.filterTypes.includes(thought.type)) {
      return;
    }

    // Add to display buffer
    this.displayThoughts.push({
      ...thought,
      display_id: this.displayThoughts.length
    });

    // Trim to max size
    if (this.displayThoughts.length > this.maxDisplaySize) {
      this.displayThoughts.shift();
    }

    // Print to console
    this.printThought(thought);
  }

  /**
   * Print a formatted thought to console
   */
  printThought(thought) {
    const timestamp = new Date(thought.timestamp || Date.now()).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const color = this.getColorForType(thought.type);
    const resetColor = '\x1b[0m';

    // Importance indicator
    const importance = thought.importance !== undefined ? thought.importance : '?';
    const importanceBars = this.drawBars(importance, 5);

    // Source
    const source = (thought.source || 'unknown').padEnd(20);

    // Type
    const type = (thought.type).padEnd(25);

    // Summary
    let summary = '';
    if (thought.question) {
      summary = thought.question.substring(0, 40);
    } else if (thought.message) {
      summary = thought.message.substring(0, 40);
    } else if (thought.content) {
      summary = thought.content.substring(0, 40);
    }

    // Format output
    console.log(
      `${color}[${timestamp}] ${importanceBars} ${type} ${source} ${summary}${resetColor}`
    );
  }

  /**
   * Get color code for thought type
   */
  getColorForType(type) {
    if (!this.colorEnabled) return '';

    const colorMap = {
      [ThoughtTypes.USER_PROMPT]: '\x1b[36m',        // Cyan
      [ThoughtTypes.MEMORY_QUERY]: '\x1b[33m',       // Yellow
      [ThoughtTypes.MEMORY_RESULTS]: '\x1b[32m',     // Green
      [ThoughtTypes.STORE_MEMORY]: '\x1b[32m',       // Green
      [ThoughtTypes.DREAM_EVENT]: '\x1b[35m',        // Magenta
      [ThoughtTypes.INTERNAL_THOUGHT]: '\x1b[37m',   // White
      [ThoughtTypes.ATTENTION_FOCUS]: '\x1b[31m',    // Red
      [ThoughtTypes.CURIOSITY_TRIGGER]: '\x1b[34m',  // Blue
      [ThoughtTypes.GOAL_EMERGED]: '\x1b[33m',       // Yellow
      [ThoughtTypes.SYSTEM_LOG]: '\x1b[37m',         // White
      [ThoughtTypes.SYSTEM_ERROR]: '\x1b[91m'        // Bright Red
    };

    return colorMap[type] || '\x1b[37m'; // Default white
  }

  /**
   * Draw importance as bars
   */
  drawBars(value, maxBars) {
    const filledBars = Math.round(value * maxBars);
    const filled = '█'.repeat(filledBars);
    const empty = '░'.repeat(maxBars - filledBars);
    return `[${filled}${empty}]`;
  }

  /**
   * Filter to specific thought types
   */
  setFilter(types) {
    this.filterTypes = types;
    console.log(`  ✓ Filter set to: ${types.join(', ')}`);
  }

  /**
   * Clear the filter
   */
  clearFilter() {
    this.filterTypes = null;
    console.log('  ✓ Filter cleared');
  }

  /**
   * Get recent thoughts
   */
  getRecent(limit = 20) {
    return this.displayThoughts.slice(-limit);
  }

  /**
   * Get thoughts of specific type
   */
  getByType(type, limit = 20) {
    return this.displayThoughts
      .filter(t => t.type === type)
      .slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const typeCounts = {};
    let totalImportance = 0;

    for (const thought of this.displayThoughts) {
      typeCounts[thought.type] = (typeCounts[thought.type] || 0) + 1;
      if (thought.importance) totalImportance += thought.importance;
    }

    const uptime = Date.now() - this.startTime;

    return {
      uptime_ms: uptime,
      uptime_minutes: Math.round(uptime / 60000),
      thoughts_seen: this.displayThoughts.length,
      average_importance: totalImportance / Math.max(this.displayThoughts.length, 1),
      type_breakdown: typeCounts,
      filter_active: this.filterTypes !== null,
      filter: this.filterTypes
    };
  }

  /**
   * Print the current state
   */
  printStats() {
    const stats = this.getStats();
    console.log('\n╔════════ THOUGHT STREAM STATS ════════╗');
    console.log(`║ Uptime: ${String(stats.uptime_minutes).padEnd(30)}║`);
    console.log(`║ Thoughts Seen: ${String(stats.thoughts_seen).padEnd(22)}║`);
    console.log(`║ Avg Importance: ${String(stats.average_importance.toFixed(2)).padEnd(20)}║`);
    console.log('╠══════════════════════════════════════╣');

    // Top 5 types
    const topTypes = Object.entries(stats.type_breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [type, count] of topTypes) {
      console.log(`║ ${String(type).substring(0, 20).padEnd(20)} ${String(count).padStart(13)} │`);
    }

    console.log('╚══════════════════════════════════════╝\n');
  }

  /**
   * Export thought log as JSON
   */
  exportLog() {
    return JSON.stringify(this.displayThoughts, null, 2);
  }

  /**
   * Clear display buffer
   */
  clear() {
    this.displayThoughts = [];
    console.log('  ✓ Thought stream cleared');
  }
}

module.exports = ThoughtStream;
