const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { dbController } = require('./db');

let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'CoffeeTracker ERP - Coffee Arrival & Accounting',
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
    if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].includes(input.key)) {
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
  ];

  shortcutMap.forEach(({ key, action }) => {
    try {
      globalShortcut.register(key, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('shortcut-triggered', action);
        }
      });
    } catch (e) {}
  });
}

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();

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

      // PRODUCTS
      case 'products:get':
        return dbController.getProducts();

      case 'products:add':
        return dbController.addProduct(payload);

      // SUPPLIERS
      case 'suppliers:get':
        return dbController.getSuppliers();

      case 'suppliers:get-one':
        return dbController.getSupplierDetails(payload.id);

      case 'suppliers:add':
        return dbController.addSupplier(payload);

      case 'suppliers:update':
        return dbController.updateSupplier(payload.id, payload.data);

      case 'suppliers:delete':
        return dbController.deleteSupplier(payload.id);

      // COMMITMENTS
      case 'commitments:get':
        return dbController.getCommitments(payload?.supplierId);

      case 'commitments:add':
        return dbController.addCommitment(payload);

      case 'commitments:delete':
        return dbController.deleteCommitment(payload.id);

      // ARRIVALS
      case 'arrivals:get':
        return dbController.getArrivals(payload || {});

      case 'arrivals:add':
        return dbController.addArrival(payload);

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

      case 'settlements:delete':
        return dbController.deleteSettlement(payload.id);

      // PAYMENTS & TCS
      case 'payments:get':
        return dbController.getPayments(payload?.supplierId);

      case 'payments:add':
        return dbController.addPayment(payload);

      case 'payments:delete':
        return dbController.deletePayment(payload.id);

      // DASHBOARD METRICS
      case 'dashboard:metrics':
        return dbController.getDashboardMetrics(payload || {});

      // BACKUP & RESTORE
      case 'backup:export':
        return dbController.exportFullBackup();

      case 'backup:import':
        return dbController.importBackup(payload);

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
