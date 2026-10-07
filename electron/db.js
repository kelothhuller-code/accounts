const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const mongoose = require('mongoose');

// File storage fallback path in userData
const getUserDataPath = () => {
  try {
    return app ? app.getPath('userData') : path.join(process.cwd(), 'data');
  } catch (e) {
    return path.join(process.cwd(), 'data');
  }
};

const dataDir = getUserDataPath();
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.error('Error creating data directory:', e);
  }
}
const localDbFile = path.join(dataDir, 'commodity_store.json');
const oldDbFile = path.join(dataDir, 'coffee_store.json');
const backupsDir = path.join(dataDir, 'backups');
if (!fs.existsSync(backupsDir)) {
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
  } catch (e) {
    console.error('Error creating backups directory:', e);
  }
}
const archivesDir = path.join(dataDir, 'archives');
if (!fs.existsSync(archivesDir)) {
  try {
    fs.mkdirSync(archivesDir, { recursive: true });
  } catch (e) {
    console.error('Error creating archives directory:', e);
  }
}

// Automatic migration from coffee_store.json to commodity_store.json if old file exists
if (!fs.existsSync(localDbFile) && fs.existsSync(oldDbFile)) {
  try {
    fs.copyFileSync(oldDbFile, localDbFile);
  } catch (e) { }
}

// Default products list - empty array so no products are predefined by default
const DEFAULT_PRODUCTS = [];

// In-Memory & Local File Store State
let dbState = {
  suppliers: [],
  products: [],
  arrivals: [],
  dispatches: [],
  commitments: [],
  settlements: [],
  payments: [],
  epTransfers: [],
  commitmentWashes: [],
  millingLogs: [],
  openingStockEntries: [],
  settings: {
    mongoUri: 'mongodb://127.0.0.1:27017/commoditytracker',
    defaultTcsRate: 0.1, // 0.1% TCS u/s 206C(1H)
    defaultCgstRate: 0,
    defaultSgstRate: 0,
    defaultTdsRate: 0.1,
    companyName: 'Global Commodity Trading & Processing Co.',
    autoBagsWeight: 50, // standard bag size in kg
    openingStock: {
      coffeeBags: 0,
      coffeeWeight: 0,
      coffeeEP: 0,
      huskBags: 0,
      huskWeight: 0
    }
  }
};



// Load existing local DB file
function loadLocalDb() {
  try {
    if (fs.existsSync(localDbFile)) {
      const content = fs.readFileSync(localDbFile, 'utf8');
      const loaded = JSON.parse(content);
      const loadedProducts = loaded.products || [];

      dbState = {
        ...dbState,
        ...loaded,
        suppliers: loaded.suppliers || [],
        arrivals: loaded.arrivals || [],
        dispatches: loaded.dispatches || [],
        commitments: loaded.commitments || [],
        settlements: loaded.settlements || [],
        payments: loaded.payments || [],
        epTransfers: loaded.epTransfers || [],
        commitmentWashes: loaded.commitmentWashes || [],
        millingLogs: loaded.millingLogs || [],
        openingStockEntries: loaded.openingStockEntries || [],
        products: loadedProducts,
        settings: { ...dbState.settings, ...(loaded.settings || {}) }
      };

      // Ensure clean defaults for products without hardcoding any commodity names or rules
      dbState.products = dbState.products.map(p => {
        const cgst = p.cgstRate !== undefined ? Number(p.cgstRate) : 0;
        const sgst = p.sgstRate !== undefined ? Number(p.sgstRate) : 0;
        return {
          ...p,
          calculationBasis: p.calculationBasis || 'direct',
          defaultOutturn: p.defaultOutturn !== undefined ? Number(p.defaultOutturn) : 50,
          defaultOutturnType: p.defaultOutturnType || 'per_50kg',
          cgstRate: cgst,
          sgstRate: sgst,
          igstRate: p.igstRate !== undefined ? Number(p.igstRate) : (cgst + sgst)
        };
      });

      rebuildProductIndices();
      saveLocalDb();
      console.log('Local DB store loaded successfully. Suppliers:', dbState.suppliers.length, 'Products:', dbState.products.length);
    } else {
      rebuildProductIndices();
      saveLocalDb();
    }
  } catch (err) {
    console.error('Error loading local DB file:', err);
  }
}

// Helper: normalize keys for product identification
function normalizeKey(str) {
  if (!str) return '';
  return String(str).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Financial Year Helper: Standard Indian Fiscal Year (1 April - 31 March)
function getFinancialYear(dateStr) {
  if (!dateStr) {
    const now = new Date();
    const yr = now.getFullYear();
    return (now.getMonth() + 1 >= 4) ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
  }
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length >= 2) {
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    if (!isNaN(yr) && !isNaN(mo)) {
      return mo >= 4 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '2026-2027';
  const yr = d.getFullYear();
  return (d.getMonth() + 1 >= 4) ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
}

// Fast in-memory lookup maps for O(1) product identification & categorization
const productNormMap = new Map();
const canonicalNameMap = new Map();
const secondaryProductCache = new Map();

function rebuildProductIndices() {
  productNormMap.clear();
  canonicalNameMap.clear();
  secondaryProductCache.clear();
  const products = dbState.products || [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (p.name) productNormMap.set(normalizeKey(p.name), p);
    if (p.code) productNormMap.set(normalizeKey(p.code), p);
    if (p.id) productNormMap.set(normalizeKey(p.id), p);
  }
}

// Helper: get canonical product name (consistent across records with O(1) cache)
function getCanonicalName(rawName) {
  if (!rawName) return '';
  const trimmed = String(rawName).trim();
  const norm = normalizeKey(trimmed);
  if (!norm) return '';
  if (canonicalNameMap.has(norm)) return canonicalNameMap.get(norm);

  const found = productNormMap.get(norm);
  const result = (found && found.name) ? found.name.trim() : trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ');
  canonicalNameMap.set(norm, result);
  return result;
}

// Calculate effective net bill for an arrival (purchase bill) factoring in TCS and TDS
function getEffectiveArrivalNetAmount(arr) {
  if (!arr) return 0;
  const taxable = Number(arr.taxableAmount) || (Number(arr.weight) * Number(arr.rate)) || 0;
  const cgst = Number(arr.cgstAmount) || 0;
  const sgst = Number(arr.sgstAmount) || 0;
  const igst = Number(arr.igstAmount) || 0;
  const billBase = Number(arr.billAmount) || (taxable + cgst + sgst + igst);
  const tcs = Number(arr.tcsAmount) || (arr.tcsRate ? Math.round((taxable * (Number(arr.tcsRate) / 100)) * 100) / 100 : 0);
  const tds = Number(arr.tdsAmount) || (arr.tdsRate ? Math.round((taxable * (Number(arr.tdsRate) / 100)) * 100) / 100 : 0);

  let net = Number(arr.netAmount);
  if (!net || isNaN(net) || (Math.abs(net - billBase) < 0.01 && (tcs > 0 || tds > 0))) {
    net = Math.round((billBase + tcs - tds) * 100) / 100;
  }
  return net;
}

// Calculate effective net invoice for a dispatch (sale invoice) factoring in TCS and TDS
function getEffectiveDispatchNetAmount(disp) {
  if (!disp) return 0;
  const taxable = Number(disp.taxableAmount) || (Number(disp.weight) * Number(disp.rate)) || 0;
  const cgst = Number(disp.cgstAmount) || 0;
  const sgst = Number(disp.sgstAmount) || 0;
  const igst = Number(disp.igstAmount) || 0;
  const billBase = Number(disp.billAmount) || (taxable + cgst + sgst + igst);
  const tcs = Number(disp.tcsAmount) || (disp.tcsRate ? Math.round((taxable * (Number(disp.tcsRate) / 100)) * 100) / 100 : 0);
  const tds = Number(disp.tdsAmount) || (disp.tdsRate ? Math.round((taxable * (Number(disp.tdsRate) / 100)) * 100) / 100 : 0);

  let net = Number(disp.netAmount);
  if (!net || isNaN(net) || (Math.abs(net - billBase) < 0.01 && (tcs > 0 || tds > 0))) {
    net = Math.round((billBase + tcs - tds) * 100) / 100;
  }
  return net;
}

// Calculate effective net bill for a settlement factoring in TCS and TDS
function getEffectiveSettlementNetAmount(set) {
  if (!set) return 0;
  const gross = Number(set.settlementGrossAmount) || 0;
  const cgst = Number(set.cgstAmount) || 0;
  const sgst = Number(set.sgstAmount) || 0;
  const igst = Number(set.igstAmount) || 0;
  const tcs = Number(set.tcsAmount) || (set.tcsRate ? Math.round((gross * (Number(set.tcsRate) / 100)) * 100) / 100 : 0);
  const tds = Number(set.tdsAmount) || (set.tdsRate ? Math.round((gross * (Number(set.tdsRate) / 100)) * 100) / 100 : 0);

  let net = Number(set.settlementNetAmount);
  if (!net || isNaN(net) || (Math.abs(net - gross) < 0.01 && (tcs > 0 || tds > 0 || cgst > 0 || sgst > 0 || igst > 0))) {
    net = Math.round((gross + cgst + sgst + igst + tcs - tds) * 100) / 100;
  }
  return net;
}

// Global check whether a product is a secondary/by‑product (O(1) cached)
function isSecondaryProduct(pName) {
  if (!pName) return false;
  const canonical = getCanonicalName(pName);
  if (secondaryProductCache.has(canonical)) {
    return secondaryProductCache.get(canonical);
  }

  let isSec = false;
  const prodObj = productNormMap.get(normalizeKey(canonical));
  if (prodObj) {
    if (prodObj.isSecondary === true || prodObj.productType === 'secondary' || prodObj.category === 'Secondary Product' || prodObj.category === 'husk') {
      isSec = true;
    } else if (prodObj.isSecondary === false && prodObj.isMain === true) {
      isSec = false;
    } else {
      // Check if product is treated as secondary in milling log outputs
      const millingLogs = dbState.millingLogs || [];
      const isMillingSecondary = millingLogs.some(m =>
        (m.outputs || []).some(o => getCanonicalName(o.product) === canonical && o.isSecondary)
      );
      if (isMillingSecondary) {
        isSec = true;
      } else if (prodObj.isMain === true || prodObj.category === 'Primary Product') {
        isSec = false;
      } else {
        isSec = (canonical || '').toLowerCase().includes('husk');
      }
    }
  } else {
    // Check milling logs for secondary outputs
    const millingLogs = dbState.millingLogs || [];
    const isMillingSecondary = millingLogs.some(m =>
      (m.outputs || []).some(o => getCanonicalName(o.product) === canonical && o.isSecondary)
    );
    if (isMillingSecondary) {
      isSec = true;
    } else {
      isSec = (pName || '').toLowerCase().includes('husk');
    }
  }

  secondaryProductCache.set(canonical, isSec);
  return isSec;
}

function hasConfiguredMongoUri() {
  const uri = dbState.settings && dbState.settings.mongoUri;
  return !!(uri && typeof uri === 'string' && uri.trim() !== '' && uri.trim().toLowerCase() !== 'standalone');
}

function ensureDatabaseReady() {
  if (dbState.settings && dbState.settings.enforceMongo === true && !isMongoConnected) {
    const detail = mongoError ? `: ${mongoError}` : '';
    throw new Error(`MongoDB Connection Problem${detail}. Enforce MongoDB is enabled, but the database connection is offline. Operations are suspended.`);
  }
}

let lastBackupDateStr = '';

function performDailyBackupIfNeeded() {
  try {
    const today = new Date().toISOString().split('T')[0];
    if (lastBackupDateStr === today) return;
    const backupFile = path.join(backupsDir, `commodity_backup_${today}.json`);
    if (!fs.existsSync(backupFile)) {
      const serialized = JSON.stringify(dbState);
      fs.writeFileSync(backupFile, serialized, 'utf8');
      console.log(`Automatic rolling backup generated: ${backupFile}`);
    }
    lastBackupDateStr = today;

    // Prune backups keeping the 14 latest
    const files = fs.readdirSync(backupsDir);
    const backupFiles = files
      .filter(f => f.startsWith('commodity_backup_') && f.endsWith('.json'))
      .sort();
    if (backupFiles.length > 14) {
      const toDelete = backupFiles.slice(0, backupFiles.length - 14);
      toDelete.forEach(f => {
        try {
          fs.unlinkSync(path.join(backupsDir, f));
        } catch (e) { }
      });
    }
  } catch (err) {
    console.warn('Backup check error:', err.message);
  }
}

// High-Performance Non-blocking Asynchronous Write Queue with Coalescing & Atomic Rename
let saveDebounceTimer = null;
let isWritingDisk = false;
let queuedWritePending = false;

async function flushDbToDiskAsync() {
  if (isWritingDisk) {
    queuedWritePending = true;
    return;
  }
  isWritingDisk = true;
  try {
    const serialized = JSON.stringify(dbState);
    const tempFile = localDbFile + '.tmp';
    await fs.promises.writeFile(tempFile, serialized, 'utf8');
    await fs.promises.rename(tempFile, localDbFile);
    performDailyBackupIfNeeded();
  } catch (err) {
    console.error('Error saving local DB file asynchronously:', err);
  } finally {
    isWritingDisk = false;
    if (queuedWritePending) {
      queuedWritePending = false;
      setImmediate(flushDbToDiskAsync);
    }
  }
}

function saveLocalDb(options = {}) {
  // Synchronous immediate write if explicitly requested (e.g. exit, export, reset)
  if (options && options.immediate === true) {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    try {
      const serialized = JSON.stringify(dbState);
      const tempFile = localDbFile + '.tmp';
      fs.writeFileSync(tempFile, serialized, 'utf8');
      fs.renameSync(tempFile, localDbFile);
      performDailyBackupIfNeeded();
    } catch (err) {
      console.error('Error saving local DB file synchronously:', err);
    }
    return;
  }

  // Non-blocking background flush coalesced within 40ms window (avoids freezing UI / event loop)
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(flushDbToDiskAsync, 40);
}

// MongoDB connection status
let isMongoConnected = false;
let mongoError = null;

// Initialize Mongoose connection with graceful fallback
async function initMongo(uri) {
  const connectionUri = uri || dbState.settings.mongoUri;
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(connectionUri, {
      serverSelectionTimeoutMS: 4000,
    });
    isMongoConnected = true;
    mongoError = null;
    console.log('MongoDB connected successfully to:', connectionUri);
    await syncWithMongo();
  } catch (err) {
    isMongoConnected = false;
    mongoError = err.message;
    console.warn('MongoDB connection note: local standalone storage active (' + err.message + ')');
  }
}

// Mongoose Schemas
const SupplierSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  phone: String,
  place: String,
  gst: String,
  notes: String,
  openingBalance: Number,
  openingBalanceType: String, // 'credit' (we owe them) or 'debit' (they owe us)
  openingStorageBags: Number,
  openingStorageEP: Number,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const ArrivalSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  arrivalNo: String,
  date: String,
  supplierId: String,
  supplierName: String,
  vehicleNo: String,
  product: String,
  isMain: Boolean,
  isSecondary: Boolean,
  weight: Number,
  bags: Number,
  outturn: Number,
  outturnType: String,
  endProductWeight: Number,
  rateType: String, // 'fixed', 'commitment', 'storage'
  rate: Number,
  taxableAmount: Number,
  billType: String, // 'gst_bill' or 'cash_bill'
  cgstRate: Number,
  cgstAmount: Number,
  sgstRate: Number,
  sgstAmount: Number,
  igstRate: Number,
  igstAmount: Number,
  tdsRate: Number,
  tdsAmount: Number,
  billAmount: Number,
  tcsRate: Number,
  tcsAmount: Number,
  netAmount: Number,
  status: String, // 'billed', 'cash_bill', 'storage', 'settled', 'partial_settled'
  settledBags: Number,
  remainingBags: Number,
  settledEndProduct: Number,
  remainingEndProduct: Number,
  settlementIds: [String],
  commitmentId: String,
  remarks: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const DispatchSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  dispatchNo: String,
  date: String,
  supplierId: String,
  supplierName: String,
  vehicleNo: String,
  dispatchType: String, // 'coffee' or 'husk'
  product: String,
  isMain: Boolean,
  isSecondary: Boolean,
  weight: Number,
  bags: Number,
  endProductWeight: Number,
  rateType: String, // 'fixed', 'commitment', 'storage_out'
  rate: Number,
  taxableAmount: Number,
  billType: String, // 'gst_bill' or 'cash_bill'
  cgstRate: Number,
  cgstAmount: Number,
  sgstRate: Number,
  sgstAmount: Number,
  igstRate: Number,
  igstAmount: Number,
  tdsRate: Number,
  tdsAmount: Number,
  billAmount: Number,
  tcsRate: Number,
  tcsAmount: Number,
  netAmount: Number,
  status: String, // 'billed', 'cash_bill', 'storage_out'
  commitmentId: String,
  remarks: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const CommitmentSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  commitmentNo: String,
  supplierId: String,
  supplierName: String,
  category: String, // 'purchase' or 'sale'
  product: String,
  isMain: Boolean,
  isSecondary: Boolean,
  type: String, // 'bags' or 'end_product'
  quantity: Number,
  rate: Number,
  fulfilledQty: Number,
  remainingQty: Number,
  status: String, // 'active', 'fulfilled', 'cancelled', 'washed'
  date: String,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const SettlementSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  settlementNo: String,
  date: String,
  supplierId: String,
  supplierName: String,
  product: String,
  isMain: Boolean,
  isSecondary: Boolean,
  arrivalIds: [String],
  totalSelectedBags: Number,
  totalSelectedWeight: Number,
  totalSelectedEndProduct: Number,
  averageOutturn: Number,
  settledBags: Number,
  settledEndProduct: Number,
  settlementRate: Number,
  rateType: String,
  settlementGrossAmount: Number,
  tcsRate: Number,
  tcsAmount: Number,
  tdsRate: Number,
  tdsAmount: Number,
  settlementNetAmount: Number,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const PaymentSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  paymentNo: String,
  date: String,
  supplierId: String,
  supplierName: String,
  type: String, // 'payment_paid' (paid to supplier) | 'payment_received' (received from supplier)
  mode: String,
  amount: Number,
  reference: String,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const EpTransferSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  transferNo: String,
  date: String,
  fromPartyId: String,
  fromPartyName: String,
  toPartyId: String,
  toPartyName: String,
  product: String,
  isMain: Boolean,
  isSecondary: Boolean,
  bags: Number,
  weight: Number,
  endProductWeight: Number,
  rate: Number,
  transferValue: Number,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const CommitmentWashSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  washNo: String,
  date: String,
  supplierId: String,
  supplierName: String,
  product: String,
  isMain: Boolean,
  isSecondary: Boolean,
  purchaseCommitmentId: String,
  purchaseCommitmentNo: String,
  purchaseRate: Number,
  saleCommitmentId: String,
  saleCommitmentNo: String,
  saleRate: Number,
  quantityWashed: Number,
  rateDifference: Number,
  adjustmentAmount: Number,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const ProductSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  code: String,
  name: String,
  isMain: Boolean,
  isSecondary: Boolean,
  category: String,
  calculationBasis: String,
  defaultOutturn: Number,
  defaultOutturnType: String,
  cgstRate: Number,
  sgstRate: Number,
  igstRate: Number,
  hsnCode: String,
  description: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const MillingLogSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  millingNo: String,
  date: String,
  godown: String,
  sourceProduct: String,
  sourceIsMain: Boolean,
  sourceIsSecondary: Boolean,
  sourceBags: Number,
  sourceWeight: Number,
  sourceOutturn: Number,
  inputEPWeight: Number,
  outputs: Array,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const OpeningStockEntrySchema = new mongoose.Schema({
  id: { type: String, unique: true },
  date: String,
  godown: String,
  supplierId: String,
  supplierName: String,
  product: String,
  isSecondary: Boolean,
  bags: Number,
  weight: Number,
  outturn: Number,
  endProductWeight: Number,
  notes: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const ProcessingProfileSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  sourceProduct: String,
  outputs: Array,
  updatedAt: { type: Date, default: Date.now }
}, { strict: false });

// High-performance compound indexes for MongoDB queries at multi-year scale
try {
  SupplierSchema.index({ name: 1 });
  SupplierSchema.index({ phone: 1 });

  ArrivalSchema.index({ supplierId: 1, date: -1 });
  ArrivalSchema.index({ product: 1, date: -1 });
  ArrivalSchema.index({ date: -1 });
  ArrivalSchema.index({ status: 1 });
  ArrivalSchema.index({ fy: 1 });

  DispatchSchema.index({ supplierId: 1, date: -1 });
  DispatchSchema.index({ product: 1, date: -1 });
  DispatchSchema.index({ date: -1 });
  DispatchSchema.index({ status: 1 });
  DispatchSchema.index({ fy: 1 });

  CommitmentSchema.index({ supplierId: 1, status: 1 });
  CommitmentSchema.index({ category: 1, status: 1 });
  CommitmentSchema.index({ product: 1 });

  SettlementSchema.index({ supplierId: 1, date: -1 });
  SettlementSchema.index({ date: -1 });
  SettlementSchema.index({ fy: 1 });

  PaymentSchema.index({ supplierId: 1, date: -1 });
  PaymentSchema.index({ date: -1 });
  PaymentSchema.index({ fy: 1 });

  EpTransferSchema.index({ fromPartyId: 1, toPartyId: 1, date: -1 });
  EpTransferSchema.index({ date: -1 });

  MillingLogSchema.index({ sourceProduct: 1, date: -1 });
  MillingLogSchema.index({ date: -1 });
  MillingLogSchema.index({ fy: 1 });

  OpeningStockEntrySchema.index({ godown: 1, product: 1, date: -1 });
  OpeningStockEntrySchema.index({ supplierId: 1 });
  OpeningStockEntrySchema.index({ fy: 1 });
} catch (idxErr) {
  console.warn('Index registration note:', idxErr.message);
}

let MongoSupplier, MongoArrival, MongoDispatch, MongoCommitment, MongoSettlement, MongoPayment, MongoEpTransfer, MongoCommitmentWash, MongoProduct, MongoMillingLog, MongoOpeningStockEntry, MongoProcessingProfile;

try {
  MongoSupplier = mongoose.model('Supplier', SupplierSchema);
  MongoArrival = mongoose.model('Arrival', ArrivalSchema);
  MongoDispatch = mongoose.model('Dispatch', DispatchSchema);
  MongoCommitment = mongoose.model('Commitment', CommitmentSchema);
  MongoSettlement = mongoose.model('Settlement', SettlementSchema);
  MongoPayment = mongoose.model('Payment', PaymentSchema);
  MongoEpTransfer = mongoose.model('EpTransfer', EpTransferSchema);
  MongoCommitmentWash = mongoose.model('CommitmentWash', CommitmentWashSchema);
  MongoProduct = mongoose.model('Product', ProductSchema);
  MongoMillingLog = mongoose.model('MillingLog', MillingLogSchema);
  MongoOpeningStockEntry = mongoose.model('OpeningStockEntry', OpeningStockEntrySchema);
  MongoProcessingProfile = mongoose.model('ProcessingProfile', ProcessingProfileSchema);
} catch (e) { }

function mergeCollections(localList = [], remoteList = []) {
  const map = new Map();
  for (const item of (localList || [])) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of (remoteList || [])) {
    if (item && item.id) {
      const existing = map.get(item.id);
      map.set(item.id, existing ? { ...existing, ...item } : item);
    }
  }
  return Array.from(map.values());
}

function mergeSuppliers(localList = [], remoteList = []) {
  const map = new Map();
  const nameToId = new Map();

  for (const item of (localList || [])) {
    if (item && item.id) {
      map.set(item.id, item);
      const normName = (item.name || '').trim().toLowerCase();
      if (normName) nameToId.set(normName, item.id);
    }
  }

  for (const item of (remoteList || [])) {
    if (!item) continue;
    const normName = (item.name || '').trim().toLowerCase();
    const existingId = (item.id && map.has(item.id)) ? item.id : (normName ? nameToId.get(normName) : null);

    if (existingId) {
      const existing = map.get(existingId);
      const isExistingAllUpper = existing.name === existing.name.toUpperCase();
      const isItemAllUpper = item.name === item.name.toUpperCase();
      const cleanName = (isExistingAllUpper && !isItemAllUpper) ? item.name : (existing.name || item.name);

      const merged = {
        ...existing,
        ...item,
        id: existing.id,
        name: cleanName,
        openingBalance: (existing.openingBalance !== undefined && existing.openingBalance !== 0) 
          ? existing.openingBalance 
          : (item.openingBalance || 0),
        openingBalanceType: existing.openingBalanceType || item.openingBalanceType || 'credit',
        openingStorageBags: (existing.openingStorageBags || 0) || (item.openingStorageBags || 0),
        openingStorageEP: (existing.openingStorageEP || 0) || (item.openingStorageEP || 0),
        phone: existing.phone || item.phone || '',
        place: existing.place || item.place || '',
        gst: existing.gst || item.gst || '',
        notes: existing.notes || item.notes || ''
      };
      map.set(existingId, merged);
    } else if (item.id) {
      map.set(item.id, item);
      if (normName) nameToId.set(normName, item.id);
    }
  }

  return Array.from(map.values());
}

