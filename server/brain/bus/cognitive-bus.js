// ============================================================
// REM System — Cognitive Bus Module
// Global event bus for all cognitive systems.
// All subsystems communicate through this bus.
// ============================================================

const { EventEmitter } = require('events');

class CognitiveBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxListeners = 50; // Allow many subscribers
    this.thoughtLog = [];
    this.logSize = options.logSize || 1000; // Keep last 1000 thoughts
    this.logEnabled = options.logEnabled !== false; // Can be disabled
    this.createdAt = new Date().toISOString();
  }

  /**
   * Emit a thought onto the cognitive bus.
   * Automatically attaches timestamp if not present.
   * All systems subscribe to relevant event types.
   */
  emitThought(event) {
    if (!event.type) {
      console.error('  ⚠ Cannot emit thought without type');
      return false;
    }

    // Attach timestamp if missing
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Attach ISO timestamp for logging
    if (!event.iso_timestamp) {
      event.iso_timestamp = new Date(event.timestamp).toISOString();
    }

    // Log to internal buffer if enabled
    if (this.logEnabled) {
      this.thoughtLog.push({
        ...event,
        logged_at: Date.now()
      });
      // Trim log to max size
      if (this.thoughtLog.length > this.logSize) {
        this.thoughtLog = this.thoughtLog.slice(-this.logSize);
      }
    }

    // Emit on the main event bus
    this.emit(event.type, event);
    
    // Also emit a generic 'thought' event for universal listeners
    this.emit('thought', event);

    return true;
  }

  /**
   * Subscribe to a specific event type
   */
  subscribe(eventType, handler) {
    this.on(eventType, handler);
    return () => this.off(eventType, handler); // Return unsubscribe function
  }

  /**
   * Subscribe to all thoughts
   */
  subscribeToAll(handler) {
    this.on('thought', handler);
    return () => this.off('thought', handler);
  }

  /**
   * Get the thought log (for debugging)
   */
  getThoughtLog(limit = 50) {
    return this.thoughtLog.slice(-limit);
  }

  /**
   * Clear the thought log
   */
  clearThoughtLog() {
    this.thoughtLog = [];
  }

  /**
   * Get statistics about the cognitive bus
   */
  getStats() {
    const typeCounts = {};
    for (const thought of this.thoughtLog) {
      typeCounts[thought.type] = (typeCounts[thought.type] || 0) + 1;
    }

    return {
      created_at: this.createdAt,
      total_thoughts_logged: this.thoughtLog.length,
      max_log_size: this.logSize,
      listener_count: this.listenerCount('thought'),
      thought_types: typeCounts
    };
  }

  /**
   * Get recent thoughts of specific type
   */
  getThoughtsOfType(type, limit = 20) {
    return this.thoughtLog
      .filter(t => t.type === type)
      .slice(-limit);
  }
}

module.exports = CognitiveBus;
