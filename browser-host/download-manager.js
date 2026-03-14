'use strict';

/**
 * NekoCore Browser Host — Download Manager (NB-2-4)
 *
 * Owns: download tracking with start/progress/complete/failure events.
 * Emits: browser.download.state events via the browser event bus.
 */

const crypto = require('crypto');
const eventBus = require('./event-bus');

/** @type {Map<string, object>} downloadId → state */
const downloads = new Map();

function _makeDownloadId() {
  return 'dl_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Register a new download.
 * Returns downloadId for correlation.
 */
function startDownload({ url, filename, tabId }) {
  const downloadId = _makeDownloadId();
  const dl = {
    downloadId,
    url,
    filename: filename || url.split('/').pop() || 'download',
    tabId: tabId || null,
    state: 'started',
    bytesReceived: 0,
    totalBytes: -1,
    startedAt: Date.now(),
    completedAt: null,
    error: null,
  };
  downloads.set(downloadId, dl);
  eventBus.emit('browser.download.state', { downloadId, state: 'started', url: dl.url, filename: dl.filename, tabId: dl.tabId });
  return dl;
}

function completeDownload(downloadId, { totalBytes } = {}) {
  const dl = downloads.get(downloadId);
  if (!dl) return null;
  dl.state = 'completed';
  dl.completedAt = Date.now();
  if (totalBytes != null) dl.totalBytes = totalBytes;
  dl.bytesReceived = dl.totalBytes;
  eventBus.emit('browser.download.state', { downloadId, state: 'completed', filename: dl.filename, totalBytes: dl.totalBytes });
  return dl;
}

function failDownload(downloadId, error) {
  const dl = downloads.get(downloadId);
  if (!dl) return null;
  dl.state = 'failed';
  dl.completedAt = Date.now();
  dl.error = error || 'Unknown error';
  eventBus.emit('browser.download.state', { downloadId, state: 'failed', filename: dl.filename, error: dl.error });
  return dl;
}

function getDownload(downloadId) {
  return downloads.get(downloadId) || null;
}

function getAllDownloads() {
  return Array.from(downloads.values());
}

/** Reset (for testing). */
function reset() {
  downloads.clear();
}

module.exports = { startDownload, completeDownload, failDownload, getDownload, getAllDownloads, reset };