function deduplicateSuppliersInDb() {
  const nameMap = new Map();
  const duplicateReplacements = new Map(); // dupId -> primaryId
  const uniqueSuppliers = [];

  for (const sup of (dbState.suppliers || [])) {
    if (!sup || !sup.name) continue;
    const norm = sup.name.trim().toLowerCase();
    if (!nameMap.has(norm)) {
      nameMap.set(norm, sup);
      uniqueSuppliers.push(sup);
    } else {
      const primary = nameMap.get(norm);
      duplicateReplacements.set(sup.id, primary.id);

      const isSupAllUpper = sup.name === sup.name.toUpperCase();
      const isPrimaryAllUpper = primary.name === primary.name.toUpperCase();
      if (isPrimaryAllUpper && !isSupAllUpper) {
        primary.name = sup.name;
      }

      if ((!primary.openingBalance || primary.openingBalance === 0) && sup.openingBalance) {
        primary.openingBalance = sup.openingBalance;
        primary.openingBalanceType = sup.openingBalanceType || 'credit';
      }
      if ((!primary.openingStorageBags || primary.openingStorageBags === 0) && sup.openingStorageBags) {
        primary.openingStorageBags = sup.openingStorageBags;
      }
      if ((!primary.openingStorageEP || primary.openingStorageEP === 0) && sup.openingStorageEP) {
        primary.openingStorageEP = sup.openingStorageEP;
      }
      if (!primary.phone && sup.phone) primary.phone = sup.phone;
      if (!primary.place && sup.place) primary.place = sup.place;
      if (!primary.gst && sup.gst) primary.gst = sup.gst;
      if (!primary.notes && sup.notes) primary.notes = sup.notes;
    }
  }

  if (duplicateReplacements.size > 0) {
    dbState.suppliers = uniqueSuppliers;

    (dbState.arrivals || []).forEach(a => {
      if (duplicateReplacements.has(a.supplierId)) {
        a.supplierId = duplicateReplacements.get(a.supplierId);
      }
    });
    (dbState.dispatches || []).forEach(d => {
      if (duplicateReplacements.has(d.supplierId)) d.supplierId = duplicateReplacements.get(d.supplierId);
      if (duplicateReplacements.has(d.partyId)) d.partyId = duplicateReplacements.get(d.partyId);
    });
    (dbState.commitments || []).forEach(c => {
      if (duplicateReplacements.has(c.supplierId)) c.supplierId = duplicateReplacements.get(c.supplierId);
      if (duplicateReplacements.has(c.partyId)) c.partyId = duplicateReplacements.get(c.partyId);
    });
    (dbState.settlements || []).forEach(s => {
      if (duplicateReplacements.has(s.supplierId)) s.supplierId = duplicateReplacements.get(s.supplierId);
    });
    (dbState.payments || []).forEach(p => {
      if (duplicateReplacements.has(p.supplierId)) p.supplierId = duplicateReplacements.get(p.supplierId);
    });
    (dbState.epTransfers || []).forEach(t => {
      if (duplicateReplacements.has(t.fromPartyId)) t.fromPartyId = duplicateReplacements.get(t.fromPartyId);
      if (duplicateReplacements.has(t.toPartyId)) t.toPartyId = duplicateReplacements.get(t.toPartyId);
    });
    (dbState.commitmentWashes || []).forEach(w => {
      if (duplicateReplacements.has(w.supplierId)) w.supplierId = duplicateReplacements.get(w.supplierId);
      if (duplicateReplacements.has(w.partyId)) w.partyId = duplicateReplacements.get(w.partyId);
    });

    saveLocalDb();

    if (isMongoConnected && MongoSupplier) {
      for (const dupId of duplicateReplacements.keys()) {
        MongoSupplier.deleteOne({ id: dupId }).catch(() => {});
      }
    }
    console.log(`Deduplication complete: merged ${duplicateReplacements.size} duplicate parties.`);
  }

  return { mergedCount: duplicateReplacements.size };
}

async function loadFromMongo() {
  if (!isMongoConnected) return;
  try {
    const [sups, arrs, disps, comms, sets, pays, trfs, washes, prods, mills, ops, profs] = await Promise.all([
      MongoSupplier.find({}).lean(),
      MongoArrival.find({}).lean(),
      MongoDispatch.find({}).lean(),
      MongoCommitment.find({}).lean(),
      MongoSettlement.find({}).lean(),
      MongoPayment.find({}).lean(),
      MongoEpTransfer.find({}).lean(),
      MongoCommitmentWash.find({}).lean(),
      MongoProduct.find({}).lean(),
      MongoMillingLog.find({}).lean(),
      MongoOpeningStockEntry.find({}).lean(),
      MongoProcessingProfile ? MongoProcessingProfile.find({}).lean() : Promise.resolve([])
    ]);

    dbState.suppliers = (sups || []).map(s => { delete s._id; delete s.__v; return s; });
    dbState.arrivals = (arrs || []).map(a => { delete a._id; delete a.__v; return a; });
    dbState.dispatches = (disps || []).map(d => { delete d._id; delete d.__v; return d; });
    dbState.commitments = (comms || []).map(c => { delete c._id; delete c.__v; return c; });
    dbState.settlements = (sets || []).map(st => { delete st._id; delete st.__v; return st; });
    dbState.payments = (pays || []).map(p => { delete p._id; delete p.__v; return p; });
    dbState.epTransfers = (trfs || []).map(t => { delete t._id; delete t.__v; return t; });
    dbState.commitmentWashes = (washes || []).map(w => { delete w._id; delete w.__v; return w; });
    dbState.products = (prods || []).map(pr => { delete pr._id; delete pr.__v; return pr; });
    dbState.millingLogs = (mills || []).map(m => { delete m._id; delete m.__v; return m; });
    dbState.openingStockEntries = (ops || []).map(o => { delete o._id; delete o.__v; return o; });

    if (!dbState.settings) dbState.settings = {};
    dbState.settings.processingProfiles = {};
    for (const prof of (profs || [])) {
      if (prof && prof.sourceProduct) {
        dbState.settings.processingProfiles[prof.sourceProduct] = prof.outputs || [];
      }
    }

    deduplicateSuppliersInDb();
    rebuildProductIndices();
    saveLocalDb();
    console.log('Local cache cleanly reloaded from MongoDB collections.');
  } catch (err) {
    console.error('Error reloading clean state from MongoDB:', err);
  }
}

async function syncWithMongo() {
  if (!isMongoConnected) return;
  try {
    deduplicateSuppliersInDb();

    // 1. Upload local data to Mongo so any locally added items get pushed to cloud
    for (const sup of (dbState.suppliers || [])) {
      await MongoSupplier.findOneAndUpdate({ id: sup.id }, sup, { upsert: true });
    }
    for (const arr of (dbState.arrivals || [])) {
      await MongoArrival.findOneAndUpdate({ id: arr.id }, arr, { upsert: true });
    }
    for (const disp of (dbState.dispatches || [])) {
      await MongoDispatch.findOneAndUpdate({ id: disp.id }, disp, { upsert: true });
    }
    for (const com of (dbState.commitments || [])) {
      await MongoCommitment.findOneAndUpdate({ id: com.id }, com, { upsert: true });
    }
    for (const set of (dbState.settlements || [])) {
      await MongoSettlement.findOneAndUpdate({ id: set.id }, set, { upsert: true });
    }
    for (const pay of (dbState.payments || [])) {
      await MongoPayment.findOneAndUpdate({ id: pay.id }, pay, { upsert: true });
    }
    for (const trf of (dbState.epTransfers || [])) {
      await MongoEpTransfer.findOneAndUpdate({ id: trf.id }, trf, { upsert: true });
    }
    for (const wash of (dbState.commitmentWashes || [])) {
      await MongoCommitmentWash.findOneAndUpdate({ id: wash.id }, wash, { upsert: true });
    }
    for (const prod of (dbState.products || [])) {
      await MongoProduct.findOneAndUpdate({ id: prod.id }, prod, { upsert: true });
    }
    for (const mill of (dbState.millingLogs || [])) {
      await MongoMillingLog.findOneAndUpdate({ id: mill.id }, mill, { upsert: true });
    }
    for (const op of (dbState.openingStockEntries || [])) {
      await MongoOpeningStockEntry.findOneAndUpdate({ id: op.id }, op, { upsert: true });
    }
    if (MongoProcessingProfile && dbState.settings && dbState.settings.processingProfiles) {
      for (const [sourceProduct, outputs] of Object.entries(dbState.settings.processingProfiles)) {
        await MongoProcessingProfile.findOneAndUpdate(
          { id: sourceProduct },
          { id: sourceProduct, sourceProduct, outputs, updatedAt: new Date() },
          { upsert: true }
        );
      }
    }

    // 2. Fetch remote collections from Mongo and merge cleanly
    const [sups, arrs, disps, comms, sets, pays, trfs, washes, prods, mills, ops, profs] = await Promise.all([
      MongoSupplier.find({}).lean(),
      MongoArrival.find({}).lean(),
      MongoDispatch.find({}).lean(),
      MongoCommitment.find({}).lean(),
      MongoSettlement.find({}).lean(),
      MongoPayment.find({}).lean(),
      MongoEpTransfer.find({}).lean(),
      MongoCommitmentWash.find({}).lean(),
      MongoProduct.find({}).lean(),
      MongoMillingLog.find({}).lean(),
      MongoOpeningStockEntry.find({}).lean(),
      MongoProcessingProfile ? MongoProcessingProfile.find({}).lean() : Promise.resolve([])
    ]);

    const cleanedSups = (sups || []).map(s => { delete s._id; delete s.__v; return s; });
    const cleanedArrs = (arrs || []).map(a => { delete a._id; delete a.__v; return a; });
    const cleanedDisps = (disps || []).map(d => { delete d._id; delete d.__v; return d; });
    const cleanedComms = (comms || []).map(c => { delete c._id; delete c.__v; return c; });
    const cleanedSets = (sets || []).map(st => { delete st._id; delete st.__v; return st; });
    const cleanedPays = (pays || []).map(p => { delete p._id; delete p.__v; return p; });
    const cleanedTrfs = (trfs || []).map(t => { delete t._id; delete t.__v; return t; });
    const cleanedWashes = (washes || []).map(w => { delete w._id; delete w.__v; return w; });
    const cleanedProds = (prods || []).map(pr => { delete pr._id; delete pr.__v; return pr; });
    const cleanedMills = (mills || []).map(m => { delete m._id; delete m.__v; return m; });
    const cleanedOps = (ops || []).map(o => { delete o._id; delete o.__v; return o; });

    dbState.suppliers = mergeSuppliers(dbState.suppliers, cleanedSups);
    dbState.arrivals = mergeCollections(dbState.arrivals, cleanedArrs);
    dbState.dispatches = mergeCollections(dbState.dispatches, cleanedDisps);
    dbState.commitments = mergeCollections(dbState.commitments, cleanedComms);
    dbState.settlements = mergeCollections(dbState.settlements, cleanedSets);
    dbState.payments = mergeCollections(dbState.payments, cleanedPays);
    dbState.epTransfers = mergeCollections(dbState.epTransfers, cleanedTrfs);
    dbState.commitmentWashes = mergeCollections(dbState.commitmentWashes, cleanedWashes);
    dbState.products = mergeCollections(dbState.products, cleanedProds);
    dbState.millingLogs = mergeCollections(dbState.millingLogs, cleanedMills);
    dbState.openingStockEntries = mergeCollections(dbState.openingStockEntries, cleanedOps);

    if (!dbState.settings) dbState.settings = {};
    if (!dbState.settings.processingProfiles) dbState.settings.processingProfiles = {};
    for (const prof of (profs || [])) {
      if (prof && prof.sourceProduct) {
        dbState.settings.processingProfiles[prof.sourceProduct] = prof.outputs || [];
      }
    }

    deduplicateSuppliersInDb();
    saveLocalDb();
  } catch (err) {
    console.error('Error syncing with MongoDB:', err);
  }
}

// Pre-grouping helper for O(N + M) instant ledger aggregation across all suppliers
function buildSupplierLookupMaps() {
  const arrivalsBySupplier = {};
  const dispatchesBySupplier = {};
  const settlementsBySupplier = {};
  const paymentsBySupplier = {};
  const commitmentsBySupplier = {};
  const epTransfersBySupplier = {};
  const washesBySupplier = {};

  (dbState.arrivals || []).forEach(a => {
    if (!a.supplierId) return;
    if (!arrivalsBySupplier[a.supplierId]) arrivalsBySupplier[a.supplierId] = [];
    arrivalsBySupplier[a.supplierId].push(a);
  });

  (dbState.dispatches || []).forEach(d => {
    const sId = d.supplierId || d.partyId;
    if (!sId) return;
    if (!dispatchesBySupplier[sId]) dispatchesBySupplier[sId] = [];
    dispatchesBySupplier[sId].push(d);
  });

  (dbState.settlements || []).forEach(s => {
    if (!s.supplierId) return;
    if (!settlementsBySupplier[s.supplierId]) settlementsBySupplier[s.supplierId] = [];
    settlementsBySupplier[s.supplierId].push(s);
  });

  (dbState.payments || []).forEach(p => {
    if (!p.supplierId) return;
    if (!paymentsBySupplier[p.supplierId]) paymentsBySupplier[p.supplierId] = [];
    paymentsBySupplier[p.supplierId].push(p);
  });

  (dbState.commitments || []).forEach(c => {
    const sId = c.supplierId || c.partyId;
    if (!sId) return;
    if (!commitmentsBySupplier[sId]) commitmentsBySupplier[sId] = [];
    commitmentsBySupplier[sId].push(c);
  });

  (dbState.epTransfers || []).forEach(t => {
    if (t.fromPartyId) {
      if (!epTransfersBySupplier[t.fromPartyId]) epTransfersBySupplier[t.fromPartyId] = [];
      epTransfersBySupplier[t.fromPartyId].push(t);
    }
    if (t.toPartyId && t.toPartyId !== t.fromPartyId) {
      if (!epTransfersBySupplier[t.toPartyId]) epTransfersBySupplier[t.toPartyId] = [];
      epTransfersBySupplier[t.toPartyId].push(t);
    }
  });

  (dbState.commitmentWashes || []).forEach(w => {
    const sId = w.supplierId || w.partyId;
    if (!sId) return;
    if (!washesBySupplier[sId]) washesBySupplier[sId] = [];
    washesBySupplier[sId].push(w);
  });

  return {
    arrivalsBySupplier,
    dispatchesBySupplier,
    settlementsBySupplier,
    paymentsBySupplier,
    commitmentsBySupplier,
    epTransfersBySupplier,
    washesBySupplier
  };
}

