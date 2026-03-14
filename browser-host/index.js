'use strict';

/**
 * NekoCore Browser Host — entry point.
 *
 * Owns: embedded-engine runtime lifecycle, window/tab primitives,
 *       navigation execution, and host event emission.
 * Must NOT contain: REM memory writes, entity orchestration, or route handlers.
 */

const MODULE_NAME = '@nekocore/browser-host';
const MODULE_VERSION = '0.0.1';

const eventBus         = require('./event-bus');
const tabModel         = require('./tab-model');
const navigation       = require('./navigation');
const lifecycle        = require('./lifecycle');
const downloadManager  = require('./download-manager');
const historyStore     = require('./history-store');
const bookmarkStore    = require('./bookmark-store');
const sessionStore     = require('./session-store');
const settingsStore    = require('./settings-store');

module.exports = {
  name: MODULE_NAME,
  version: MODULE_VERSION,
  eventBus,
  tabModel,
  navigation,
  lifecycle,
  downloadManager,
  historyStore,
  bookmarkStore,
  sessionStore,
  settingsStore,
};
