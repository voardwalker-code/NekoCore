// ── Config Routes ────────────────────────────────────────────
// /api/config, /api/entity-config, /api/proxy
// /api/sleep/config, /api/workspace/*

function createConfigRoutes(ctx) {
  const { fs, path } = ctx;
  const PROJECT_ROOT = path.join(__dirname, '..', '..');
  const SERVER_DATA_DIR = path.join(PROJECT_ROOT, 'server', 'data');
  const CONFIG_DIR = path.join(PROJECT_ROOT, 'Config');
  const CONFIG_FILE = path.join(CONFIG_DIR, 'ma-config.json');
  const ENTITIES_DIR = path.join(PROJECT_ROOT, 'entities');
  const MEMORIES_DIR = path.join(PROJECT_ROOT, 'memories');
  const BACKUP_MANIFEST = 'backup-manifest.json';

  function isValidObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function timestampTag() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  function copyPathIfExists(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true, force: true });
    } else {
      const parent = path.dirname(dest);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }

  function removePathIfExists(target) {
    if (!fs.existsSync(target)) return;
    fs.rmSync(target, { recursive: true, force: true });
  }

  function buildRestoreCandidates(backupDir) {
    return {
      configFile: path.join(backupDir, 'Config', 'ma-config.json'),
      serverDataDir: path.join(backupDir, 'server', 'data'),
      entitiesDir: path.join(backupDir, 'entities'),
      memoriesDir: path.join(backupDir, 'memories')
    };
  }

  function createSafetySnapshot() {
    const snapshotsRoot = path.join(PROJECT_ROOT, 'restore-snapshots');
    if (!fs.existsSync(snapshotsRoot)) fs.mkdirSync(snapshotsRoot, { recursive: true });
    const snapshotDir = path.join(snapshotsRoot, `pre-restore-${timestampTag()}`);
    fs.mkdirSync(snapshotDir, { recursive: true });

    copyPathIfExists(CONFIG_FILE, path.join(snapshotDir, 'Config', 'ma-config.json'));
    copyPathIfExists(SERVER_DATA_DIR, path.join(snapshotDir, 'server', 'data'));
    copyPathIfExists(ENTITIES_DIR, path.join(snapshotDir, 'entities'));
    copyPathIfExists(MEMORIES_DIR, path.join(snapshotDir, 'memories'));

    fs.writeFileSync(path.join(snapshotDir, BACKUP_MANIFEST), JSON.stringify({
      type: 'pre-restore-snapshot',
      createdAt: new Date().toISOString(),
      source: 'local-runtime'
    }, null, 2), 'utf8');
    return snapshotDir;
  }

  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/config' && m === 'GET') { await getConfig(req, res, apiHeaders); return true; }
    if (p === '/api/config' && m === 'POST') { await postConfig(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/config/max-tokens' && m === 'GET') { getMaxTokens(req, res, apiHeaders); return true; }
    if (p === '/api/config/max-tokens' && m === 'POST') { await postMaxTokens(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/config/token-limits' && m === 'GET') { getTokenLimits(req, res, apiHeaders); return true; }
    if (p === '/api/config/token-limits' && m === 'POST') { await postTokenLimits(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/config/token-limits/reset' && m === 'POST') { await resetTokenLimits(req, res, apiHeaders); return true; }
    if (p === '/api/entity-config' && m === 'GET') { getEntityConfig(req, res, apiHeaders, url); return true; }
    if (p === '/api/entity-config' && m === 'POST') { await postEntityConfig(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/proxy' && m === 'POST') { await postProxy(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/sleep/config' && m === 'GET') { getSleepConfig(req, res, apiHeaders); return true; }
    if (p === '/api/sleep/config' && m === 'POST') { await postSleepConfig(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/workspace/config' && m === 'GET') { getWorkspaceConfig(req, res, apiHeaders); return true; }
    if (p === '/api/workspace/config' && m === 'POST') { await postWorkspaceConfig(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/workspace/list' && m === 'GET') { getWorkspaceList(req, res, apiHeaders, url); return true; }
    if (p === '/api/workspace/read' && m === 'GET') { getWorkspaceRead(req, res, apiHeaders, url); return true; }
    if (p === '/api/workspace/write' && m === 'POST') { await postWorkspaceWrite(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/workspace/delete' && m === 'POST') { await postWorkspaceDelete(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/system/backup' && m === 'POST') { await postSystemBackup(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/system/restore' && m === 'POST') { await postSystemRestore(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/system/webui-presence' && m === 'POST') { await postWebuiPresence(req, res, apiHeaders, readBody); return true; }
    return false;
  }

  function normalizeAspectProvider(provider) {
    const p = String(provider || '').toLowerCase().trim();
    if (p === 'dreams') return 'dream';
    return p;
  }

  function readEntityProfileRef(entityId) {
    if (!entityId) return null;
    try {
      const entityPaths = require('../entityPaths');
      const canonicalId = entityPaths.normalizeEntityId(entityId);
      const entityFile = path.join(entityPaths.getEntityRoot(canonicalId), 'entity.json');
      if (!fs.existsSync(entityFile)) return null;
      const entity = JSON.parse(fs.readFileSync(entityFile, 'utf8'));
      const ref = String(entity?.configProfileRef || '').trim();
      return ref || null;
    } catch (_) {
      return null;
    }
  }

  function writeEntityProfileRef(entityId, profileName) {
    const entityPaths = require('../entityPaths');
    const canonicalId = entityPaths.normalizeEntityId(entityId);
    const entityFile = path.join(entityPaths.getEntityRoot(canonicalId), 'entity.json');
    if (!fs.existsSync(entityFile)) throw new Error('Entity not found: ' + canonicalId);

    const entity = JSON.parse(fs.readFileSync(entityFile, 'utf8'));
    entity.configProfileRef = String(profileName || '').trim();
    fs.writeFileSync(entityFile, JSON.stringify(entity, null, 2), 'utf8');
    return entity.configProfileRef;
  }

  function normalizeIncomingRuntimeConfig(config) {
    if (!config || typeof config !== 'object') return null;

    const type = String(config.type || '').toLowerCase().trim();
    if (type === 'ollama' || (config.ollamaUrl && config.ollamaModel)) {
      const endpoint = String(config.endpoint || config.ollamaUrl || 'http://localhost:11434').trim();
      const model = String(config.model || config.ollamaModel || '').trim();
      if (!endpoint || !model) return null;
      return { type: 'ollama', endpoint, model };
    }

    const endpoint = String(config.endpoint || config.ep || '').trim() || 'https://openrouter.ai/api/v1/chat/completions';
    const apiKey = String(config.apiKey || config.key || '').trim();
    const model = String(config.model || '').trim();
    if (!endpoint || !apiKey || !model) return null;
    return { type: 'openrouter', endpoint, apiKey, model };
  }

  const REDACTED = '••••••••';

  function redactKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactKeys);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if ((k === 'apiKey' || k === 'key') && typeof v === 'string' && v.length > 0) {
        out[k] = REDACTED;
      } else if (typeof v === 'object') {
        out[k] = redactKeys(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function mergeKeysBack(incoming, stored) {
    // When client POSTs config, restore any redacted values from the stored config on disk
    if (!incoming || typeof incoming !== 'object') return incoming;
    if (!stored || typeof stored !== 'object') return incoming;
    if (Array.isArray(incoming)) return incoming;
    const out = {};
    for (const [k, v] of Object.entries(incoming)) {
      if ((k === 'apiKey' || k === 'key') && v === REDACTED) {
        out[k] = stored[k] || v;
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        out[k] = mergeKeysBack(v, stored[k] || {});
      } else {
        out[k] = v;
      }
    }
    // Preserve stored keys that incoming didn't touch
    for (const [k, v] of Object.entries(stored)) {
      if (!(k in out)) out[k] = v;
    }
    return out;
  }

  async function getConfig(req, res, apiHeaders) {
    const config = ctx.loadConfig();
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify(redactKeys(config)));
  }

  async function postConfig(req, res, apiHeaders, readBody) {
    try {
      const body = await readBody(req);
      const incoming = JSON.parse(body);
      // Merge back any redacted keys from the currently stored config
      const stored = ctx.loadConfig();
      const data = mergeKeysBack(incoming, stored);
      ctx.saveConfig(data);
      ctx.refreshMaxTokensCache();
      ctx.refreshTokenLimitsCache();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getMaxTokens(req, res, apiHeaders) {
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ maxTokens: ctx._defaultMaxTokens }));
  }

  async function postMaxTokens(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const val = parseInt(body.maxTokens, 10);
      if (!Number.isFinite(val) || val < 256 || val > 128000) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'maxTokens must be between 256 and 128000' }));
        return;
      }
      const config = ctx.loadConfig();
      config.maxTokens = val;
      ctx.saveConfig(config);
      ctx.refreshMaxTokensCache();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, maxTokens: val }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getTokenLimits(req, res, apiHeaders) {
    const result = {};
    for (const [key, def] of Object.entries(ctx.TOKEN_LIMIT_DEFAULTS)) {
      result[key] = {
        value: ctx._tokenLimits[key] || def.value,
        defaultValue: def.value,
        label: def.label,
        desc: def.desc
      };
    }
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify(result));
  }

  async function postTokenLimits(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const overrides = body.tokenLimits;
      if (!overrides || typeof overrides !== 'object') {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ error: 'Expected { tokenLimits: { key: value, ... } }' }));
        return;
      }
      const validated = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (!ctx.TOKEN_LIMIT_DEFAULTS[k]) continue;
        const val = parseInt(v, 10);
        if (!Number.isFinite(val) || val < 64 || val > 128000) continue;
        validated[k] = val;
      }
      const config = ctx.loadConfig();
      config.tokenLimits = validated;
      ctx.saveConfig(config);
      ctx.refreshTokenLimitsCache();
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, tokenLimits: ctx._tokenLimits }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function resetTokenLimits(req, res, apiHeaders) {
    try {
      const config = ctx.loadConfig();
      delete config.tokenLimits;
      ctx.saveConfig(config);
      ctx.refreshTokenLimitsCache();
      const result = {};
      for (const [key, def] of Object.entries(ctx.TOKEN_LIMIT_DEFAULTS)) {
        result[key] = { value: def.value, defaultValue: def.value, label: def.label, desc: def.desc };
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, tokenLimits: result }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  function getEntityConfig(req, res, apiHeaders, url) {
    const entityId = url.searchParams.get('entityId') || '';
    const provider = url.searchParams.get('provider');
    if (!provider) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: 'Missing provider' }));
      return;
    }

    const normalizedProvider = normalizeAspectProvider(provider);
    const globalCfg = ctx.loadConfig();
    const entityProfileRef = readEntityProfileRef(entityId);
    const profileRef = globalCfg?.lastActive;
    const profile = globalCfg?.profiles?.[profileRef] || null;

    if (normalizedProvider === 'profile-ref') {
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ profileRef, entityProfileRef, globalOnly: true }));
      return;
    }

    const resolved = ctx.resolveProfileAspectConfigs(profile);
    const config = resolved?.[normalizedProvider] || {};
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ...config, profileRef, entityProfileRef, globalOnly: true }));
  }

  async function postEntityConfig(req, res, apiHeaders, readBody) {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { entityId, provider, config, profileRef } = data;
      if (!provider) throw new Error('Missing provider');
      const normalizedProvider = normalizeAspectProvider(provider);

      if (normalizedProvider === 'profile-ref') {
        if (!entityId) throw new Error('Missing entityId for profile-ref update');
        const chosenProfile = String(profileRef || '').trim();
        if (!chosenProfile) throw new Error('Missing profileRef value');
        const globalCfg = ctx.loadConfig();
        if (!globalCfg?.profiles?.[chosenProfile]) throw new Error('Unknown profile: ' + chosenProfile);
        const savedRef = writeEntityProfileRef(entityId, chosenProfile);
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: true, profileRef: savedRef, globalOnly: true }));
        return;
      }

      if (!config) throw new Error('Missing config');
      const normalizedConfig = normalizeIncomingRuntimeConfig(config);
      if (!normalizedConfig) throw new Error('Invalid provider config payload');

      const globalCfg = ctx.loadConfig();
      if (!globalCfg.profiles || typeof globalCfg.profiles !== 'object') globalCfg.profiles = {};
      if (!globalCfg.lastActive) globalCfg.lastActive = 'default-multi-llm';
      if (!globalCfg.profiles[globalCfg.lastActive]) globalCfg.profiles[globalCfg.lastActive] = {};

      const targetProfile = globalCfg.profiles[globalCfg.lastActive];
      targetProfile[normalizedProvider] = normalizedConfig;
      if (!targetProfile._activeTypes || typeof targetProfile._activeTypes !== 'object') targetProfile._activeTypes = {};
      targetProfile._activeTypes[normalizedProvider] = normalizedConfig.type;

      // Keep legacy main fields in sync for older clients.
      if (normalizedProvider === 'main') {
        targetProfile._activeType = normalizedConfig.type;
        if (normalizedConfig.type === 'openrouter') {
          targetProfile.apikey = {
            endpoint: normalizedConfig.endpoint,
            key: normalizedConfig.apiKey,
            model: normalizedConfig.model
          };
        } else if (normalizedConfig.type === 'ollama') {
          targetProfile.ollama = {
            url: normalizedConfig.endpoint,
            model: normalizedConfig.model
          };
        }
      }

      ctx.saveConfig(globalCfg);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, globalOnly: true, profileRef: globalCfg.lastActive }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ error: e.message }));
    }
  }

  async function postProxy(req, res, apiHeaders, readBody) {
    const ALLOWED_HOSTS = ['openrouter.ai'];
    try {
      const raw = JSON.parse(await readBody(req));
      if (!raw.url) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ error: 'Missing url' })); return; }
      const parsed = new URL(raw.url);
      if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
        res.writeHead(403, apiHeaders); res.end(JSON.stringify({ error: 'Host not allowed: ' + parsed.hostname })); return;
      }
      const upstream = await fetch(raw.url, {
        method: raw.method || 'GET',
        headers: raw.headers || {},
        body: raw.body ? (typeof raw.body === 'string' ? raw.body : JSON.stringify(raw.body)) : undefined
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { ...apiHeaders, 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
      res.end(text);
    } catch (e) { res.writeHead(500, apiHeaders); res.end(JSON.stringify({ error: e.message })); }
  }

  function getSleepConfig(req, res, apiHeaders) {
    try {
      const config = ctx.loadConfig();
      const sleepConfig = config.sleep || {};
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        config: {
          autoSleepEnabled: sleepConfig.autoSleepEnabled !== false,
          autoSleepThreshold: sleepConfig.autoSleepThreshold || 35000,
          sleepInterval: sleepConfig.sleepInterval || '0',
          activeHours: sleepConfig.activeHours || { start: '00:00', end: '24:00' },
          dreamDepth: sleepConfig.dreamDepth || 'normal',
          maxDreamCycles: sleepConfig.maxDreamCycles || 3,
          heartbeatEnabled: sleepConfig.heartbeatEnabled || false,
          heartbeatInterval: sleepConfig.heartbeatInterval || '30m',
          heartbeatPrompt: sleepConfig.heartbeatPrompt || '',
          heartbeatTarget: sleepConfig.heartbeatTarget || 'none',
          imageGenMode: sleepConfig.imageGenMode || 'off',
          imageApiEndpoint: sleepConfig.imageApiEndpoint || '',
          imageApiKey: sleepConfig.imageApiKey ? '••••••' : '',
          imageApiModel: sleepConfig.imageApiModel || ''
        }
      }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postSleepConfig(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const config = ctx.loadConfig();
      config.sleep = Object.assign(config.sleep || {}, body);
      ctx.saveConfig(config);
      if (ctx.dreamVisualizer && (body.imageGenMode !== undefined || body.imageApiEndpoint !== undefined || body.imageApiKey !== undefined || body.imageApiModel !== undefined)) {
        ctx.dreamVisualizer.setImageGenConfig({
          imageGenMode: config.sleep.imageGenMode || 'off',
          imageApiEndpoint: config.sleep.imageApiEndpoint || '',
          imageApiKey: config.sleep.imageApiKey || '',
          imageApiModel: config.sleep.imageApiModel || ''
        });
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getWorkspaceConfig(req, res, apiHeaders) {
    const config = ctx.loadConfig();
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, workspacePath: config.workspacePath || '' }));
  }

  async function postWorkspaceConfig(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const wsPath = (body.workspacePath || '').trim();
      if (wsPath && !fs.existsSync(wsPath)) {
        fs.mkdirSync(wsPath, { recursive: true });
      }
      const config = ctx.loadConfig();
      config.workspacePath = wsPath;
      ctx.saveConfig(config);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, workspacePath: wsPath }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function resolveWsPath(relPath) {
    const config = ctx.loadConfig();
    const wsRoot = config.workspacePath;
    if (!wsRoot) return null;
    const resolved = path.resolve(wsRoot, relPath || '.');
    if (!resolved.startsWith(path.resolve(wsRoot))) return null;
    return resolved;
  }

  function getWorkspaceList(req, res, apiHeaders, url) {
    const relPath = url.searchParams.get('path') || '.';
    const dir = resolveWsPath(relPath);
    if (!dir) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: 'No workspace configured' }));
      return;
    }
    if (!fs.existsSync(dir)) {
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, files: [] }));
      return;
    }
    try {
      const entries = fs.readdirSync(dir).map(name => {
        try {
          const full = path.join(dir, name);
          const stat = fs.statSync(full);
          return { name, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size };
        } catch { return { name, type: 'file', size: 0 }; }
      });
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, files: entries }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  function getWorkspaceRead(req, res, apiHeaders, url) {
    const relPath = url.searchParams.get('path');
    if (!relPath) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'path required' })); return; }
    const filep = resolveWsPath(relPath);
    if (!filep) { res.writeHead(400, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'No workspace configured or path outside workspace' })); return; }
    if (!fs.existsSync(filep)) { res.writeHead(404, apiHeaders); res.end(JSON.stringify({ ok: false, error: 'File not found' })); return; }
    try {
      const content = fs.readFileSync(filep, 'utf-8');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, content, path: relPath }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postWorkspaceWrite(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const filep = resolveWsPath(body.path);
      if (!filep) throw new Error('No workspace configured or path outside workspace');
      const dir = path.dirname(filep);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filep, body.content || '', 'utf-8');
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postWorkspaceDelete(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const filep = resolveWsPath(body.path);
      if (!filep) throw new Error('No workspace configured or path outside workspace');
      if (fs.existsSync(filep)) fs.unlinkSync(filep);
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postSystemBackup(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const targetRoot = String(body.targetFolder || '').trim();
      if (!targetRoot) throw new Error('targetFolder is required');

      const resolvedTargetRoot = path.resolve(targetRoot);
      if (!fs.existsSync(resolvedTargetRoot)) fs.mkdirSync(resolvedTargetRoot, { recursive: true });

      const backupName = body.backupName
        ? String(body.backupName).trim().replace(/[<>:"/\\|?*]/g, '_')
        : `NekoCore-backup-${timestampTag()}`;
      const backupDir = path.join(resolvedTargetRoot, backupName || `NekoCore-backup-${timestampTag()}`);
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      copyPathIfExists(CONFIG_FILE, path.join(backupDir, 'Config', 'ma-config.json'));
      copyPathIfExists(SERVER_DATA_DIR, path.join(backupDir, 'server', 'data'));
      copyPathIfExists(ENTITIES_DIR, path.join(backupDir, 'entities'));
      copyPathIfExists(MEMORIES_DIR, path.join(backupDir, 'memories'));

      const manifest = {
        type: 'NekoCore-backup',
        createdAt: new Date().toISOString(),
        backupName: path.basename(backupDir),
        sourceRoot: PROJECT_ROOT,
        contents: [
          'Config/ma-config.json',
          'server/data/',
          'entities/',
          'memories/'
        ]
      };
      fs.writeFileSync(path.join(backupDir, BACKUP_MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, backupDir, manifest }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postSystemRestore(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const sourceFolder = String(body.sourceFolder || '').trim();
      if (!sourceFolder) throw new Error('sourceFolder is required');

      const backupDir = path.resolve(sourceFolder);
      if (!fs.existsSync(backupDir) || !fs.statSync(backupDir).isDirectory()) {
        throw new Error('Backup folder not found: ' + backupDir);
      }

      const manifestPath = path.join(backupDir, BACKUP_MANIFEST);
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (!isValidObject(manifest)) throw new Error('invalid manifest object');
        } catch {
          throw new Error('Backup manifest is invalid');
        }
      }

      const candidates = buildRestoreCandidates(backupDir);
      const hasAny = Object.values(candidates).some(pth => fs.existsSync(pth));
      if (!hasAny) {
        throw new Error('No restorable data found in backup folder');
      }

      const safetySnapshot = createSafetySnapshot();

      // Restore config
      if (fs.existsSync(candidates.configFile)) {
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.copyFileSync(candidates.configFile, CONFIG_FILE);
      }

      // Restore server data
      if (fs.existsSync(candidates.serverDataDir)) {
        removePathIfExists(SERVER_DATA_DIR);
        copyPathIfExists(candidates.serverDataDir, SERVER_DATA_DIR);
      }

      // Restore entities + memories
      if (fs.existsSync(candidates.entitiesDir)) {
        removePathIfExists(ENTITIES_DIR);
        copyPathIfExists(candidates.entitiesDir, ENTITIES_DIR);
      }
      if (fs.existsSync(candidates.memoriesDir)) {
        removePathIfExists(MEMORIES_DIR);
        copyPathIfExists(candidates.memoriesDir, MEMORIES_DIR);
      }

      // Refresh config caches if available
      try { ctx.refreshMaxTokensCache && ctx.refreshMaxTokensCache(); } catch (_) {}
      try { ctx.refreshTokenLimitsCache && ctx.refreshTokenLimitsCache(); } catch (_) {}

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({
        ok: true,
        restoredFrom: backupDir,
        safetySnapshot,
        note: 'Restore complete. Reload UI and restart server if you need all in-memory state reset.'
      }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  async function postWebuiPresence(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const isOpen = body && body.isOpen !== false;
      const url = String((body && body.url) || '').trim() || undefined;
      if (typeof ctx.updateBrowserOpenState === 'function') {
        ctx.updateBrowserOpenState({ isOpen, url, source: 'webui-presence' });
      }
      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, isOpen }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  return { dispatch };
}

module.exports = createConfigRoutes;
