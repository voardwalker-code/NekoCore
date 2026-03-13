// ── SSE Routes ───────────────────────────────────────────────
// GET /api/brain/events — real-time cognitive event stream

function createSSERoutes(ctx) {
  async function dispatch(req, res, url, apiHeaders) {
    if (url.pathname === '/api/brain/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': `http://localhost:${ctx.PORT}`
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, timestamp: Date.now() })}\n\n`);
      ctx.sseClients.add(res);
      req.on('close', () => { ctx.sseClients.delete(res); });
      return true;
    }
    return false;
  }

  return { dispatch };
}

module.exports = createSSERoutes;
