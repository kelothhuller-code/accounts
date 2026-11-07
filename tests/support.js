const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.COMMODITY_DATA_DIR) {
  process.env.COMMODITY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-boot-'));
}
process.env.COMMODITY_SKIP_MONGO = '1';

const { dbController, dbState } = require('../electron/db');

function isolate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-case-'));
  dbController.resetIsolated(dir);
  return { db: dbController, state: dbState, dir };
}

function party(db, name, extra = {}) {
  const summary = db.addSupplier({ name, ...extra }, false);
  return stateParty(summary.id);
}

function stateParty(id) {
  return dbState.suppliers.find(s => s.id === id);
}

module.exports = { isolate, party, stateParty, dbState };
