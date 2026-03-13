// ============================================================
// REM System — Dream Seed Pool
// A ring buffer of interrupted pulse thoughts that the dream
// engine drains before falling back to random memory selection.
// When the brain-loop interrupts the cognitive pulse, the last
// visited memory node is pushed here so dreams stay personally
// meaningful — reflecting what the entity was actually thinking.
// ============================================================

class DreamSeedPool {
  /**
   * @param {number} capacity — max seeds held before oldest is evicted (default 20)
   */
  constructor(capacity = 20) {
    this.capacity = capacity;
    this._pool = [];
  }

  /**
   * Push a pulse node into the pool.
   * Evicts the oldest entry when capacity is exceeded.
   * @param {Object} memory — pulse node: { nodeId, title, timestamp, hopCount, path, ... }
   */
  push(memory) {
    if (!memory) return;
    this._pool.push(memory);
    if (this._pool.length > this.capacity) {
      this._pool.shift();
    }
  }

  /**
   * Drain all seeds from the pool and return them.
   * Pool is empty after this call.
   * @returns {Object[]}
   */
  drain() {
    const seeds = this._pool.slice();
    this._pool = [];
    return seeds;
  }

  /**
   * Peek at current pool contents without consuming them.
   * @returns {Object[]}
   */
  peek() {
    return this._pool.slice();
  }

  /** Current number of seeds in the pool. */
  get size() {
    return this._pool.length;
  }
}

module.exports = DreamSeedPool;
