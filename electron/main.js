const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { dbController } = require('./db');

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'CommodityTracker ERP - Global Commodity Inventory & Accounting',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Reliable, high-priority in-app shortcut listener
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Prevent default browser behaviors for function keys
    if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11'].includes(input.key)) {
      event.preventDefault();
    }

    const key = input.key ? input.key.toUpperCase() : '';
    const code = input.code || '';
    const isAltOrCtrl = input.alt || input.control;

    // Alt+N, Ctrl+N -> New item (contextual)
    if (isAltOrCtrl && (key === 'N' || code === 'KeyN')) {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'shortcut-new');
    }
    // Alt+E, Ctrl+E -> Export CSV
    else if (isAltOrCtrl && (key === 'E' || code === 'KeyE')) {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'export-csv');
    }
    // Alt+A, Ctrl+A or F2 -> New Arrival
    else if ((isAltOrCtrl && (key === 'A' || code === 'KeyA')) || input.key === 'F2') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-arrival');
    }
    // Alt+S, Ctrl+S or F3 -> Suppliers
    else if ((isAltOrCtrl && (key === 'S' || code === 'KeyS')) || input.key === 'F3') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-suppliers');
    }
    // Alt+W, Ctrl+W or F4 -> Settlement
    else if ((isAltOrCtrl && (key === 'W' || code === 'KeyW')) || input.key === 'F4') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-settlement');
    }
    // Alt+P, Ctrl+P or F5 -> Payments
    else if ((isAltOrCtrl && (key === 'P' || code === 'KeyP')) || input.key === 'F5') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-payments');
    }
    // Alt+C, Ctrl+C or F6 -> Commitments
    else if ((isAltOrCtrl && (key === 'C' || code === 'KeyC')) || input.key === 'F6') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-commitments');
    }
    // Alt+R, Ctrl+R or F7 -> Reports
    else if ((isAltOrCtrl && (key === 'R' || code === 'KeyR')) || input.key === 'F7') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-reports');
    }
    // Alt+D, Ctrl+D or F1 -> Dashboard
    else if ((isAltOrCtrl && (key === 'D' || code === 'KeyD')) || input.key === 'F1') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'nav-dashboard');
    } else if (input.key === 'F8') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'quick-add-product');
    } else if (input.key === 'F9') {
      event.preventDefault();
      mainWindow.webContents.send('shortcut-triggered', 'quick-add-supplier');
    } else if (input.key === 'Escape') {
      mainWindow.webContents.send('shortcut-triggered', 'close-modal');
    }
  });

  const startURL = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startURL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Optional OS-level fallback registration
function registerShortcuts() {
  const shortcutMap = [
    { key: 'Alt+A', action: 'nav-arrival' },
    { key: 'Alt+S', action: 'nav-suppliers' },
    { key: 'Alt+W', action: 'nav-settlement' },
    { key: 'Alt+C', action: 'nav-commitments' },
    { key: 'Alt+P', action: 'nav-payments' },
    { key: 'Alt+R', action: 'nav-reports' },
    { key: 'Alt+D', action: 'nav-dashboard' },
    { key: 'F8', action: 'quick-add-product' },
    { key: 'F9', action: 'quick-add-supplier' },
  ];

  shortcutMap.forEach(({ key, action }) => {
    try {
      globalShortcut.register(key, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut-triggered', action);
        }
      });
    } catch (e) { }
  });
}

