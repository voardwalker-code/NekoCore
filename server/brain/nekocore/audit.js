// ── NekoCore Audit Log ────────────────────────────────────────────────────────
// Append-only NDJSON audit trail for NekoCore governance actions.
// Records every recommendation request and every approval/rejection.
//
// File: server/data/nekocore-audit.ndjson
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs   = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '..', '..', '..', 'server', 'data', 'nekocore-audit.ndjson');

/**
 * Append a governance action record to the audit log.
 * Non-fatal — write errors are swallowed (audit is best-effort, never crashes the server).
 *
 * Recommended fields:
 *   event           — 'recommendation' | 'approval' | 'rejection'
 *   requestor       — who triggered the action (e.g. 'system', userId string)
 *   targetEntityId  — entity the model change targets
 *   targetAspect    — pipeline aspect ('subconscious' | 'conscious' | 'dream' | 'orchestrator')
 *   beforeModel     — current model before any change
 *   afterModel      — new model (approval only)
 *   recommendationId — short unique ID linking recommend → apply
 *   decision        — 'pending' | 'approved' | 'rejected'
 *   notes           — free-text rationale or risk note
 *   diffusionFlag   — true if selected model is a diffusion LLM with sensitivity warnings
 */
function appendAuditRecord(record) {
  try {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...record
    }) + '\n';
    fs.appendFileSync(AUDIT_FILE, line, 'utf8');
  } catch (_) {
    // Non-critical — never crash the server over audit failures
  }
}

/**
 * Read all audit records. Returns an array (newest last).
 * Returns empty array if the file does not exist or is unreadable.
 */
function readAuditRecords() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    return fs.readFileSync(AUDIT_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

module.exports = { appendAuditRecord, readAuditRecords, AUDIT_FILE };
