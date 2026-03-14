'use strict';

/**
 * NekoCore Browser Host — Event Bus
 *
 * Lightweight pub/sub for browser host events.
 * Keeps event emission decoupled from host internals.
 */

const { EventEmitter } = require('events');

class BrowserEventBus extends EventEmitter {
  emit(channel, payload) {
    const stamped = { ...payload, timestamp: payload.timestamp || Date.now() };
    super.emit(channel, stamped);
    super.emit('*', { channel, ...stamped });
    return true;
  }
}

module.exports = new BrowserEventBus();
