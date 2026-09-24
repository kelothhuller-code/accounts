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
const localDbFile = path.join(dataDir, 'coffee_store.json');

// Initial default products (Coffee = 0% GST, Husk = 2.5% CGST + 2.5% SGST)
const DEFAULT_PRODUCTS = [
  { id: 'prod_rc_raw', code: 'RC_RAW', name: 'RC Raw', isMain: true, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry Raw Coffee' },
  { id: 'prod_rc_ep', code: 'RC_EP', name: 'RC EP', isMain: true, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry Clean / End Product' },
  { id: 'prod_ac_raw', code: 'AC_RAW', name: 'AC Raw', isMain: true, cgstRate: 0, sgstRate: 0, description: 'Arabica Cherry Raw Coffee' },
  { id: 'prod_husk', code: 'HUSK', name: 'Coffee Husk', isMain: true, cgstRate: 2.5, sgstRate: 2.5, description: 'Coffee Husk (2.5% CGST + 2.5% SGST)' },
  { id: 'prod_rc_a', code: 'RC_A', name: 'RC A', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry A Grade' },
  { id: 'prod_rc_b', code: 'RC_B', name: 'RC B', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry B Grade' },
  { id: 'prod_rc_c', code: 'RC_C', name: 'RC C', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry C Grade' },
  { id: 'prod_rc_aa', code: 'RC_AA', name: 'RC AA', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry AA Grade' },
  { id: 'prod_rc_pb', code: 'RC_PB', name: 'RC PB', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry Peaberry' },
  { id: 'prod_rc_og', code: 'RC_OG', name: 'RC OG', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry Ongoing/Other' },
  { id: 'prod_rc_bits', code: 'RC_BITS', name: 'RC Bits', isMain: false, cgstRate: 0, sgstRate: 0, description: 'Robusta Cherry Bits / Blacks' },
];

// In-Memory & Local File Store State
let dbState = {
  suppliers: [],
  products: [...DEFAULT_PRODUCTS],
  arrivals: [],
  dispatches: [],
  commitments: [],
  settlements: [],
  payments: [],
  epTransfers: [],
  commitmentWashes: [],
  settings: {
    mongoUri: 'mongodb://127.0.0.1:27017/coffeetracker',
    defaultTcsRate: 0.1, // 0.1% TCS u/s 206C(1H)
    defaultCgstRate: 0,
    defaultSgstRate: 0,
    defaultTdsRate: 0.1,
    companyName: 'Coffee Trading & Processing Co.',
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
        products: loaded.products && loaded.products.length > 0 ? loaded.products : DEFAULT_PRODUCTS,
        settings: { ...dbState.settings, ...(loaded.settings || {}) }
      };
      // Ensure Husk product exists
      if (!dbState.products.some(p => p.code === 'HUSK')) {
        dbState.products.push({ id: 'prod_husk', code: 'HUSK', name: 'Coffee Husk', isMain: true, description: 'Coffee Husk (2.5% CGST + 2.5% SGST)' });
      }
      console.log('Local DB store loaded successfully. Suppliers:', dbState.suppliers.length, 'Dispatches:', dbState.dispatches.length);
    } else {
      saveLocalDb();
    }
  } catch (err) {
    console.error('Error loading local DB file:', err);
  }
}

function hasConfiguredMongoUri() {
  const uri = dbState.settings && dbState.settings.mongoUri;
  return !!(uri && typeof uri === 'string' && uri.trim() !== '' && uri.trim().toLowerCase() !== 'standalone');
}

function ensureDatabaseReady() {
  if (hasConfiguredMongoUri() && !isMongoConnected) {
    const detail = mongoError ? `: ${mongoError}` : '';
    throw new Error(`MongoDB Connection Problem${detail}. A MongoDB URI is configured, but the database connection is offline. Operations are suspended to prevent local storage drift.`);
  }
}

// Save local DB file (bypassed when MongoDB URI is configured)
function saveLocalDb() {
  if (hasConfiguredMongoUri()) return;
  try {
    fs.writeFileSync(localDbFile, JSON.stringify(dbState, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving local DB file:', err);
  }
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

let MongoSupplier, MongoArrival, MongoDispatch, MongoCommitment, MongoSettlement, MongoPayment, MongoEpTransfer, MongoCommitmentWash;

try {
  MongoSupplier = mongoose.model('Supplier', SupplierSchema);
  MongoArrival = mongoose.model('Arrival', ArrivalSchema);
  MongoDispatch = mongoose.model('Dispatch', DispatchSchema);
  MongoCommitment = mongoose.model('Commitment', CommitmentSchema);
  MongoSettlement = mongoose.model('Settlement', SettlementSchema);
  MongoPayment = mongoose.model('Payment', PaymentSchema);
  MongoEpTransfer = mongoose.model('EpTransfer', EpTransferSchema);
  MongoCommitmentWash = mongoose.model('CommitmentWash', CommitmentWashSchema);
} catch (e) {}

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

async function loadFromMongo() {
  await syncWithMongo();
}

async function syncWithMongo() {
  if (!isMongoConnected) return;
  try {
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

    // 2. Fetch remote collections from Mongo and merge cleanly
    const [sups, arrs, disps, comms, sets, pays, trfs, washes] = await Promise.all([
      MongoSupplier.find({}).lean(),
      MongoArrival.find({}).lean(),
      MongoDispatch.find({}).lean(),
      MongoCommitment.find({}).lean(),
      MongoSettlement.find({}).lean(),
      MongoPayment.find({}).lean(),
      MongoEpTransfer.find({}).lean(),
      MongoCommitmentWash.find({}).lean(),
    ]);

    const cleanedSups = (sups || []).map(s => { delete s._id; delete s.__v; return s; });
    const cleanedArrs = (arrs || []).map(a => { delete a._id; delete a.__v; return a; });
    const cleanedDisps = (disps || []).map(d => { delete d._id; delete d.__v; return d; });
    const cleanedComms = (comms || []).map(c => { delete c._id; delete c.__v; return c; });
    const cleanedSets = (sets || []).map(st => { delete st._id; delete st.__v; return st; });
    const cleanedPays = (pays || []).map(p => { delete p._id; delete p.__v; return p; });
    const cleanedTrfs = (trfs || []).map(t => { delete t._id; delete t.__v; return t; });
    const cleanedWashes = (washes || []).map(w => { delete w._id; delete w.__v; return w; });

    dbState.suppliers = mergeCollections(dbState.suppliers, cleanedSups);
    dbState.arrivals = mergeCollections(dbState.arrivals, cleanedArrs);
    dbState.dispatches = mergeCollections(dbState.dispatches, cleanedDisps);
    dbState.commitments = mergeCollections(dbState.commitments, cleanedComms);
    dbState.settlements = mergeCollections(dbState.settlements, cleanedSets);
    dbState.payments = mergeCollections(dbState.payments, cleanedPays);
    dbState.epTransfers = mergeCollections(dbState.epTransfers, cleanedTrfs);
    dbState.commitmentWashes = mergeCollections(dbState.commitmentWashes, cleanedWashes);

    saveLocalDb();
  } catch (err) {
    console.error('Error syncing with MongoDB:', err);
  }
}

// Business Calculations for Supplier / Party Accounts & Ledger
function calculateSupplierLedger(supplierId) {
  const supplier = dbState.suppliers.find(s => s.id === supplierId);
  if (!supplier) return null;

  const arrivals = (dbState.arrivals || []).filter(a => a.supplierId === supplierId);
  const dispatches = (dbState.dispatches || []).filter(d => d.supplierId === supplierId || d.partyId === supplierId);
  const settlements = (dbState.settlements || []).filter(s => s.supplierId === supplierId);
  const payments = (dbState.payments || []).filter(p => p.supplierId === supplierId);
  const commitments = (dbState.commitments || []).filter(c => c.supplierId === supplierId || c.partyId === supplierId);
  const epTransfers = (dbState.epTransfers || []).filter(t => t.fromPartyId === supplierId || t.toPartyId === supplierId);
  const washes = (dbState.commitmentWashes || []).filter(w => w.supplierId === supplierId || w.partyId === supplierId);

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
      const bill = Number(arr.netAmount) || Number(arr.billAmount) || 0;
      totalPurchasesBilled += bill;
      totalCgst += (Number(arr.cgstAmount) || 0);
      totalSgst += (Number(arr.sgstAmount) || 0);
      totalIgst += (Number(arr.igstAmount) || 0);
      totalTdsDeducted += (Number(arr.tdsAmount) || 0);
      totalTcsDeducted += (Number(arr.tcsAmount) || 0);
    }
  });

  // 2. Process Dispatches (Sales / Store Out / Husk)
  dispatches.forEach(disp => {
    const isHusk = disp.dispatchType === 'husk' || disp.product === 'Husk' || disp.product === 'prod_husk';
    const weight = Number(disp.weight) || 0;
    const bags = Number(disp.bags) || 0;

    if (isHusk) {
      totalHuskWeight += weight;
      totalHuskBags += bags;
    } else {
      totalDispatchWeight += weight;
      totalDispatchBags += bags;
    }

    if (disp.status === 'storage_out' || disp.rateType === 'storage_out' || (disp.rateType === 'storage_out' && disp.status === 'partial_settled')) {
      if (!isHusk) {
        const remBags = disp.remainingBags !== undefined ? Number(disp.remainingBags) : bags;
        const remEP = disp.remainingEndProduct !== undefined ? Number(disp.remainingEndProduct) : (Number(disp.endProductWeight) || weight);
        storeOutBags += remBags;
        storeOutEP += remEP;
      }
    } else {
      const bill = Number(disp.netAmount) || Number(disp.billAmount) || 0;
      totalSalesBilled += bill;
      totalCgst += (Number(disp.cgstAmount) || 0);
      totalSgst += (Number(disp.sgstAmount) || 0);
      totalIgst += (Number(disp.igstAmount) || 0);
      totalTdsDeducted += (Number(disp.tdsAmount) || 0);
      totalTcsDeducted += (Number(disp.tcsAmount) || 0);
    }
  });

  // 3. Process Storage Settlements
  settlements.forEach(set => {
    const bill = Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0;
    if (set.settlementCategory === 'sales_storage') {
      totalSalesBilled += bill;
    } else {
      totalPurchasesBilled += bill;
    }
    totalTcsDeducted += (Number(set.tcsAmount) || 0);
    totalTdsDeducted += (Number(set.tdsAmount) || 0);
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

  const netPayable = openingBal + totalPurchasesBilled - totalSalesBilled - totalPaid + totalReceived + transferFinancialNet + washAdjustmentAmount;

  return {
    ...supplier,
    openingBalance: Number(supplier.openingBalance) || 0,
    openingBalanceType: supplier.openingBalanceType || 'credit',
    openingStorageBags: Number(supplier.openingStorageBags) || 0,
    openingStorageEP: Number(supplier.openingStorageEP) || 0,
    totalRawWeight: Math.round(totalRawWeight * 100) / 100,
    totalBags: Math.round(totalBags * 100) / 100,
    totalEndProduct: Math.round(totalEndProduct * 100) / 100,
    totalDispatchWeight: Math.round(totalDispatchWeight * 100) / 100,
    totalDispatchBags: Math.round(totalDispatchBags * 100) / 100,
    totalHuskWeight: Math.round(totalHuskWeight * 100) / 100,
    totalHuskBags: Math.round(totalHuskBags * 100) / 100,
    storeInBags: Math.round(storeInBags * 100) / 100,
    storeInEP: Math.round(storeInEP * 100) / 100,
    storeOutBags: Math.round(storeOutBags * 100) / 100,
    storeOutEP: Math.round(storeOutEP * 100) / 100,
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

  async clearLocalData() {
    dbState.suppliers = [];
    dbState.arrivals = [];
    dbState.dispatches = [];
    dbState.commitments = [];
    dbState.settlements = [];
    dbState.payments = [];
    dbState.epTransfers = [];
    dbState.commitmentWashes = [];
    saveLocalDb();
    if (isMongoConnected) {
      await loadFromMongo();
    }
    return dbController.getStatus();
  },

  // PRODUCTS
  getProducts() {
    return dbState.products;
  },

  addProduct(productData) {
    const id = 'prod_' + Date.now();
    const code = (productData.code || '').toUpperCase().trim();
    const name = (productData.name || '').trim();
    const isHusk = code === 'HUSK' || name.toLowerCase().includes('husk');
    
    const newProduct = {
      id,
      code,
      name,
      isMain: productData.isMain || false,
      cgstRate: productData.cgstRate !== undefined ? Number(productData.cgstRate) : (isHusk ? 2.5 : 0),
      sgstRate: productData.sgstRate !== undefined ? Number(productData.sgstRate) : (isHusk ? 2.5 : 0),
      description: productData.description || ''
    };
    dbState.products.push(newProduct);
    saveLocalDb();
    return newProduct;
  },

  // SUPPLIERS & PARTIES
  getSuppliers() {
    ensureDatabaseReady();
    return dbState.suppliers.map(sup => calculateSupplierLedger(sup.id));
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

  addSupplier(data) {
    ensureDatabaseReady();
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) throw new Error('Supplier/Party name is required.');

    const exists = dbState.suppliers.some(s => s.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      throw new Error(`Party with name "${trimmedName}" already exists.`);
    }

    const id = 'sup_' + Date.now();
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
      saveLocalDb();
      if (isMongoConnected && MongoSupplier) {
        MongoSupplier.findOneAndUpdate({ id }, newSupplier, { upsert: true }).catch(e => console.error(e));
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
    const id = 'com_' + Date.now();
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
    return list.reverse();
  },

  addArrival(data) {
    ensureDatabaseReady();
    const id = 'arr_' + Date.now();
    const count = dbState.arrivals.length + 1;
    const arrivalNo = 'ARR-' + String(count).padStart(4, '0');

    const weight = Number(data.weight) || 0;
    const bags = Number(data.bags) || (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const outturn = Number(data.outturn) || 0;
    const outturnType = data.outturnType || 'per_50kg';

    let endProductWeight = 0;
    if (outturnType === 'percentage') {
      endProductWeight = weight * (outturn / 100);
    } else {
      endProductWeight = (weight / 50) * outturn;
    }
    endProductWeight = Math.round(endProductWeight * 100) / 100;

    const rateType = data.rateType || 'fixed';
    const billType = data.billType || 'gst_bill';
    let rate = Number(data.rate) || 0;
    let taxableAmount = 0;
    let cgstRate = billType === 'gst_bill' ? (Number(data.cgstRate) || 2.5) : 0;
    let sgstRate = billType === 'gst_bill' ? (Number(data.sgstRate) || 2.5) : 0;
    let igstRate = billType === 'gst_bill' ? (Number(data.igstRate) || 0) : 0;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    let tdsRate = Number(data.tdsRate) || 0;
    let tdsAmount = 0;

    let tcsRate = Number(data.tcsRate) || (dbState.settings.defaultTcsRate || 0.1);
    let tcsAmount = 0;

    let billAmount = 0;
    let netAmount = 0;
    let status = 'billed';
    let commitmentId = data.commitmentId || null;

    if (rateType === 'commitment' && commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        rate = com.rate;
        const qtyToDeduct = com.type === 'bags' ? bags : endProductWeight;
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
      taxableAmount = Math.round((endProductWeight * rate) * 100) / 100;
      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = Math.round((billAmount - tdsAmount + tcsAmount) * 100) / 100;
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
      remarks: data.remarks || '',
      createdAt: new Date().toISOString()
    };

    dbState.arrivals.push(newArrival);
    saveLocalDb();
    if (isMongoConnected && MongoArrival) {
      MongoArrival.findOneAndUpdate({ id }, newArrival, { upsert: true }).catch(e => console.error(e));
    }
    return newArrival;
  },

  updateArrival(id, data) {
    const index = dbState.arrivals.findIndex(a => a.id === id);
    if (index === -1) throw new Error('Arrival not found');
    const arr = dbState.arrivals[index];

    if ((arr.status === 'settled' || (arr.settlementIds && arr.settlementIds.length > 0)) && (data.weight !== undefined && data.weight !== arr.weight)) {
      throw new Error('Cannot change weight on an arrival that has already been settled in storage.');
    }

    const weight = data.weight !== undefined ? Number(data.weight) : arr.weight;
    const bags = data.bags !== undefined ? Number(data.bags) : (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const outturn = data.outturn !== undefined ? Number(data.outturn) : arr.outturn;
    const outturnType = data.outturnType || arr.outturnType || 'per_50kg';

    let endProductWeight = 0;
    if (outturnType === 'percentage') {
      endProductWeight = weight * (outturn / 100);
    } else {
      endProductWeight = (weight / 50) * outturn;
    }
    endProductWeight = Math.round(endProductWeight * 100) / 100;

    const rate = data.rate !== undefined ? Number(data.rate) : arr.rate;
    const billType = data.billType || arr.billType || 'gst_bill';

    let cgstRate = billType === 'gst_bill' ? (data.cgstRate !== undefined ? Number(data.cgstRate) : (arr.cgstRate || 2.5)) : 0;
    let sgstRate = billType === 'gst_bill' ? (data.sgstRate !== undefined ? Number(data.sgstRate) : (arr.sgstRate || 2.5)) : 0;
    let igstRate = billType === 'gst_bill' ? (data.igstRate !== undefined ? Number(data.igstRate) : (arr.igstRate || 0)) : 0;

    let tdsRate = data.tdsRate !== undefined ? Number(data.tdsRate) : (arr.tdsRate || 0);
    let tcsRate = data.tcsRate !== undefined ? Number(data.tcsRate) : (arr.tcsRate || 0.1);

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let tdsAmount = 0;
    let tcsAmount = 0;
    let billAmount = 0;
    let netAmount = 0;

    if (arr.status !== 'storage') {
      taxableAmount = Math.round((endProductWeight * rate) * 100) / 100;
      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = Math.round((billAmount - tdsAmount + tcsAmount) * 100) / 100;
    }

    dbState.arrivals[index] = {
      ...arr,
      date: data.date || arr.date,
      vehicleNo: data.vehicleNo !== undefined ? data.vehicleNo : arr.vehicleNo,
      product: data.product || arr.product,
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
      remainingBags: arr.status === 'storage' ? bags - (arr.settledBags || 0) : arr.remainingBags,
      remainingEndProduct: arr.status === 'storage' ? endProductWeight - (arr.settledEndProduct || 0) : arr.remainingEndProduct,
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
    return list.reverse();
  },

  addDispatch(data) {
    ensureDatabaseReady();
    const id = 'disp_' + Date.now();
    const count = dbState.dispatches.length + 1;
    const dispatchType = data.dispatchType || (data.product === 'prod_husk' || data.product === 'Husk' ? 'husk' : 'coffee');
    const prefix = dispatchType === 'husk' ? 'HSK-' : 'DSP-';
    const dispatchNo = prefix + String(count).padStart(4, '0');

    const weight = Number(data.weight) || 0;
    const bags = Number(data.bags) || (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const endProductWeight = Number(data.endProductWeight) || weight;

    const rateType = data.rateType || 'fixed'; // 'fixed', 'commitment', 'storage_out'
    const billType = data.billType || 'gst_bill'; // 'gst_bill' or 'cash_bill'
    let rate = Number(data.rate) || 0;

    // Husk default tax rule: 2.5% CGST + 2.5% SGST (Total 5%) for GST bills
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;

    if (billType === 'gst_bill') {
      if (dispatchType === 'husk') {
        cgstRate = Number(data.cgstRate) !== undefined ? Number(data.cgstRate) : 2.5;
        sgstRate = Number(data.sgstRate) !== undefined ? Number(data.sgstRate) : 2.5;
        igstRate = Number(data.igstRate) || 0;
      } else {
        cgstRate = Number(data.cgstRate) || 2.5;
        sgstRate = Number(data.sgstRate) || 2.5;
        igstRate = Number(data.igstRate) || 0;
      }
    }

    let commitmentId = data.commitmentId || null;
    if (rateType === 'commitment' && commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        rate = com.rate;
        const qtyToDeduct = com.type === 'bags' ? bags : weight;
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
    let tdsRate = Number(data.tdsRate) || 0;
    let tdsAmount = 0;
    let tcsRate = Number(data.tcsRate) || (dbState.settings.defaultTcsRate || 0.1);
    let tcsAmount = 0;
    let billAmount = 0;
    let netAmount = 0;
    let status = 'billed';

    if (rateType === 'storage_out') {
      status = 'storage_out';
      rate = 0;
    } else {
      taxableAmount = Math.round((weight * rate) * 100) / 100;
      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = Math.round((billAmount - tdsAmount + tcsAmount) * 100) / 100;
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
      commitmentId,
      remarks: data.remarks || '',
      createdAt: new Date().toISOString()
    };

    dbState.dispatches.push(newDispatch);
    saveLocalDb();
    if (isMongoConnected && MongoDispatch) {
      MongoDispatch.findOneAndUpdate({ id }, newDispatch, { upsert: true }).catch(e => console.error(e));
    }
    return newDispatch;
  },

  updateDispatch(id, data) {
    const index = dbState.dispatches.findIndex(d => d.id === id);
    if (index === -1) throw new Error('Dispatch record not found');
    const disp = dbState.dispatches[index];

    const weight = data.weight !== undefined ? Number(data.weight) : disp.weight;
    const bags = data.bags !== undefined ? Number(data.bags) : disp.bags;
    const endProductWeight = data.endProductWeight !== undefined ? Number(data.endProductWeight) : disp.endProductWeight;
    const rate = data.rate !== undefined ? Number(data.rate) : disp.rate;
    const billType = data.billType || disp.billType || 'gst_bill';
    const dispatchType = data.dispatchType || disp.dispatchType || 'coffee';

    let cgstRate = billType === 'gst_bill' ? (data.cgstRate !== undefined ? Number(data.cgstRate) : (disp.cgstRate || (dispatchType === 'husk' ? 2.5 : 2.5))) : 0;
    let sgstRate = billType === 'gst_bill' ? (data.sgstRate !== undefined ? Number(data.sgstRate) : (disp.sgstRate || (dispatchType === 'husk' ? 2.5 : 2.5))) : 0;
    let igstRate = billType === 'gst_bill' ? (data.igstRate !== undefined ? Number(data.igstRate) : (disp.igstRate || 0)) : 0;
    let tdsRate = data.tdsRate !== undefined ? Number(data.tdsRate) : (disp.tdsRate || 0);
    let tcsRate = data.tcsRate !== undefined ? Number(data.tcsRate) : (disp.tcsRate || 0.1);

    let taxableAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let tdsAmount = 0;
    let tcsAmount = 0;
    let billAmount = 0;
    let netAmount = 0;

    if (disp.status !== 'storage_out') {
      taxableAmount = Math.round((weight * rate) * 100) / 100;
      if (billType === 'gst_bill') {
        if (igstRate > 0) {
          igstAmount = Math.round((taxableAmount * (igstRate / 100)) * 100) / 100;
        } else {
          cgstAmount = Math.round((taxableAmount * (cgstRate / 100)) * 100) / 100;
          sgstAmount = Math.round((taxableAmount * (sgstRate / 100)) * 100) / 100;
        }
      }
      billAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      tdsAmount = Math.round((taxableAmount * (tdsRate / 100)) * 100) / 100;
      tcsAmount = Math.round((taxableAmount * (tcsRate / 100)) * 100) / 100;

      netAmount = Math.round((billAmount - tdsAmount + tcsAmount) * 100) / 100;
    }

    dbState.dispatches[index] = {
      ...disp,
      date: data.date || disp.date,
      supplierId: data.supplierId || data.partyId || disp.supplierId,
      supplierName: data.supplierName || data.partyName || disp.supplierName,
      vehicleNo: data.vehicleNo !== undefined ? data.vehicleNo : disp.vehicleNo,
      dispatchType,
      product: data.product || disp.product,
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

    const id = 'trf_' + Date.now();
    const count = dbState.epTransfers.length + 1;
    const transferNo = 'TRF-' + String(count).padStart(4, '0');

    const bags = Number(data.bags) || 0;
    const weight = Number(data.weight) || (bags * 50);
    const endProductWeight = Number(data.endProductWeight) || weight;
    const rate = Number(data.rate) || 0;
    const transferValue = Math.round((endProductWeight * rate) * 100) / 100;

    const newTransfer = {
      id,
      transferNo,
      date: data.date || new Date().toISOString().split('T')[0],
      fromPartyId: data.fromPartyId,
      fromPartyName: fromParty.name,
      toPartyId: data.toPartyId,
      toPartyName: toParty.name,
      product: data.product || 'RC_EP',
      bags,
      weight,
      endProductWeight,
      rate,
      transferValue,
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    dbState.epTransfers.push(newTransfer);
    saveLocalDb();
    if (isMongoConnected && MongoEpTransfer) {
      MongoEpTransfer.findOneAndUpdate({ id }, newTransfer, { upsert: true }).catch(e => console.error(e));
    }
    return newTransfer;
  },

  deleteEpTransfer(id) {
    const index = dbState.epTransfers.findIndex(t => t.id === id);
    if (index === -1) return { success: true };
    dbState.epTransfers.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoEpTransfer) {
      MongoEpTransfer.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // SETTLEMENT OF STORAGE COFFEE
  calculateBatchOutturn(arrivalIds) {
    const selected = dbState.arrivals.filter(a => arrivalIds.includes(a.id));
    if (selected.length === 0) return null;

    let totalBags = 0;
    let totalWeight = 0;
    let totalEndProduct = 0;

    selected.forEach(arr => {
      const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : Number(arr.bags);
      const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : Number(arr.endProductWeight);
      const remWeight = arr.bags > 0 ? (remBags / arr.bags) * (Number(arr.weight) || 0) : 0;

      totalBags += remBags;
      totalWeight += remWeight;
      totalEndProduct += remEP;
    });

    const averageOutturn = totalWeight > 0 ? (totalEndProduct / (totalWeight / 50)) : 0;
    const averageOutturnPercentage = totalWeight > 0 ? (totalEndProduct / totalWeight) * 100 : 0;

    return {
      arrivalCount: selected.length,
      totalBags: Math.round(totalBags * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalEndProduct: Math.round(totalEndProduct * 100) / 100,
      averageOutturn: Math.round(averageOutturn * 100) / 100,
      averageOutturnPercentage: Math.round(averageOutturnPercentage * 100) / 100,
    };
  },

  settleStorageArrivals(settleData) {
    const {
      supplierId,
      supplierName,
      arrivalIds,
      settleBags,
      settlementRate,
      rateUnit = 'per_kg_ep',
      tcsRate = 0.1,
      tdsRate = 0,
      date = new Date().toISOString().split('T')[0],
      notes = ''
    } = settleData;

    const selectedArrivals = dbState.arrivals.filter(a => arrivalIds.includes(a.id));
    if (selectedArrivals.length === 0) throw new Error('No arrivals selected for settlement');

    let totalAvailBags = 0;
    let totalAvailWeight = 0;
    let totalAvailEndProduct = 0;

    selectedArrivals.forEach(arr => {
      const b = arr.remainingBags !== undefined ? arr.remainingBags : arr.bags;
      const ep = arr.remainingEndProduct !== undefined ? arr.remainingEndProduct : arr.endProductWeight;
      const w = arr.bags > 0 ? (b / arr.bags) * arr.weight : 0;

      totalAvailBags += b;
      totalAvailWeight += w;
      totalAvailEndProduct += ep;
    });

    const bagsToSettle = Number(settleBags) || totalAvailBags;
    if (bagsToSettle > totalAvailBags) {
      throw new Error(`Cannot settle ${bagsToSettle} bags. Selected arrivals only have ${totalAvailBags} bags available.`);
    }

    const settleRatio = totalAvailBags > 0 ? bagsToSettle / totalAvailBags : 0;
    const settledEndProduct = Math.round((totalAvailEndProduct * settleRatio) * 100) / 100;
    const averageOutturn = totalAvailWeight > 0 ? (totalAvailEndProduct / (totalAvailWeight / 50)) : 0;

    let settlementGrossAmount = 0;
    if (rateUnit === 'per_bag') {
      settlementGrossAmount = bagsToSettle * settlementRate;
    } else {
      settlementGrossAmount = settledEndProduct * settlementRate;
    }
    settlementGrossAmount = Math.round(settlementGrossAmount * 100) / 100;

    const tdsAmount = Math.round((settlementGrossAmount * (tdsRate / 100)) * 100) / 100;
    const tcsAmount = Math.round((settlementGrossAmount * (tcsRate / 100)) * 100) / 100;
    const settlementNetAmount = Math.round((settlementGrossAmount - tdsAmount + tcsAmount) * 100) / 100;

    const id = 'set_' + Date.now();
    const count = dbState.settlements.length + 1;
    const settlementNo = 'SET-' + String(count).padStart(4, '0');

    let remainingBagsToDeduct = bagsToSettle;
    selectedArrivals.forEach(arr => {
      const curRemBags = arr.remainingBags !== undefined ? arr.remainingBags : arr.bags;
      const curRemEP = arr.remainingEndProduct !== undefined ? arr.remainingEndProduct : arr.endProductWeight;

      if (remainingBagsToDeduct <= 0) return;

      const deductBags = Math.min(curRemBags, remainingBagsToDeduct);
      const ratio = curRemBags > 0 ? deductBags / curRemBags : 0;
      const deductEP = Math.round((curRemEP * ratio) * 100) / 100;

      const newRemBags = Math.max(0, curRemBags - deductBags);
      const newRemEP = Math.max(0, curRemEP - deductEP);

      const arrIndex = dbState.arrivals.findIndex(a => a.id === arr.id);
      if (arrIndex !== -1) {
        dbState.arrivals[arrIndex] = {
          ...dbState.arrivals[arrIndex],
          settledBags: (dbState.arrivals[arrIndex].settledBags || 0) + deductBags,
          remainingBags: Math.round(newRemBags * 100) / 100,
          settledEndProduct: (dbState.arrivals[arrIndex].settledEndProduct || 0) + deductEP,
          remainingEndProduct: Math.round(newRemEP * 100) / 100,
          status: newRemBags <= 0 ? 'settled' : 'partial_settled',
          settlementIds: [...(dbState.arrivals[arrIndex].settlementIds || []), id]
        };
      }

      remainingBagsToDeduct -= deductBags;
    });

    const newSettlement = {
      id,
      settlementNo,
      date,
      supplierId,
      supplierName,
      arrivalIds,
      totalSelectedBags: totalAvailBags,
      totalSelectedWeight: Math.round(totalAvailWeight * 100) / 100,
      totalSelectedEndProduct: Math.round(totalAvailEndProduct * 100) / 100,
      averageOutturn: Math.round(averageOutturn * 100) / 100,
      settledBags: bagsToSettle,
      settledEndProduct,
      settlementRate,
      rateUnit,
      settlementGrossAmount,
      tcsRate,
      tcsAmount,
      tdsRate,
      tdsAmount,
      settlementNetAmount,
      notes,
      createdAt: new Date().toISOString()
    };

    dbState.settlements.push(newSettlement);
    saveLocalDb();
    if (isMongoConnected && MongoSettlement) {
      MongoSettlement.findOneAndUpdate({ id }, newSettlement, { upsert: true }).catch(e => console.error(e));
    }
    return newSettlement;
  },

  getSettlements(supplierId = null) {
    ensureDatabaseReady();
    let list = dbState.settlements;
    if (supplierId) {
      list = list.filter(s => s.supplierId === supplierId);
    }
    return list.slice().reverse();
  },

  updateSettlement(id, data) {
    const index = dbState.settlements.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Settlement not found');
    const st = dbState.settlements[index];

    const settlementRate = data.settlementRate !== undefined ? Number(data.settlementRate) : st.settlementRate;
    const rateUnit = data.rateUnit || st.rateUnit || 'per_kg_ep';
    const tcsRate = data.tcsRate !== undefined ? Number(data.tcsRate) : (st.tcsRate || 0.1);
    const tdsRate = data.tdsRate !== undefined ? Number(data.tdsRate) : (st.tdsRate || 0);

    let settlementGrossAmount = 0;
    if (rateUnit === 'per_bag') {
      settlementGrossAmount = st.settledBags * settlementRate;
    } else {
      settlementGrossAmount = st.settledEndProduct * settlementRate;
    }
    settlementGrossAmount = Math.round(settlementGrossAmount * 100) / 100;

    const tdsAmount = Math.round((settlementGrossAmount * (tdsRate / 100)) * 100) / 100;
    const tcsAmount = Math.round((settlementGrossAmount * (tcsRate / 100)) * 100) / 100;
    const settlementNetAmount = Math.round((settlementGrossAmount - tdsAmount + tcsAmount) * 100) / 100;

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

    dbState.settlements.splice(index, 1);
    saveLocalDb();
    if (isMongoConnected && MongoSettlement) {
      MongoSettlement.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // PAYMENTS
  getPayments(supplierId = null) {
    ensureDatabaseReady();
    let list = dbState.payments;
    if (supplierId) {
      list = list.filter(p => p.supplierId === supplierId);
    }
    return list.slice().reverse();
  },

  addPayment(data) {
    ensureDatabaseReady();
    const id = 'pay_' + Date.now();
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
      createdAt: new Date().toISOString()
    };

    dbState.payments.push(newPayment);
    saveLocalDb();
    if (isMongoConnected && MongoPayment) {
      MongoPayment.findOneAndUpdate({ id }, newPayment, { upsert: true }).catch(e => console.error(e));
    }
    return newPayment;
  },

  updatePayment(id, data) {
    const index = dbState.payments.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Payment not found');
    const pay = dbState.payments[index];

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
    const openStock = dbState.settings.openingStock || { coffeeBags: 0, coffeeWeight: 0, coffeeEP: 0, huskBags: 0, huskWeight: 0 };
    
    let totalArrivalEP = 0;
    let totalStoreInEP = 0;
    (dbState.arrivals || []).forEach(a => {
      const ep = Number(a.endProductWeight) || 0;
      if (a.status === 'storage') {
        totalStoreInEP += ep;
      } else {
        totalArrivalEP += ep;
      }
    });

    let totalDispatchEP = 0;
    let totalStoreOutEP = 0;
    (dbState.dispatches || []).forEach(d => {
      if (d.dispatchType !== 'husk' && d.product !== 'Husk' && d.product !== 'prod_husk') {
        const ep = Number(d.endProductWeight) || Number(d.weight) || 0;
        if (d.status === 'storage_out') {
          totalStoreOutEP += ep;
        } else {
          totalDispatchEP += ep;
        }
      }
    });

    let purchaseCommitmentsPendingEP = 0;
    (dbState.commitments || [])
      .filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active')
      .forEach(c => {
        const rem = Number(c.remainingQty) || 0;
        purchaseCommitmentsPendingEP += (c.type === 'bags' ? rem * 50 * 0.52 : rem);
      });

    let saleCommitmentsPendingEP = 0;
    (dbState.commitments || [])
      .filter(c => c.category === 'sale' && c.status === 'active')
      .forEach(c => {
        const rem = Number(c.remainingQty) || 0;
        saleCommitmentsPendingEP += (c.type === 'bags' ? rem * 50 * 0.52 : rem);
      });

    // Formula: Opening Stock + Total Arrival - Total Dispatch - Total Store In + Total Store Out + Purchase Commitment Pending - Sale Commitment Pending
    const netPositionEP = (Number(openStock.coffeeEP) || 0)
      + totalArrivalEP
      - totalDispatchEP
      - totalStoreInEP
      + totalStoreOutEP
      + purchaseCommitmentsPendingEP
      - saleCommitmentsPendingEP;

    return {
      openingCoffeeEP: Math.round((Number(openStock.coffeeEP) || 0) * 100) / 100,
      totalArrivalEP: Math.round(totalArrivalEP * 100) / 100,
      totalDispatchEP: Math.round(totalDispatchEP * 100) / 100,
      totalStoreInEP: Math.round(totalStoreInEP * 100) / 100,
      totalStoreOutEP: Math.round(totalStoreOutEP * 100) / 100,
      purchaseCommitmentsPendingEP: Math.round(purchaseCommitmentsPendingEP * 100) / 100,
      saleCommitmentsPendingEP: Math.round(saleCommitmentsPendingEP * 100) / 100,
      netPositionEP: Math.round(netPositionEP * 100) / 100,
      actionNeeded: netPositionEP > 0 ? 'SELL_COFFEE' : netPositionEP < 0 ? 'BUY_COFFEE' : 'BALANCED'
    };
  },

  // GLOBAL DASHBOARD METRICS
  getDashboardMetrics(dateFilter = {}) {
    let arrivals = dbState.arrivals || [];
    let dispatches = dbState.dispatches || [];
    if (dateFilter.startDate) {
      arrivals = arrivals.filter(a => a.date >= dateFilter.startDate);
      dispatches = dispatches.filter(d => d.date >= dateFilter.startDate);
    }
    if (dateFilter.endDate) {
      arrivals = arrivals.filter(a => a.date <= dateFilter.endDate);
      dispatches = dispatches.filter(d => d.date <= dateFilter.endDate);
    }

    let dailyTotalWeight = 0;
    let dailyTotalBags = 0;
    let dailyTotalEndProduct = 0;
    let dailyTotalBill = 0;
    let billedArrivalsCount = 0;
    let totalRateSum = 0;

    arrivals.forEach(arr => {
      dailyTotalWeight += (Number(arr.weight) || 0);
      dailyTotalBags += (Number(arr.bags) || 0);
      dailyTotalEndProduct += (Number(arr.endProductWeight) || 0);
      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        dailyTotalBill += (Number(arr.netAmount) || Number(arr.billAmount) || 0);
        if (arr.rate > 0) {
          totalRateSum += arr.rate;
          billedArrivalsCount++;
        }
      }
    });

    let dailyDispatchWeight = 0;
    let dailyDispatchBags = 0;
    let dailyDispatchValue = 0;
    dispatches.forEach(d => {
      dailyDispatchWeight += (Number(d.weight) || 0);
      dailyDispatchBags += (Number(d.bags) || 0);
      dailyDispatchValue += (Number(d.netAmount) || Number(d.billAmount) || 0);
    });

    const dailyAvgRate = billedArrivalsCount > 0 ? totalRateSum / billedArrivalsCount : 0;

    let totalSuppliers = dbState.suppliers.length;
    let totalStorageBags = 0;
    let totalStorageEP = 0;
    let totalPurchasesValue = 0;
    let totalSalesValue = 0;
    let totalTcsAllTime = 0;
    let totalTdsAllTime = 0;
    let totalGstAllTime = 0;
    let totalPaidAllTime = 0;
    let totalReceivedAllTime = 0;

    (dbState.arrivals || []).forEach(arr => {
      if (arr.status === 'storage' || arr.status === 'partial_settled') {
        totalStorageBags += (arr.remainingBags !== undefined ? arr.remainingBags : arr.bags);
        totalStorageEP += (arr.remainingEndProduct !== undefined ? arr.remainingEndProduct : arr.endProductWeight);
      }
      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        totalPurchasesValue += (Number(arr.netAmount) || Number(arr.billAmount) || 0);
        totalTcsAllTime += (Number(arr.tcsAmount) || 0);
        totalTdsAllTime += (Number(arr.tdsAmount) || 0);
        totalGstAllTime += (Number(arr.cgstAmount) || 0) + (Number(arr.sgstAmount) || 0) + (Number(arr.igstAmount) || 0);
      }
    });

    (dbState.dispatches || []).forEach(disp => {
      if (disp.status === 'billed' || disp.status === 'cash_bill') {
        totalSalesValue += (Number(disp.netAmount) || Number(disp.billAmount) || 0);
        totalTcsAllTime += (Number(disp.tcsAmount) || 0);
        totalTdsAllTime += (Number(disp.tdsAmount) || 0);
        totalGstAllTime += (Number(disp.cgstAmount) || 0) + (Number(disp.sgstAmount) || 0) + (Number(disp.igstAmount) || 0);
      }
    });

    (dbState.settlements || []).forEach(set => {
      totalPurchasesValue += (Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0);
      totalTcsAllTime += (Number(set.tcsAmount) || 0);
      totalTdsAllTime += (Number(set.tdsAmount) || 0);
    });

    (dbState.payments || []).forEach(p => {
      if (p.type === 'payment_paid' || !p.type) {
        totalPaidAllTime += (Number(p.amount) || 0);
      } else if (p.type === 'payment_received') {
        totalReceivedAllTime += (Number(p.amount) || 0);
      }
    });

    const netPayableGlobal = totalPurchasesValue - totalSalesValue - totalPaidAllTime + totalReceivedAllTime;

    return {
      daily: {
        totalWeight: Math.round(dailyTotalWeight * 100) / 100,
        totalBags: Math.round(dailyTotalBags * 100) / 100,
        totalEndProduct: Math.round(dailyTotalEndProduct * 100) / 100,
        totalBill: Math.round(dailyTotalBill * 100) / 100,
        dispatchWeight: Math.round(dailyDispatchWeight * 100) / 100,
        dispatchBags: Math.round(dailyDispatchBags * 100) / 100,
        dispatchValue: Math.round(dailyDispatchValue * 100) / 100,
        avgRate: Math.round(dailyAvgRate * 100) / 100,
        arrivalsCount: arrivals.length
      },
      global: {
        totalSuppliers,
        totalPurchasesValue: Math.round(totalPurchasesValue * 100) / 100,
        totalSalesValue: Math.round(totalSalesValue * 100) / 100,
        totalStorageBags: Math.round(totalStorageBags * 100) / 100,
        totalStorageEP: Math.round(totalStorageEP * 100) / 100,
        totalTcsAllTime: Math.round(totalTcsAllTime * 100) / 100,
        totalTdsAllTime: Math.round(totalTdsAllTime * 100) / 100,
        totalGstAllTime: Math.round(totalGstAllTime * 100) / 100,
        totalPaidAllTime: Math.round(totalPaidAllTime * 100) / 100,
        totalReceivedAllTime: Math.round(totalReceivedAllTime * 100) / 100,
        netPayableGlobal: Math.round(netPayableGlobal * 100) / 100,
      }
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
  }
};

// Initial setup
loadLocalDb();
initMongo().catch(e => console.error('MongoDB init error:', e));

module.exports = {
  dbController,
  dbState
};
