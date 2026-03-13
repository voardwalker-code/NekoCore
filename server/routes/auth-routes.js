// ============================================================
// REM System — Auth Routes
// POST /api/auth/register  — create account + session cookie
// POST /api/auth/login     — verify + session cookie
// POST /api/auth/logout    — destroy session + clear cookie
// GET  /api/auth/me        — return current account info
// ============================================================
'use strict';

function createAuthRoutes(ctx) {
  const { readBody } = ctx;
  const authService = ctx.authService;

  // ── Cookie helper ──────────────────────────────────────────
  function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(part => {
      const idx = part.indexOf('=');
      if (idx < 0) return;
      cookies[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    });
    return cookies;
  }

  function sessionCookie(token) {
    return `rem_session=${token}; Path=/; HttpOnly; SameSite=Strict`;
  }
  function clearSessionCookie() {
    return `rem_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  }

  // ── Dispatcher ─────────────────────────────────────────────
  async function dispatch(req, res, url, apiHeaders, readBody) {
    const p = url.pathname;
    const m = req.method;

    if (p === '/api/auth/register' && m === 'POST') { await postRegister(req, res, apiHeaders, readBody); return true; }
    if (p === '/api/auth/login'    && m === 'POST') { await postLogin(req, res, apiHeaders, readBody);    return true; }
    if (p === '/api/auth/logout'   && m === 'POST') { postLogout(req, res, apiHeaders);                   return true; }
    if (p === '/api/auth/me'       && m === 'GET')  { getMe(req, res, apiHeaders);                        return true; }
    return false;
  }

  // ── POST /api/auth/register ───────────────────────────────
  async function postRegister(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { username, password, displayName, info } = body || {};

      const result = authService.createAccount(username, password, displayName, info);
      if (!result.ok) {
        res.writeHead(400, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: result.error }));
        return;
      }

      const token = authService.createSession(result.account.id);
      res.writeHead(200, { ...apiHeaders, 'Set-Cookie': sessionCookie(token) });
      res.end(JSON.stringify({ ok: true, account: result.account }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── POST /api/auth/login ──────────────────────────────────
  async function postLogin(req, res, apiHeaders, readBody) {
    try {
      const body = JSON.parse(await readBody(req));
      const { username, password } = body || {};

      const account = authService.verifyAccount(username, password);
      if (!account) {
        res.writeHead(401, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'Invalid username or password' }));
        return;
      }

      const token = authService.createSession(account.id);
      res.writeHead(200, { ...apiHeaders, 'Set-Cookie': sessionCookie(token) });
      res.end(JSON.stringify({ ok: true, account }));
    } catch (e) {
      res.writeHead(400, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // ── POST /api/auth/logout ─────────────────────────────────
  function postLogout(req, res, apiHeaders) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.rem_session;
    // Release all entity checkouts for this account
    if (req.accountId) {
      const entityCheckout = require('../services/entity-checkout');
      entityCheckout.releaseAllForAccount(req.accountId);
    }
    if (token) authService.destroySession(token);
    res.writeHead(200, { ...apiHeaders, 'Set-Cookie': clearSessionCookie() });
    res.end(JSON.stringify({ ok: true }));
  }

  // ── GET /api/auth/me ──────────────────────────────────────
  function getMe(req, res, apiHeaders) {
    const accountId = req.accountId;
    if (!accountId) {
      res.writeHead(401, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: 'Not authenticated' }));
      return;
    }
    const account = authService.getAccount(accountId);
    if (!account) {
      res.writeHead(401, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: 'Session account not found' }));
      return;
    }
    res.writeHead(200, apiHeaders);
    res.end(JSON.stringify({ ok: true, account }));
  }

  return { dispatch };
}

module.exports = createAuthRoutes;
