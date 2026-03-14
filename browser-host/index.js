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

module.exports = {
  name: MODULE_NAME,
  version: MODULE_VERSION,
};
