const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class TimelineLogger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseDir = options.baseDir || path.join(process.cwd(), 'memories');
    this.maxString = Number(options.maxString || 2000);
    this.maxObjectKeys = Number(options.maxObjectKeys || 80);
    this.maxArrayItems = Number(options.maxArrayItems || 80);
    this._seq = 0;
    this._entityResolver = null;
  }

  setEntityResolver(fn) {
    this._entityResolver = typeof fn === 'function' ? fn : null;
  }

  logEvent(type, payload = {}, options = {}) {
    try {
      const now = Date.now();
      const iso = new Date(now).toISOString();
      const seq = ++this._seq;

      const scope = this._resolveScope(options.entityId || null);
      const record = {
        seq,
        ts: now,
        iso,
        entityId: scope.entityId || null,
        type: String(type || 'unknown'),
        payload: this._sanitize(payload)
      };

      const line = JSON.stringify(record) + '\n';
      const filePath = this._getTimelinePath(scope);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.appendFileSync(filePath, line, 'utf8');
      this.emit('timeline', record);
      return { ok: true, filePath, seq };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  getTimelinePath(options = {}) {
    const scope = this._resolveScope(options.entityId || null);
    return this._getTimelinePath(scope);
  }

  readRecent(options = {}) {
    const limit = Math.max(1, Number(options.limit) || 200);
    const typePrefix = options.typePrefix ? String(options.typePrefix) : '';
    const contains = options.contains ? String(options.contains).toLowerCase() : '';
    const filePath = this.getTimelinePath({ entityId: options.entityId || null });
    if (!fs.existsSync(filePath)) {
      return { ok: true, filePath, records: [] };
    }

    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split('\n').filter(Boolean);
    const out = [];

    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      const line = lines[i];
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (typePrefix && !String(rec.type || '').startsWith(typePrefix)) continue;
      if (contains) {
        const hay = JSON.stringify(rec).toLowerCase();
        if (!hay.includes(contains)) continue;
      }
      out.push(rec);
    }

    out.reverse();
    return { ok: true, filePath, records: out };
  }

  _resolveScope(explicitEntityId) {
    if (explicitEntityId) {
      return {
        entityId: explicitEntityId,
        rootDir: null
      };
    }

    if (this._entityResolver) {
      try {
        const resolved = this._entityResolver();
        if (resolved && typeof resolved === 'object') {
          return {
            entityId: resolved.entityId || null,
            rootDir: resolved.rootDir || null
          };
        }
      } catch (_) {}
    }

    return { entityId: null, rootDir: null };
  }

  _getTimelinePath(scope) {
    if (scope.rootDir) {
      return path.join(scope.rootDir, 'logs', 'timeline.ndjson');
    }

    if (scope.entityId) {
      return path.join(this.baseDir, 'logs', `timeline-${scope.entityId}.ndjson`);
    }

    return path.join(this.baseDir, 'logs', 'timeline-system.ndjson');
  }

  _sanitize(value, depth = 0) {
    if (value == null) return value;
    if (depth > 5) return '[max-depth]';

    const t = typeof value;
    if (t === 'number' || t === 'boolean') return value;
    if (t === 'string') {
      return value.length > this.maxString ? value.slice(0, this.maxString) : value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, this.maxArrayItems).map((v) => this._sanitize(v, depth + 1));
    }

    if (t === 'object') {
      const out = {};
      const keys = Object.keys(value).slice(0, this.maxObjectKeys);
      for (const k of keys) {
        out[k] = this._sanitize(value[k], depth + 1);
      }
      return out;
    }

    return String(value);
  }
}

module.exports = TimelineLogger;
