// ── VFS Routes ────────────────────────────────────────────────
// /api/vfs/* — Server-side Virtual File System for the shared workspace
//
// The workspace lives at PROJECT_ROOT/workspace/
// Virtual paths like "/desktop/foo.txt" map to workspace/desktop/foo.txt
// Metadata (pos, fileExt, type, launchTab) is stored in .nekoMeta.json
// sidecar files inside each directory.

function createVfsRoutes(ctx) {
  const { fs, path } = ctx;
  const PROJECT_ROOT = path.join(__dirname, '..', '..');
  const WORKSPACE_DIR = path.join(PROJECT_ROOT, 'workspace');
  const META_FILENAME = '.nekoMeta.json';

  // ── Ensure workspace/desktop exists on startup ──────────────────────────────
  try {
    fs.mkdirSync(path.join(WORKSPACE_DIR, 'desktop'), { recursive: true });
  } catch (_) {}

  // ── Deduplication helper ─────────────────────────────────────────────────────

  /**
   * If `dedup` is true and the target name already exists in `parentAbs`,
   * appends " (2)", " (3)", etc. before the extension until a free name is found.
   * Returns the final (possibly modified) name.
   */
  function deduplicateName(parentAbs, name) {
    if (!fs.existsSync(path.join(parentAbs, name))) return name;
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    for (let i = 2; i < 1000; i++) {
      const candidate = base + ' (' + i + ')' + ext;
      if (!fs.existsSync(path.join(parentAbs, candidate))) return candidate;
    }
    return base + '-' + Date.now() + ext;
  }

  // ── Path helpers ─────────────────────────────────────────────────────────────

  /**
   * Convert a virtual path like "/desktop/foo.txt" to an absolute OS path
   * inside WORKSPACE_DIR with path-traversal protection.
   * Returns null if the resolved path escapes the workspace.
   */
  function toAbsPath(virtualPath) {
    // Remove leading slash, then resolve against WORKSPACE_DIR
    const relative = String(virtualPath || '').replace(/^\/+/, '');
    const abs = path.resolve(WORKSPACE_DIR, relative);
    // Ensure the resolved path starts with WORKSPACE_DIR (prevent traversal)
    const base = WORKSPACE_DIR.endsWith(path.sep) ? WORKSPACE_DIR : WORKSPACE_DIR + path.sep;
    if (abs !== WORKSPACE_DIR && !abs.startsWith(base)) return null;
    return abs;
  }

  /**
   * Convert an absolute OS path back to a virtual path like "/desktop/foo.txt".
   */
  function toVirtPath(absPath) {
    return '/' + path.relative(WORKSPACE_DIR, absPath).replace(/\\/g, '/');
  }

  // ── Metadata sidecar helpers ─────────────────────────────────────────────────

  function readMeta(dirAbsPath) {
    const metaFile = path.join(dirAbsPath, META_FILENAME);
    if (!fs.existsSync(metaFile)) return {};
    try { return JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch (_) { return {}; }
  }

  function writeMeta(dirAbsPath, meta) {
    const metaFile = path.join(dirAbsPath, META_FILENAME);
    try { fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8'); } catch (_) {}
  }

  function getEntryMeta(dirAbsPath, name) {
    return readMeta(dirAbsPath)[name] || {};
  }

  function setEntryMeta(dirAbsPath, name, patch) {
    const meta = readMeta(dirAbsPath);
    meta[name] = Object.assign(meta[name] || {}, patch);
    writeMeta(dirAbsPath, meta);
  }

  function deleteEntryMeta(dirAbsPath, name) {
    const meta = readMeta(dirAbsPath);
    delete meta[name];
    writeMeta(dirAbsPath, meta);
  }

  function renameEntryMeta(dirAbsPath, oldName, newName) {
    const meta = readMeta(dirAbsPath);
    if (meta[oldName]) {
      meta[newName] = meta[oldName];
      delete meta[oldName];
      writeMeta(dirAbsPath, meta);
    }
  }

  // ── Route handlers ───────────────────────────────────────────────────────────

  /**
   * GET /api/vfs/list?path=/desktop
   * Returns array of { name, path, type, size?, modified, ...meta }
   */
  function getList(req, res, apiHeaders, url) {
    const virtualPath = url.searchParams.get('path') || '/desktop';
    const absPath = toAbsPath(virtualPath);
    if (!absPath) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: 'Invalid path' }));
      return;
    }
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
      res.writeHead(404, apiHeaders);
      res.end(JSON.stringify({ error: 'Directory not found' }));
      return;
    }

    const meta = readMeta(absPath);
    try {
      const names = fs.readdirSync(absPath).filter(n => n !== META_FILENAME);
      const entries = names.map(name => {
        const childAbs = path.join(absPath, name);
        let stat;
        try { stat = fs.statSync(childAbs); } catch (_) { return null; }
        const isDir = stat.isDirectory();
        const entryMeta = meta[name] || {};
        // Derive fileExt from filename extension when not stored in metadata
        const derivedExt = isDir ? undefined : (path.extname(name).slice(1) || undefined);
        return Object.assign({
          name: name,
          path: toVirtPath(childAbs),
          type: isDir ? 'folder' : (entryMeta.type || 'file'),
          size: isDir ? undefined : stat.size,
          modified: stat.mtimeMs,
          fileExt: derivedExt
        }, entryMeta);
      }).filter(Boolean);

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entries }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * GET /api/vfs/stat?path=/desktop/foo.txt
   * Returns { name, path, type, size?, modified, ...meta }
   */
  function getStat(req, res, apiHeaders, url) {
    const virtualPath = url.searchParams.get('path') || '';
    const absPath = toAbsPath(virtualPath);
    if (!absPath) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: 'Invalid path' }));
      return;
    }
    if (!fs.existsSync(absPath)) {
      res.writeHead(404, apiHeaders);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    try {
      const stat = fs.statSync(absPath);
      const isDir = stat.isDirectory();
      const parentAbs = path.dirname(absPath);
      const name = path.basename(absPath);
      const entryMeta = getEntryMeta(parentAbs, name);
      const entry = Object.assign({
        name: name,
        path: toVirtPath(absPath),
        type: isDir ? 'folder' : (entryMeta.type || 'file'),
        size: isDir ? undefined : stat.size,
        modified: stat.mtimeMs
      }, entryMeta);

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, entry }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * GET /api/vfs/read?path=/desktop/foo.txt
   * Returns file contents as plain text.
   */
  function getRead(req, res, apiHeaders, url) {
    const virtualPath = url.searchParams.get('path') || '';
    const absPath = toAbsPath(virtualPath);
    if (!absPath) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: 'Invalid path' }));
      return;
    }
    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
      res.writeHead(404, apiHeaders);
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      res.writeHead(200, Object.assign({}, apiHeaders, { 'Content-Type': 'text/plain; charset=utf-8' }));
      res.end(content);
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * POST /api/vfs/write
   * Body: { path: "/desktop/foo.txt", content: "..." }
   * Creates or overwrites the file. Parent directory must exist.
   */
  async function postWrite(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const content = typeof body.content === 'string' ? body.content : '';
      let absPath = toAbsPath(body.path);
      if (!absPath) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      const parentAbs = path.dirname(absPath);
      if (!fs.existsSync(parentAbs)) fs.mkdirSync(parentAbs, { recursive: true });
      // Deduplication: if requested and path already exists, pick a free name
      if (body.dedup) {
        const freeName = deduplicateName(parentAbs, path.basename(absPath));
        absPath = path.join(parentAbs, freeName);
      }
      fs.writeFileSync(absPath, content, 'utf8');
      if (body.meta) {
        const name = path.basename(absPath);
        setEntryMeta(parentAbs, name, body.meta);
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, path: toVirtPath(absPath) }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * POST /api/vfs/mkdir
   * Body: { path: "/desktop/MyFolder" }
   */
  async function postMkdir(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      let absPath = toAbsPath(body.path);
      if (!absPath) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      // Deduplication: if requested and directory already exists, pick a free name
      if (body.dedup) {
        const parentAbs = path.dirname(absPath);
        const freeName = deduplicateName(parentAbs, path.basename(absPath));
        absPath = path.join(parentAbs, freeName);
      }
      fs.mkdirSync(absPath, { recursive: true });
      if (body.meta) {
        const parentAbs = path.dirname(absPath);
        const name = path.basename(absPath);
        setEntryMeta(parentAbs, name, Object.assign({ type: 'folder' }, body.meta));
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, path: toVirtPath(absPath) }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * POST /api/vfs/move
   * Body: { from: "/desktop/OldName", to: "/desktop/NewName" }
   */
  async function postMove(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const fromAbs = toAbsPath(body.from);
      const toAbs = toAbsPath(body.to);
      if (!fromAbs || !toAbs) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      if (!fs.existsSync(fromAbs)) {
        res.writeHead(404, apiHeaders);
        res.end(JSON.stringify({ error: 'Source not found' }));
        return;
      }
      const toParentAbs = path.dirname(toAbs);
      if (!fs.existsSync(toParentAbs)) fs.mkdirSync(toParentAbs, { recursive: true });
      fs.renameSync(fromAbs, toAbs);
      // Migrate metadata from old name to new name (same-directory rename only)
      const fromParentAbs = path.dirname(fromAbs);
      if (fromParentAbs === toParentAbs) {
        renameEntryMeta(fromParentAbs, path.basename(fromAbs), path.basename(toAbs));
      } else {
        // Cross-directory move: copy meta to new dir, delete from old
        const oldName = path.basename(fromAbs);
        const newName = path.basename(toAbs);
        const oldMeta = getEntryMeta(fromParentAbs, oldName);
        deleteEntryMeta(fromParentAbs, oldName);
        if (Object.keys(oldMeta).length) setEntryMeta(toParentAbs, newName, oldMeta);
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, path: toVirtPath(toAbs) }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * POST /api/vfs/delete
   * Body: { path: "/desktop/foo.txt" }
   * (Using POST instead of DELETE to avoid Body-in-DELETE parsing quirks)
   */
  async function postDelete(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const virtualPath = body.path;
      if (!virtualPath || virtualPath === '/desktop' || virtualPath === '/') {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Cannot delete root or protected paths' }));
        return;
      }
      const absPath = toAbsPath(virtualPath);
      if (!absPath) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      if (!fs.existsSync(absPath)) {
        res.writeHead(200, apiHeaders); // Idempotent
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      fs.rmSync(absPath, { recursive: true, force: true });
      // Remove metadata entry from parent
      const parentAbs = path.dirname(absPath);
      deleteEntryMeta(parentAbs, path.basename(absPath));
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  /**
   * POST /api/vfs/meta
   * Body: { path: "/desktop/foo.txt", meta: { pos: {x,y}, fileExt: "txt", ... } }
   * Merges the meta patch into the sidecar for this entry.
   */
  async function postMeta(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const absPath = toAbsPath(body.path);
      if (!absPath) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      const parentAbs = path.dirname(absPath);
      const name = path.basename(absPath);
      setEntryMeta(parentAbs, name, body.meta || {});
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── Dispatcher ───────────────────────────────────────────────────────────────

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;
    if (!p.startsWith('/api/vfs')) return false;

    if (p === '/api/vfs/list'   && m === 'GET')  { getList(req, res, apiHeaders, url);                    return true; }
    if (p === '/api/vfs/stat'   && m === 'GET')  { getStat(req, res, apiHeaders, url);                    return true; }
    if (p === '/api/vfs/read'   && m === 'GET')  { getRead(req, res, apiHeaders, url);                    return true; }
    if (p === '/api/vfs/write'  && m === 'POST') { await postWrite(req, res, apiHeaders, readBody);        return true; }
    if (p === '/api/vfs/mkdir'  && m === 'POST') { await postMkdir(req, res, apiHeaders, readBody);        return true; }
    if (p === '/api/vfs/move'   && m === 'POST') { await postMove(req, res, apiHeaders, readBody);         return true; }
    if (p === '/api/vfs/delete' && m === 'POST') { await postDelete(req, res, apiHeaders, readBody);       return true; }
    if (p === '/api/vfs/meta'   && m === 'POST') { await postMeta(req, res, apiHeaders, readBody);         return true; }
    return false;
  }

  return { dispatch };
}

module.exports = createVfsRoutes;
