// ============================================================
// Phase 13 Utility: Legacy Memory Audit and Optional Backfill
//
// Default mode is dry-run audit (no writes).
// Use --apply to write schema-version backfills.
// ============================================================

const fs = require('fs');
const path = require('path');
const entityPaths = require('../entities/entityPaths');
const { MEMORY_SCHEMA_VERSION, normalizeMemoryRecord } = require('../contracts/memory-schema');

function parseArgs(argv) {
  const args = { entity: null, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--entity' && argv[i + 1]) {
      args.entity = argv[i + 1];
      i++;
    } else if (token === '--apply') {
      args.apply = true;
    }
  }
  return args;
}

function listEntityIds(baseEntitiesDir) {
  if (!fs.existsSync(baseEntitiesDir)) return [];
  return fs.readdirSync(baseEntitiesDir)
    .filter(name => name.startsWith('entity_'))
    .filter(name => {
      try {
        return fs.statSync(path.join(baseEntitiesDir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .map(name => name.replace(/^entity_/, ''));
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function auditMemoryLogFile(filePath, apply) {
  const json = safeReadJson(filePath);
  if (!json) {
    return { scanned: 1, invalidJson: 1, missingSchema: 0, patched: 0 };
  }

  const hasSchema = Number.isFinite(Number(json.memorySchemaVersion));
  if (hasSchema) {
    return { scanned: 1, invalidJson: 0, missingSchema: 0, patched: 0 };
  }

  if (apply) {
    const normalized = normalizeMemoryRecord(json, {
      defaultId: json.memory_id || '',
      defaultType: json.type || 'episodic'
    });
    const merged = Object.assign({}, json, normalized);
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
    return { scanned: 1, invalidJson: 0, missingSchema: 1, patched: 1 };
  }

  return { scanned: 1, invalidJson: 0, missingSchema: 1, patched: 0 };
}

function auditConsciousLtmFile(filePath, apply) {
  const json = safeReadJson(filePath);
  if (!json) {
    return { scanned: 1, invalidJson: 1, missingSchema: 0, patched: 0 };
  }
  const hasSchema = Number.isFinite(Number(json.memorySchemaVersion));
  if (hasSchema) {
    return { scanned: 1, invalidJson: 0, missingSchema: 0, patched: 0 };
  }

  if (apply) {
    const merged = Object.assign({}, json, { memorySchemaVersion: MEMORY_SCHEMA_VERSION });
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
    return { scanned: 1, invalidJson: 0, missingSchema: 1, patched: 1 };
  }

  return { scanned: 1, invalidJson: 0, missingSchema: 1, patched: 0 };
}

function runEntityAudit(entityId, apply) {
  const memoryRoot = entityPaths.getMemoryRoot(entityId);
  const out = {
    entityId,
    memoryRoot,
    scanned: 0,
    invalidJson: 0,
    missingSchema: 0,
    patched: 0
  };

  const tierDirs = ['episodic', 'semantic', 'ltm'];
  for (const tier of tierDirs) {
    const tierPath = path.join(memoryRoot, tier);
    if (!fs.existsSync(tierPath)) continue;

    const memIds = fs.readdirSync(tierPath)
      .filter(name => {
        try { return fs.statSync(path.join(tierPath, name)).isDirectory(); }
        catch { return false; }
      });

    for (const memId of memIds) {
      const logPath = path.join(tierPath, memId, 'log.json');
      if (!fs.existsSync(logPath)) continue;
      const result = auditMemoryLogFile(logPath, apply);
      out.scanned += result.scanned;
      out.invalidJson += result.invalidJson;
      out.missingSchema += result.missingSchema;
      out.patched += result.patched;
    }
  }

  const consciousLtmDir = path.join(memoryRoot, 'conscious', 'ltm');
  if (fs.existsSync(consciousLtmDir)) {
    const files = fs.readdirSync(consciousLtmDir).filter(name => name.endsWith('.json'));
    for (const file of files) {
      const result = auditConsciousLtmFile(path.join(consciousLtmDir, file), apply);
      out.scanned += result.scanned;
      out.invalidJson += result.invalidJson;
      out.missingSchema += result.missingSchema;
      out.patched += result.patched;
    }
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const baseEntitiesDir = path.join(__dirname, '../../entities');
  const entityIds = args.entity
    ? [entityPaths.normalizeEntityId(args.entity)]
    : listEntityIds(baseEntitiesDir);

  if (entityIds.length === 0) {
    console.log(JSON.stringify({ ok: true, message: 'No entities found', mode: args.apply ? 'apply' : 'audit' }, null, 2));
    return;
  }

  const report = {
    ok: true,
    mode: args.apply ? 'apply' : 'audit',
    targetSchemaVersion: MEMORY_SCHEMA_VERSION,
    entities: [],
    totals: { scanned: 0, invalidJson: 0, missingSchema: 0, patched: 0 }
  };

  for (const entityId of entityIds) {
    const entityReport = runEntityAudit(entityId, args.apply);
    report.entities.push(entityReport);
    report.totals.scanned += entityReport.scanned;
    report.totals.invalidJson += entityReport.invalidJson;
    report.totals.missingSchema += entityReport.missingSchema;
    report.totals.patched += entityReport.patched;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