// Local HTTP REST API server on 127.0.0.1:4820 for automated Bot data entry & external integrations
function startBotApiServer() {
  const PORT = 4820;
  const server = http.createServer(async (req, res) => {
    // Only accept connections from localhost
    const remoteIp = req.socket.remoteAddress;
    if (remoteIp !== '127.0.0.1' && remoteIp !== '::1' && remoteIp !== '::ffff:127.0.0.1') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Forbidden: Bot API is local-only' }));
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    const readJsonBody = () => new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body: ' + e.message));
        }
      });
      req.on('error', reject);
    });

    try {
      if (req.method === 'GET' && pathname === '/api/status') {
        const status = dbController.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', serverTime: new Date().toISOString(), ...status }));
      }

      if (req.method === 'GET' && pathname === '/api/products') {
        const prods = dbController.getProducts();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(prods));
      }

      if (req.method === 'GET' && pathname === '/api/suppliers') {
        const sups = dbController.getSuppliers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(sups));
      }

      if (req.method === 'POST' && pathname === '/api/arrivals') {
        const body = await readJsonBody();
        const result = dbController.addArrival(body);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'arrivals' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/arrivals/bulk') {
        const body = await readJsonBody();
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddArrivals(items);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'arrivals' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/dispatches') {
        const body = await readJsonBody();
        const result = dbController.addDispatch(body);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'dispatches' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/dispatches/bulk') {
        const body = await readJsonBody();
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddDispatches(items);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'dispatches' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/suppliers') {
        const body = await readJsonBody();
        const result = dbController.addSupplier(body);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'suppliers' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/suppliers/bulk') {
        const body = await readJsonBody();
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddSuppliers(items);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'suppliers' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/payments') {
        const body = await readJsonBody();
        const result = dbController.addPayment(body);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'payments' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      if (req.method === 'POST' && pathname === '/api/payments/bulk') {
        const body = await readJsonBody();
        const items = Array.isArray(body) ? body : (body.items || []);
        const result = dbController.bulkAddPayments(items);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-updated', { type: 'payments' });
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal bot api error' }));
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`🤖 Bot Data Entry REST API active on http://127.0.0.1:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Bot API port ${PORT} already in use, skipping bot server.`);
    } else {
      console.error('Bot API Server error:', err);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  startBotApiServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Central IPC handler for Database and Accounting Logic
ipcMain.handle('db-action', async (event, action, payload) => {
  try {
    switch (action) {
      case 'db:status':
        return dbController.getStatus();

      case 'db:set-mongo-uri':
        return await dbController.updateMongoUri(payload.uri);

      case 'db:clear-local':
      case 'db:reset-database':
        return await dbController.clearLocalData(payload || {});

      // PRODUCTS
      case 'products:get':
        return dbController.getProducts();

      case 'products:add':
        return dbController.addProduct(payload);

      case 'products:update':
        return dbController.updateProduct(payload.id, payload.data);

      case 'products:delete':
        return dbController.deleteProduct(payload.id);

      // SUPPLIERS
      case 'suppliers:get':
        return dbController.getSuppliers();

      case 'suppliers:get-one':
        return dbController.getSupplierDetails(payload.id);

      case 'suppliers:add':
        return dbController.addSupplier(payload);

      case 'suppliers:bulk-add':
        return dbController.bulkAddSuppliers(payload?.items || payload || []);

      case 'suppliers:update':
        return dbController.updateSupplier(payload.id, payload.data);

      case 'suppliers:delete':
        return dbController.deleteSupplier(payload.id);

      // COMMITMENTS
      case 'commitments:get':
        return dbController.getCommitments(payload?.supplierId);

      case 'commitments:add':
        return dbController.addCommitment(payload);

      case 'commitments:update':
        return dbController.updateCommitment(payload.id, payload.data);

      case 'commitments:close':
        return dbController.closeCommitment(payload);

      case 'commitments:delete':
        return dbController.deleteCommitment(payload.id);

      // ARRIVALS
      case 'arrivals:get':
        return dbController.getArrivals(payload || {});

      case 'arrivals:add':
        return dbController.addArrival(payload);

      case 'arrivals:bulk-add':
        return dbController.bulkAddArrivals(payload?.items || payload || []);

      case 'arrivals:update':
        return dbController.updateArrival(payload.id, payload.data);

      case 'arrivals:delete':
        return dbController.deleteArrival(payload.id);

      // SETTLEMENTS
      case 'settlements:calculate-outturn':
        return dbController.calculateBatchOutturn(payload.arrivalIds);

      case 'settlements:settle':
        return dbController.settleStorageArrivals(payload);

      case 'settlements:get':
        return dbController.getSettlements(payload?.supplierId);

      case 'settlements:update':
        return dbController.updateSettlement(payload.id, payload.data);

      case 'settlements:delete':
        return dbController.deleteSettlement(payload.id);

      // PAYMENTS & TCS
      case 'payments:get':
        return dbController.getPayments(payload?.supplierId);

      case 'payments:add':
        return dbController.addPayment(payload);

      case 'payments:bulk-add':
        return dbController.bulkAddPayments(payload?.items || payload || []);

      case 'payments:update':
        return dbController.updatePayment(payload.id, payload.data);

      case 'payments:delete':
        return dbController.deletePayment(payload.id);

      // DISPATCHES
      case 'dispatches:get':
        return dbController.getDispatches(payload || {});

      case 'dispatches:add':
        return dbController.addDispatch(payload);

      case 'dispatches:bulk-add':
        return dbController.bulkAddDispatches(payload?.items || payload || []);

      case 'dispatches:update':
        return dbController.updateDispatch(payload.id, payload.data);

      case 'dispatches:delete':
        return dbController.deleteDispatch(payload.id);

      // EP TRANSFERS
      case 'ep-transfers:get':
        return dbController.getEpTransfers(payload?.supplierId);

      case 'ep-transfers:add':
        return dbController.addEpTransfer(payload);

      case 'ep-transfers:delete':
        return dbController.deleteEpTransfer(payload.id);

      // COMMITMENT WASHES
      case 'commitments:wash':
        return dbController.washCommitments(payload);

      case 'commitments:get-washes':
        return dbController.getCommitmentWashes(payload?.supplierId);

      // OPENING STOCK & REQUIREMENT INSIGHT & GODOWN SUMMARY
      case 'stock:update-opening':
        return dbController.updateOpeningStock(payload);

      case 'stock:requirement-insight':
        return dbController.getRequirementInsight();

      case 'stock:get-summary':
        return dbController.getGodownStockSummary();

      case 'stock:get-entries':
        return dbController.getOpeningStockEntries();

      case 'stock:add-entry':
        return dbController.addOpeningStockEntry(payload);

      case 'stock:delete-entry':
        return dbController.deleteOpeningStockEntry(payload.id);

      // MILLING & PROCESSING
      case 'milling:get':
        return dbController.getMillingLogs();

      case 'milling:add':
        return dbController.addMillingLog(payload);

      case 'milling:delete':
        return dbController.deleteMillingLog(payload.id);

      case 'processing-profiles:get':
        return dbController.getProcessingProfiles();

      case 'processing-profiles:save':
        return dbController.saveProcessingProfile(payload);

      case 'processing-profiles:delete':
        return dbController.deleteProcessingProfile(payload.sourceProduct || payload.id);

      // DASHBOARD METRICS
      case 'dashboard:metrics':
        return dbController.getDashboardMetrics(payload || {});

      // BACKUP & RESTORE
      case 'backup:export':
        return dbController.exportFullBackup();

      case 'backup:import':
        return dbController.importBackup(payload);

      // SETTINGS
      case 'settings:get':
        return dbController.getSettings();

      case 'settings:update':
        return dbController.updateSettings(payload || {});

      // FINANCIAL YEAR & CLOSING
      case 'fy:summary':
        return dbController.getFiscalYearsSummary();

      case 'fy:close':
        return dbController.closeFinancialYear(payload || {});

      case 'fy:reopen':
        return dbController.reopenFinancialYear(payload?.fy);

      case 'fy:export-archive': {
        const fy = payload?.fy;
        if (!fy) throw new Error('Fiscal year required');
        const archivesDir = path.join(app.getPath('userData'), 'archives');
        const archivePath = path.join(archivesDir, `commodity_store_FY_${fy}.json`);
        if (fs.existsSync(archivePath)) {
          return { success: true, fy, content: fs.readFileSync(archivePath, 'utf8'), path: archivePath };
        }
        // If not yet saved on disk, generate on the fly
        const archiveData = {
          financialYear: fy,
          exportedAt: new Date().toISOString(),
          data: {
            arrivals: (dbState.arrivals || []).filter(a => (a.fy || (a.date && a.date >= `${fy.split('-')[0]}-04-01` && a.date <= `${fy.split('-')[1]}-03-31`))),
            dispatches: (dbState.dispatches || []).filter(d => (d.fy || (d.date && d.date >= `${fy.split('-')[0]}-04-01` && d.date <= `${fy.split('-')[1]}-03-31`))),
            settlements: (dbState.settlements || []).filter(s => (s.fy || (s.date && s.date >= `${fy.split('-')[0]}-04-01` && s.date <= `${fy.split('-')[1]}-03-31`))),
            payments: (dbState.payments || []).filter(p => (p.fy || (p.date && p.date >= `${fy.split('-')[0]}-04-01` && p.date <= `${fy.split('-')[1]}-03-31`))),
            millingLogs: (dbState.millingLogs || []).filter(m => (m.fy || (m.date && m.date >= `${fy.split('-')[0]}-04-01` && m.date <= `${fy.split('-')[1]}-03-31`)))
          }
        };
        return { success: true, fy, content: JSON.stringify(archiveData, null, 2) };
      }

      // FILE SAVE DIALOG HELPER (CSV, JSON)
      case 'dialog:save-file': {
        const { defaultName, content, ext } = payload;
        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Export File',
          defaultPath: defaultName || 'export.csv',
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
        });
        if (!result.canceled && result.filePath) {
          fs.writeFileSync(result.filePath, content, 'utf8');
          return { success: true, path: result.filePath };
        }
        return { canceled: true };
      }

      default:
        console.warn('Unknown db-action:', action);
        return { error: 'Unknown action: ' + action };
    }
  } catch (error) {
    console.error(`Error in db-action [${action}]:`, error);
    return { error: error.message || 'Internal error' };
  }
});
