'use strict';

/**
 * NekoCore Browser Host — Lifecycle Controller (NB-2-4)
 *
 * Owns: host-level lifecycle states and tab lifecycle relay.
 * Emits: browser.host.lifecycle events via the browser event bus.
 *
 * Host states: host_starting → host_ready → host_closing
 * Tab states relayed from tab-model: tab_created, tab_navigating, tab_ready, tab_closed
 */

const eventBus = require('./event-bus');

const VALID_HOST_STATES = ['host_starting', 'host_ready', 'host_closing'];
let _hostState = null;

function setHostState(state) {
  if (!VALID_HOST_STATES.includes(state)) {
    throw new Error(`Invalid host state: ${state}`);
  }
  _hostState = state;
  eventBus.emit('browser.host.lifecycle', { state });
}

function getHostState() {
  return _hostState;
}

function startup() {
  setHostState('host_starting');
  // In a real engine integration, async init happens here.
  setHostState('host_ready');
}

function shutdown() {
  setHostState('host_closing');
  _hostState = null;
}

/** Reset (for testing). */
function reset() {
  _hostState = null;
}

module.exports = { startup, shutdown, setHostState, getHostState, reset };
