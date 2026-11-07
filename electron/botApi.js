const http = require('http');
const { schema, previewRequest, commitRequest } = require('./botEntry');

function isLocalAddress(remoteIp) {
  return remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
}

function authorize(req) {
  const remoteIp = req.socket && req.socket.remoteAddress;
  if (!isLocalAddress(remoteIp)) {
    return { status: 403, error: 'Forbidden: Bot API accepts 127.0.0.1 only.' };
  }
  if (req.headers.origin) {
    return { status: 403, error: 'Forbidden: browser Origin is not accepted. Use a local process, not a web page.' };
  }
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && fetchSite !== 'none') {
    return { status: 403, error: 'Forbidden: browser fetch is not accepted.' };
  }
  const required = process.env.COMMODITY_BOT_TOKEN;
  if (required && req.headers['x-commodity-bot-token'] !== required) {
    return { status: 401, error: 'Unauthorized: X-Commodity-Bot-Token does not match COMMODITY_BOT_TOKEN.' };
  }
  return null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5_000_000) {
        reject(new Error('Request body exceeds 5 MB.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body: ' + e.message));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function createBotApiServer({ dbController, dbState, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    const denied = authorize(req);
    if (denied) return send(res, denied.status, { error: denied.error });

    if (req.method === 'OPTIONS') {
      return send(res, 403, { error: 'Browser preflight is not supported.' });
    }

    let pathname = '/';
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch (e) {
      return send(res, 400, { error: 'Bad URL' });
    }

    try {
      if (req.method === 'GET' && pathname === '/api/status') {
        const status = dbController.getStatus ? dbController.getStatus() : {};
        return send(res, 200, { status: 'ok', serverTime: new Date().toISOString(), localOnly: true, ...status });
      }
      if (req.method === 'GET' && pathname === '/api/bot/schema') {
        return send(res, 200, schema());
      }
      if (req.method === 'GET' && pathname === '/api/products') {
        return send(res, 200, dbController.getProducts());
      }
      if (req.method === 'GET' && pathname === '/api/suppliers') {
        return send(res, 200, dbController.getSuppliers());
      }
      if (req.method === 'POST' && (pathname === '/api/bot/preview' || pathname === '/api/bot/commit')) {
        const body = await readJsonBody(req);
        if (pathname === '/api/bot/preview') {
          const preview = previewRequest(dbState, body || {});
          return send(res, preview.ok ? 200 : 422, preview);
        }
        const committed = commitRequest(dbController, dbState, body || {});
        return send(res, committed.status || (committed.ok ? 201 : 422), committed);
      }

      if (req.method === 'POST' && pathname.startsWith('/api/')) {
        return send(res, 410, {
          error: 'Direct write routes are disabled. Use POST /api/bot/preview and POST /api/bot/commit. See GET /api/bot/schema.',
          schema: '/api/bot/schema'
        });
      }

      return send(res, 404, { error: `Not found: ${pathname}` });
    } catch (err) {
      return send(res, 500, { error: err.message || 'Bot API error' });
    }
  });

  return server;
}

function startBotApiServer(opts = {}) {
  const port = opts.port || 4820;
  const host = opts.host || '127.0.0.1';
  const server = createBotApiServer({ ...opts, host });
  server.listen(port, host, () => {
    console.log(`Bot data-entry API listening on http://${host}:${port} (local only)`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.warn(`Bot API port ${port} already in use.`);
    else console.error('Bot API error:', err);
  });
  return server;
}

module.exports = {
  createBotApiServer,
  startBotApiServer,
  authorize,
  isLocalAddress
};
