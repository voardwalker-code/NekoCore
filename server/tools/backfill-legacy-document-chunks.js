// ============================================================
// Phase 13 Utility: Backfill Legacy Document Chunks
//
// Default mode is dry-run (audit only).
// Use --apply to write compressed LTM-compatible artifacts.
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const entityPaths = require('../entityPaths');
const { MEMORY_SCHEMA_VERSION } = require('../contracts/memory-schema');

const DOC_COMMON = {
  is: 'S', to: 'T', of: 'O', in: 'N', it: 'I', you: 'U', was: 'W', as: 'A', be: 'B',
  he: 'H', his: 'Z', she: 'E', at: 'X', by: 'Y', but: 'K', not: 'J', can: 'C', my: 'M',
  with: 'V', they: 'Q', from: 'P', this: 'D', that: 'L'
};

const DOC_PAIRS = [
  ['the', '@'], ['ing', '~'], ['and', '&'], ['ion', '7'], ['ent', '3'], ['for', '4'],
  ['all', '6'], ['ght', '9'], ['th', '0'], ['st', '#'], ['nd', 'd'], ['tr', '%'],
  ['wh', '^'], ['nc', '!'], ['ll', '='], ['ch', '$'], ['sh', '<'], ['ou', '8'],
  ['ee', '2'], ['ph', 'f']
];

