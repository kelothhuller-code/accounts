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
  // Reject untrusted external browser origins
  const origin = req.headers.origin;
  if (origin && origin !== 'null' && !origin.startsWith('http://localhost') && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('vscode-webview://')) {
    return { status: 403, error: 'Forbidden: external browser Origin is not accepted.' };
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
      if (data.length > 50_000_000) { // 50MB allowance for large batch imports
        reject(new Error('Request body exceeds 50 MB limit.'));
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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Commodity-Bot, X-Commodity-Bot-Token',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function notifyUi(getWin, type) {
  try {
    const win = typeof getWin === 'function' ? getWin() : getWin;
    if (win && !win.isDestroyed()) {
      win.webContents.send('data-updated', { type });
    }
  } catch (e) { }
}

function createBotApiServer({ dbController, dbState, getMainWindow, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    const denied = authorize(req);
    if (denied) return send(res, denied.status, { error: denied.error });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Commodity-Bot, X-Commodity-Bot-Token'
      });
      return res.end();
    }

    let pathname = '/';
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch (e) {
      return send(res, 400, { error: 'Bad URL' });
    }

    try {
      // 1. Status & Metadata endpoints
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
      if (req.method === 'GET' && pathname === '/api/commitments') {
        return send(res, 200, dbController.getCommitments ? dbController.getCommitments() : []);
      }

      // 2. High-speed batch preview & commit endpoints (atomic, idempotent)
      if (req.method === 'POST' && pathname === '/api/bot/preview') {
        if (req.headers['x-commodity-bot'] !== '1') {
          return send(res, 403, { error: 'Forbidden: local calls must send X-Commodity-Bot: 1' });
        }
        const body = await readJsonBody(req);
        const preview = previewRequest(dbState, body || {});
        return send(res, preview.ok ? 200 : 422, preview);
      }
      if (req.method === 'POST' && pathname === '/api/bot/commit') {
        if (req.headers['x-commodity-bot'] !== '1') {
          return send(res, 403, { error: 'Forbidden: local calls must send X-Commodity-Bot: 1' });
        }
        const body = await readJsonBody(req);
        const committed = commitRequest(dbController, dbState, body || {});
        if (committed.ok) notifyUi(getMainWindow, 'all');
        return send(res, committed.status || (committed.ok ? 201 : 422), committed);
      }

      // 3. Direct single & bulk write routes (for Grok Bot and automation scripts)
      if (req.method === 'POST' && pathname === '/api/arrivals') {
        const body = await readJsonBody(req);
        if (!body || Object.keys(body).length === 0) {
          return send(res, 410, {
            error: 'Direct write routes require valid payload or use POST /api/bot/preview and POST /api/bot/commit. See GET /api/bot/schema.',
            schema: '/api/bot/schema'
          });
        }
        const result = dbController.addArrival(body);
        notifyUi(getMainWindow, 'arrivals');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/arrivals/bulk') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddArrivals(items);
        notifyUi(getMainWindow, 'arrivals');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/dispatches') {
        const body = await readJsonBody(req);
        const result = dbController.addDispatch(body);
        notifyUi(getMainWindow, 'dispatches');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/dispatches/bulk') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddDispatches(items);
        notifyUi(getMainWindow, 'dispatches');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/suppliers') {
        const body = await readJsonBody(req);
        const result = dbController.addSupplier(body);
        notifyUi(getMainWindow, 'suppliers');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/suppliers/bulk') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddSuppliers(items);
        notifyUi(getMainWindow, 'suppliers');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/payments') {
        const body = await readJsonBody(req);
        const result = dbController.addPayment(body);
        notifyUi(getMainWindow, 'payments');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/payments/bulk') {
        const body = await readJsonBody(req);
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddPayments(items);
        notifyUi(getMainWindow, 'payments');
        return send(res, 201, result);
      }

      if (req.method === 'POST' && pathname === '/api/commitments') {
        const body = await readJsonBody(req);
        const result = dbController.addCommitment(body);
        notifyUi(getMainWindow, 'commitments');
        return send(res, 201, result);
      }

      return send(res, 404, { error: `Not found: ${pathname}` });
    } catch (err) {
      return send(res, 500, { error: err.message || 'Bot API internal error' });
    }
  });

  return server;
}

function startBotApiServer(opts = {}) {
  const port = opts.port || 4820;
  const host = opts.host || '127.0.0.1';
  const server = createBotApiServer({ ...opts, host });
  server.listen(port, host, () => {
    console.log(`🤖 Bot Data Entry REST API active on http://${host}:${port} (local only)`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.warn(`Bot API port ${port} already in use, skipping.`);
    else console.error('Bot API Server error:', err);
  });
  return server;
}

module.exports = {
  createBotApiServer,
  startBotApiServer,
  authorize,
  isLocalAddress
};
