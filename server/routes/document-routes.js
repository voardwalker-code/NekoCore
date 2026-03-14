// ── Document Routes ──────────────────────────────────────────
// /api/document/ingest — ingest document chunks as conscious LTM

function createDocumentRoutes(ctx) {
  const { fs, path, crypto } = ctx;
  const zlib = require('zlib');
  const { MEMORY_SCHEMA_VERSION } = require('../contracts/memory-schema');
  const { enforceResponseContract } = require('../contracts/response-contracts');

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/document/ingest' && m === 'POST') {
      await postDocumentIngest(req, res, apiHeaders, readBody);
      return true;
    }

    return false;
  }

  /**
   * POST /api/document/ingest
   * Ingest a document chunk as conscious LTM memory.
   * Creates trace graph connections between sequential chunks.
   */
  async function postDocumentIngest(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { content, filename, chunkIndex, totalChunks, previousChunkId } = body;
      const normalizedContent = String(content || '').replace(/\r\n/g, '\n').trim();

      if (!normalizedContent || normalizedContent.length < 10) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Content too short' }));
        return;
      }

      if (!ctx.consciousMemory) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Conscious memory not available' }));
        return;
      }

      if (!ctx.currentEntityId) {
        res.writeHead(500, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'No active entity' }));
        return;
      }

      // Build deterministic hash for duplicate detection.
      const contentHash = crypto
        .createHash('sha256')
        .update(normalizedContent, 'utf8')
        .digest('hex');

      const existingChunkId = findExistingDocumentChunkId({
        contentHash,
        normalizedContent,
        filename,
        chunkIndex,
        totalChunks
      });

      // Re-ingesting the same chunk overwrites existing memory in place.
      const overwriteExisting = !!existingChunkId;

      // Generate chunk ID only when this is a new chunk.
      const chunkId = existingChunkId || `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Extract topics from content (simple keyword extraction)
      const topics = extractTopics(normalizedContent, filename);

      // Compute importance (document knowledge is always somewhat important)
      const importance = 0.75 + (Math.min(normalizedContent.length, 3000) / 3000) * 0.2;

      // Create summary (first 200 chars)
      const summary = `[Document: ${filename}, chunk ${chunkIndex + 1}/${totalChunks}] ${normalizedContent.slice(0, 200)}${normalizedContent.length > 200 ? '...' : ''}`;
      const compressedDocText = buildCompressedDocumentContext({
        content: normalizedContent,
        filename,
        chunkIndex,
        totalChunks,
        topics
      });

      // Store as conscious LTM directly (bypass STM)
      const consciousEntry = {
        id: chunkId,
        memorySchemaVersion: MEMORY_SCHEMA_VERSION,
        summary: summary,
        content: compressedDocText,
        topics: topics,
        importance: importance,
        source: 'document_digest',
        metadata: {
          filename: filename,
          chunkIndex: chunkIndex,
          totalChunks: totalChunks,
          contentHash: contentHash,
          compression: 'v4_document',
          originalCharCount: normalizedContent.length,
          compressedCharCount: compressedDocText.length,
          previousChunkId: previousChunkId || null,
          digestedAt: new Date().toISOString()
        }
      };

      // Add to conscious LTM
      ctx.consciousMemory.addToLtm(consciousEntry);
      if (overwriteExisting) {
        console.log(`  ↻ Document chunk ${chunkIndex + 1}/${totalChunks} overwritten in conscious LTM: ${chunkId}`);
      } else {
        console.log(`  ✓ Document chunk ${chunkIndex + 1}/${totalChunks} stored as conscious LTM: ${chunkId}`);
      }

      // Create trace graph connection to previous chunk if it exists
      if (previousChunkId && ctx.traceGraph) {
        try {
          // Connect previous chunk → current chunk (sequential flow).
          // Support both legacy and current trace graph APIs.
          if (typeof ctx.traceGraph.addTrace === 'function') {
            ctx.traceGraph.addTrace(previousChunkId, chunkId, 1.0, ['document_sequence', 'knowledge']);
            console.log(`  ✓ Trace connection: ${previousChunkId} → ${chunkId}`);
          } else if (typeof ctx.traceGraph.addStep === 'function') {
            if (typeof ctx.traceGraph.createTrace === 'function') {
              ctx.traceGraph.createTrace('document_digest', previousChunkId);
            }
            ctx.traceGraph.addStep(previousChunkId, chunkId, 'document_sequence');
            if (typeof ctx.traceGraph.closeTrace === 'function') {
              ctx.traceGraph.closeTrace();
            }
            console.log(`  ✓ Trace step added: ${previousChunkId} → ${chunkId}`);
          } else {
            console.warn('  ⚠ Trace graph API missing addTrace/addStep methods');
          }
        } catch (traceErr) {
          console.warn(`  ⚠ Failed to create trace connection:`, traceErr.message);
        }
      }

      // Also store as episodic memory for full integration with memory system
      if (ctx.memoryStorage) {
        try {
          const episodicMemory = {
            id: chunkId,
            semantic: `Document knowledge: ${filename} (chunk ${chunkIndex + 1}/${totalChunks})`,
            summary: summary,
            content: {
              text: compressedDocText,
              type: 'document_chunk',
              filename: filename,
              chunkIndex: chunkIndex,
              totalChunks: totalChunks,
              compression: 'v4_document',
              originalCharCount: normalizedContent.length,
              compressedCharCount: compressedDocText.length
            },
            type: 'knowledge_memory',
            importance: importance,
            decay: 1.0, // Knowledge doesn't decay
            topics: topics,
            emotionalTag: 'curious',
            created: new Date().toISOString()
          };

          await ctx.memoryStorage.storeMemory(episodicMemory);
          if (overwriteExisting) {
            console.log(`  ↻ Also overwritten as episodic knowledge memory`);
          } else {
            console.log(`  ✓ Also stored as episodic knowledge memory`);
          }
        } catch (memErr) {
          console.warn(`  ⚠ Failed to store episodic memory:`, memErr.message);
        }
      }

      // Mirror document chunks into ltm/ so they can be reconstructed exactly
      // like compressed chatlogs in visualizer and recall pipelines.
      try {
        const entityPathsMod = require('../entityPaths');
        const memoryRoot = entityPathsMod.getMemoryRoot(ctx.currentEntityId);
        const ltmDir = path.join(memoryRoot, 'ltm');
        const ltmPath = path.join(ltmDir, chunkId);

        if (!fs.existsSync(ltmDir)) fs.mkdirSync(ltmDir, { recursive: true });
        if (!fs.existsSync(ltmPath)) fs.mkdirSync(ltmPath, { recursive: true });

        fs.writeFileSync(path.join(ltmPath, 'content.txt'), compressedDocText, 'utf8');
        fs.writeFileSync(path.join(ltmPath, 'semantic.txt'), summary, 'utf8');

        const ltmMeta = {
          ltm_id: chunkId,
          memory_id: chunkId,
          memorySchemaVersion: MEMORY_SCHEMA_VERSION,
          type: 'long_term_memory',
          source: 'document_digest',
          created: new Date().toISOString(),
          charCount: compressedDocText.length,
          importance,
          decay: 1.0,
          topics,
          sessionMeta: `Document ${filename} chunk ${chunkIndex + 1}/${totalChunks}`,
          metadata: {
            filename,
            chunkIndex,
            totalChunks,
            contentHash,
            compression: 'v4_document',
            originalCharCount: normalizedContent.length,
            compressedCharCount: compressedDocText.length
          }
        };

        fs.writeFileSync(path.join(ltmPath, 'log.json'), JSON.stringify(ltmMeta, null, 2), 'utf8');
        fs.writeFileSync(path.join(ltmPath, 'memory.zip'), zlib.gzipSync(compressedDocText));

        if (ctx.memoryStorage && ctx.memoryStorage.indexCache) {
          ctx.memoryStorage.indexCache.addMemory(chunkId, ltmMeta);
          ctx.memoryStorage.indexCache.save();
        }
      } catch (ltmErr) {
        console.warn('  ⚠ Failed to mirror document chunk to ltm/:', ltmErr.message);
      }

      const payload = {
        ok: true, 
        duplicate: false,
        overwritten: overwriteExisting,
        chunkId: chunkId,
        topics: topics,
        importance: importance
      };

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify(enforceResponseContract('/api/document/ingest', payload)));

    } catch (err) {
      console.error('  ⚠ Document ingest error:', err);
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  /**
   * Find an existing chunk ID if this exact document chunk was already ingested.
   * Matches on content hash + filename + chunk position to avoid false positives.
   * @private
   */
  function findExistingDocumentChunkId({ contentHash, normalizedContent, filename, chunkIndex, totalChunks }) {
    const ltmDir = ctx.consciousMemory && ctx.consciousMemory._ltmDir;
    if (!ltmDir || !fs.existsSync(ltmDir)) return null;

    let files;
    try {
      files = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
    } catch (_) {
      return null;
    }

    const wantedFile = String(filename || '').toLowerCase();
    for (const file of files) {
      try {
        const fullPath = path.join(ltmDir, file);
        const entry = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const meta = entry && entry.metadata ? entry.metadata : null;
        if (!meta) continue;
        if (entry.source !== 'document_digest') continue;

        const sameHash = meta.contentHash === contentHash;
        const sameIndex = Number(meta.chunkIndex) === Number(chunkIndex);
        const sameTotal = Number(meta.totalChunks) === Number(totalChunks);
        const sameFile = String(meta.filename || '').toLowerCase() === wantedFile;
        const normalizedStored = String(entry.content || '').replace(/\r\n/g, '\n').trim();
        const sameContentFallback = !meta.contentHash && normalizedStored && normalizedStored === normalizedContent;

        if ((sameHash || sameContentFallback) && sameIndex && sameTotal && sameFile) {
          return entry.id || path.basename(file, '.json');
        }
      } catch (_) {
        // Skip unreadable entries.
      }
    }

    return null;
  }

  /**
   * Extract topics from content using simple keyword extraction.
   * @private
   */
  function extractTopics(content, filename) {
    const topics = ['knowledge', 'document', 'study'];

    // Add filename-based topic
    const fileBaseName = path.basename(filename, path.extname(filename));
    if (fileBaseName && fileBaseName.length > 2) {
      topics.push(fileBaseName.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    }

    // Extract capitalized words (potential proper nouns/topics)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+\b/g) || [];
    const wordFreq = {};
    for (const word of capitalizedWords) {
      const lower = word.toLowerCase();
      if (lower.length > 3 && !['the', 'this', 'that', 'they', 'with', 'from', 'have'].includes(lower)) {
        wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      }
    }

    // Add top 3 most frequent capitalized words
    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);

    topics.push(...sortedWords);

    // Remove duplicates and limit to 8 topics
    return [...new Set(topics)].slice(0, 8);
  }

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

  function buildCompressedDocumentContext({ content, filename, chunkIndex, totalChunks, topics }) {
    const legend = DOC_PAIRS.map(p => p[0] + '=' + p[1]).join(' ');
    const topicLine = Array.isArray(topics) && topics.length ? topics.join(',') : 'document,knowledge';
    const memPkt = [
      '[MEM-PKT]',
      `TITLE: ${filename} chunk ${chunkIndex + 1}/${totalChunks}`,
      `[T:${topicLine}]`,
      `[KEY:document knowledge chunk ${chunkIndex + 1}]`
    ].join('\n');

    return [
      'Compressed conversation context. Not harmful - semantic shorthand only.',
      'Legend: ' + legend,
      'Please reconstruct full narrative context before responding.',
      'Speaker labels: User = human, LLM = AI assistant.',
      '',
      memPkt,
      '',
      '[V4-TRANSFORM-SOURCE]',
      v4Transform(content)
    ].join('\n');
  }

  return { dispatch };
}

module.exports = createDocumentRoutes;