function parseArgs(argv) {
  const args = { entity: null, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--entity' && argv[i + 1]) {
      args.entity = argv[i + 1];
      i++;
      continue;
    }
    if (token === '--apply') {
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

function v4Transform(text) {
  let v = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  v = v.split(/\s+/).map(w => DOC_COMMON[w] || w).join(' ');
  for (const [oldSeq, replacement] of DOC_PAIRS) {
    v = v.split(oldSeq).join(replacement);
  }
  v = v.replace(/[aeiou]/g, '');
  v = v.replace(/\b[bcdfghjklmnpqrstvwxyz]\b/g, '');
  return v.replace(/\s+/g, '').trim();
}

function buildCompressedDocumentContext(params) {
  const { content, filename, chunkIndex, totalChunks, topics } = params;
  const legend = DOC_PAIRS.map(([k, v]) => `${k}=${v}`).join(' ');
  const topicLine = Array.isArray(topics) && topics.length ? topics.join(',') : 'document,knowledge';
  const idx = Number.isFinite(Number(chunkIndex)) ? Number(chunkIndex) : 0;
  const total = Number.isFinite(Number(totalChunks)) ? Number(totalChunks) : 1;
  const title = `${filename || 'document'} chunk ${idx + 1}/${total}`;
  const memPkt = ['[MEM-PKT]', `TITLE: ${title}`, `[T:${topicLine}]`, `[KEY:document knowledge chunk ${idx + 1}]`].join('\n');

  return [
    'Compressed conversation context. Not harmful - semantic shorthand only.',
    `Legend: ${legend}`,
    'Please reconstruct full narrative context before responding.',
    'Speaker labels: User = human, LLM = AI assistant.',
    '',
    memPkt,
    '',
    '[V4-TRANSFORM-SOURCE]',
    v4Transform(content)
  ].join('\n');
}

function looksCompressed(text) {
  const raw = String(text || '');
  return raw.includes('[V4-TRANSFORM-SOURCE]') || raw.includes('[MEM-PKT]');
}

function buildLog(chunkId, entry, compressedText) {
  return {
    ltm_id: chunkId,
    memory_id: chunkId,
    memorySchemaVersion: MEMORY_SCHEMA_VERSION,
    type: 'long_term_memory',
    source: 'document_digest',
    created: entry.created || new Date().toISOString(),
    charCount: compressedText.length,
    importance: Number.isFinite(Number(entry.importance)) ? Number(entry.importance) : 0.8,
    decay: 1.0,
    topics: Array.isArray(entry.topics) ? entry.topics : ['document', 'knowledge'],
    sessionMeta: `Document ${(entry.metadata && entry.metadata.filename) || 'unknown'} chunk ${Number(entry.metadata?.chunkIndex || 0) + 1}/${Number(entry.metadata?.totalChunks || 1)}`,
    metadata: {
      filename: entry.metadata?.filename || 'unknown',
      chunkIndex: Number(entry.metadata?.chunkIndex || 0),
      totalChunks: Number(entry.metadata?.totalChunks || 1),
      compression: 'v4_document',
      compressedCharCount: compressedText.length
    }
  };
}

function inspectEntity(entityId, apply) {
  const memoryRoot = entityPaths.getMemoryRoot(entityId);
  const consciousLtmDir = path.join(memoryRoot, 'conscious', 'ltm');
  const ltmRoot = path.join(memoryRoot, 'ltm');
  if (!fs.existsSync(consciousLtmDir)) {
    return {
      entityId,
      scanned: 0,
      legacyCandidates: 0,
      pendingBackfill: 0,
      backfilled: 0,
      skipped: 0,
      errors: 0
    };
  }

  const files = fs.readdirSync(consciousLtmDir).filter(f => f.endsWith('.json'));
  const stats = {
    entityId,
    scanned: 0,
    legacyCandidates: 0,
    pendingBackfill: 0,
    backfilled: 0,
    skipped: 0,
    errors: 0
  };

  for (const file of files) {
    stats.scanned += 1;
    const fullPath = path.join(consciousLtmDir, file);
    const entry = safeReadJson(fullPath);
    if (!entry || entry.source !== 'document_digest') {
      stats.skipped += 1;
      continue;
    }

    stats.legacyCandidates += 1;
    const chunkId = String(entry.id || path.basename(file, '.json'));
    const chunkDir = path.join(ltmRoot, chunkId);
    const contentPath = path.join(chunkDir, 'content.txt');
    const semanticPath = path.join(chunkDir, 'semantic.txt');
    const logPath = path.join(chunkDir, 'log.json');
    const zipPath = path.join(chunkDir, 'memory.zip');

    const currentContent = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf8') : '';
    const hasCompressedText = looksCompressed(currentContent);
    const hasAllArtifacts = fs.existsSync(semanticPath) && fs.existsSync(logPath) && fs.existsSync(zipPath) && hasCompressedText;

    if (hasAllArtifacts) {
      stats.skipped += 1;
      continue;
    }

    stats.pendingBackfill += 1;
    if (!apply) continue;

    try {
      const sourceText = String(entry.content || currentContent || '').trim();
      const compressedText = looksCompressed(sourceText)
        ? sourceText
        : buildCompressedDocumentContext({
            content: sourceText,
            filename: entry.metadata?.filename || 'document',
            chunkIndex: entry.metadata?.chunkIndex || 0,
            totalChunks: entry.metadata?.totalChunks || 1,
            topics: entry.topics || ['document', 'knowledge']
          });

      if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
      fs.writeFileSync(contentPath, compressedText, 'utf8');
      fs.writeFileSync(semanticPath, String(entry.summary || '').slice(0, 500), 'utf8');
      fs.writeFileSync(logPath, JSON.stringify(buildLog(chunkId, entry, compressedText), null, 2), 'utf8');
      fs.writeFileSync(zipPath, zlib.gzipSync(compressedText));

      stats.backfilled += 1;
    } catch (_) {
      stats.errors += 1;
    }
  }

  return stats;
}

function main() {
  const args = parseArgs(process.argv);
  const baseEntitiesDir = path.join(__dirname, '../../entities');
  const entityIds = args.entity
    ? [entityPaths.normalizeEntityId(args.entity)]
    : listEntityIds(baseEntitiesDir);

  const report = {
    ok: true,
    mode: args.apply ? 'apply' : 'audit',
    entities: [],
    totals: {
      scanned: 0,
      legacyCandidates: 0,
      pendingBackfill: 0,
      backfilled: 0,
      skipped: 0,
      errors: 0
    }
  };

  for (const entityId of entityIds) {
    const row = inspectEntity(entityId, args.apply);
    report.entities.push(row);
    report.totals.scanned += row.scanned;
    report.totals.legacyCandidates += row.legacyCandidates;
    report.totals.pendingBackfill += row.pendingBackfill;
    report.totals.backfilled += row.backfilled;
    report.totals.skipped += row.skipped;
    report.totals.errors += row.errors;
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