// Business Calculations for Supplier / Party Accounts & Ledger
function calculateSupplierLedger(supplierId, pregrouped = null, maxDate = null) {
  const supplier = dbState.suppliers.find(s => s.id === supplierId);
  if (!supplier) return null;

  let arrivals = pregrouped ? (pregrouped.arrivalsBySupplier[supplierId] || []) : (dbState.arrivals || []).filter(a => a.supplierId === supplierId);
  let dispatches = pregrouped ? (pregrouped.dispatchesBySupplier[supplierId] || []) : (dbState.dispatches || []).filter(d => d.supplierId === supplierId || d.partyId === supplierId);
  let settlements = pregrouped ? (pregrouped.settlementsBySupplier[supplierId] || []) : (dbState.settlements || []).filter(s => s.supplierId === supplierId);
  let payments = pregrouped ? (pregrouped.paymentsBySupplier[supplierId] || []) : (dbState.payments || []).filter(p => p.supplierId === supplierId);
  let commitments = pregrouped ? (pregrouped.commitmentsBySupplier[supplierId] || []) : (dbState.commitments || []).filter(c => c.supplierId === supplierId || c.partyId === supplierId);
  let epTransfers = pregrouped ? (pregrouped.epTransfersBySupplier[supplierId] || []) : (dbState.epTransfers || []).filter(t => t.fromPartyId === supplierId || t.toPartyId === supplierId);
  let washes = pregrouped ? (pregrouped.washesBySupplier[supplierId] || []) : (dbState.commitmentWashes || []).filter(w => w.supplierId === supplierId || w.partyId === supplierId);

  if (maxDate) {
    arrivals = arrivals.filter(a => a.date <= maxDate);
    dispatches = dispatches.filter(d => d.date <= maxDate);
    settlements = settlements.filter(s => s.date <= maxDate);
    payments = payments.filter(p => p.date <= maxDate);
    commitments = commitments.filter(c => c.date <= maxDate);
    epTransfers = epTransfers.filter(t => t.date <= maxDate);
    washes = washes.filter(w => w.date <= maxDate);
  }

  // Financial Ledger tracking
  let totalPurchasesBilled = 0;
  let totalSalesBilled = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTdsDeducted = 0;
  let totalTcsDeducted = 0;

  // Physical Coffee Stock tracking
  let totalRawWeight = 0;
  let totalBags = 0;
  let totalEndProduct = 0;

  let totalDispatchWeight = 0;
  let totalDispatchBags = 0;
  let totalHuskWeight = 0;
  let totalHuskBags = 0;

  // Stored Coffee Stock (Store In vs Store Out)
  let storeInBags = 0;
  let storeInEP = 0;
  let storeOutBags = 0;
  let storeOutEP = 0;

  // 1. Process Arrivals (Purchases / Store In)
  arrivals.forEach(arr => {
    totalRawWeight += (Number(arr.weight) || 0);
    totalBags += (Number(arr.bags) || 0);
    totalEndProduct += (Number(arr.endProductWeight) || 0);

    if (arr.status === 'storage' || arr.status === 'partial_settled') {
      const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : Number(arr.bags);
      const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : Number(arr.endProductWeight);

      storeInBags += remBags;
      storeInEP += remEP;
    }

    if (arr.status === 'billed' || arr.status === 'cash_bill') {
      const bill = getEffectiveArrivalNetAmount(arr);
      totalPurchasesBilled += bill;
      totalCgst += (Number(arr.cgstAmount) || 0);
      totalSgst += (Number(arr.sgstAmount) || 0);
      totalIgst += (Number(arr.igstAmount) || 0);
      const taxable = Number(arr.taxableAmount) || (Number(arr.weight) * Number(arr.rate)) || 0;
      const tcs = Number(arr.tcsAmount) || (arr.tcsRate ? Math.round((taxable * (Number(arr.tcsRate) / 100)) * 100) / 100 : 0);
      const tds = Number(arr.tdsAmount) || (arr.tdsRate ? Math.round((taxable * (Number(arr.tdsRate) / 100)) * 100) / 100 : 0);
      totalTdsDeducted += tds;
      totalTcsDeducted += tcs;
    }
  });

  // 2. Process Dispatches (Sales / Store Out / Secondary Byproducts)
  dispatches.forEach(disp => {
    const isSecondary = disp.isSecondary !== undefined ? (disp.isSecondary === true) : (disp.isMain === true ? false : isSecondaryProduct(disp.product));
    const weight = Number(disp.weight) || 0;
    const bags = Number(disp.bags) || 0;

    if (isSecondary) {
      totalHuskWeight += weight;
      totalHuskBags += bags;
    } else {
      totalDispatchWeight += weight;
      totalDispatchBags += bags;
    }

    if (disp.status === 'storage_out' || disp.rateType === 'storage_out' || (disp.rateType === 'storage_out' && disp.status === 'partial_settled')) {
      if (!isSecondary) {
        const remBags = disp.remainingBags !== undefined ? Number(disp.remainingBags) : bags;
        const remEP = disp.remainingEndProduct !== undefined ? Number(disp.remainingEndProduct) : (Number(disp.endProductWeight) || weight);
        storeOutBags += remBags;
        storeOutEP += remEP;
      }
    } else {
      const bill = getEffectiveDispatchNetAmount(disp);
      totalSalesBilled += bill;
      totalCgst += (Number(disp.cgstAmount) || 0);
      totalSgst += (Number(disp.sgstAmount) || 0);
      totalIgst += (Number(disp.igstAmount) || 0);
      const taxable = Number(disp.taxableAmount) || (Number(disp.weight) * Number(disp.rate)) || 0;
      const tcs = Number(disp.tcsAmount) || (disp.tcsRate ? Math.round((taxable * (Number(disp.tcsRate) / 100)) * 100) / 100 : 0);
      const tds = Number(disp.tdsAmount) || (disp.tdsRate ? Math.round((taxable * (Number(disp.tdsRate) / 100)) * 100) / 100 : 0);
      totalTdsDeducted += tds;
      totalTcsDeducted += tcs;
    }
  });

  // 3. Process Storage Settlements
  settlements.forEach(set => {
    const bill = getEffectiveSettlementNetAmount(set);
    if (set.settlementCategory === 'sales_storage') {
      totalSalesBilled += bill;
    } else {
      totalPurchasesBilled += bill;
    }
    const gross = Number(set.settlementGrossAmount) || 0;
    const tcs = Number(set.tcsAmount) || (set.tcsRate ? Math.round((gross * (Number(set.tcsRate) / 100)) * 100) / 100 : 0);
    const tds = Number(set.tdsAmount) || (set.tdsRate ? Math.round((gross * (Number(set.tdsRate) / 100)) * 100) / 100 : 0);
    totalTcsDeducted += tcs;
    totalTdsDeducted += tds;
  });

  // Net Stored Stock calculation before EP Transfers
  let storageBags = Math.max(0, (Number(supplier.openingStorageBags) || 0) + storeInBags - storeOutBags);
  let storageEndProduct = Math.max(0, (Number(supplier.openingStorageEP) || 0) + storeInEP - storeOutEP);

  // 4. Process EP Stock Transfers
  let epTransferredOut = 0;
  let epTransferredIn = 0;
  let transferFinancialNet = 0;

  epTransfers.forEach(trf => {
    const val = Number(trf.transferValue) || 0;
    const ep = Number(trf.endProductWeight) || 0;
    const b = Number(trf.bags) || 0;

    if (trf.fromPartyId === supplierId) {
      epTransferredOut += ep;
      storageEndProduct = Math.max(0, storageEndProduct - ep);
      storageBags = Math.max(0, storageBags - b);
      transferFinancialNet -= val;
    }
    if (trf.toPartyId === supplierId) {
      epTransferredIn += ep;
      storageEndProduct += ep;
      storageBags += b;
      transferFinancialNet += val;
    }
  });

  // 5. Process Commitment Washes
  let washAdjustmentAmount = 0;
  washes.forEach(w => {
    washAdjustmentAmount += (Number(w.adjustmentAmount) || 0);
  });

  // 6. Process Payments
  const totalPaid = payments
    .filter(p => p.type === 'payment_paid' || !p.type)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalReceived = payments
    .filter(p => p.type === 'payment_received')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // 7. Opening Account Balance
  let openingBal = Number(supplier.openingBalance) || 0;
  if (supplier.openingBalanceType === 'debit') {
    openingBal = -Math.abs(openingBal); // Party owes us
  } else if (supplier.openingBalanceType === 'credit') {
    openingBal = Math.abs(openingBal);  // We owe party
  }

  // Net Stored Stock calculation
  const storageAvgOutturn = storageBags > 0 ? (storageEndProduct / storageBags) : 0;

  // Separate main vs secondary EP for dispatches
  let totalDispatchEP = 0;
  let totalDispatchEPSecondary = 0;
  // Also track arrival EP, storeIn/Out EP split by main/secondary
  let totalArrivalEPMain = 0;
  let totalArrivalEPSecondary = 0;
  let totalRawWeightMain = 0;
  let totalRawWeightSecondary = 0;
  let totalBagsMain = 0;
  let totalBagsSecondary = 0;
  let storeInEPMain = 0;
  let storeInEPSecondary = 0;
  let storeOutEPMain = 0;
  let storeOutEPSecondary = 0;

  arrivals.forEach(arr => {
    const secFlag = arr.isSecondary !== undefined ? (arr.isSecondary === true) : (arr.isMain === true ? false : isSecondaryProduct(arr.product));
    const ep = Number(arr.endProductWeight) || 0;
    const w = Number(arr.weight) || 0;
    const b = Number(arr.bags) || 0;
    if (secFlag) {
      totalArrivalEPSecondary += ep;
      totalRawWeightSecondary += w;
      totalBagsSecondary += b;
    } else {
      totalArrivalEPMain += ep;
      totalRawWeightMain += w;
      totalBagsMain += b;
    }
    if (arr.status === 'storage' || arr.status === 'partial_settled') {
      const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : ep;
      if (secFlag) {
        storeInEPSecondary += remEP;
      } else {
        storeInEPMain += remEP;
      }
    }
  });

  dispatches.forEach(d => {
    const secFlag = d.isSecondary !== undefined ? (d.isSecondary === true) : (d.isMain === true ? false : isSecondaryProduct(d.product));
    const ep = Number(d.endProductWeight) || Number(d.weight) || 0;
    if (secFlag) {
      totalDispatchEPSecondary += ep;
    } else {
      totalDispatchEP += ep;
    }
    if (d.status === 'storage_out' || d.rateType === 'storage_out') {
      const remEP = d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep;
      if (secFlag) {
        storeOutEPSecondary += remEP;
      } else {
        storeOutEPMain += remEP;
      }
    }
  });

  const netPayable = openingBal + totalPurchasesBilled - totalSalesBilled - totalPaid + totalReceived + transferFinancialNet + washAdjustmentAmount;

  return {
    ...supplier,
    openingBalance: Number(supplier.openingBalance) || 0,
    openingBalanceType: supplier.openingBalanceType || 'credit',
    openingStorageBags: Number(supplier.openingStorageBags) || 0,
    openingStorageEP: Number(supplier.openingStorageEP) || 0,
    totalRawWeight: Math.round(totalRawWeight * 100) / 100,
    totalRawWeightMain: Math.round(totalRawWeightMain * 100) / 100,
    totalRawWeightSecondary: Math.round(totalRawWeightSecondary * 100) / 100,
    totalBags: Math.round(totalBags * 100) / 100,
    totalBagsMain: Math.round(totalBagsMain * 100) / 100,
    totalBagsSecondary: Math.round(totalBagsSecondary * 100) / 100,
    totalEndProduct: Math.round(totalEndProduct * 100) / 100,
    totalArrivalEPMain: Math.round(totalArrivalEPMain * 100) / 100,
    totalArrivalEPSecondary: Math.round(totalArrivalEPSecondary * 100) / 100,
    totalDispatchWeight: Math.round(totalDispatchWeight * 100) / 100,
    totalDispatchBags: Math.round(totalDispatchBags * 100) / 100,
    totalDispatchEP: Math.round(totalDispatchEP * 100) / 100,
    totalDispatchEPSecondary: Math.round(totalDispatchEPSecondary * 100) / 100,
    totalHuskWeight: Math.round(totalHuskWeight * 100) / 100,
    totalHuskBags: Math.round(totalHuskBags * 100) / 100,
    storeInBags: Math.round(storeInBags * 100) / 100,
    storeInEP: Math.round(storeInEP * 100) / 100,
    storeInEPMain: Math.round(storeInEPMain * 100) / 100,
    totalStoreInEPSecondary: Math.round(storeInEPSecondary * 100) / 100,
    storeOutBags: Math.round(storeOutBags * 100) / 100,
    storeOutEP: Math.round(storeOutEP * 100) / 100,
    storeOutEPMain: Math.round(storeOutEPMain * 100) / 100,
    totalStoreOutEPSecondary: Math.round(storeOutEPSecondary * 100) / 100,
    storageBags: Math.round(storageBags * 100) / 100,
    storageEndProduct: Math.round(storageEndProduct * 100) / 100,
    storageAvgOutturn: Math.round(storageAvgOutturn * 100) / 100,
    totalPurchasesBilled: Math.round(totalPurchasesBilled * 100) / 100,
    totalSalesBilled: Math.round(totalSalesBilled * 100) / 100,
    totalBilledAmount: Math.round((totalPurchasesBilled - totalSalesBilled) * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalCgst: Math.round(totalCgst * 100) / 100,
    totalSgst: Math.round(totalSgst * 100) / 100,
    totalIgst: Math.round(totalIgst * 100) / 100,
    totalTdsDeducted: Math.round(totalTdsDeducted * 100) / 100,
    totalTcsDeducted: Math.round(totalTcsDeducted * 100) / 100,
    epTransferredOut: Math.round(epTransferredOut * 100) / 100,
    epTransferredIn: Math.round(epTransferredIn * 100) / 100,
    netPayable: Math.round(netPayable * 100) / 100,
    arrivalsCount: arrivals.length,
    dispatchesCount: dispatches.length,
    activeCommitmentsCount: commitments.filter(c => c.status === 'active').length
  };
}

// Controller API
const dbController = {
  getStatus() {
    return {
      isMongoConnected,
      mongoError,
      mongoUri: dbState.settings.mongoUri,
      localDbFile,
      suppliersCount: dbState.suppliers.length,
      arrivalsCount: dbState.arrivals.length,
      dispatchesCount: dbState.dispatches.length,
      commitmentsCount: dbState.commitments.length,
      settlementsCount: dbState.settlements.length,
      paymentsCount: dbState.payments.length,
      epTransfersCount: dbState.epTransfers.length,
      productsCount: (dbState.products || []).length,
      millingLogsCount: (dbState.millingLogs || []).length,
      openingStockEntriesCount: (dbState.openingStockEntries || []).length,
      processingProfilesCount: Object.keys(dbState.settings?.processingProfiles || {}).length
    };
  },

  async updateMongoUri(uri) {
    dbState.settings.mongoUri = uri;
    saveLocalDb();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await initMongo(uri);
    return dbController.getStatus();
  },

  async clearLocalData(payload = {}) {
    dbState.suppliers = [];
    dbState.products = [];
    dbState.arrivals = [];
    dbState.dispatches = [];
    dbState.commitments = [];
    dbState.settlements = [];
    dbState.payments = [];
    dbState.epTransfers = [];
    dbState.commitmentWashes = [];
    dbState.millingLogs = [];
    dbState.openingStockEntries = [];
    if (dbState.settings) {
      dbState.settings.openingStock = { coffeeBags: 0, coffeeWeight: 0, coffeeEP: 0, huskBags: 0, huskWeight: 0 };
      dbState.settings.processingProfiles = {};
    }
    rebuildProductIndices();

    // Explicitly write cleared state to local JSON file
    saveLocalDb();

    if (payload && payload.wipeMongo && isMongoConnected) {
      try {
        if (MongoSupplier) await MongoSupplier.deleteMany({});
        if (MongoArrival) await MongoArrival.deleteMany({});
        if (MongoDispatch) await MongoDispatch.deleteMany({});
        if (MongoCommitment) await MongoCommitment.deleteMany({});
        if (MongoSettlement) await MongoSettlement.deleteMany({});
        if (MongoPayment) await MongoPayment.deleteMany({});
        if (MongoEpTransfer) await MongoEpTransfer.deleteMany({});
        if (MongoCommitmentWash) await MongoCommitmentWash.deleteMany({});
        if (MongoProduct) await MongoProduct.deleteMany({});
        if (MongoMillingLog) await MongoMillingLog.deleteMany({});
        if (MongoOpeningStockEntry) await MongoOpeningStockEntry.deleteMany({});
        if (MongoProcessingProfile) await MongoProcessingProfile.deleteMany({});
      } catch (e) {
        console.error('Error clearing Mongo collections:', e);
      }
    } else if (payload && payload.syncMongo && isMongoConnected) {
      await loadFromMongo();
    }
    return dbController.getStatus();
  },

  async pushToMongo() {
    ensureDatabaseReady();
    if (!isMongoConnected) {
      throw new Error('MongoDB is not connected. Please verify your connection in Settings.');
    }
    deduplicateSuppliersInDb();

    // 1. Upsert all local records to MongoDB
    for (const sup of (dbState.suppliers || [])) {
      await MongoSupplier.findOneAndUpdate({ id: sup.id }, sup, { upsert: true });
    }
    for (const arr of (dbState.arrivals || [])) {
      await MongoArrival.findOneAndUpdate({ id: arr.id }, arr, { upsert: true });
    }
    for (const disp of (dbState.dispatches || [])) {
      await MongoDispatch.findOneAndUpdate({ id: disp.id }, disp, { upsert: true });
    }
    for (const com of (dbState.commitments || [])) {
      await MongoCommitment.findOneAndUpdate({ id: com.id }, com, { upsert: true });
    }
    for (const set of (dbState.settlements || [])) {
      await MongoSettlement.findOneAndUpdate({ id: set.id }, set, { upsert: true });
    }
    for (const pay of (dbState.payments || [])) {
      await MongoPayment.findOneAndUpdate({ id: pay.id }, pay, { upsert: true });
    }
    for (const trf of (dbState.epTransfers || [])) {
      await MongoEpTransfer.findOneAndUpdate({ id: trf.id }, trf, { upsert: true });
    }
    for (const wash of (dbState.commitmentWashes || [])) {
      await MongoCommitmentWash.findOneAndUpdate({ id: wash.id }, wash, { upsert: true });
    }
    for (const prod of (dbState.products || [])) {
      await MongoProduct.findOneAndUpdate({ id: prod.id }, prod, { upsert: true });
    }
    for (const mill of (dbState.millingLogs || [])) {
      await MongoMillingLog.findOneAndUpdate({ id: mill.id }, mill, { upsert: true });
    }
    for (const op of (dbState.openingStockEntries || [])) {
      await MongoOpeningStockEntry.findOneAndUpdate({ id: op.id }, op, { upsert: true });
    }
    if (MongoProcessingProfile && dbState.settings && dbState.settings.processingProfiles) {
      for (const [sourceProduct, outputs] of Object.entries(dbState.settings.processingProfiles)) {
        await MongoProcessingProfile.findOneAndUpdate(
          { id: sourceProduct },
          { id: sourceProduct, sourceProduct, outputs, updatedAt: new Date() },
          { upsert: true }
        );
      }
    }

    return {
      success: true,
      message: 'Local database successfully pushed to MongoDB cloud!',
      counts: {
        suppliers: (dbState.suppliers || []).length,
        arrivals: (dbState.arrivals || []).length,
        dispatches: (dbState.dispatches || []).length,
        commitments: (dbState.commitments || []).length,
        settlements: (dbState.settlements || []).length,
        payments: (dbState.payments || []).length,
        products: (dbState.products || []).length
      }
    };
  },

  async pullFromMongo() {
    ensureDatabaseReady();
    if (!isMongoConnected) {
      throw new Error('MongoDB is not connected. Please verify your connection in Settings.');
    }
    await loadFromMongo();
    deduplicateSuppliersInDb();

    return {
      success: true,
      message: 'MongoDB cloud data successfully pulled into local database!',
      counts: {
        suppliers: (dbState.suppliers || []).length,
        arrivals: (dbState.arrivals || []).length,
        dispatches: (dbState.dispatches || []).length,
        commitments: (dbState.commitments || []).length,
        settlements: (dbState.settlements || []).length,
        payments: (dbState.payments || []).length,
        products: (dbState.products || []).length
      }
    };
  },

  deduplicateSuppliers() {
    ensureDatabaseReady();
    const result = deduplicateSuppliersInDb();
    return {
      success: true,
      message: result.mergedCount > 0 
        ? `Cleaned and merged ${result.mergedCount} duplicate party accounts.`
        : 'No duplicate party accounts found. All party accounts are clean.',
      mergedCount: result.mergedCount,
      totalSuppliers: (dbState.suppliers || []).length
    };
  },

  // PRODUCTS
  getProducts() {
    return dbState.products;
  },

  addProduct(productData) {
    const name = (productData.name || '').trim();
    if (!name) throw new Error('Product name required');

    const existing = dbState.products.find(p => p.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      return existing;
    }

    const id = 'prod_' + Date.now();
    const code = (productData.code || name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 12)).toUpperCase().trim();
    const isSec = productData.isSecondary !== undefined ? !!productData.isSecondary : (productData.isMain === false);
    const calculationBasis = productData.calculationBasis || 'direct';
    const cgst = productData.cgstRate !== undefined ? Number(productData.cgstRate) : 0;
    const sgst = productData.sgstRate !== undefined ? Number(productData.sgstRate) : 0;
    const igst = productData.igstRate !== undefined ? Number(productData.igstRate) : (cgst + sgst);

    const newProduct = {
      id,
      code,
      name,
      isMain: !isSec,
      isSecondary: isSec,
      category: isSec ? 'Secondary Product' : (productData.category || 'Primary Commodity'),
      calculationBasis,
      defaultOutturn: productData.defaultOutturn !== undefined ? Number(productData.defaultOutturn) : (calculationBasis === 'end_product' ? 26 : 50),
      defaultOutturnType: productData.defaultOutturnType || 'per_50kg',
      cgstRate: cgst,
      sgstRate: sgst,
      igstRate: igst,
      hsnCode: productData.hsnCode || '',
      description: productData.description || ''
    };
    dbState.products.push(newProduct);
    rebuildProductIndices();
    saveLocalDb();
    if (isMongoConnected && MongoProduct) {
      MongoProduct.findOneAndUpdate({ id: newProduct.id }, newProduct, { upsert: true }).catch(e => console.error(e));
    }
    return newProduct;
  },

  updateProduct(id, productData) {
    const index = dbState.products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    const p = dbState.products[index];
    const cgst = productData.cgstRate !== undefined ? Number(productData.cgstRate) : (p.cgstRate || 0);
    const sgst = productData.sgstRate !== undefined ? Number(productData.sgstRate) : (p.sgstRate || 0);
    const igst = productData.igstRate !== undefined ? Number(productData.igstRate) : (cgst + sgst);

    const updated = {
      ...p,
      name: productData.name !== undefined ? productData.name.trim() : p.name,
      code: productData.code !== undefined ? productData.code.trim().toUpperCase() : p.code,
      isMain: productData.isMain !== undefined ? !!productData.isMain : p.isMain,
      isSecondary: productData.isSecondary !== undefined ? !!productData.isSecondary : (!productData.isMain),
      calculationBasis: productData.calculationBasis || p.calculationBasis || 'direct',
      defaultOutturn: productData.defaultOutturn !== undefined ? Number(productData.defaultOutturn) : (p.defaultOutturn || 26),
      defaultOutturnType: productData.defaultOutturnType || p.defaultOutturnType || 'per_50kg',
      cgstRate: cgst,
      sgstRate: sgst,
      igstRate: igst,
      hsnCode: productData.hsnCode !== undefined ? productData.hsnCode : (p.hsnCode || ''),
      description: productData.description !== undefined ? productData.description : (p.description || '')
    };
    dbState.products[index] = updated;
    rebuildProductIndices();
    saveLocalDb();
    if (isMongoConnected && MongoProduct) {
      MongoProduct.findOneAndUpdate({ id: updated.id }, updated, { upsert: true }).catch(e => console.error(e));
    }
    return dbState.products[index];
  },

  deleteProduct(id) {
    const index = dbState.products.findIndex(p => p.id === id);
    if (index === -1) return { success: true };
    const p = dbState.products[index];
    const isUsed = (dbState.arrivals || []).some(a => a.product === p.name || a.product === p.code) ||
      (dbState.dispatches || []).some(d => d.product === p.name || d.product === p.code);
    if (isUsed) {
      throw new Error(`Cannot delete commodity "${p.name}" because it is referenced in existing arrivals or dispatches.`);
    }
    dbState.products.splice(index, 1);
    rebuildProductIndices();
    saveLocalDb();
    if (isMongoConnected && MongoProduct) {
      MongoProduct.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // SUPPLIERS & PARTIES
  getSuppliers() {
    ensureDatabaseReady();
    const pregrouped = buildSupplierLookupMaps();
    return dbState.suppliers.map(sup => calculateSupplierLedger(sup.id, pregrouped));
  },

  getSupplierDetails(supplierId) {
    ensureDatabaseReady();
    const summary = calculateSupplierLedger(supplierId);
    if (!summary) return null;

    const arrivals = (dbState.arrivals || []).filter(a => a.supplierId === supplierId).reverse();
    const dispatches = (dbState.dispatches || []).filter(d => d.supplierId === supplierId || d.partyId === supplierId).reverse();
    const settlements = (dbState.settlements || []).filter(s => s.supplierId === supplierId).reverse();
    const payments = (dbState.payments || []).filter(p => p.supplierId === supplierId).reverse();
    const commitments = (dbState.commitments || []).filter(c => c.supplierId === supplierId || c.partyId === supplierId).reverse();
    const epTransfers = (dbState.epTransfers || []).filter(t => t.fromPartyId === supplierId || t.toPartyId === supplierId).reverse();
    const washes = (dbState.commitmentWashes || []).filter(w => w.supplierId === supplierId || w.partyId === supplierId).reverse();

    return {
      summary,
      arrivals,
      dispatches,
      settlements,
      payments,
      commitments,
      epTransfers,
      washes
    };
  },

  addSupplier(data, shouldSave = true) {
    ensureDatabaseReady();
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) throw new Error('Supplier/Party name is required.');

    const exists = dbState.suppliers.some(s => s.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      throw new Error(`Party with name "${trimmedName}" already exists.`);
    }

    const id = 'sup_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newSupplier = {
      id,
      name: trimmedName,
      phone: data.phone || '',
      place: data.place || '',
      gst: data.gst || '',
      notes: data.notes || '',
      openingBalance: Number(data.openingBalance) || 0,
      openingBalanceType: data.openingBalanceType || 'credit',
      openingStorageBags: Number(data.openingStorageBags) || 0,
      openingStorageEP: Number(data.openingStorageEP) || 0,
      createdAt: new Date().toISOString()
    };
    dbState.suppliers.push(newSupplier);
    try {
      const summary = calculateSupplierLedger(id);
      if (shouldSave) {
        saveLocalDb();
        if (isMongoConnected && MongoSupplier) {
          MongoSupplier.findOneAndUpdate({ id }, newSupplier, { upsert: true }).catch(e => console.error(e));
        }
      }
      return summary;
    } catch (err) {
      const idx = dbState.suppliers.findIndex(s => s.id === id);
      if (idx !== -1) dbState.suppliers.splice(idx, 1);
      throw err;
    }
  },

  updateSupplier(id, data) {
    const index = dbState.suppliers.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Supplier/Party not found');
    const oldName = dbState.suppliers[index].name;
    const newName = data.name ? data.name.trim() : oldName;

    if (newName) {
      const exists = dbState.suppliers.some(s => s.id !== id && s.name.trim().toLowerCase() === newName.toLowerCase());
      if (exists) {
        throw new Error(`Party with name "${newName}" already exists.`);
      }
    }

    dbState.suppliers[index] = {
      ...dbState.suppliers[index],
      name: newName,
      phone: data.phone !== undefined ? data.phone : dbState.suppliers[index].phone,
      place: data.place !== undefined ? data.place : dbState.suppliers[index].place,
      gst: data.gst !== undefined ? data.gst : dbState.suppliers[index].gst,
      notes: data.notes !== undefined ? data.notes : dbState.suppliers[index].notes,
      openingBalance: data.openingBalance !== undefined ? Number(data.openingBalance) : (dbState.suppliers[index].openingBalance || 0),
      openingBalanceType: data.openingBalanceType !== undefined ? data.openingBalanceType : (dbState.suppliers[index].openingBalanceType || 'credit'),
      openingStorageBags: data.openingStorageBags !== undefined ? Number(data.openingStorageBags) : (dbState.suppliers[index].openingStorageBags || 0),
      openingStorageEP: data.openingStorageEP !== undefined ? Number(data.openingStorageEP) : (dbState.suppliers[index].openingStorageEP || 0),
    };

    if (newName !== oldName) {
      dbState.arrivals.forEach(a => { if (a.supplierId === id) a.supplierName = newName; });
      dbState.dispatches.forEach(d => { if (d.supplierId === id || d.partyId === id) { d.supplierName = newName; d.partyName = newName; } });
      dbState.commitments.forEach(c => { if (c.supplierId === id) c.supplierName = newName; });
      dbState.settlements.forEach(s => { if (s.supplierId === id) s.supplierName = newName; });
      dbState.payments.forEach(p => { if (p.supplierId === id) p.supplierName = newName; });
      dbState.epTransfers.forEach(t => {
        if (t.fromPartyId === id) t.fromPartyName = newName;
        if (t.toPartyId === id) t.toPartyName = newName;
      });
    }

    saveLocalDb();
    if (isMongoConnected && MongoSupplier) {
      MongoSupplier.findOneAndUpdate({ id }, dbState.suppliers[index]).catch(e => console.error(e));
    }
    return calculateSupplierLedger(id);
  },

  deleteSupplier(id) {
    const index = dbState.suppliers.findIndex(s => s.id === id);
    if (index === -1) return { success: true };
    const sup = dbState.suppliers[index];

    const hasArrivals = dbState.arrivals.some(a => a.supplierId === id);
    const hasDispatches = dbState.dispatches.some(d => d.supplierId === id || d.partyId === id);
    const hasCommitments = dbState.commitments.some(c => c.supplierId === id);
    const hasSettlements = dbState.settlements.some(s => s.supplierId === id);
    const hasPayments = dbState.payments.some(p => p.supplierId === id);

    if (hasArrivals || hasDispatches || hasCommitments || hasSettlements || hasPayments) {
      throw new Error(`Cannot delete party "${sup.name}" because they have existing transactions.`);
    }

    dbState.suppliers.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoSupplier) {
      MongoSupplier.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // COMMITMENTS (PURCHASE & SALES)
  getCommitments(supplierId = null) {
    ensureDatabaseReady();
    let list = dbState.commitments;
    if (supplierId) {
      list = list.filter(c => c.supplierId === supplierId || c.partyId === supplierId);
    }
    return list.slice().reverse();
  },

  addCommitment(data) {
    ensureDatabaseReady();
    const id = 'com_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const count = dbState.commitments.length + 1;
    const category = data.category || 'purchase'; // 'purchase' or 'sale'
    const prefix = category === 'sale' ? 'COM-SALE-' : 'COM-PUR-';
    const commitmentNo = prefix + String(count).padStart(4, '0');

    const newCommitment = {
      id,
      commitmentNo,
      supplierId: data.supplierId || data.partyId,
      supplierName: data.supplierName || data.partyName,
      category,
      product: data.product,
      type: data.type || 'bags', // 'bags' or 'end_product'
      quantity: Number(data.quantity) || 0,
      rate: Number(data.rate) || 0,
      fulfilledQty: 0,
      remainingQty: Number(data.quantity) || 0,
      status: 'active',
      date: data.date || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    dbState.commitments.push(newCommitment);
    saveLocalDb();
    if (isMongoConnected && MongoCommitment) {
      MongoCommitment.findOneAndUpdate({ id }, newCommitment, { upsert: true }).catch(e => console.error(e));
    }
    return newCommitment;
  },

  updateCommitment(id, data) {
    const index = dbState.commitments.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Commitment not found');
    const com = dbState.commitments[index];

    const newQty = data.quantity !== undefined ? Number(data.quantity) : com.quantity;
    const newRate = data.rate !== undefined ? Number(data.rate) : com.rate;
    const fulfilledQty = com.fulfilledQty || 0;

    if (newQty < fulfilledQty) {
      throw new Error(`Cannot reduce total quantity to ${newQty} because ${fulfilledQty} ${com.type} has already been fulfilled.`);
    }

    const remainingQty = Math.max(0, newQty - fulfilledQty);
    const status = remainingQty <= 0 ? 'fulfilled' : (data.status || com.status || 'active');

    dbState.commitments[index] = {
      ...com,
      supplierId: data.supplierId || data.partyId || com.supplierId,
      supplierName: data.supplierName || data.partyName || com.supplierName,
      category: data.category || com.category || 'purchase',
      product: data.product || com.product,
      type: data.type || com.type,
      quantity: Math.round(newQty * 100) / 100,
      rate: Math.round(newRate * 100) / 100,
      remainingQty: Math.round(remainingQty * 100) / 100,
      status,
      date: data.date || com.date,
      notes: data.notes !== undefined ? data.notes : com.notes
    };

    saveLocalDb();
    if (isMongoConnected && MongoCommitment) {
      MongoCommitment.findOneAndUpdate({ id }, dbState.commitments[index]).catch(e => console.error(e));
    }
    return dbState.commitments[index];
  },

  closeCommitment(data) {
    const id = typeof data === 'string' ? data : data.id;
    const closedQty = typeof data === 'object' ? data.closedQty : undefined;
    const notes = typeof data === 'object' ? data.notes : '';

    const index = dbState.commitments.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Commitment not found');
    const com = dbState.commitments[index];

    const finalQty = closedQty !== undefined && closedQty !== null && !isNaN(Number(closedQty))
      ? Number(closedQty)
      : (com.fulfilledQty > 0 ? com.fulfilledQty : com.quantity);

    const shortCloseNotes = notes
      ? (com.notes ? `${com.notes} | ${notes}` : notes)
      : (com.notes || 'Manually closed');

    dbState.commitments[index] = {
      ...com,
      quantity: Math.round(finalQty * 100) / 100,
      remainingQty: 0,
      status: 'closed',
      notes: shortCloseNotes,
      closedAt: new Date().toISOString()
    };

    saveLocalDb();
    if (isMongoConnected && MongoCommitment) {
      MongoCommitment.findOneAndUpdate({ id }, dbState.commitments[index]).catch(e => console.error(e));
    }
    return dbState.commitments[index];
  },

  deleteCommitment(id) {
    const index = dbState.commitments.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Commitment not found');
    const com = dbState.commitments[index];
    if (com.fulfilledQty > 0) {
      throw new Error(`Cannot delete commitment ${com.commitmentNo} because ${com.fulfilledQty} ${com.type} has already been fulfilled.`);
    }

    dbState.commitments.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoCommitment) {
      MongoCommitment.deleteOne({ id }).catch(e => console.error(e));
    }
    return true;
  },

  // COMMITMENT WASH / SETTLEMENT AGAINST OPPOSITE COMMITMENT
  washCommitments(washData) {
    ensureDatabaseReady();
    const {
      supplierId,
      supplierName,
      purchaseCommitmentId,
      saleCommitmentId,
      quantityToWash,
      purchaseRate,
      saleRate,
      notes = ''
    } = washData;

    const purIdx = dbState.commitments.findIndex(c => c.id === purchaseCommitmentId);
    const saleIdx = dbState.commitments.findIndex(c => c.id === saleCommitmentId);

    if (purIdx === -1) throw new Error('Purchase commitment not found');
    if (saleIdx === -1) throw new Error('Sale commitment not found');

    const purCom = dbState.commitments[purIdx];
    const saleCom = dbState.commitments[saleIdx];

    const qty = Number(quantityToWash) || 0;
    if (qty <= 0) throw new Error('Quantity to wash must be greater than zero.');

    if (qty > purCom.remainingQty) {
      throw new Error(`Cannot wash ${qty} units. Purchase Commitment ${purCom.commitmentNo} has only ${purCom.remainingQty} remaining.`);
    }
    if (qty > saleCom.remainingQty) {
      throw new Error(`Cannot wash ${qty} units. Sale Commitment ${saleCom.commitmentNo} has only ${saleCom.remainingQty} remaining.`);
    }

    const pRate = Number(purchaseRate) !== undefined ? Number(purchaseRate) : purCom.rate;
    const sRate = Number(saleRate) !== undefined ? Number(saleRate) : saleCom.rate;
    const rateDiff = Math.round((sRate - pRate) * 100) / 100;

    // Adjustment Amount: Rate difference * quantity (e.g. if Sale Rate > Purchase Rate, party owes us profit differential)
    const adjustmentAmount = Math.round((qty * rateDiff) * 100) / 100;

    // Update Purchase Commitment
    const newPurFulfilled = (purCom.fulfilledQty || 0) + qty;
    const newPurRem = Math.max(0, purCom.quantity - newPurFulfilled);
    dbState.commitments[purIdx] = {
      ...purCom,
      fulfilledQty: Math.round(newPurFulfilled * 100) / 100,
      remainingQty: Math.round(newPurRem * 100) / 100,
      status: newPurRem <= 0 ? 'washed' : 'active'
    };

    // Update Sale Commitment
    const newSaleFulfilled = (saleCom.fulfilledQty || 0) + qty;
    const newSaleRem = Math.max(0, saleCom.quantity - newSaleFulfilled);
    dbState.commitments[saleIdx] = {
      ...saleCom,
      fulfilledQty: Math.round(newSaleFulfilled * 100) / 100,
      remainingQty: Math.round(newSaleRem * 100) / 100,
      status: newSaleRem <= 0 ? 'washed' : 'active'
    };

    const id = 'wash_' + Date.now();
    const washNo = 'WASH-' + String(dbState.commitmentWashes.length + 1).padStart(4, '0');

    const newWash = {
      id,
      washNo,
      date: new Date().toISOString().split('T')[0],
      supplierId: supplierId || purCom.supplierId,
      supplierName: supplierName || purCom.supplierName,
      purchaseCommitmentId,
      purchaseCommitmentNo: purCom.commitmentNo,
      purchaseRate: pRate,
      saleCommitmentId,
      saleCommitmentNo: saleCom.commitmentNo,
      saleRate: sRate,
      quantityWashed: qty,
      rateDifference: rateDiff,
      adjustmentAmount,
      notes,
      createdAt: new Date().toISOString()
    };

    dbState.commitmentWashes.push(newWash);
    saveLocalDb();
    if (isMongoConnected && MongoCommitmentWash) {
      MongoCommitmentWash.findOneAndUpdate({ id }, newWash, { upsert: true }).catch(e => console.error(e));
    }
    return newWash;
  },

  getCommitmentWashes(supplierId = null) {
    ensureDatabaseReady();
    let list = dbState.commitmentWashes || [];
    if (supplierId) {
      list = list.filter(w => w.supplierId === supplierId || w.partyId === supplierId);
    }
    return list.slice().reverse();
  },

  // ARRIVALS (PURCHASES & STORE IN)
  getArrivals(filter = {}) {
    ensureDatabaseReady();
    let list = dbState.arrivals.slice();
    if (filter.fy && filter.fy !== 'ALL') {
      list = list.filter(a => (a.fy || getFinancialYear(a.date)) === filter.fy);
    }
    if (filter.supplierId) {
      list = list.filter(a => a.supplierId === filter.supplierId);
    }
    if (filter.product) {
      list = list.filter(a => a.product === filter.product);
    }
    if (filter.status) {
      list = list.filter(a => a.status === filter.status);
    }
    if (filter.startDate) {
      list = list.filter(a => a.date >= filter.startDate);
    }
    if (filter.endDate) {
      list = list.filter(a => a.date <= filter.endDate);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(a =>
        (a.arrivalNo && a.arrivalNo.toLowerCase().includes(q)) ||
        (a.supplierName && a.supplierName.toLowerCase().includes(q)) ||
        (a.product && a.product.toLowerCase().includes(q)) ||
        (a.vehicleNo && a.vehicleNo.toLowerCase().includes(q))
      );
    }
    list.reverse();

    if (filter.page && filter.limit) {
      const page = Math.max(1, parseInt(filter.page, 10) || 1);
      const limit = Math.max(1, parseInt(filter.limit, 10) || 50);
      const totalCount = list.length;
      const totalPages = Math.ceil(totalCount / limit);
      const items = list.slice((page - 1) * limit, page * limit);
      return {
        items,
        totalCount,
        page,
        limit,
        totalPages
      };
    }

    return list;
  },

  addArrival(data, shouldSave = true) {
    ensureDatabaseReady();
    const id = 'arr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const count = dbState.arrivals.length + 1;
    const arrivalNo = 'ARR-' + String(count).padStart(4, '0');

    const weight = Number(data.weight) || 0;
    const bags = Number(data.bags) || (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const outturn = Number(data.outturn) || 0;
    const outturnType = data.outturnType || 'per_50kg';

    // Look up product to check calculationBasis if not explicitly passed
    const prodObj = dbState.products.find(p => p.name === data.product || p.code === data.product);
    const calculationBasis = data.calculationBasis || (prodObj ? prodObj.calculationBasis : (outturn > 0 ? 'end_product' : 'direct'));
    const rateUnit = data.rateUnit || (calculationBasis === 'end_product' ? 'per_kg_ep' : 'per_kg_raw');

    let endProductWeight = 0;
    if (calculationBasis === 'direct') {
      endProductWeight = weight;
    } else {
      if (outturnType === 'percentage') {
        endProductWeight = weight * (outturn / 100);
      } else {
        endProductWeight = (weight / 50) * outturn;
      }
    }
    endProductWeight = Math.round(endProductWeight * 100) / 100;

    const rateType = data.rateType || 'fixed';
    const billType = data.billType || 'gst_bill';
    let rate = Number(data.rate) || 0;
    let taxableAmount = 0;
    let cgstRate = billType === 'gst_bill' ? (data.cgstRate !== undefined ? Number(data.cgstRate) : 0) : 0;
    let sgstRate = billType === 'gst_bill' ? (data.sgstRate !== undefined ? Number(data.sgstRate) : 0) : 0;
    let igstRate = billType === 'gst_bill' ? (data.igstRate !== undefined ? Number(data.igstRate) : 0) : 0;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    let tdsRate = data.tdsRate !== undefined && data.tdsRate !== '' ? Number(data.tdsRate) : 0;
    let tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : 0;

    let tcsRate = data.tcsRate !== undefined && data.tcsRate !== '' ? Number(data.tcsRate) : (dbState.settings.defaultTcsRate || 0.1);
    let tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : 0;

    let billAmount = 0;
    let netAmount = 0;
    let status = 'billed';
    let commitmentId = data.commitmentId || null;

    if (rateType === 'commitment' && commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        rate = com.rate;
        const qtyToDeduct = com.type === 'bags' ? bags : (calculationBasis === 'direct' ? weight : endProductWeight);
        const newFulfilled = (com.fulfilledQty || 0) + qtyToDeduct;
        const newRemaining = Math.max(0, com.quantity - newFulfilled);

        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: Math.round(newFulfilled * 100) / 100,
          remainingQty: Math.round(newRemaining * 100) / 100,
          status: newRemaining <= 0 ? 'fulfilled' : 'active'
        };
      }
    }

    if (rateType === 'storage') {
      status = 'storage';
      rate = 0;
      taxableAmount = 0;
      billAmount = 0;
      cgstAmount = 0; sgstAmount = 0; igstAmount = 0;
      tdsAmount = 0; tcsAmount = 0;
      netAmount = 0;
    } else {
      if (rateUnit === 'per_bag') {
        taxableAmount = Math.round((bags * rate) * 100) / 100;
      } else if (calculationBasis === 'direct' || rateUnit === 'per_kg_raw') {
        taxableAmount = Math.round((weight * rate) * 100) / 100;
      } else {
        taxableAmount = Math.round((endProductWeight * rate) * 100) / 100;
      }

      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = data.netAmount !== undefined ? Number(data.netAmount) : Math.round((billAmount + tcsAmount - tdsAmount) * 100) / 100;
      status = billType === 'cash_bill' ? 'cash_bill' : 'billed';
    }

    const newArrival = {
      id,
      arrivalNo,
      date: data.date || new Date().toISOString().split('T')[0],
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      vehicleNo: data.vehicleNo || '',
      product: data.product,
      calculationBasis,
      rateUnit,
      weight,
      bags,
      outturn,
      outturnType,
      endProductWeight,
      rateType,
      rate,
      taxableAmount,
      billType,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      tdsRate,
      tdsAmount,
      billAmount,
      tcsRate,
      tcsAmount,
      netAmount,
      status,
      settledBags: 0,
      remainingBags: status === 'storage' ? bags : 0,
      settledEndProduct: 0,
      remainingEndProduct: status === 'storage' ? endProductWeight : 0,
      settlementIds: [],
      commitmentId,
      fy: data.fy || getFinancialYear(data.date),
      isLocked: false,
      remarks: data.remarks || '',
      createdAt: new Date().toISOString()
    };

    dbState.arrivals.push(newArrival);
    if (shouldSave) {
      saveLocalDb();
      if (isMongoConnected && MongoArrival) {
        MongoArrival.findOneAndUpdate({ id }, newArrival, { upsert: true }).catch(e => console.error(e));
      }
    }
    return newArrival;
  },

  updateArrival(id, data) {
    const index = dbState.arrivals.findIndex(a => a.id === id);
    if (index === -1) throw new Error('Arrival not found');
    const arr = dbState.arrivals[index];

    if (arr.isLocked) {
      throw new Error(`Cannot modify arrival ${arr.arrivalNo} because it belongs to closed Financial Year (${arr.fy || 'Audited'}). Record is locked.`);
    }

    if ((arr.status === 'settled' || (arr.settlementIds && arr.settlementIds.length > 0)) && (data.weight !== undefined && data.weight !== arr.weight)) {
      throw new Error('Cannot change weight on an arrival that has already been settled in storage.');
    }

    const weight = data.weight !== undefined ? Number(data.weight) : arr.weight;
    const bags = data.bags !== undefined ? Number(data.bags) : (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const outturn = data.outturn !== undefined ? Number(data.outturn) : arr.outturn;
    const outturnType = data.outturnType || arr.outturnType || 'per_50kg';

    const prodObj = dbState.products.find(p => p.name === (data.product || arr.product) || p.code === (data.product || arr.product));
    const calculationBasis = data.calculationBasis || arr.calculationBasis || (prodObj ? prodObj.calculationBasis : (outturn > 0 ? 'end_product' : 'direct'));
    const rateUnit = data.rateUnit || arr.rateUnit || (calculationBasis === 'end_product' ? 'per_kg_ep' : 'per_kg_raw');

    let endProductWeight = 0;
    if (calculationBasis === 'direct') {
      endProductWeight = weight;
    } else {
      if (outturnType === 'percentage') {
        endProductWeight = weight * (outturn / 100);
      } else {
        endProductWeight = (weight / 50) * outturn;
      }
    }
    endProductWeight = Math.round(endProductWeight * 100) / 100;

    const rate = data.rate !== undefined ? Number(data.rate) : arr.rate;
    const billType = data.billType || arr.billType || 'gst_bill';

    let cgstRate = billType === 'gst_bill' ? (data.cgstRate !== undefined ? Number(data.cgstRate) : (arr.cgstRate || 0)) : 0;
    let sgstRate = billType === 'gst_bill' ? (data.sgstRate !== undefined ? Number(data.sgstRate) : (arr.sgstRate || 0)) : 0;
    let igstRate = billType === 'gst_bill' ? (data.igstRate !== undefined ? Number(data.igstRate) : (arr.igstRate || 0)) : 0;

    let tdsRate = data.tdsRate !== undefined && data.tdsRate !== '' ? Number(data.tdsRate) : (arr.tdsRate || 0);
    let tcsRate = data.tcsRate !== undefined && data.tcsRate !== '' ? Number(data.tcsRate) : (arr.tcsRate !== undefined ? arr.tcsRate : 0.1);

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let tdsAmount = 0;
    let tcsAmount = 0;
    let billAmount = 0;
    let netAmount = 0;

    if (arr.status !== 'storage') {
      if (rateUnit === 'per_bag') {
        taxableAmount = Math.round((bags * rate) * 100) / 100;
      } else if (calculationBasis === 'direct' || rateUnit === 'per_kg_raw') {
        taxableAmount = Math.round((weight * rate) * 100) / 100;
      } else {
        taxableAmount = Math.round((endProductWeight * rate) * 100) / 100;
      }

      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = data.netAmount !== undefined ? Number(data.netAmount) : Math.round((billAmount + tcsAmount - tdsAmount) * 100) / 100;
    }

    dbState.arrivals[index] = {
      ...arr,
      date: data.date || arr.date,
      vehicleNo: data.vehicleNo !== undefined ? data.vehicleNo : arr.vehicleNo,
      product: data.product || arr.product,
      calculationBasis,
      rateUnit,
      weight,
      bags,
      outturn,
      outturnType,
      endProductWeight,
      rate,
      billType,
      taxableAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      tdsRate,
      tdsAmount,
      billAmount,
      tcsRate,
      tcsAmount,
      netAmount,
      remainingBags: arr.status === 'storage' ? Math.max(0, bags - (arr.settledBags || 0)) : arr.remainingBags,
      remainingEndProduct: arr.status === 'storage' ? Math.max(0, endProductWeight - (arr.settledEndProduct || 0)) : arr.remainingEndProduct,
      remarks: data.remarks !== undefined ? data.remarks : arr.remarks
    };

    saveLocalDb();
    if (isMongoConnected && MongoArrival) {
      MongoArrival.findOneAndUpdate({ id }, dbState.arrivals[index]).catch(e => console.error(e));
    }
    return dbState.arrivals[index];
  },

  deleteArrival(id) {
    const index = dbState.arrivals.findIndex(a => a.id === id);
    if (index === -1) return { success: true };
    const arr = dbState.arrivals[index];

    if (arr.isLocked) {
      throw new Error(`Cannot delete arrival ${arr.arrivalNo} because it belongs to closed Financial Year (${arr.fy || 'Audited'}). Record is locked.`);
    }

    if (arr.status === 'settled' || (arr.settlementIds && arr.settlementIds.length > 0) || (arr.settledBags > 0)) {
      throw new Error(`Cannot delete arrival ${arr.arrivalNo} because it has already been settled.`);
    }

    if (arr.commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === arr.commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        const qtyToRestore = com.type === 'bags' ? arr.bags : arr.endProductWeight;
        const newFulfilled = Math.max(0, (com.fulfilledQty || 0) - qtyToRestore);
        const newRemaining = Math.min(com.quantity, (com.remainingQty || 0) + qtyToRestore);

        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: Math.round(newFulfilled * 100) / 100,
          remainingQty: Math.round(newRemaining * 100) / 100,
          status: newRemaining <= 0 ? 'fulfilled' : 'active'
        };
      }
    }

    dbState.arrivals.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoArrival) {
      MongoArrival.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // DISPATCHES (SALES & HUSK DISPATCHES)
  getDispatches(filter = {}) {
    ensureDatabaseReady();
    let list = (dbState.dispatches || []).slice();
    if (filter.fy && filter.fy !== 'ALL') {
      list = list.filter(d => (d.fy || getFinancialYear(d.date)) === filter.fy);
    }
    if (filter.supplierId || filter.partyId) {
      const pid = filter.supplierId || filter.partyId;
      list = list.filter(d => d.supplierId === pid || d.partyId === pid);
    }
    if (filter.dispatchType) {
      list = list.filter(d => d.dispatchType === filter.dispatchType);
    }
    if (filter.product) {
      list = list.filter(d => d.product === filter.product);
    }
    if (filter.status) {
      list = list.filter(d => d.status === filter.status);
    }
    if (filter.startDate) {
      list = list.filter(d => d.date >= filter.startDate);
    }
    if (filter.endDate) {
      list = list.filter(d => d.date <= filter.endDate);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(d =>
        (d.dispatchNo && d.dispatchNo.toLowerCase().includes(q)) ||
        (d.supplierName && d.supplierName.toLowerCase().includes(q)) ||
        (d.product && d.product.toLowerCase().includes(q)) ||
        (d.vehicleNo && d.vehicleNo.toLowerCase().includes(q))
      );
    }
    list.reverse();

    if (filter.page && filter.limit) {
      const page = Math.max(1, parseInt(filter.page, 10) || 1);
      const limit = Math.max(1, parseInt(filter.limit, 10) || 50);
      const totalCount = list.length;
      const totalPages = Math.ceil(totalCount / limit);
      const items = list.slice((page - 1) * limit, page * limit);
      return {
        items,
        totalCount,
        page,
        limit,
        totalPages
      };
    }

    return list;
  },

  addDispatch(data, shouldSave = true) {
    ensureDatabaseReady();
    const id = 'disp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const count = dbState.dispatches.length + 1;
    const dispatchType = data.dispatchType || 'dispatch';
    const dispatchNo = `DSP-${String(count).padStart(4, '0')}`;

    const weight = Number(data.weight) || 0;
    const bags = Number(data.bags) || (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const prodObj = dbState.products.find(p => p.name === data.product || p.code === data.product);
    const calculationBasis = data.calculationBasis || (prodObj ? prodObj.calculationBasis : (dispatchType === 'husk' ? 'direct' : 'direct'));
    const rateUnit = data.rateUnit || (calculationBasis === 'end_product' ? 'per_kg_ep' : 'per_kg_raw');

    let endProductWeight = Number(data.endProductWeight) || (calculationBasis === 'direct' ? weight : weight);

    const rateType = data.rateType || 'fixed'; // 'fixed', 'commitment', 'storage_out'
    const billType = data.billType || 'gst_bill'; // 'gst_bill' or 'cash_bill'
    let rate = Number(data.rate) || 0;

    let cgstRate = billType === 'gst_bill' ? (data.cgstRate !== undefined ? Number(data.cgstRate) : (dispatchType === 'husk' ? 2.5 : 0)) : 0;
    let sgstRate = billType === 'gst_bill' ? (data.sgstRate !== undefined ? Number(data.sgstRate) : (dispatchType === 'husk' ? 2.5 : 0)) : 0;
    let igstRate = billType === 'gst_bill' ? (data.igstRate !== undefined ? Number(data.igstRate) : 0) : 0;

    let commitmentId = data.commitmentId || null;
    if (rateType === 'commitment' && commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        rate = com.rate;
        const qtyToDeduct = com.type === 'bags' ? bags : (rateUnit === 'per_kg_ep' ? endProductWeight : weight);
        const newFulfilled = (com.fulfilledQty || 0) + qtyToDeduct;
        const newRemaining = Math.max(0, com.quantity - newFulfilled);
        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: Math.round(newFulfilled * 100) / 100,
          remainingQty: Math.round(newRemaining * 100) / 100,
          status: newRemaining <= 0 ? 'fulfilled' : 'active'
        };
      }
    }

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let tdsRate = data.tdsRate !== undefined && data.tdsRate !== '' ? Number(data.tdsRate) : 0;
    let tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : 0;
    let tcsRate = data.tcsRate !== undefined && data.tcsRate !== '' ? Number(data.tcsRate) : (dbState.settings.defaultTcsRate || 0);
    let tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : 0;
    let billAmount = 0;
    let netAmount = 0;
    let status = 'billed';

    if (rateType === 'storage_out') {
      status = 'storage_out';
      rate = 0;
    } else {
      if (rateUnit === 'per_bag') {
        taxableAmount = Math.round((bags * rate) * 100) / 100;
      } else if (rateUnit === 'per_kg_ep' && calculationBasis === 'end_product') {
        taxableAmount = Math.round((endProductWeight * rate) * 100) / 100;
      } else {
        taxableAmount = Math.round((weight * rate) * 100) / 100;
      }

      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = data.netAmount !== undefined ? Number(data.netAmount) : Math.round((billAmount + tcsAmount - tdsAmount) * 100) / 100;
      status = billType === 'cash_bill' ? 'cash_bill' : 'billed';
    }

    const newDispatch = {
      id,
      dispatchNo,
      date: data.date || new Date().toISOString().split('T')[0],
      supplierId: data.supplierId || data.partyId,
      supplierName: data.supplierName || data.partyName,
      vehicleNo: data.vehicleNo || '',
      dispatchType,
      product: data.product,
      calculationBasis,
      rateUnit,
      weight,
      bags,
      endProductWeight,
      rateType,
      rate,
      taxableAmount,
      billType,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      tdsRate,
      tdsAmount,
      billAmount,
      tcsRate,
      tcsAmount,
      netAmount,
      status,
      settledBags: 0,
      remainingBags: rateType === 'storage_out' ? bags : 0,
      settledEndProduct: 0,
      remainingEndProduct: rateType === 'storage_out' ? endProductWeight : 0,
      settlementIds: [],
      commitmentId,
      fy: data.fy || getFinancialYear(data.date),
      isLocked: false,
      remarks: data.remarks || '',
      createdAt: new Date().toISOString()
    };

    dbState.dispatches.push(newDispatch);
    if (shouldSave) {
      saveLocalDb();
      if (isMongoConnected && MongoDispatch) {
        MongoDispatch.findOneAndUpdate({ id }, newDispatch, { upsert: true }).catch(e => console.error(e));
      }
    }
    return newDispatch;
  },

  updateDispatch(id, data) {
    const index = dbState.dispatches.findIndex(d => d.id === id);
    if (index === -1) throw new Error('Dispatch record not found');
    const disp = dbState.dispatches[index];

    if (disp.isLocked) {
      throw new Error(`Cannot modify dispatch ${disp.dispatchNo} because it belongs to closed Financial Year (${disp.fy || 'Audited'}). Record is locked.`);
    }

    const weight = data.weight !== undefined ? Number(data.weight) : disp.weight;
    const bags = data.bags !== undefined ? Number(data.bags) : disp.bags;
    const endProductWeight = data.endProductWeight !== undefined ? Number(data.endProductWeight) : disp.endProductWeight;
    const rate = data.rate !== undefined ? Number(data.rate) : disp.rate;
    const billType = data.billType || disp.billType || 'gst_bill';
    const dispatchType = data.dispatchType || disp.dispatchType || 'coffee';

    const prodObj = dbState.products.find(p => p.name === (data.product || disp.product) || p.code === (data.product || disp.product));
    const calculationBasis = data.calculationBasis || disp.calculationBasis || (prodObj ? prodObj.calculationBasis : 'direct');
    const rateUnit = data.rateUnit || disp.rateUnit || (calculationBasis === 'end_product' ? 'per_kg_ep' : 'per_kg_raw');

    let cgstRate = billType === 'gst_bill' ? (data.cgstRate !== undefined ? Number(data.cgstRate) : (disp.cgstRate || (dispatchType === 'husk' ? 2.5 : 0))) : 0;
    let sgstRate = billType === 'gst_bill' ? (data.sgstRate !== undefined ? Number(data.sgstRate) : (disp.sgstRate || (dispatchType === 'husk' ? 2.5 : 0))) : 0;
    let igstRate = billType === 'gst_bill' ? (data.igstRate !== undefined ? Number(data.igstRate) : (disp.igstRate || 0)) : 0;
    let tdsRate = data.tdsRate !== undefined && data.tdsRate !== '' ? Number(data.tdsRate) : (disp.tdsRate || 0);
    let tcsRate = data.tcsRate !== undefined && data.tcsRate !== '' ? Number(data.tcsRate) : (disp.tcsRate !== undefined ? disp.tcsRate : 0);

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let tdsAmount = 0;
    let tcsAmount = 0;
    let billAmount = 0;
    let netAmount = 0;

    if (disp.status !== 'storage_out') {
      if (rateUnit === 'per_bag') {
        taxableAmount = Math.round((bags * rate) * 100) / 100;
      } else if (rateUnit === 'per_kg_ep' && calculationBasis === 'end_product') {
        taxableAmount = Math.round((endProductWeight * rate) * 100) / 100;
      } else {
        taxableAmount = Math.round((weight * rate) * 100) / 100;
      }

      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = data.netAmount !== undefined ? Number(data.netAmount) : Math.round((billAmount + tcsAmount - tdsAmount) * 100) / 100;
    }

    dbState.dispatches[index] = {
      ...disp,
      date: data.date || disp.date,
      supplierId: data.supplierId || data.partyId || disp.supplierId,
      supplierName: data.supplierName || data.partyName || disp.supplierName,
      vehicleNo: data.vehicleNo !== undefined ? data.vehicleNo : disp.vehicleNo,
      dispatchType,
      product: data.product || disp.product,
      calculationBasis,
      rateUnit,
      weight,
      bags,
      endProductWeight,
      rate,
      billType,
      taxableAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      tdsRate,
      tdsAmount,
      billAmount,
      tcsRate,
      tcsAmount,
      netAmount,
      remainingBags: disp.status === 'storage_out' ? Math.max(0, bags - (disp.settledBags || 0)) : disp.remainingBags,
      remainingEndProduct: disp.status === 'storage_out' ? Math.max(0, endProductWeight - (disp.settledEndProduct || 0)) : disp.remainingEndProduct,
      remarks: data.remarks !== undefined ? data.remarks : disp.remarks
    };

    saveLocalDb();
    if (isMongoConnected && MongoDispatch) {
      MongoDispatch.findOneAndUpdate({ id }, dbState.dispatches[index]).catch(e => console.error(e));
    }
    return dbState.dispatches[index];
  },

  deleteDispatch(id) {
    const index = dbState.dispatches.findIndex(d => d.id === id);
    if (index === -1) return { success: true };
    const disp = dbState.dispatches[index];

    if (disp.isLocked) {
      throw new Error(`Cannot delete dispatch ${disp.dispatchNo} because it belongs to closed Financial Year (${disp.fy || 'Audited'}). Record is locked.`);
    }

    if (disp.commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === disp.commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        const qtyToRestore = com.type === 'bags' ? disp.bags : disp.weight;
        const newFulfilled = Math.max(0, (com.fulfilledQty || 0) - qtyToRestore);
        const newRemaining = Math.min(com.quantity, (com.remainingQty || 0) + qtyToRestore);

        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: Math.round(newFulfilled * 100) / 100,
          remainingQty: Math.round(newRemaining * 100) / 100,
          status: newRemaining <= 0 ? 'fulfilled' : 'active'
        };
      }
    }

    dbState.dispatches.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoDispatch) {
      MongoDispatch.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // EP (END PRODUCT) TRANSFERS BETWEEN PARTIES
  getEpTransfers(supplierId = null) {
    ensureDatabaseReady();
    let list = dbState.epTransfers || [];
    if (supplierId) {
      list = list.filter(t => t.fromPartyId === supplierId || t.toPartyId === supplierId);
    }
    return list.slice().reverse();
  },

  addEpTransfer(data) {
    ensureDatabaseReady();
    const fromParty = dbState.suppliers.find(s => s.id === data.fromPartyId);
    const toParty = dbState.suppliers.find(s => s.id === data.toPartyId);

    if (!fromParty) throw new Error('Source party not found');
    if (!toParty) throw new Error('Destination party not found');
    if (data.fromPartyId === data.toPartyId) throw new Error('Source and destination parties must be different.');

    const transferType = data.transferType || 'store_in'; // 'store_in' or 'store_out'
    const product = data.product || 'RC EP';
    const bags = Number(data.bags) || 0;
    const weight = Number(data.weight) || (bags * 50);
    const endProductWeight = Number(data.endProductWeight) || weight;
    const rate = Number(data.rate) || 0;
    const transferValue = Math.round((endProductWeight * rate) * 100) / 100;

    // Strict Quantity Verification on Source Party Stock
    let availableEP = 0;
    if (transferType === 'store_in') {
      const openEP = (fromParty.openingStorageEP || 0);
      const arrEP = (dbState.arrivals || []).filter(a => a.supplierId === data.fromPartyId && a.product === product && (a.status === 'storage' || a.status === 'partial_settled'))
        .reduce((sum, a) => sum + (a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : Number(a.endProductWeight || 0)), 0);
      availableEP = openEP + arrEP;
    } else {
      const dispEP = (dbState.dispatches || []).filter(d => (d.supplierId === data.fromPartyId || d.partyId === data.fromPartyId) && d.product === product && (d.status === 'storage_out' || d.rateType === 'storage_out'))
        .reduce((sum, d) => sum + Number(d.endProductWeight || d.weight || 0), 0);
      availableEP = dispEP;
    }

    if (endProductWeight > availableEP + 0.001) {
      throw new Error(`Insufficient Storage Stock: Party '${fromParty.name}' has only ${(Math.round(availableEP * 100) / 100).toLocaleString()} kg EP of '${product}' available in ${transferType === 'store_in' ? 'Store-In' : 'Store-Out'} storage. Requested ${endProductWeight.toLocaleString()} kg EP exceeds available balance.`);
    }

    const id = 'trf_' + Date.now();
    const count = (dbState.epTransfers || []).length + 1;
    const transferNo = 'TRF-' + String(count).padStart(4, '0');

    const newTransfer = {
      id,
      transferNo,
      date: data.date || new Date().toISOString().split('T')[0],
      fromPartyId: data.fromPartyId,
      fromPartyName: fromParty.name,
      toPartyId: data.toPartyId,
      toPartyName: toParty.name,
      transferType,
      product,
      bags,
      weight,
      endProductWeight,
      rate,
      transferValue,
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    if (!dbState.epTransfers) dbState.epTransfers = [];
    dbState.epTransfers.push(newTransfer);

    // 1. Post Storage Out Dispatch Entry for Source Party (Deduction)
    const dispatchId = 'disp_trf_' + Date.now();
    const sourceDispatch = {
      id: dispatchId,
      dispatchNo: 'DISP-TRF-' + String((dbState.dispatches || []).length + 1).padStart(4, '0'),
      date: newTransfer.date,
      supplierId: data.fromPartyId,
      supplierName: fromParty.name,
      partyId: data.fromPartyId,
      partyName: fromParty.name,
      product,
      bags,
      weight,
      endProductWeight,
      rate,
      billAmount: transferValue,
      netAmount: transferValue,
      dispatchType: 'storage_out',
      status: 'storage_out',
      rateType: 'storage_out',
      notes: `EP Transfer Outward to ${toParty.name} (${transferNo})${data.notes ? ' | ' + data.notes : ''}`,
      transferId: id,
      createdAt: new Date().toISOString()
    };
    if (!dbState.dispatches) dbState.dispatches = [];
    dbState.dispatches.unshift(sourceDispatch);

    // 2. Post Storage Inward Arrival Entry for Destination Party (Addition - Settleable/Billable Later)
    const arrivalId = 'arr_trf_' + Date.now();
    const destArrival = {
      id: arrivalId,
      arrivalNo: 'ARR-TRF-' + String((dbState.arrivals || []).length + 1).padStart(4, '0'),
      date: newTransfer.date,
      supplierId: data.toPartyId,
      supplierName: toParty.name,
      product,
      bags,
      weight,
      endProductWeight,
      remainingBags: bags,
      remainingEndProduct: endProductWeight,
      rate,
      rateType: 'storage',
      status: 'storage',
      notes: `EP Transfer Inward from ${fromParty.name} (${transferNo})${data.notes ? ' | ' + data.notes : ''}`,
      transferId: id,
      createdAt: new Date().toISOString()
    };
    if (!dbState.arrivals) dbState.arrivals = [];
    dbState.arrivals.unshift(destArrival);

    saveLocalDb();
    if (isMongoConnected && MongoEpTransfer) {
      MongoEpTransfer.findOneAndUpdate({ id }, newTransfer, { upsert: true }).catch(e => console.error(e));
      MongoDispatch.findOneAndUpdate({ id: dispatchId }, sourceDispatch, { upsert: true }).catch(e => console.error(e));
      MongoArrival.findOneAndUpdate({ id: arrivalId }, destArrival, { upsert: true }).catch(e => console.error(e));
    }
    return newTransfer;
  },

  deleteEpTransfer(id) {
    const index = (dbState.epTransfers || []).findIndex(t => t.id === id);
    if (index === -1) return { success: true };

    // Also remove associated dispatch and arrival entries created for this transfer
    dbState.dispatches = (dbState.dispatches || []).filter(d => d.transferId !== id);
    dbState.arrivals = (dbState.arrivals || []).filter(a => a.transferId !== id);

    dbState.epTransfers.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoEpTransfer) {
      MongoEpTransfer.deleteOne({ id }).catch(e => console.error(e));
      MongoDispatch.deleteMany({ transferId: id }).catch(e => console.error(e));
      MongoArrival.deleteMany({ transferId: id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // SETTLEMENT OF STORAGE COFFEE (PURCHASES & SALES)
  calculateBatchOutturn(payload) {
    const ids = Array.isArray(payload) ? payload : (payload?.arrivalIds || payload?.dispatchIds || payload?.itemIds || []);
    const isSales = payload?.settlementCategory === 'sales_storage' || payload?.category === 'sales_storage';
    const sourceList = isSales ? dbState.dispatches : dbState.arrivals;
    const selected = sourceList.filter(item => ids.includes(item.id));
    if (selected.length === 0) return null;

    let totalBags = 0;
    let totalWeight = 0;
    let totalEndProduct = 0;

    selected.forEach(item => {
      const remBags = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
      const remEP = item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || item.weight || 0);
      const remWeight = item.bags > 0 ? (remBags / item.bags) * (Number(item.weight) || (remBags * 50)) : Number(item.weight || (remBags * 50));

      totalBags += remBags;
      totalWeight += remWeight;
      totalEndProduct += remEP;
    });

    const averageOutturn = totalWeight > 0 ? (totalEndProduct / (totalWeight / 50)) : 0;
    const averageOutturnPercentage = totalWeight > 0 ? (totalEndProduct / totalWeight) * 100 : 0;

    return {
      itemCount: selected.length,
      totalBags: Math.round(totalBags * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalEndProduct: Math.round(totalEndProduct * 100) / 100,
      averageOutturn: Math.round(averageOutturn * 100) / 100,
      averageOutturnPercentage: Math.round(averageOutturnPercentage * 100) / 100,
      items: selected.map(item => ({
        id: item.id,
        no: item.arrivalNo || item.dispatchNo,
        date: item.date,
        product: item.product,
        remainingBags: item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags),
        remainingWeight: item.bags > 0 ? Math.round(((item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags)) / item.bags * (item.weight || 0)) * 100) / 100 : item.weight,
        remainingEndProduct: item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || 0),
        outturn: item.outturn || (item.weight > 0 ? Math.round(((item.endProductWeight || item.weight) / (item.weight / 50)) * 100) / 100 : 26)
      }))
    };
  },

  settleStorageArrivals(settleData) {
    const {
      supplierId,
      supplierName,
      settlementCategory = 'purchase_storage', // 'purchase_storage' or 'sales_storage'
      arrivalIds = [],
      dispatchIds = [],
      commitmentId = null,
      settleMode = 'bags', // 'bags', 'weight', 'end_product'
      settleBags,
      settleWeight,
      settleEndProduct,
      agreedOutturn = null,
      isDirectWeight = false,
      settlementRate,
      rateUnit = 'per_kg_ep', // 'per_kg_ep', 'per_bag', 'per_kg_raw'
      tcsRate = 0.1,
      tdsRate = 0,
      cgstRate = 0,
      sgstRate = 0,
      igstRate = 0,
      date = new Date().toISOString().split('T')[0],
      notes = ''
    } = settleData;

    const isSales = settlementCategory === 'sales_storage';
    const targetIds = isSales ? (dispatchIds.length > 0 ? dispatchIds : arrivalIds) : arrivalIds;
    const sourceList = isSales ? dbState.dispatches : dbState.arrivals;

    const selectedItems = sourceList.filter(item => targetIds.includes(item.id));
    if (selectedItems.length === 0) {
      throw new Error(`No ${isSales ? 'dispatches' : 'arrivals'} selected for storage settlement`);
    }

    let totalAvailBags = 0;
    let totalAvailWeight = 0;
    let totalAvailEndProduct = 0;

    selectedItems.forEach(item => {
      const b = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
      const ep = item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || item.weight || 0);
      const w = item.bags > 0 ? (b / item.bags) * (Number(item.weight) || (b * 50)) : Number(item.weight || (b * 50));

      totalAvailBags += b;
      totalAvailWeight += w;
      totalAvailEndProduct += ep;
    });

    if (totalAvailBags <= 0 && totalAvailWeight <= 0) {
      throw new Error('Selected records have zero remaining storage quantity to settle.');
    }

    // Determine exact settlement quantities based on settleMode
    let bagsToSettle = 0;
    let weightToSettle = 0;
    let epToSettle = 0;

    if (settleMode === 'weight' && Number(settleWeight) > 0) {
      weightToSettle = Math.min(Number(settleWeight), totalAvailWeight);
      const ratio = totalAvailWeight > 0 ? weightToSettle / totalAvailWeight : 0;
      bagsToSettle = Math.round((totalAvailBags * ratio) * 100) / 100;
      if (isDirectWeight) {
        epToSettle = weightToSettle;
      } else if (agreedOutturn && Number(agreedOutturn) > 0) {
        epToSettle = Math.round(((weightToSettle / 50) * Number(agreedOutturn)) * 100) / 100;
      } else {
        epToSettle = Math.round((totalAvailEndProduct * ratio) * 100) / 100;
      }
    } else if (settleMode === 'end_product' && Number(settleEndProduct) > 0) {
      epToSettle = Math.min(Number(settleEndProduct), totalAvailEndProduct);
      if (isDirectWeight) {
        weightToSettle = epToSettle;
        bagsToSettle = Math.round((epToSettle / 50) * 100) / 100;
      } else if (agreedOutturn && Number(agreedOutturn) > 0) {
        bagsToSettle = Math.round((epToSettle / Number(agreedOutturn)) * 100) / 100;
        weightToSettle = Math.round((bagsToSettle * 50) * 100) / 100;
      } else {
        const ratio = totalAvailEndProduct > 0 ? epToSettle / totalAvailEndProduct : 0;
        bagsToSettle = Math.round((totalAvailBags * ratio) * 100) / 100;
        weightToSettle = Math.round((totalAvailWeight * ratio) * 100) / 100;
      }
    } else {
      // Default / Bags mode
      bagsToSettle = Math.min(Number(settleBags) || totalAvailBags, totalAvailBags);
      const ratio = totalAvailBags > 0 ? bagsToSettle / totalAvailBags : 0;
      weightToSettle = Math.round((totalAvailWeight * ratio) * 100) / 100;
      if (isDirectWeight) {
        epToSettle = weightToSettle;
      } else if (agreedOutturn && Number(agreedOutturn) > 0) {
        epToSettle = Math.round((bagsToSettle * Number(agreedOutturn)) * 100) / 100;
      } else {
        epToSettle = Math.round((totalAvailEndProduct * ratio) * 100) / 100;
      }
    }

    if (bagsToSettle <= 0 && epToSettle <= 0 && weightToSettle <= 0) {
      throw new Error('Settlement quantity must be greater than zero.');
    }

    const averageOutturn = weightToSettle > 0 ? (epToSettle / (weightToSettle / 50)) : (totalAvailWeight > 0 ? (totalAvailEndProduct / (totalAvailWeight / 50)) : 26);

    let settlementGrossAmount = 0;
    if (rateUnit === 'per_bag') {
      settlementGrossAmount = bagsToSettle * settlementRate;
    } else if (rateUnit === 'per_kg_raw' || rateUnit === 'per_kg_weight') {
      settlementGrossAmount = weightToSettle * settlementRate;
    } else {
      // Standard per_kg_ep
      settlementGrossAmount = epToSettle * settlementRate;
    }
    settlementGrossAmount = Math.round(settlementGrossAmount * 100) / 100;

    const numCgstRate = Number(cgstRate) || 0;
    const numSgstRate = Number(sgstRate) || 0;
    const numIgstRate = Number(igstRate) || 0;
    const cgstAmount = Math.round((settlementGrossAmount * (numCgstRate / 100)) * 100) / 100;
    const sgstAmount = Math.round((settlementGrossAmount * (numSgstRate / 100)) * 100) / 100;
    const igstAmount = Math.round((settlementGrossAmount * (numIgstRate / 100)) * 100) / 100;

    const tdsAmount = Math.round((settlementGrossAmount * (Number(tdsRate) / 100)) * 100) / 100;
    const tcsAmount = Math.round((settlementGrossAmount * (Number(tcsRate) / 100)) * 100) / 100;
    const settlementNetAmount = Math.round((settlementGrossAmount + cgstAmount + sgstAmount + igstAmount - tdsAmount + tcsAmount) * 100) / 100;

    const id = 'set_' + Date.now();
    const count = dbState.settlements.length + 1;
    const settlementNo = 'SET-' + String(count).padStart(4, '0');

    // Deduct quantities across selected lots proportionately or FIFO
    let remainingEPToDeduct = epToSettle;
    let remainingBagsToDeduct = bagsToSettle;
    let totalPhysicalBagsDeducted = 0;
    let totalPhysicalWeightDeducted = 0;

    selectedItems.forEach(item => {
      const curRemBags = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
      const curRemEP = item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || item.weight || 0);
      const curRemW = item.bags > 0 ? (curRemBags / item.bags) * (Number(item.weight) || (curRemBags * 50)) : Number(item.weight || (curRemBags * 50));

      if (remainingEPToDeduct <= 0 && isDirectWeight && remainingBagsToDeduct <= 0) return;

      let deductEP = 0;
      let deductBags = 0;
      let deductW = 0;

      if (isDirectWeight) {
        deductBags = Math.min(curRemBags, remainingBagsToDeduct);
        deductW = Math.min(curRemW, weightToSettle);
        deductEP = deductW;
        remainingBagsToDeduct = Math.max(0, remainingBagsToDeduct - deductBags);
      } else {
        // Outturn-based commodity: Clean EP is the primary driver of deduction across storage lots
        deductEP = Math.min(curRemEP, remainingEPToDeduct);
        const lotOutturn = curRemW > 0 ? (curRemEP / (curRemW / 50)) : (curRemBags > 0 ? (curRemEP / curRemBags) : 26);
        deductBags = lotOutturn > 0 ? Math.round((deductEP / lotOutturn) * 100) / 100 : curRemBags;
        deductW = Math.round((deductBags * 50) * 100) / 100;
        remainingEPToDeduct = Math.max(0, remainingEPToDeduct - deductEP);
      }

      totalPhysicalBagsDeducted = Math.round((totalPhysicalBagsDeducted + deductBags) * 100) / 100;
      totalPhysicalWeightDeducted = Math.round((totalPhysicalWeightDeducted + deductW) * 100) / 100;

      const newRemBags = Math.max(0, Math.round((curRemBags - deductBags) * 100) / 100);
      const newRemEP = Math.max(0, Math.round((curRemEP - deductEP) * 100) / 100);

      const isItemFullySettled = newRemBags <= 0.001 || (curRemEP > 0 && newRemEP <= 0.001);

      if (isSales) {
        const dIdx = dbState.dispatches.findIndex(d => d.id === item.id);
        if (dIdx !== -1) {
          dbState.dispatches[dIdx] = {
            ...dbState.dispatches[dIdx],
            settledBags: Math.round(((dbState.dispatches[dIdx].settledBags || 0) + deductBags) * 100) / 100,
            remainingBags: newRemBags,
            settledEndProduct: Math.round(((dbState.dispatches[dIdx].settledEndProduct || 0) + deductEP) * 100) / 100,
            remainingEndProduct: newRemEP,
            status: isItemFullySettled ? 'settled' : 'partial_settled',
            settlementIds: [...(dbState.dispatches[dIdx].settlementIds || []), id]
          };
        }
      } else {
        const aIdx = dbState.arrivals.findIndex(a => a.id === item.id);
        if (aIdx !== -1) {
          dbState.arrivals[aIdx] = {
            ...dbState.arrivals[aIdx],
            settledBags: Math.round(((dbState.arrivals[aIdx].settledBags || 0) + deductBags) * 100) / 100,
            remainingBags: newRemBags,
            settledEndProduct: Math.round(((dbState.arrivals[aIdx].settledEndProduct || 0) + deductEP) * 100) / 100,
            remainingEndProduct: newRemEP,
            status: isItemFullySettled ? 'settled' : 'partial_settled',
            settlementIds: [...(dbState.arrivals[aIdx].settlementIds || []), id]
          };
        }
      }
    });

    // Update commitment remaining quantity if linked
    if (commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        let qtyFulfilled = 0;
        if (com.type === 'bags') {
          qtyFulfilled = bagsToSettle;
        } else if (com.type === 'weight' || com.type === 'kg_raw') {
          qtyFulfilled = weightToSettle;
        } else {
          // Standard EP kg
          qtyFulfilled = epToSettle;
        }
        const newFulfilled = Math.round(((com.fulfilledQty || 0) + qtyFulfilled) * 100) / 100;
        const newRem = Math.max(0, Math.round(((com.quantity || 0) - newFulfilled) * 100) / 100);
        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: newFulfilled,
          remainingQty: newRem,
          status: newRem <= 0.001 ? 'completed' : 'active'
        };
        if (isMongoConnected && MongoCommitment) {
          MongoCommitment.findOneAndUpdate({ id: commitmentId }, dbState.commitments[comIndex]).catch(e => console.error(e));
        }
      }
    }

    const newSettlement = {
      id,
      settlementNo,
      date,
      supplierId,
      supplierName,
      settlementCategory,
      arrivalIds: isSales ? [] : targetIds,
      dispatchIds: isSales ? targetIds : [],
      commitmentId,
      product: selectedItems[0] ? (selectedItems[0].product || '') : '',
      isMain: selectedItems.length > 0 ? (selectedItems[0].isMain !== undefined ? selectedItems[0].isMain : !String(selectedItems[0].product || '').toLowerCase().includes('husk')) : true,
      isSecondary: selectedItems.length > 0 ? (selectedItems[0].isSecondary !== undefined ? selectedItems[0].isSecondary : String(selectedItems[0].product || '').toLowerCase().includes('husk')) : false,
      settleMode,
      totalSelectedBags: totalAvailBags,
      totalSelectedWeight: Math.round(totalAvailWeight * 100) / 100,
      totalSelectedEndProduct: Math.round(totalAvailEndProduct * 100) / 100,
      averageOutturn: Math.round(averageOutturn * 100) / 100,
      agreedOutturn: agreedOutturn ? Number(agreedOutturn) : Math.round(averageOutturn * 100) / 100,
      isDirectWeight,
      settledBags: bagsToSettle,
      settledWeight: weightToSettle,
      settledEndProduct: epToSettle,
      physicalBagsDeducted: totalPhysicalBagsDeducted,
      physicalWeightDeducted: totalPhysicalWeightDeducted,
      settlementRate,
      rateUnit,
      settlementGrossAmount,
      cgstRate: numCgstRate,
      cgstAmount,
      sgstRate: numSgstRate,
      sgstAmount,
      igstRate: numIgstRate,
      igstAmount,
      tcsRate: Number(tcsRate),
      tcsAmount,
      tdsRate: Number(tdsRate),
      tdsAmount,
      settlementNetAmount,
      notes,
      fy: getFinancialYear(date),
      isLocked: false,
      createdAt: new Date().toISOString()
    };

    dbState.settlements.push(newSettlement);
    saveLocalDb();
    if (isMongoConnected && MongoSettlement) {
      MongoSettlement.findOneAndUpdate({ id }, newSettlement, { upsert: true }).catch(e => console.error(e));
    }
    return newSettlement;
  },

  getSettlements(filter = null) {
    ensureDatabaseReady();
    let list = (dbState.settlements || []).slice();
    let supplierId = null;
    let page = null;
    let limit = null;
    let fy = null;
    let search = null;

    if (typeof filter === 'string') {
      supplierId = filter;
    } else if (typeof filter === 'object' && filter !== null) {
      supplierId = filter.supplierId;
      page = filter.page;
      limit = filter.limit;
      fy = filter.fy;
      search = filter.search;
    }

    if (fy && fy !== 'ALL') {
      list = list.filter(s => (s.fy || getFinancialYear(s.date)) === fy);
    }
    if (supplierId) {
      list = list.filter(s => s.supplierId === supplierId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.settlementNo && s.settlementNo.toLowerCase().includes(q)) ||
        (s.supplierName && s.supplierName.toLowerCase().includes(q)) ||
        (s.product && s.product.toLowerCase().includes(q))
      );
    }

    list.reverse();

    if (page && limit) {
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 50);
      const totalCount = list.length;
      const totalPages = Math.ceil(totalCount / l);
      const items = list.slice((p - 1) * l, p * l);
      return {
        items,
        totalCount,
        page: p,
        limit: l,
        totalPages
      };
    }

    return list;
  },

  updateSettlement(id, data) {
    const index = dbState.settlements.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Settlement not found');
    const st = dbState.settlements[index];

    if (st.isLocked) {
      throw new Error(`Cannot modify settlement ${st.settlementNo} because it belongs to closed Financial Year (${st.fy || 'Audited'}). Record is locked.`);
    }

    const settlementRate = data.settlementRate !== undefined ? Number(data.settlementRate) : st.settlementRate;
    const rateUnit = data.rateUnit || st.rateUnit || 'per_kg_ep';
    const tcsRate = data.tcsRate !== undefined && data.tcsRate !== '' ? Number(data.tcsRate) : (st.tcsRate !== undefined ? st.tcsRate : 0.1);
    const tdsRate = data.tdsRate !== undefined && data.tdsRate !== '' ? Number(data.tdsRate) : (st.tdsRate !== undefined ? st.tdsRate : 0);

    let settlementGrossAmount = 0;
    if (rateUnit === 'per_bag') {
      settlementGrossAmount = st.settledBags * settlementRate;
    } else if (rateUnit === 'per_kg_raw' || rateUnit === 'per_kg_weight') {
      settlementGrossAmount = (st.settledWeight || st.settledBags * 50) * settlementRate;
    } else {
      settlementGrossAmount = st.settledEndProduct * settlementRate;
    }
    settlementGrossAmount = Math.round(settlementGrossAmount * 100) / 100;

    const tdsAmount = data.tdsAmount !== undefined ? Number(data.tdsAmount) : Math.round((settlementGrossAmount * (tdsRate / 100)) * 100) / 100;
    const tcsAmount = data.tcsAmount !== undefined ? Number(data.tcsAmount) : Math.round((settlementGrossAmount * (tcsRate / 100)) * 100) / 100;
    const cgstAmount = Number(st.cgstAmount) || 0;
    const sgstAmount = Number(st.sgstAmount) || 0;
    const igstAmount = Number(st.igstAmount) || 0;
    const settlementNetAmount = data.settlementNetAmount !== undefined ? Number(data.settlementNetAmount) : Math.round((settlementGrossAmount + cgstAmount + sgstAmount + igstAmount + tcsAmount - tdsAmount) * 100) / 100;

    dbState.settlements[index] = {
      ...st,
      date: data.date || st.date,
      settlementRate,
      rateUnit,
      settlementGrossAmount,
      tcsRate,
      tcsAmount,
      tdsRate,
      tdsAmount,
      settlementNetAmount,
      notes: data.notes !== undefined ? data.notes : st.notes
    };

    saveLocalDb();
    if (isMongoConnected && MongoSettlement) {
      MongoSettlement.findOneAndUpdate({ id }, dbState.settlements[index]).catch(e => console.error(e));
    }
    return dbState.settlements[index];
  },

  deleteSettlement(id) {
    const index = dbState.settlements.findIndex(s => s.id === id);
    if (index === -1) return { success: true };
    const st = dbState.settlements[index];

    if (st.isLocked) {
      throw new Error(`Cannot delete settlement ${st.settlementNo} because it belongs to closed Financial Year (${st.fy || 'Audited'}). Record is locked.`);
    }

    // Restore storage arrivals
    if (st.arrivalIds && st.arrivalIds.length > 0) {
      st.arrivalIds.forEach(arrId => {
        const aIdx = dbState.arrivals.findIndex(a => a.id === arrId);
        if (aIdx !== -1) {
          const arr = dbState.arrivals[aIdx];
          const newRemBags = Math.min(arr.bags, (arr.remainingBags || 0) + (arr.settledBags || 0));
          const newRemEP = Math.min(arr.endProductWeight, (arr.remainingEndProduct || 0) + (arr.settledEndProduct || 0));

          dbState.arrivals[aIdx] = {
            ...arr,
            settledBags: 0,
            remainingBags: Math.round(newRemBags * 100) / 100,
            settledEndProduct: 0,
            remainingEndProduct: Math.round(newRemEP * 100) / 100,
            status: 'storage',
            settlementIds: (arr.settlementIds || []).filter(sid => sid !== id)
          };
        }
      });
    }

    // Restore storage dispatches
    if (st.dispatchIds && st.dispatchIds.length > 0) {
      st.dispatchIds.forEach(dispId => {
        const dIdx = dbState.dispatches.findIndex(d => d.id === dispId);
        if (dIdx !== -1) {
          const disp = dbState.dispatches[dIdx];
          const newRemBags = Math.min(disp.bags, (disp.remainingBags || 0) + (disp.settledBags || 0));
          const newRemEP = Math.min(disp.endProductWeight, (disp.remainingEndProduct || 0) + (disp.settledEndProduct || 0));

          dbState.dispatches[dIdx] = {
            ...disp,
            settledBags: 0,
            remainingBags: Math.round(newRemBags * 100) / 100,
            settledEndProduct: 0,
            remainingEndProduct: Math.round(newRemEP * 100) / 100,
            status: 'storage_out',
            settlementIds: (disp.settlementIds || []).filter(sid => sid !== id)
          };
        }
      });
    }

    // Restore commitment progress if linked
    if (st.commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === st.commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        let qtyToRestore = 0;
        if (com.type === 'bags') {
          qtyToRestore = st.settledBags || 0;
        } else if (com.type === 'weight' || com.type === 'kg_raw') {
          qtyToRestore = st.settledWeight || 0;
        } else {
          qtyToRestore = st.settledEndProduct || 0;
        }
        const newFulfilled = Math.max(0, Math.round(((com.fulfilledQty || 0) - qtyToRestore) * 100) / 100);
        const newRem = Math.min(com.quantity || 0, Math.round(((com.quantity || 0) - newFulfilled) * 100) / 100);
        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: newFulfilled,
          remainingQty: newRem,
          status: newRem > 0.001 ? 'active' : 'completed'
        };
        if (isMongoConnected && MongoCommitment) {
          MongoCommitment.findOneAndUpdate({ id: st.commitmentId }, dbState.commitments[comIndex]).catch(e => console.error(e));
        }
      }
    }

    dbState.settlements.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoSettlement) {
      MongoSettlement.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // PAYMENTS
  getPayments(filter = null) {
    ensureDatabaseReady();
    let list = (dbState.payments || []).slice();
    let supplierId = null;
    let page = null;
    let limit = null;
    let fy = null;
    let search = null;

    if (typeof filter === 'string') {
      supplierId = filter;
    } else if (typeof filter === 'object' && filter !== null) {
      supplierId = filter.supplierId;
      page = filter.page;
      limit = filter.limit;
      fy = filter.fy;
      search = filter.search;
    }

    if (fy && fy !== 'ALL') {
      list = list.filter(p => (p.fy || getFinancialYear(p.date)) === fy);
    }
    if (supplierId) {
      list = list.filter(p => p.supplierId === supplierId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.paymentNo && p.paymentNo.toLowerCase().includes(q)) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q))
      );
    }

    list.reverse();

    if (page && limit) {
      const p = Math.max(1, parseInt(page, 10) || 1);
      const l = Math.max(1, parseInt(limit, 10) || 50);
      const totalCount = list.length;
      const totalPages = Math.ceil(totalCount / l);
      const items = list.slice((p - 1) * l, p * l);
      return {
        items,
        totalCount,
        page: p,
        limit: l,
        totalPages
      };
    }

    return list;
  },

  addPayment(data, shouldSave = true) {
    ensureDatabaseReady();
    const id = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const count = dbState.payments.length + 1;
    const paymentNo = 'PAY-' + String(count).padStart(4, '0');

    const newPayment = {
      id,
      paymentNo,
      date: data.date || new Date().toISOString().split('T')[0],
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      type: data.type || 'payment_paid',
      mode: data.mode || 'Bank Transfer',
      amount: Number(data.amount) || 0,
      reference: data.reference || '',
      notes: data.notes || '',
      fy: data.fy || getFinancialYear(data.date),
      isLocked: false,
      createdAt: new Date().toISOString()
    };

    dbState.payments.push(newPayment);
    if (shouldSave) {
      saveLocalDb();
      if (isMongoConnected && MongoPayment) {
        MongoPayment.findOneAndUpdate({ id }, newPayment, { upsert: true }).catch(e => console.error(e));
      }
    }
    return newPayment;
  },

  updatePayment(id, data) {
    const index = dbState.payments.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Payment not found');
    const pay = dbState.payments[index];

    if (pay.isLocked) {
      throw new Error(`Cannot modify payment ${pay.paymentNo || pay.id} because it belongs to closed Financial Year (${pay.fy || 'Audited'}). Record is locked.`);
    }

    dbState.payments[index] = {
      ...pay,
      date: data.date || pay.date,
      supplierId: data.supplierId || pay.supplierId,
      supplierName: data.supplierName || pay.supplierName,
      type: data.type || pay.type,
      mode: data.mode || pay.mode,
      amount: data.amount !== undefined ? Number(data.amount) : pay.amount,
      reference: data.reference !== undefined ? data.reference : pay.reference,
      notes: data.notes !== undefined ? data.notes : pay.notes
    };

    saveLocalDb();
    if (isMongoConnected && MongoPayment) {
      MongoPayment.findOneAndUpdate({ id }, dbState.payments[index]).catch(e => console.error(e));
    }
    return dbState.payments[index];
  },

  deletePayment(id) {
    const pay = (dbState.payments || []).find(p => p.id === id);
    if (pay && pay.isLocked) {
      throw new Error(`Cannot delete payment ${pay.paymentNo || pay.id} because it belongs to closed Financial Year (${pay.fy || 'Audited'}). Record is locked.`);
    }

    dbState.payments = dbState.payments.filter(p => p.id !== id);
    saveLocalDb();
    if (isMongoConnected && MongoPayment) {
      MongoPayment.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // GLOBAL OPENING STOCK & REQUIREMENT INSIGHT
  updateOpeningStock(data) {
    dbState.settings.openingStock = {
      coffeeBags: Number(data.coffeeBags) || 0,
      coffeeWeight: Number(data.coffeeWeight) || 0,
      coffeeEP: Number(data.coffeeEP) || 0,
      huskBags: Number(data.huskBags) || 0,
      huskWeight: Number(data.huskWeight) || 0
    };
    saveLocalDb();
    return dbState.settings.openingStock;
  },

  getRequirementInsight() {
    const openStock = dbState.settings?.openingStock || { coffeeBags: 0, coffeeWeight: 0, coffeeEP: 0, huskBags: 0, huskWeight: 0 };

    const isSecItem = (item) => {
      if (!item) return false;
      if (item.isSecondary !== undefined) return item.isSecondary === true;
      if (item.isMain !== undefined) return item.isMain === false;
      return isSecondaryProduct(item.product);
    };

    // 1. Godown Opening Stock & Stock Adjustments
    const openEntries = dbState.openingStockEntries || [];
    let godownOpenStockEP = 0;
    let godownOpenStockBags = 0;
    let godownOpenStockEPSec = 0;
    let godownOpenStockBagsSec = 0;

    let stockAdjustmentsEP = 0;
    let stockAdjustmentsBags = 0;
    let stockAdjustmentsEPSec = 0;
    let stockAdjustmentsBagsSec = 0;

    openEntries.forEach(entry => {
      const isSec = isSecItem(entry);
      const isAdj = entry.isAdjustment ||
        (entry.supplierName && entry.supplierName.toLowerCase().includes('stock adjustment')) ||
        (entry.notes && entry.notes.toLowerCase().includes('adjustment'));
      const ep = Number(entry.endProductWeight !== undefined ? entry.endProductWeight : entry.weight) || 0;
      const bags = Number(entry.bags) || 0;

      if (isAdj) {
        if (isSec) {
          stockAdjustmentsEPSec += ep;
          stockAdjustmentsBagsSec += bags;
        } else {
          stockAdjustmentsEP += ep;
          stockAdjustmentsBags += bags;
        }
      } else {
        if (isSec) {
          godownOpenStockEPSec += ep;
          godownOpenStockBagsSec += bags;
        } else {
          godownOpenStockEP += ep;
          godownOpenStockBags += bags;
        }
      }
    });

    // If no individual opening entries exist for main, fallback to global settings.openingStock
    if (godownOpenStockEP === 0 && ((Number(openStock.coffeeEP) || 0) > 0 || (Number(openStock.coffeeBags) || 0) > 0)) {
      godownOpenStockBags = Number(openStock.coffeeBags) || 0;
      godownOpenStockEP = (Number(openStock.coffeeEP) || 0) > 0 ? Number(openStock.coffeeEP) : (godownOpenStockBags * 26);
    }
    if (godownOpenStockEPSec === 0 && ((Number(openStock.huskWeight) || 0) > 0 || (Number(openStock.huskBags) || 0) > 0)) {
      godownOpenStockBagsSec = Number(openStock.huskBags) || 0;
      godownOpenStockEPSec = (Number(openStock.huskWeight) || 0) > 0 ? Number(openStock.huskWeight) : (godownOpenStockBagsSec * 50);
    }

    // Also include party opening stored lots (from suppliers master)
    (dbState.suppliers || []).forEach(s => {
      const b = Number(s.openingStorageBags) || 0;
      const ep = Number(s.openingStorageEP) || (b * 26);
      godownOpenStockBags += b;
      godownOpenStockEP += ep;
    });

    // 2. Arrivals (Total & Store In)
    let totalArrivalEP = 0;
    let totalArrivalBags = 0;
    let totalArrivalRawWeight = 0;
    let totalArrivalEPSecondary = 0;
    let totalArrivalBagsSecondary = 0;
    let totalArrivalRawWeightSecondary = 0;

    let totalStoreInEP = 0;
    let totalStoreInBags = 0;
    let totalStoreInEPSecondary = 0;
    let totalStoreInBagsSecondary = 0;

    (dbState.arrivals || []).forEach(a => {
      const ep = Number(a.endProductWeight) || 0;
      const bags = Number(a.bags) || 0;
      const weight = Number(a.weight) || 0;
      const isSec = isSecItem(a);

      if (isSec) {
        totalArrivalEPSecondary += ep;
        totalArrivalBagsSecondary += bags;
        totalArrivalRawWeightSecondary += weight;
      } else {
        totalArrivalEP += ep;
        totalArrivalBags += bags;
        totalArrivalRawWeight += weight;
      }

      if (a.status === 'storage' || a.status === 'partial_settled' || a.rateType === 'storage' || a.rateType === 'storage_in') {
        const remEP = a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : ep;
        const remBags = a.remainingBags !== undefined ? Number(a.remainingBags) : bags;
        if (isSec) {
          totalStoreInEPSecondary += remEP;
          totalStoreInBagsSecondary += remBags;
        } else {
          totalStoreInEP += remEP;
          totalStoreInBags += remBags;
        }
      }
    });

    // 3. Dispatches (Total & Store Out)
    let totalDispatchEP = 0;
    let totalDispatchBags = 0;
    let totalDispatchWeight = 0;
    let totalDispatchEPSecondary = 0;
    let totalDispatchBagsSecondary = 0;
    let totalDispatchWeightSecondary = 0;

    let totalStoreOutEP = 0;
    let totalStoreOutBags = 0;
    let totalStoreOutEPSecondary = 0;
    let totalStoreOutBagsSecondary = 0;

    (dbState.dispatches || []).forEach(d => {
      const ep = Number(d.endProductWeight) || Number(d.weight) || 0;
      const bags = Number(d.bags) || 0;
      const weight = Number(d.weight) || 0;
      const isSec = isSecItem(d);

      if (isSec) {
        totalDispatchEPSecondary += ep;
        totalDispatchBagsSecondary += bags;
        totalDispatchWeightSecondary += weight;
      } else {
        totalDispatchEP += ep;
        totalDispatchBags += bags;
        totalDispatchWeight += weight;
      }

      if (d.status === 'storage_out' || d.rateType === 'storage_out') {
        const remEP = d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep;
        const remBags = d.remainingBags !== undefined ? Number(d.remainingBags) : bags;
        if (isSec) {
          totalStoreOutEPSecondary += remEP;
          totalStoreOutBagsSecondary += remBags;
        } else {
          totalStoreOutEP += remEP;
          totalStoreOutBags += remBags;
        }
      }
    });

    // 4. Commitments (Purchase & Sale)
    let purchaseCommitmentsPendingEP = 0;
    let purchaseCommitmentsPendingBags = 0;
    let purchaseCommitmentsPendingEPSec = 0;
    let purchaseCommitmentsPendingBagsSec = 0;

    (dbState.commitments || [])
      .filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active')
      .forEach(c => {
        const isSec = isSecItem(c);
        const rem = Number(c.remainingQty) !== undefined ? Number(c.remainingQty) : (Number(c.quantity) || 0);
        const prodObj = (dbState.products || []).find(p => getCanonicalName(p.name) === getCanonicalName(c.product));
        let epQty = rem;
        if (c.type === 'bags') {
          const outturn = prodObj?.defaultOutturn || 26; // 26 kg EP per 50 kg bag (52%)
          epQty = rem * outturn;
        }
        if (isSec) {
          purchaseCommitmentsPendingEPSec += epQty;
          purchaseCommitmentsPendingBagsSec += (c.type === 'bags' ? rem : Math.round(rem / 50));
        } else {
          purchaseCommitmentsPendingEP += epQty;
          purchaseCommitmentsPendingBags += (c.type === 'bags' ? rem : Math.round(rem / 50));
        }
      });

    let saleCommitmentsPendingEP = 0;
    let saleCommitmentsPendingBags = 0;
    let saleCommitmentsPendingEPSec = 0;
    let saleCommitmentsPendingBagsSec = 0;

    (dbState.commitments || [])
      .filter(c => c.category === 'sale' && c.status === 'active')
      .forEach(c => {
        const isSec = isSecItem(c);
        const rem = Number(c.remainingQty) !== undefined ? Number(c.remainingQty) : (Number(c.quantity) || 0);
        const prodObj = (dbState.products || []).find(p => getCanonicalName(p.name) === getCanonicalName(c.product));
        let epQty = rem;
        if (c.type === 'bags') {
          const outturn = prodObj?.defaultOutturn || 26;
          epQty = rem * outturn;
        }
        if (isSec) {
          saleCommitmentsPendingEPSec += epQty;
          saleCommitmentsPendingBagsSec += (c.type === 'bags' ? rem : Math.round(rem / 50));
        } else {
          saleCommitmentsPendingEP += epQty;
          saleCommitmentsPendingBags += (c.type === 'bags' ? rem : Math.round(rem / 50));
        }
      });

    // Exact formula for main items:
    // godown open stock + stock adjustments + arrivals - dispatch - storein + storeout + purchasecomit - sale commitment
    const quantityToSell = godownOpenStockEP
      + stockAdjustmentsEP
      + totalArrivalEP
      - totalDispatchEP
      - totalStoreInEP
      + totalStoreOutEP
      + purchaseCommitmentsPendingEP
      - saleCommitmentsPendingEP;

    const netWarehouseStockMainEP = godownOpenStockEP + stockAdjustmentsEP + totalStoreInEP - totalStoreOutEP;
    const netWarehouseStockSecEP = godownOpenStockEPSec + stockAdjustmentsEPSec + totalStoreInEPSecondary - totalStoreOutEPSecondary;

    return {
      // Primary / Main Product Position
      main: {
        godownOpenStockEP: Math.round(godownOpenStockEP * 100) / 100,
        godownOpenStockBags: Math.round(godownOpenStockBags * 100) / 100,
        stockAdjustmentsEP: Math.round(stockAdjustmentsEP * 100) / 100,
        stockAdjustmentsBags: Math.round(stockAdjustmentsBags * 100) / 100,
        totalArrivalEP: Math.round(totalArrivalEP * 100) / 100,
        totalArrivalBags: Math.round(totalArrivalBags * 100) / 100,
        totalArrivalRawWeight: Math.round(totalArrivalRawWeight * 100) / 100,
        totalDispatchEP: Math.round(totalDispatchEP * 100) / 100,
        totalDispatchBags: Math.round(totalDispatchBags * 100) / 100,
        totalStoreInEP: Math.round(totalStoreInEP * 100) / 100,
        totalStoreInBags: Math.round(totalStoreInBags * 100) / 100,
        totalStoreOutEP: Math.round(totalStoreOutEP * 100) / 100,
        totalStoreOutBags: Math.round(totalStoreOutBags * 100) / 100,
        purchaseCommitmentsPendingEP: Math.round(purchaseCommitmentsPendingEP * 100) / 100,
        purchaseCommitmentsPendingBags: Math.round(purchaseCommitmentsPendingBags * 100) / 100,
        saleCommitmentsPendingEP: Math.round(saleCommitmentsPendingEP * 100) / 100,
        saleCommitmentsPendingBags: Math.round(saleCommitmentsPendingBags * 100) / 100,
        netWarehouseStockEP: Math.round(netWarehouseStockMainEP * 100) / 100,
        quantityToSell: Math.round(quantityToSell * 100) / 100,
        quantityToPurchase: quantityToSell < 0 ? Math.round(Math.abs(quantityToSell) * 100) / 100 : 0,
        netPositionEP: Math.round(quantityToSell * 100) / 100,
        actionNeeded: quantityToSell > 0 ? 'SELL_COFFEE' : quantityToSell < 0 ? 'BUY_COFFEE' : 'BALANCED'
      },
      // Secondary Product Report
      secondary: {
        godownOpenStockEP: Math.round(godownOpenStockEPSec * 100) / 100,
        godownOpenStockBags: Math.round(godownOpenStockBagsSec * 100) / 100,
        stockAdjustmentsEP: Math.round(stockAdjustmentsEPSec * 100) / 100,
        stockAdjustmentsBags: Math.round(stockAdjustmentsBagsSec * 100) / 100,
        totalArrivalEP: Math.round(totalArrivalEPSecondary * 100) / 100,
        totalArrivalBags: Math.round(totalArrivalBagsSecondary * 100) / 100,
        totalArrivalRawWeight: Math.round(totalArrivalRawWeightSecondary * 100) / 100,
        totalDispatchEP: Math.round(totalDispatchEPSecondary * 100) / 100,
        totalDispatchBags: Math.round(totalDispatchBagsSecondary * 100) / 100,
        totalStoreInEP: Math.round(totalStoreInEPSecondary * 100) / 100,
        totalStoreInBags: Math.round(totalStoreInBagsSecondary * 100) / 100,
        totalStoreOutEP: Math.round(totalStoreOutEPSecondary * 100) / 100,
        totalStoreOutBags: Math.round(totalStoreOutBagsSecondary * 100) / 100,
        purchaseCommitmentsPendingEP: Math.round(purchaseCommitmentsPendingEPSec * 100) / 100,
        purchaseCommitmentsPendingBags: Math.round(purchaseCommitmentsPendingBagsSec * 100) / 100,
        saleCommitmentsPendingEP: Math.round(saleCommitmentsPendingEPSec * 100) / 100,
        saleCommitmentsPendingBags: Math.round(saleCommitmentsPendingBagsSec * 100) / 100,
        netWarehouseStockEP: Math.round(netWarehouseStockSecEP * 100) / 100
      },
      // Top-level aliases for direct access
      openingCoffeeEP: Math.round(godownOpenStockEP * 100) / 100,
      godownOpenStockEP: Math.round(godownOpenStockEP * 100) / 100,
      stockAdjustmentsEP: Math.round(stockAdjustmentsEP * 100) / 100,
      totalArrivalEP: Math.round(totalArrivalEP * 100) / 100,
      totalArrivalEPSecondary: Math.round(totalArrivalEPSecondary * 100) / 100,
      totalDispatchEP: Math.round(totalDispatchEP * 100) / 100,
      totalDispatchEPSecondary: Math.round(totalDispatchEPSecondary * 100) / 100,
      totalStoreInEP: Math.round(totalStoreInEP * 100) / 100,
      totalStoreInEPSecondary: Math.round(totalStoreInEPSecondary * 100) / 100,
      totalStoreOutEP: Math.round(totalStoreOutEP * 100) / 100,
      totalStoreOutEPSecondary: Math.round(totalStoreOutEPSecondary * 100) / 100,
      purchaseCommitmentsPendingEP: Math.round(purchaseCommitmentsPendingEP * 100) / 100,
      saleCommitmentsPendingEP: Math.round(saleCommitmentsPendingEP * 100) / 100,
      quantityToSell: Math.round(quantityToSell * 100) / 100,
      quantityToPurchase: quantityToSell < 0 ? Math.round(Math.abs(quantityToSell) * 100) / 100 : 0,
      netPositionEP: Math.round(quantityToSell * 100) / 100,
      actionNeeded: quantityToSell > 0 ? 'SELL_COFFEE' : quantityToSell < 0 ? 'BUY_COFFEE' : 'BALANCED'
    };
  },

  // MILLING & COMMODITY PROCESSING ENGINE
  getMillingLogs(filter = {}) {
    let list = (dbState.millingLogs || []).slice().sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    if (filter.fy && filter.fy !== 'ALL') {
      list = list.filter(m => (m.fy || getFinancialYear(m.date)) === filter.fy);
    }
    if (filter.sourceProduct) {
      list = list.filter(m => m.sourceProduct === filter.sourceProduct);
    }
    if (filter.startDate) {
      list = list.filter(m => m.date >= filter.startDate);
    }
    if (filter.endDate) {
      list = list.filter(m => m.date <= filter.endDate);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(m =>
        (m.millingNo && m.millingNo.toLowerCase().includes(q)) ||
        (m.sourceProduct && m.sourceProduct.toLowerCase().includes(q)) ||
        (m.godown && m.godown.toLowerCase().includes(q))
      );
    }

    if (filter.page && filter.limit) {
      const page = Math.max(1, parseInt(filter.page, 10) || 1);
      const limit = Math.max(1, parseInt(filter.limit, 10) || 50);
      const totalCount = list.length;
      const totalPages = Math.ceil(totalCount / limit);
      const items = list.slice((page - 1) * limit, page * limit);
      return { items, totalCount, page, limit, totalPages };
    }
    return list;
  },

  addMillingLog(data) {
    const id = 'mill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const count = (dbState.millingLogs || []).length + 1;
    const millingNo = data.millingNo || `MILL-${String(count).padStart(4, '0')}`;

    const record = {
      id,
      millingNo,
      date: data.date || new Date().toISOString().split('T')[0],
      godown: data.godown || 'Main Godown',
      sourceProduct: data.sourceProduct || '',
      sourceBags: Number(data.sourceBags) || 0,
      sourceWeight: Number(data.sourceWeight) || 0,
      sourceOutturn: Number(data.sourceOutturn) || 0,
      inputEPWeight: Number(data.inputEPWeight) || 0,
      outputs: (data.outputs || []).map(o => ({
        product: o.product,
        percentage: Number(o.percentage) || 0,
        yieldWeight: Number(o.yieldWeight) || 0,
        isSecondary: Boolean(o.isSecondary)
      })),
      notes: data.notes || '',
      fy: data.fy || getFinancialYear(data.date),
      isLocked: false,
      createdAt: new Date().toISOString()
    };

    if (!dbState.millingLogs) dbState.millingLogs = [];
    dbState.millingLogs.unshift(record);
    saveLocalDb();
    if (isMongoConnected && MongoMillingLog) {
      MongoMillingLog.findOneAndUpdate({ id: record.id }, record, { upsert: true }).catch(e => console.error(e));
    }
    return record;
  },

  deleteMillingLog(id) {
    const mill = (dbState.millingLogs || []).find(m => m.id === id);
    if (mill && mill.isLocked) {
      throw new Error(`Cannot delete processing log ${mill.millingNo || mill.id} because it belongs to closed Financial Year (${mill.fy || 'Audited'}). Record is locked.`);
    }

    dbState.millingLogs = (dbState.millingLogs || []).filter(m => m.id !== id);
    saveLocalDb();
    if (isMongoConnected && MongoMillingLog) {
      MongoMillingLog.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  getProcessingProfiles() {
    if (!dbState.settings) dbState.settings = {};
    if (!dbState.settings.processingProfiles) {
      dbState.settings.processingProfiles = {};
      saveLocalDb();
    }
    return dbState.settings.processingProfiles;
  },

  async saveProcessingProfile(payload) {
    const { sourceProduct, outputs } = payload;
    if (!sourceProduct) return { error: 'Source product name required' };
    if (!dbState.settings) dbState.settings = {};
    if (!dbState.settings.processingProfiles) {
      dbState.settings.processingProfiles = {};
    }
    dbState.settings.processingProfiles[sourceProduct] = outputs;
    saveLocalDb();
    if (isMongoConnected && MongoProcessingProfile) {
      try {
        await MongoProcessingProfile.findOneAndUpdate(
          { id: sourceProduct },
          { id: sourceProduct, sourceProduct, outputs, updatedAt: new Date() },
          { upsert: true }
        );
      } catch (e) {
        console.error('Error saving processing profile to MongoDB:', e);
      }
    }
    return { success: true, profiles: dbState.settings.processingProfiles };
  },

  async deleteProcessingProfile(sourceProduct) {
    if (!sourceProduct) return { error: 'Source product name required' };
    if (dbState.settings && dbState.settings.processingProfiles) {
      delete dbState.settings.processingProfiles[sourceProduct];
    }
    saveLocalDb();
    if (isMongoConnected && MongoProcessingProfile) {
      try {
        await MongoProcessingProfile.deleteOne({ id: sourceProduct });
      } catch (e) {
        console.error('Error deleting processing profile from MongoDB:', e);
      }
    }
    return { success: true, profiles: dbState.settings?.processingProfiles || {} };
  },

  // DATED OPENING STOCK ENTRIES & PARTY LINKAGE
  getOpeningStockEntries() {
    return (dbState.openingStockEntries || []).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  },

  addOpeningStockEntry(data) {
    const id = 'opstock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const record = {
      id,
      date: data.date || new Date().toISOString().split('T')[0],
      godown: data.godown || 'Main Godown',
      supplierId: data.supplierId || null,
      supplierName: data.supplierName || 'Global / Unallocated',
      product: data.product || '',
      isSecondary: Boolean(data.isSecondary),
      bags: Number(data.bags) || 0,
      weight: Number(data.weight) || 0,
      outturn: Number(data.outturn) || 0,
      endProductWeight: Number(data.endProductWeight) || 0,
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    if (!dbState.openingStockEntries) dbState.openingStockEntries = [];
    dbState.openingStockEntries.unshift(record);

    // If mapped to a specific supplier, update supplier opening storage balances
    if (data.supplierId) {
      const supIdx = (dbState.suppliers || []).findIndex(s => s.id === data.supplierId);
      if (supIdx !== -1) {
        dbState.suppliers[supIdx].openingStorageBags = (dbState.suppliers[supIdx].openingStorageBags || 0) + record.bags;
        dbState.suppliers[supIdx].openingStorageEP = (dbState.suppliers[supIdx].openingStorageEP || 0) + record.endProductWeight;
      }
    }

    saveLocalDb();
    if (isMongoConnected && MongoOpeningStockEntry) {
      MongoOpeningStockEntry.findOneAndUpdate({ id: record.id }, record, { upsert: true }).catch(e => console.error(e));
    }
    return record;
  },

  deleteOpeningStockEntry(id) {
    dbState.openingStockEntries = (dbState.openingStockEntries || []).filter(e => e.id !== id);
    saveLocalDb();
    if (isMongoConnected && MongoOpeningStockEntry) {
      MongoOpeningStockEntry.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // COMPREHENSIVE GODOWN STOCK SUMMARY (DYNAMIC FOR ALL COMMODITIES GLOBALLY)
  getGodownStockSummary(options = {}) {
    const products = dbState.products || [];
    let arrivals = dbState.arrivals || [];
    let dispatches = dbState.dispatches || [];
    let millingLogs = dbState.millingLogs || [];
    let openingEntries = dbState.openingStockEntries || [];
    const suppliers = dbState.suppliers || [];

    if (options && options.maxDate) {
      arrivals = arrivals.filter(a => a.date <= options.maxDate);
      dispatches = dispatches.filter(d => d.date <= options.maxDate);
      millingLogs = millingLogs.filter(m => m.date <= options.maxDate);
      openingEntries = openingEntries.filter(o => o.date <= options.maxDate);
    }

    const normalizeKey = (str) => {
      if (!str) return '';
      return String(str).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const knownCanonicalMap = new Map();

    // Helper to resolve canonical product name to prevent duplicate stock rows
    const getCanonicalName = (rawName) => {
      if (!rawName) return '';
      const trimmed = String(rawName).trim();
      const norm = normalizeKey(trimmed);
      if (!norm) return '';

      // 1. Search products master by normalized name, code, or id
      const found = products.find(p =>
        (p.name && normalizeKey(p.name) === norm) ||
        (p.code && normalizeKey(p.code) === norm) ||
        (p.id && normalizeKey(p.id) === norm)
      );
      if (found && found.name) {
        return found.name.trim();
      }

      // 2. Check if already mapped
      if (knownCanonicalMap.has(norm)) {
        return knownCanonicalMap.get(norm);
      }

      // 3. Fallback: format trimmed string (convert underscores to spaces)
      const formatted = trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ');

      knownCanonicalMap.set(norm, formatted);
      return formatted;
    };

    // Duplicate definition removed. Global isSecondaryProduct function (declared earlier) is used.
    // const isSecondaryProduct = (pName) => {
    //   const canonical = getCanonicalName(pName);
    //   const prodObj = products.find(p => p.name === canonical);
    //   if (prodObj && (prodObj.isSecondary === true || prodObj.productType === 'secondary' || prodObj.category === 'Secondary Product' || prodObj.isMain === false)) {
    //     return true;
    //   }
    //   const isMillingSecondary = millingLogs.some(m => (m.outputs || []).some(o => getCanonicalName(o.product) === canonical && o.isSecondary));
    //   if (isMillingSecondary) return true;
    //
    //   return false;
    // };

    // Collect all product names dynamically from the database
    const allProdNames = new Set([
      ...products.map(p => getCanonicalName(p.name)),
      ...arrivals.map(a => getCanonicalName(a.product)),
      ...dispatches.map(d => getCanonicalName(d.product)),
      ...openingEntries.map(e => getCanonicalName(e.product)),
      ...millingLogs.map(m => getCanonicalName(m.sourceProduct)),
      ...millingLogs.flatMap(m => (m.outputs || []).map(o => getCanonicalName(o.product)))
    ].filter(Boolean));

    const stockMap = {};

    // Helper to get or create stock item by canonical product name
    const getOrCreateItem = (rawName) => {
      const p = getCanonicalName(rawName);
      if (!p) return null;
      if (!stockMap[p]) {
        const prodObj = products.find(prod => prod.name === p);
        stockMap[p] = {
          product: p,
          category: prodObj?.category || 'General Commodity',
          unit: prodObj?.unit || 'Kg',
          openingBags: 0,
          openingWeight: 0,
          openingEP: 0,
          storeInBags: 0,
          storeInWeight: 0,
          storeInEP: 0,
          storeOutBags: 0,
          storeOutWeight: 0,
          storeOutEP: 0,
          millingDeductedBags: 0,
          millingDeductedWeight: 0,
          millingDeductedEP: 0,
          millingYieldBags: 0,
          millingYieldWeight: 0,
          millingYieldEP: 0,
          currentBags: 0,
          currentWeight: 0,
          currentEP: 0
        };
      }
      return stockMap[p];
    };

    allProdNames.forEach(pName => getOrCreateItem(pName));

    // 1. Process Opening Stock Entries
    openingEntries.forEach(entry => {
      if (entry.product) {
        const item = getOrCreateItem(entry.product);
        if (item) {
          item.openingBags += Number(entry.bags) || 0;
          item.openingWeight += Number(entry.weight) || 0;
          item.openingEP += Number(entry.endProductWeight || entry.weight) || 0;
        }
      }
    });

    // 2. Process Store-In (Arrivals)
    arrivals.forEach(arr => {
      if (arr.product) {
        const item = getOrCreateItem(arr.product);
        if (item) {
          item.storeInBags += Number(arr.bags) || 0;
          item.storeInWeight += Number(arr.weight) || 0;
          item.storeInEP += Number(arr.endProductWeight || arr.weight) || 0;
        }
      }
    });

    // 3. Process Store-Out (Dispatches)
    dispatches.forEach(disp => {
      if (disp.product) {
        const item = getOrCreateItem(disp.product);
        if (item) {
          item.storeOutBags += Number(disp.bags) || 0;
          item.storeOutWeight += Number(disp.weight) || 0;
          item.storeOutEP += Number(disp.endProductWeight || disp.weight) || 0;
        }
      }
    });

    // 4. Process Processing Logs
    millingLogs.forEach(mill => {
      const srcP = mill.sourceProduct;
      const srcBags = Number(mill.sourceBags) || 0;
      const srcWeight = Number(mill.sourceWeight || mill.inputEPWeight) || 0;

      let primaryEPYieldSum = 0;

      (mill.outputs || []).forEach(out => {
        const outP = out.product;
        const yieldW = Number(out.yieldWeight) || 0;
        const yieldB = Number(out.yieldBags) || (srcBags > 0 ? Math.round(srcBags * (Number(out.percentage) / 100)) : 0);

        if (outP) {
          const item = getOrCreateItem(outP);
          if (item) {
            item.millingYieldBags += yieldB;
            item.millingYieldWeight += yieldW;
            const sec = isSecondaryProduct(item.product);
            if (!sec) {
              item.millingYieldEP += yieldW;
              primaryEPYieldSum += yieldW;
            }
          }
        }
      });

      if (srcP) {
        const item = getOrCreateItem(srcP);
        if (item) {
          item.millingDeductedBags += srcBags;
          item.millingDeductedWeight += srcWeight; // Deduct Processed Quantity from Net Weight
          item.millingDeductedEP += primaryEPYieldSum; // Deduct Sum of Primary EP Yields from Net EP
        }
      }
    });

    // Calculate final balances dynamically
    const allProductsCalculated = Object.values(stockMap).map(item => {
      const openB = Number(item.openingBags) || 0;
      const inB = Number(item.storeInBags) || 0;
      const outB = Number(item.storeOutBags) || 0;
      const millDedB = Number(item.millingDeductedBags) || 0;
      const millYldB = Number(item.millingYieldBags) || 0;

      const openW = Number(item.openingWeight) || 0;
      const inW = Number(item.storeInWeight) || 0;
      const outW = Number(item.storeOutWeight) || 0;
      const millDedW = Number(item.millingDeductedWeight) || 0;
      const millYldW = Number(item.millingYieldWeight) || 0;

      const openEP = Number(item.openingEP) || 0;
      const inEP = Number(item.storeInEP) || 0;
      const outEP = Number(item.storeOutEP) || 0;
      const millDedEP = Number(item.millingDeductedEP) || 0;
      const millYldEP = Number(item.millingYieldEP) || 0;

      const currentBags = openB + inB - outB - millDedB + millYldB;
      const currentWeight = openW + inW - outW - millDedW + millYldW;
      const currentEP = openEP + inEP - outEP - millDedEP + millYldEP;

      const isSec = isSecondaryProduct(item.product);

      return {
        ...item,
        isSecondary: isSec,
        category: isSec ? 'Secondary / Byproduct' : (item.category || 'Primary Commodity'),
        currentBags: Math.round(currentBags),
        currentWeight: Math.round(currentWeight * 100) / 100,
        currentEP: Math.round(currentEP * 100) / 100
      };
    });

    const primaryProducts = allProductsCalculated.filter(p => !p.isSecondary);
    const secondaryProducts = allProductsCalculated.filter(p => p.isSecondary);

    // Party Account Storage Ledgers
    const partyAccountSummaries = suppliers.map(sup => {
      const openBags = Number(sup.openingStorageBags) || 0;
      const openEP = Number(sup.openingStorageEP) || 0;

      let inBags = 0;
      let inEP = 0;
      arrivals.filter(a => a.supplierId === sup.id && (a.status === 'storage' || a.status === 'partial_settled')).forEach(a => {
        inBags += (a.remainingBags !== undefined ? Number(a.remainingBags) : Number(a.bags) || 0);
        inEP += (a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : Number(a.endProductWeight) || 0);
      });

      let outBags = 0;
      let outEP = 0;
      dispatches.filter(d => (d.supplierId === sup.id || d.partyId === sup.id) && (d.status === 'storage_out' || d.rateType === 'storage_out')).forEach(d => {
        outBags += Number(d.bags) || 0;
        outEP += Number(d.endProductWeight || d.weight) || 0;
      });

      const currentBags = openBags + inBags - outBags;
      const currentEP = openEP + inEP - outEP;

      return {
        supplierId: sup.id,
        supplierName: sup.name,
        phone: sup.phone || '',
        place: sup.place || '',
        openingBags: openBags,
        openingEP: Math.round(openEP * 100) / 100,
        storeInBags: inBags,
        storeInEP: Math.round(inEP * 100) / 100,
        storeOutBags: outBags,
        storeOutEP: Math.round(outEP * 100) / 100,
        currentBags: Math.round(currentBags),
        currentEP: Math.round(currentEP * 100) / 100
      };
    }).filter(s => s.openingEP > 0 || s.storeInEP > 0 || s.storeOutEP > 0 || s.currentEP !== 0);

    // Global Grand Totals
    const totalOpeningEP = primaryProducts.reduce((acc, i) => acc + i.openingEP, 0);
    const totalStoreInEP = primaryProducts.reduce((acc, i) => acc + i.storeInEP, 0);
    const totalStoreOutEP = primaryProducts.reduce((acc, i) => acc + i.storeOutEP, 0);
    const totalMillingYieldEP = primaryProducts.reduce((acc, i) => acc + i.millingYieldEP, 0);
    const totalCurrentAvailableEP = primaryProducts.reduce((acc, i) => acc + i.currentEP, 0);

    const totalSecondaryWeight = secondaryProducts.reduce((acc, i) => acc + i.currentWeight, 0);
    const totalSecondaryBags = secondaryProducts.reduce((acc, i) => acc + i.currentBags, 0);

    return {
      primaryProducts,
      secondaryProducts,
      partyAccounts: partyAccountSummaries,
      totals: {
        totalOpeningEP: Math.round(totalOpeningEP * 100) / 100,
        totalStoreInEP: Math.round(totalStoreInEP * 100) / 100,
        totalStoreOutEP: Math.round(totalStoreOutEP * 100) / 100,
        totalMillingYieldEP: Math.round(totalMillingYieldEP * 100) / 100,
        totalCurrentAvailableEP: Math.round(totalCurrentAvailableEP * 100) / 100,
        totalSecondaryWeight: Math.round(totalSecondaryWeight * 100) / 100,
        totalSecondaryBags: Math.round(totalSecondaryBags)
      }
    };
  },

  // GLOBAL DASHBOARD METRICS
  getDashboardMetrics(dateFilter = {}) {
    let arrivals = (dbState.arrivals || []).slice();
    let dispatches = (dbState.dispatches || []).slice();
    let settlements = (dbState.settlements || []).slice();

    if (dateFilter.startDate) {
      arrivals = arrivals.filter(a => a.date >= dateFilter.startDate);
      dispatches = dispatches.filter(d => d.date >= dateFilter.startDate);
      settlements = settlements.filter(s => s.date >= dateFilter.startDate);
    }
    if (dateFilter.endDate) {
      arrivals = arrivals.filter(a => a.date <= dateFilter.endDate);
      dispatches = dispatches.filter(d => d.date <= dateFilter.endDate);
      settlements = settlements.filter(s => s.date <= dateFilter.endDate);
    }

    let dailyTotalWeight = 0;
    let dailyTotalBags = 0;
    let dailyTotalEndProduct = 0;
    let dailyTotalBill = 0;
    let dailyStorageInBags = 0;
    let dailyStorageInEP = 0;
    let billedArrivalsCount = 0;
    let totalRateSum = 0;

    arrivals.forEach(arr => {
      const w = Number(arr.weight) || 0;
      const b = Number(arr.bags) || 0;
      const ep = Number(arr.endProductWeight) || 0;
      dailyTotalWeight += w;
      dailyTotalBags += b;
      dailyTotalEndProduct += ep;

      if (arr.status === 'storage' || arr.status === 'partial_settled') {
        dailyStorageInBags += (arr.remainingBags !== undefined ? Number(arr.remainingBags) : b);
        dailyStorageInEP += (arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : ep);
      }
      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        dailyTotalBill += getEffectiveArrivalNetAmount(arr);
        if (arr.rate > 0) {
          totalRateSum += arr.rate;
          billedArrivalsCount++;
        }
      }
    });

    let dailyDispatchWeight = 0;
    let dailyDispatchBags = 0;
    let dailyDispatchValue = 0;
    let dailyStorageOutBags = 0;
    let dailyStorageOutEP = 0;

    dispatches.forEach(d => {
      const w = Number(d.weight) || 0;
      const b = Number(d.bags) || 0;
      const ep = Number(d.endProductWeight) || w;
      dailyDispatchWeight += w;
      dailyDispatchBags += b;
      if (d.status === 'storage_out' || d.rateType === 'storage_out') {
        dailyStorageOutBags += (d.remainingBags !== undefined ? Number(d.remainingBags) : b);
        dailyStorageOutEP += (d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep);
      } else {
        dailyDispatchValue += getEffectiveDispatchNetAmount(d);
      }
    });

    let dailySettledBags = 0;
    let dailySettledEP = 0;
    let dailySettledValue = 0;
    settlements.forEach(s => {
      dailySettledBags += (Number(s.settledBags) || 0);
      dailySettledEP += (Number(s.settledEndProduct) || 0);
      dailySettledValue += getEffectiveSettlementNetAmount(s);
    });

    const dailyAvgRate = billedArrivalsCount > 0 ? totalRateSum / billedArrivalsCount : 0;

    // Global all-time aggregates
    let totalSuppliers = dbState.suppliers.length;
    let totalStorageBags = 0;
    let totalStorageEP = 0;
    let totalStoreOutBags = 0;
    let totalStoreOutEP = 0;
    let totalPurchasesValue = 0;
    let totalSalesValue = 0;
    let totalTcsAllTime = 0;
    let totalTdsAllTime = 0;
    let totalGstAllTime = 0;
    let totalPaidAllTime = 0;
    let totalReceivedAllTime = 0;

    // Commodity-wise stock breakdown map
    const productStockMap = new Map();
    (dbState.products || []).forEach(p => {
      productStockMap.set(p.name, {
        product: p.name,
        code: p.code,
        calculationBasis: p.calculationBasis || 'direct',
        storeInBags: 0,
        storeInWeight: 0,
        storeInEP: 0,
        storeOutBags: 0,
        storeOutEP: 0,
        netBags: 0,
        netEP: 0,
        avgOutturn: 0
      });
    });

    (dbState.arrivals || []).forEach(arr => {
      const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : Number(arr.bags);
      const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : Number(arr.endProductWeight);
      const remWeight = arr.bags > 0 ? (remBags / arr.bags) * (Number(arr.weight) || 0) : Number(arr.weight || 0);

      if (arr.status === 'storage' || arr.status === 'partial_settled') {
        totalStorageBags += remBags;
        totalStorageEP += remEP;

        const prodKey = arr.product || 'Other';
        if (!productStockMap.has(prodKey)) {
          productStockMap.set(prodKey, {
            product: prodKey,
            code: prodKey.toUpperCase().replace(/\s+/g, '_'),
            calculationBasis: 'end_product',
            storeInBags: 0,
            storeInWeight: 0,
            storeInEP: 0,
            storeOutBags: 0,
            storeOutEP: 0,
            netBags: 0,
            netEP: 0,
            avgOutturn: 0
          });
        }
        const item = productStockMap.get(prodKey);
        item.storeInBags += remBags;
        item.storeInWeight += remWeight;
        item.storeInEP += remEP;
      }

      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        totalPurchasesValue += getEffectiveArrivalNetAmount(arr);
        const taxable = Number(arr.taxableAmount) || (Number(arr.weight) * Number(arr.rate)) || 0;
        totalTcsAllTime += Number(arr.tcsAmount) || (arr.tcsRate ? Math.round((taxable * (Number(arr.tcsRate) / 100)) * 100) / 100 : 0);
        totalTdsAllTime += Number(arr.tdsAmount) || (arr.tdsRate ? Math.round((taxable * (Number(arr.tdsRate) / 100)) * 100) / 100 : 0);
        totalGstAllTime += (Number(arr.cgstAmount) || 0) + (Number(arr.sgstAmount) || 0) + (Number(arr.igstAmount) || 0);
      }
    });

    (dbState.dispatches || []).forEach(disp => {
      const remBags = disp.remainingBags !== undefined ? Number(disp.remainingBags) : Number(disp.bags);
      const remEP = disp.remainingEndProduct !== undefined ? Number(disp.remainingEndProduct) : Number(disp.endProductWeight || disp.weight || 0);

      if (disp.status === 'storage_out' || disp.rateType === 'storage_out' || disp.status === 'partial_settled') {
        totalStoreOutBags += remBags;
        totalStoreOutEP += remEP;

        const prodKey = disp.product || 'Other';
        if (productStockMap.has(prodKey)) {
          const item = productStockMap.get(prodKey);
          item.storeOutBags += remBags;
          item.storeOutEP += remEP;
        }
      }

      if (disp.status === 'billed' || disp.status === 'cash_bill') {
        totalSalesValue += getEffectiveDispatchNetAmount(disp);
        const taxable = Number(disp.taxableAmount) || (Number(disp.weight) * Number(disp.rate)) || 0;
        totalTcsAllTime += Number(disp.tcsAmount) || (disp.tcsRate ? Math.round((taxable * (Number(disp.tcsRate) / 100)) * 100) / 100 : 0);
        totalTdsAllTime += Number(disp.tdsAmount) || (disp.tdsRate ? Math.round((taxable * (Number(disp.tdsRate) / 100)) * 100) / 100 : 0);
        totalGstAllTime += (Number(disp.cgstAmount) || 0) + (Number(disp.sgstAmount) || 0) + (Number(disp.igstAmount) || 0);
      }
    });

    (dbState.settlements || []).forEach(set => {
      const bill = getEffectiveSettlementNetAmount(set);
      if (set.settlementCategory === 'sales_storage') {
        totalSalesValue += bill;
      } else {
        totalPurchasesValue += bill;
      }
      const gross = Number(set.settlementGrossAmount) || 0;
      totalTcsAllTime += Number(set.tcsAmount) || (set.tcsRate ? Math.round((gross * (Number(set.tcsRate) / 100)) * 100) / 100 : 0);
      totalTdsAllTime += Number(set.tdsAmount) || (set.tdsRate ? Math.round((gross * (Number(set.tdsRate) / 100)) * 100) / 100 : 0);
    });

    (dbState.payments || []).forEach(p => {
      if (p.type === 'payment_paid' || !p.type) {
        totalPaidAllTime += (Number(p.amount) || 0);
      } else if (p.type === 'payment_received') {
        totalReceivedAllTime += (Number(p.amount) || 0);
      }
    });

    // Opening financial balances & party storage stock
    let totalOpeningPayable = 0;    // Credit opening balance (We owe party)
    let totalOpeningReceivable = 0; // Debit opening balance (Party owes us)
    let totalPartyOpeningStorageBags = 0;
    let totalPartyOpeningStorageEP = 0;

    (dbState.suppliers || []).forEach(s => {
      const bal = Number(s.openingBalance) || 0;
      if (s.openingBalanceType === 'debit') {
        totalOpeningReceivable += Math.abs(bal);
      } else {
        totalOpeningPayable += Math.abs(bal);
      }
      totalPartyOpeningStorageBags += (Number(s.openingStorageBags) || 0);
      totalPartyOpeningStorageEP += (Number(s.openingStorageEP) || 0);
    });

    const netOpeningFinancialBalance = totalOpeningPayable - totalOpeningReceivable;

    // Opening stock (Godown settings + entries)
    const openStockSettings = dbState.settings?.openingStock || {};
    let godownOpeningBags = Number(openStockSettings.coffeeBags) || 0;
    let godownOpeningEP = Number(openStockSettings.coffeeEP) || 0;

    (dbState.openingStockEntries || []).forEach(e => {
      const b = Number(e.bags) || 0;
      const ep = Number(e.endProductWeight !== undefined ? e.endProductWeight : e.weight) || 0;
      if (!e.isAdjustment) {
        godownOpeningBags += b;
        godownOpeningEP += ep;
      }
    });

    if (godownOpeningEP === 0 && godownOpeningBags > 0) {
      godownOpeningEP = godownOpeningBags * 26;
    }

    const totalOpeningStockBags = godownOpeningBags + totalPartyOpeningStorageBags;
    const totalOpeningStockEP = godownOpeningEP + totalPartyOpeningStorageEP;

    // Incorporate opening stock into total physical storage
    totalStorageBags += totalOpeningStockBags;
    totalStorageEP += totalOpeningStockEP;

    const netPayableGlobal = netOpeningFinancialBalance + totalPurchasesValue - totalSalesValue - totalPaidAllTime + totalReceivedAllTime;

    // Convert product stock map to array with rounded values & avg outturn
    const storageByProduct = Array.from(productStockMap.values())
      .map(item => {
        const netBags = Math.round((item.storeInBags - item.storeOutBags) * 100) / 100;
        const netEP = Math.round((item.storeInEP - item.storeOutEP) * 100) / 100;
        const avgOutturn = item.storeInWeight > 0 ? Math.round(((item.storeInEP / (item.storeInWeight / 50))) * 100) / 100 : 0;
        return {
          ...item,
          storeInBags: Math.round(item.storeInBags * 100) / 100,
          storeInWeight: Math.round(item.storeInWeight * 100) / 100,
          storeInEP: Math.round(item.storeInEP * 100) / 100,
          storeOutBags: Math.round(item.storeOutBags * 100) / 100,
          storeOutEP: Math.round(item.storeOutEP * 100) / 100,
          netBags,
          netEP,
          avgOutturn
        };
      })
      .filter(item => item.storeInBags > 0 || item.storeOutBags > 0 || item.netBags > 0);

    const activePurchaseCommitments = (dbState.commitments || []).filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active');
    const activeSaleCommitments = (dbState.commitments || []).filter(c => c.category === 'sale' && c.status === 'active');

    return {
      daily: {
        totalWeight: Math.round(dailyTotalWeight * 100) / 100,
        totalBags: Math.round(dailyTotalBags * 100) / 100,
        totalEndProduct: Math.round(dailyTotalEndProduct * 100) / 100,
        totalBill: Math.round(dailyTotalBill * 100) / 100,
        storageInBags: Math.round(dailyStorageInBags * 100) / 100,
        storageInEP: Math.round(dailyStorageInEP * 100) / 100,
        dispatchWeight: Math.round(dailyDispatchWeight * 100) / 100,
        dispatchBags: Math.round(dailyDispatchBags * 100) / 100,
        dispatchValue: Math.round(dailyDispatchValue * 100) / 100,
        storageOutBags: Math.round(dailyStorageOutBags * 100) / 100,
        storageOutEP: Math.round(dailyStorageOutEP * 100) / 100,
        settledBags: Math.round(dailySettledBags * 100) / 100,
        settledEP: Math.round(dailySettledEP * 100) / 100,
        settledValue: Math.round(dailySettledValue * 100) / 100,
        avgRate: Math.round(dailyAvgRate * 100) / 100,
        arrivalsCount: arrivals.length,
        dispatchesCount: dispatches.length,
        settlementsCount: settlements.length
      },
      global: {
        totalSuppliers,
        totalOpeningPayable: Math.round(totalOpeningPayable * 100) / 100,
        totalOpeningReceivable: Math.round(totalOpeningReceivable * 100) / 100,
        netOpeningFinancialBalance: Math.round(netOpeningFinancialBalance * 100) / 100,
        godownOpeningBags: Math.round(godownOpeningBags * 100) / 100,
        godownOpeningEP: Math.round(godownOpeningEP * 100) / 100,
        totalPartyOpeningStorageBags: Math.round(totalPartyOpeningStorageBags * 100) / 100,
        totalPartyOpeningStorageEP: Math.round(totalPartyOpeningStorageEP * 100) / 100,
        totalOpeningStockBags: Math.round(totalOpeningStockBags * 100) / 100,
        totalOpeningStockEP: Math.round(totalOpeningStockEP * 100) / 100,
        totalPurchasesValue: Math.round(totalPurchasesValue * 100) / 100,
        totalSalesValue: Math.round(totalSalesValue * 100) / 100,
        totalStorageBags: Math.round(totalStorageBags * 100) / 100,
        totalStorageEP: Math.round(totalStorageEP * 100) / 100,
        totalStoreOutBags: Math.round(totalStoreOutBags * 100) / 100,
        totalStoreOutEP: Math.round(totalStoreOutEP * 100) / 100,
        netStorageBags: Math.round((totalStorageBags - totalStoreOutBags) * 100) / 100,
        netStorageEP: Math.round((totalStorageEP - totalStoreOutEP) * 100) / 100,
        totalTcsAllTime: Math.round(totalTcsAllTime * 100) / 100,
        totalTdsAllTime: Math.round(totalTdsAllTime * 100) / 100,
        totalGstAllTime: Math.round(totalGstAllTime * 100) / 100,
        totalPaidAllTime: Math.round(totalPaidAllTime * 100) / 100,
        totalReceivedAllTime: Math.round(totalReceivedAllTime * 100) / 100,
        netPayableGlobal: Math.round(netPayableGlobal * 100) / 100,
        activePurchaseCommitmentsCount: activePurchaseCommitments.length,
        activeSaleCommitmentsCount: activeSaleCommitments.length
      },
      storageByProduct,
      recentArrivals: (dbState.arrivals || []).slice(-8).reverse(),
      recentDispatches: (dbState.dispatches || []).slice(-8).reverse(),
      recentSettlements: (dbState.settlements || []).slice(-8).reverse()
    };
  },

  // DATA BACKUP & RESTORE
  exportFullBackup() {
    return {
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      data: dbState
    };
  },

  importBackup(backupData) {
    if (!backupData || !backupData.data) throw new Error('Invalid backup file');
    dbState = {
      ...dbState,
      ...backupData.data
    };
    saveLocalDb();
    syncWithMongo().catch(e => console.error(e));
    return { success: true };
  },

  // SETTINGS
  getSettings() {
    return dbState.settings || {};
  },

  updateSettings(data = {}) {
    if (!dbState.settings) dbState.settings = {};
    dbState.settings = {
      ...dbState.settings,
      ...data
    };
    saveLocalDb();
    return dbState.settings;
  },

  // BULK OPERATIONS FOR HIGH-SPEED BOT DATA ENTRY
  bulkAddArrivals(items = []) {
    ensureDatabaseReady();
    if (!Array.isArray(items)) throw new Error('Expected items array for bulk arrival import');
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const arr = this.addArrival(items[i], false);
      created.push(arr);
    }
    saveLocalDb();
    if (isMongoConnected && MongoArrival && created.length > 0) {
      MongoArrival.insertMany(created, { ordered: false }).catch(e => console.error('Mongo bulk arrivals error:', e));
    }
    return { success: true, count: created.length, items: created };
  },

  bulkAddDispatches(items = []) {
    ensureDatabaseReady();
    if (!Array.isArray(items)) throw new Error('Expected items array for bulk dispatch import');
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const disp = this.addDispatch(items[i], false);
      created.push(disp);
    }
    saveLocalDb();
    if (isMongoConnected && MongoDispatch && created.length > 0) {
      MongoDispatch.insertMany(created, { ordered: false }).catch(e => console.error('Mongo bulk dispatches error:', e));
    }
    return { success: true, count: created.length, items: created };
  },

  bulkAddSuppliers(items = []) {
    ensureDatabaseReady();
    if (!Array.isArray(items)) throw new Error('Expected items array for bulk supplier import');
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const sup = this.addSupplier(items[i], false);
      created.push(sup);
    }
    saveLocalDb();
    if (isMongoConnected && MongoSupplier && created.length > 0) {
      MongoSupplier.insertMany(created, { ordered: false }).catch(e => console.error('Mongo bulk suppliers error:', e));
    }
    return { success: true, count: created.length, items: created };
  },

  bulkAddPayments(items = []) {
    ensureDatabaseReady();
    if (!Array.isArray(items)) throw new Error('Expected items array for bulk payments import');
    const created = [];
    for (let i = 0; i < items.length; i++) {
      const pay = this.addPayment(items[i], false);
      created.push(pay);
    }
    saveLocalDb();
    if (isMongoConnected && MongoPayment && created.length > 0) {
      MongoPayment.insertMany(created, { ordered: false }).catch(e => console.error('Mongo bulk payments error:', e));
    }
    return { success: true, count: created.length, items: created };
  },

  // FINANCIAL YEAR (FY) CLOSING & AUTOMATED ROLLOVER ENGINE
  async closeFinancialYear(payload = {}) {
    ensureDatabaseReady();
    const { fyToClose, notes = '', lockTransactions = true } = payload;
    if (!fyToClose) throw new Error('Financial year to close is required (e.g. "2025-2026")');

    const parts = fyToClose.split('-');
    if (parts.length !== 2) throw new Error('Invalid FY format. Expected YYYY-YYYY (e.g. "2025-2026")');
    const closeEndYear = parseInt(parts[1], 10);
    const nextStartYear = closeEndYear;
    const nextEndYear = nextStartYear + 1;
    const nextFy = `${nextStartYear}-${nextEndYear}`;
    const nextApril1 = `${nextStartYear}-04-01`;
    const march31Date = `${closeEndYear}-03-31`;

    // 1. Calculate stock balances as of March 31 of the closing financial year
    const closingSummary = this.getGodownStockSummary({ maxDate: march31Date });
    const createdOpeningEntries = [];

    // For every primary and secondary product with positive balance, create an OpeningStockEntry
    for (const p of (closingSummary.primaryProducts || [])) {
      if (p.currentWeight > 0 || p.currentEP > 0 || p.currentBags > 0) {
        const opEntry = this.addOpeningStockEntry({
          date: nextApril1,
          godown: 'Main Godown',
          product: p.product,
          isSecondary: false,
          bags: p.currentBags || 0,
          weight: p.currentWeight || 0,
          outturn: p.currentWeight > 0 ? Math.round((p.currentEP / p.currentWeight) * 50 * 100) / 100 : 50,
          endProductWeight: p.currentEP || p.currentWeight || 0,
          notes: `Automated Year-End Rollover from FY ${fyToClose} (${notes || 'Audited Closing Stock'})`,
          fy: nextFy
        });
        createdOpeningEntries.push(opEntry);
      }
    }

    for (const s of (closingSummary.secondaryProducts || [])) {
      if (s.currentWeight > 0 || s.currentBags > 0) {
        const opEntry = this.addOpeningStockEntry({
          date: nextApril1,
          godown: 'Main Godown',
          product: s.product,
          isSecondary: true,
          bags: s.currentBags || 0,
          weight: s.currentWeight || 0,
          outturn: 0,
          endProductWeight: s.currentWeight || 0,
          notes: `Automated Year-End Rollover from FY ${fyToClose} (${notes || 'Audited Closing By-product'})`,
          fy: nextFy
        });
        createdOpeningEntries.push(opEntry);
      }
    }

    // 2. Carry forward supplier balances as of closing date
    const updatedSuppliers = [];
    for (const sup of (dbState.suppliers || [])) {
      const ledger = calculateSupplierLedger(sup.id, null, march31Date);
      if (ledger) {
        sup.openingBalance = Math.abs(ledger.netPayable || 0);
        sup.openingBalanceType = (ledger.netPayable || 0) >= 0 ? 'credit' : 'debit';
        sup.openingStorageBags = Math.max(0, ledger.storageBags || 0);
        sup.openingStorageEP = Math.max(0, ledger.storageEndProduct || 0);
        updatedSuppliers.push({ id: sup.id, name: sup.name, netPayable: ledger.netPayable });
        if (isMongoConnected && MongoSupplier) {
          MongoSupplier.findOneAndUpdate({ id: sup.id }, sup, { upsert: true }).catch(e => console.error(e));
        }
      }
    }

    // 3. Lock transactions belonging to the closed financial year
    let lockedCount = 0;
    if (lockTransactions) {
      const lockItem = (item) => {
        const itemFy = item.fy || getFinancialYear(item.date);
        if (itemFy === fyToClose) {
          item.isLocked = true;
          item.fy = fyToClose;
          lockedCount++;
          return true;
        }
        return false;
      };

      (dbState.arrivals || []).forEach(lockItem);
      (dbState.dispatches || []).forEach(lockItem);
      (dbState.settlements || []).forEach(lockItem);
      (dbState.payments || []).forEach(lockItem);
      (dbState.commitments || []).forEach(lockItem);
      (dbState.millingLogs || []).forEach(lockItem);
      (dbState.epTransfers || []).forEach(lockItem);
      (dbState.commitmentWashes || []).forEach(lockItem);
    }

    // 4. Record closed FY in settings
    if (!dbState.settings) dbState.settings = {};
    if (!dbState.settings.closedFiscalYears) dbState.settings.closedFiscalYears = [];
    const existingIndex = dbState.settings.closedFiscalYears.findIndex(f => f.fy === fyToClose);
    const closeRecord = {
      fy: fyToClose,
      nextFy,
      closedAt: new Date().toISOString(),
      notes,
      lockedCount,
      openingEntriesCount: createdOpeningEntries.length
    };
    if (existingIndex !== -1) {
      dbState.settings.closedFiscalYears[existingIndex] = closeRecord;
    } else {
      dbState.settings.closedFiscalYears.push(closeRecord);
    }

    // 5. Create dedicated yearly archive file in data/archives
    try {
      const archiveFile = path.join(archivesDir, `commodity_store_FY_${fyToClose}.json`);
      const archiveData = {
        financialYear: fyToClose,
        closedAt: new Date().toISOString(),
        closingStock: closingSummary,
        suppliers: updatedSuppliers,
        data: {
          arrivals: (dbState.arrivals || []).filter(a => (a.fy || getFinancialYear(a.date)) === fyToClose),
          dispatches: (dbState.dispatches || []).filter(d => (d.fy || getFinancialYear(d.date)) === fyToClose),
          settlements: (dbState.settlements || []).filter(s => (s.fy || getFinancialYear(s.date)) === fyToClose),
          payments: (dbState.payments || []).filter(p => (p.fy || getFinancialYear(p.date)) === fyToClose),
          millingLogs: (dbState.millingLogs || []).filter(m => (m.fy || getFinancialYear(m.date)) === fyToClose),
          commitments: (dbState.commitments || []).filter(c => (c.fy || getFinancialYear(c.date)) === fyToClose)
        }
      };
      fs.writeFileSync(archiveFile, JSON.stringify(archiveData, null, 2), 'utf8');
      console.log(`Financial Year Archive generated: ${archiveFile}`);
    } catch (e) {
      console.warn('Archive generation error:', e);
    }

    saveLocalDb({ immediate: true });
    if (isMongoConnected) {
      await syncWithMongo();
    }

    return {
      success: true,
      closedFy: fyToClose,
      nextFy,
      openingStockCreated: createdOpeningEntries.length,
      lockedTransactionsCount: lockedCount,
      closedFiscalYears: dbState.settings.closedFiscalYears
    };
  },

  async reopenFinancialYear(fyToReopen) {
    ensureDatabaseReady();
    if (!fyToReopen) throw new Error('Financial year required');
    const unlockItem = (item) => {
      if ((item.fy || getFinancialYear(item.date)) === fyToReopen) {
        item.isLocked = false;
      }
    };
    (dbState.arrivals || []).forEach(unlockItem);
    (dbState.dispatches || []).forEach(unlockItem);
    (dbState.settlements || []).forEach(unlockItem);
    (dbState.payments || []).forEach(unlockItem);
    (dbState.commitments || []).forEach(unlockItem);
    (dbState.millingLogs || []).forEach(unlockItem);
    (dbState.epTransfers || []).forEach(unlockItem);
    (dbState.commitmentWashes || []).forEach(unlockItem);

    if (dbState.settings && dbState.settings.closedFiscalYears) {
      dbState.settings.closedFiscalYears = dbState.settings.closedFiscalYears.filter(f => f.fy !== fyToReopen);
    }

    saveLocalDb({ immediate: true });
    if (isMongoConnected) {
      await syncWithMongo();
    }
    return { success: true, reopenedFy: fyToReopen };
  },

  getFiscalYearsSummary() {
    ensureDatabaseReady();
    const fys = new Set();
    const addDate = (d) => { if (d) fys.add(getFinancialYear(d)); };
    (dbState.arrivals || []).forEach(a => addDate(a.date));
    (dbState.dispatches || []).forEach(d => addDate(d.date));
    (dbState.settlements || []).forEach(s => addDate(s.date));
    (dbState.payments || []).forEach(p => addDate(p.date));
    (dbState.millingLogs || []).forEach(m => addDate(m.date));
    (dbState.openingStockEntries || []).forEach(o => addDate(o.date));

    // Always include current FY
    const currentFy = getFinancialYear();
    fys.add(currentFy);
    const sortedFys = Array.from(fys).sort().reverse();
    const closedList = dbState.settings?.closedFiscalYears || [];

    const years = sortedFys.map(fy => {
      const closedRecord = closedList.find(c => c.fy === fy);
      const arrivalsCount = (dbState.arrivals || []).filter(a => (a.fy || getFinancialYear(a.date)) === fy).length;
      const dispatchesCount = (dbState.dispatches || []).filter(d => (d.fy || getFinancialYear(d.date)) === fy).length;
      const settlementsCount = (dbState.settlements || []).filter(s => (s.fy || getFinancialYear(s.date)) === fy).length;
      const paymentsCount = (dbState.payments || []).filter(p => (p.fy || getFinancialYear(p.date)) === fy).length;
      const millingCount = (dbState.millingLogs || []).filter(m => (m.fy || getFinancialYear(m.date)) === fy).length;

      const archivePath = path.join(archivesDir, `commodity_store_FY_${fy}.json`);
      const hasArchive = fs.existsSync(archivePath);

      return {
        fy,
        isClosed: !!closedRecord,
        closedAt: closedRecord?.closedAt || null,
        closedNotes: closedRecord?.notes || '',
        lockedCount: closedRecord?.lockedCount || 0,
        arrivalsCount,
        dispatchesCount,
        settlementsCount,
        paymentsCount,
        millingCount,
        totalRecords: arrivalsCount + dispatchesCount + settlementsCount + paymentsCount + millingCount,
        hasArchive,
        archivePath: hasArchive ? archivePath : null
      };
    });

    return {
      currentFy,
      availableFiscalYears: sortedFys,
      closedFiscalYears: closedList,
      years
    };
  }
};

// Initial setup
loadLocalDb();
initMongo().catch(e => console.error('MongoDB init error:', e));

module.exports = {
  dbController,
  dbState
};
