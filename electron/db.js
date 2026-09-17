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

// Initial default products
const DEFAULT_PRODUCTS = [
  { id: 'prod_rc_raw', code: 'RC_RAW', name: 'RC Raw', isMain: true, description: 'Robusta Cherry Raw Coffee' },
  { id: 'prod_rc_ep', code: 'RC_EP', name: 'RC EP', isMain: true, description: 'Robusta Cherry Clean / End Product' },
  { id: 'prod_ac_raw', code: 'AC_RAW', name: 'AC Raw', isMain: true, description: 'Arabica Cherry Raw Coffee' },
  { id: 'prod_rc_a', code: 'RC_A', name: 'RC A', isMain: false, description: 'Robusta Cherry A Grade' },
  { id: 'prod_rc_b', code: 'RC_B', name: 'RC B', isMain: false, description: 'Robusta Cherry B Grade' },
  { id: 'prod_rc_c', code: 'RC_C', name: 'RC C', isMain: false, description: 'Robusta Cherry C Grade' },
  { id: 'prod_rc_aa', code: 'RC_AA', name: 'RC AA', isMain: false, description: 'Robusta Cherry AA Grade' },
  { id: 'prod_rc_pb', code: 'RC_PB', name: 'RC PB', isMain: false, description: 'Robusta Cherry Peaberry' },
  { id: 'prod_rc_og', code: 'RC_OG', name: 'RC OG', isMain: false, description: 'Robusta Cherry Ongoing/Other' },
  { id: 'prod_rc_bits', code: 'RC_BITS', name: 'RC Bits', isMain: false, description: 'Robusta Cherry Bits / Blacks' },
];

// In-Memory & Local File Store State
let dbState = {
  suppliers: [],
  products: [...DEFAULT_PRODUCTS],
  arrivals: [],
  commitments: [],
  settlements: [],
  payments: [],
  settings: {
    mongoUri: 'mongodb://127.0.0.1:27017/coffeetracker',
    defaultTcsRate: 0.1, // 0.1% standard TCS
    companyName: 'Coffee Trading & Processing Co.',
    autoBagsWeight: 50 // standard bag size in kg
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
        products: loaded.products && loaded.products.length > 0 ? loaded.products : DEFAULT_PRODUCTS,
        settings: { ...dbState.settings, ...(loaded.settings || {}) }
      };
      console.log('Local DB store loaded successfully. Suppliers:', dbState.suppliers.length);
    } else {
      saveLocalDb();
    }
  } catch (err) {
    console.error('Error loading local DB file:', err);
  }
}

// Save local DB file
function saveLocalDb() {
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
      serverSelectionTimeoutMS: 2000,
    });
    isMongoConnected = true;
    mongoError = null;
    console.log('MongoDB connected successfully to:', connectionUri);
    // Sync initial state if MongoDB is connected
    await syncWithMongo();
  } catch (err) {
    isMongoConnected = false;
    mongoError = err.message;
    console.warn('MongoDB connection note: local standalone storage active (' + err.message + ')');
  }
}

// Define Mongoose Schemas if connected
const SupplierSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  phone: String,
  place: String,
  gst: String,
  notes: String,
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
  billAmount: Number,
  tcsRate: Number,
  tcsAmount: Number,
  netAmount: Number,
  status: String, // 'billed', 'storage', 'settled', 'partial_settled'
  settledBags: Number,
  remainingBags: Number,
  settledEndProduct: Number,
  remainingEndProduct: Number,
  settlementIds: [String],
  commitmentId: String,
  remarks: String,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const CommitmentSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  commitmentNo: String,
  supplierId: String,
  supplierName: String,
  product: String,
  type: String, // 'bags' or 'end_product'
  quantity: Number,
  rate: Number,
  fulfilledQty: Number,
  remainingQty: Number,
  status: String, // 'active', 'fulfilled', 'cancelled'
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
  rateType: String, // 'per_bag' or 'per_kg_ep'
  settlementGrossAmount: Number,
  tcsRate: Number,
  tcsAmount: Number,
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

let MongoSupplier, MongoArrival, MongoCommitment, MongoSettlement, MongoPayment;

try {
  MongoSupplier = mongoose.model('Supplier', SupplierSchema);
  MongoArrival = mongoose.model('Arrival', ArrivalSchema);
  MongoCommitment = mongoose.model('Commitment', CommitmentSchema);
  MongoSettlement = mongoose.model('Settlement', SettlementSchema);
  MongoPayment = mongoose.model('Payment', PaymentSchema);
} catch (e) {
  // Models may already be registered
}

async function syncWithMongo() {
  if (!isMongoConnected) return;
  try {
    // Upsert suppliers to MongoDB
    for (const sup of dbState.suppliers) {
      await MongoSupplier.findOneAndUpdate({ id: sup.id }, sup, { upsert: true });
    }
    for (const arr of dbState.arrivals) {
      await MongoArrival.findOneAndUpdate({ id: arr.id }, arr, { upsert: true });
    }
    for (const com of dbState.commitments) {
      await MongoCommitment.findOneAndUpdate({ id: com.id }, com, { upsert: true });
    }
    for (const set of dbState.settlements) {
      await MongoSettlement.findOneAndUpdate({ id: set.id }, set, { upsert: true });
    }
    for (const pay of dbState.payments) {
      await MongoPayment.findOneAndUpdate({ id: pay.id }, pay, { upsert: true });
    }
  } catch (err) {
    console.error('Error syncing with MongoDB:', err);
  }
}

// Business Calculations for Supplier Accounts
function calculateSupplierLedger(supplierId) {
  const supplier = dbState.suppliers.find(s => s.id === supplierId);
  if (!supplier) return null;

  const arrivals = dbState.arrivals.filter(a => a.supplierId === supplierId);
  const settlements = dbState.settlements.filter(s => s.supplierId === supplierId);
  const payments = dbState.payments.filter(p => p.supplierId === supplierId);
  const commitments = dbState.commitments.filter(c => c.supplierId === supplierId);

  let totalRawWeight = 0;
  let totalBags = 0;
  let totalEndProduct = 0;

  let storageBags = 0;
  let storageWeight = 0;
  let storageEndProduct = 0;

  let totalBilledAmount = 0;
  let totalTcsDeducted = 0;

  arrivals.forEach(arr => {
    totalRawWeight += (Number(arr.weight) || 0);
    totalBags += (Number(arr.bags) || 0);
    totalEndProduct += (Number(arr.endProductWeight) || 0);

    if (arr.status === 'storage' || arr.status === 'partial_settled') {
      const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : Number(arr.bags);
      const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : Number(arr.endProductWeight);
      const remWeight = arr.bags > 0 ? (remBags / arr.bags) * (Number(arr.weight) || 0) : 0;
      
      storageBags += remBags;
      storageWeight += remWeight;
      storageEndProduct += remEP;
    }

    if (arr.status === 'billed') {
      totalBilledAmount += (Number(arr.netAmount) || Number(arr.billAmount) || 0);
      totalTcsDeducted += (Number(arr.tcsAmount) || 0);
    }
  });

  // Add settlement amounts (settlements of storage coffee create bills)
  settlements.forEach(set => {
    totalBilledAmount += (Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0);
    totalTcsDeducted += (Number(set.tcsAmount) || 0);
  });

  // Payments paid to supplier
  const totalPaid = payments
    .filter(p => p.type === 'payment_paid' || !p.type)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Payments received from supplier (user specified: deducted from payable amount!)
  const totalReceived = payments
    .filter(p => p.type === 'payment_received')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Net balance calculation:
  // We owe supplier: totalBilledAmount
  // We paid them: totalPaid
  // We received from them: totalReceived (e.g. refund/advance return/sales to them)
  // Net Payable = totalBilledAmount - totalPaid + totalReceived
  const netPayable = totalBilledAmount - totalPaid + totalReceived;

  // Average outturn of storage coffee
  // Outturn is in kg per 50kg bag: (storageEndProduct / storageWeight) * 50
  const storageAvgOutturn = storageWeight > 0 ? (storageEndProduct / (storageWeight / 50)) : 0;

  return {
    ...supplier,
    totalRawWeight: Math.round(totalRawWeight * 100) / 100,
    totalBags: Math.round(totalBags * 100) / 100,
    totalEndProduct: Math.round(totalEndProduct * 100) / 100,
    storageBags: Math.round(storageBags * 100) / 100,
    storageWeight: Math.round(storageWeight * 100) / 100,
    storageEndProduct: Math.round(storageEndProduct * 100) / 100,
    storageAvgOutturn: Math.round(storageAvgOutturn * 100) / 100,
    totalBilledAmount: Math.round(totalBilledAmount * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalTcsDeducted: Math.round(totalTcsDeducted * 100) / 100,
    netPayable: Math.round(netPayable * 100) / 100,
    arrivalsCount: arrivals.length,
    activeCommitmentsCount: commitments.filter(c => c.status === 'active').length
  };
}

// Controller API
const dbController = {
  // Get MongoDB & App Status
  getStatus() {
    return {
      isMongoConnected,
      mongoError,
      mongoUri: dbState.settings.mongoUri,
      localDbFile,
      suppliersCount: dbState.suppliers.length,
      arrivalsCount: dbState.arrivals.length,
      commitmentsCount: dbState.commitments.length,
      settlementsCount: dbState.settlements.length,
      paymentsCount: dbState.payments.length,
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

  // PRODUCTS
  getProducts() {
    return dbState.products;
  },

  addProduct(productData) {
    const id = 'prod_' + Date.now();
    const newProd = {
      id,
      code: productData.code || productData.name.toUpperCase().replace(/\s+/g, '_'),
      name: productData.name,
      isMain: !!productData.isMain,
      description: productData.description || 'Custom Commodity'
    };
    dbState.products.push(newProd);
    saveLocalDb();
    return newProd;
  },

  // SUPPLIERS
  getSuppliers() {
    return dbState.suppliers.map(sup => calculateSupplierLedger(sup.id));
  },

  getSupplierDetails(supplierId) {
    const summary = calculateSupplierLedger(supplierId);
    if (!summary) return null;

    const arrivals = dbState.arrivals.filter(a => a.supplierId === supplierId).reverse();
    const settlements = dbState.settlements.filter(s => s.supplierId === supplierId).reverse();
    const payments = dbState.payments.filter(p => p.supplierId === supplierId).reverse();
    const commitments = dbState.commitments.filter(c => c.supplierId === supplierId).reverse();

    return {
      summary,
      arrivals,
      settlements,
      payments,
      commitments
    };
  },

  addSupplier(data) {
    const id = 'sup_' + Date.now();
    const newSupplier = {
      id,
      name: data.name.trim(),
      phone: data.phone || '',
      place: data.place || '',
      gst: data.gst || '',
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };
    dbState.suppliers.push(newSupplier);
    saveLocalDb();
    if (isMongoConnected && MongoSupplier) {
      MongoSupplier.create(newSupplier).catch(e => console.error(e));
    }
    return calculateSupplierLedger(id);
  },

  updateSupplier(id, data) {
    const index = dbState.suppliers.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Supplier not found');
    dbState.suppliers[index] = {
      ...dbState.suppliers[index],
      name: data.name ? data.name.trim() : dbState.suppliers[index].name,
      phone: data.phone !== undefined ? data.phone : dbState.suppliers[index].phone,
      place: data.place !== undefined ? data.place : dbState.suppliers[index].place,
      gst: data.gst !== undefined ? data.gst : dbState.suppliers[index].gst,
      notes: data.notes !== undefined ? data.notes : dbState.suppliers[index].notes,
    };
    saveLocalDb();
    if (isMongoConnected && MongoSupplier) {
      MongoSupplier.findOneAndUpdate({ id }, dbState.suppliers[index]).catch(e => console.error(e));
    }
    return calculateSupplierLedger(id);
  },

  deleteSupplier(id) {
    dbState.suppliers = dbState.suppliers.filter(s => s.id !== id);
    saveLocalDb();
    if (isMongoConnected && MongoSupplier) {
      MongoSupplier.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // COMMITMENTS
  getCommitments(supplierId = null) {
    let list = dbState.commitments;
    if (supplierId) {
      list = list.filter(c => c.supplierId === supplierId);
    }
    return list.slice().reverse();
  },

  addCommitment(data) {
    const id = 'com_' + Date.now();
    const count = dbState.commitments.length + 1;
    const commitmentNo = 'COM-' + String(count).padStart(4, '0');

    const newCommitment = {
      id,
      commitmentNo,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
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
      MongoCommitment.create(newCommitment).catch(e => console.error(e));
    }
    return newCommitment;
  },

  // ARRIVALS
  getArrivals(filter = {}) {
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
    const id = 'arr_' + Date.now();
    const count = dbState.arrivals.length + 1;
    const arrivalNo = 'ARR-' + String(count).padStart(4, '0');

    const weight = Number(data.weight) || 0;
    const bags = Number(data.bags) || (weight > 0 ? Math.round((weight / 50) * 100) / 100 : 0);
    const outturn = Number(data.outturn) || 0;
    const outturnType = data.outturnType || 'per_50kg'; // 'per_50kg' (e.g. 26 kg in a 50kg bag) or 'percentage' (e.g. 52%)

    // Calculate End Product:
    // If outturn is given in 50kg bag basis (e.g. 26kg): endProduct = (weight / 50) * outturn
    // If outturn is given in percentage (e.g. 52%): endProduct = weight * (outturn / 100)
    let endProductWeight = 0;
    if (outturnType === 'percentage') {
      endProductWeight = weight * (outturn / 100);
    } else {
      endProductWeight = (weight / 50) * outturn;
    }
    endProductWeight = Math.round(endProductWeight * 100) / 100;

    const rateType = data.rateType || 'fixed'; // 'fixed', 'commitment', 'storage'
    let rate = Number(data.rate) || 0;
    let billAmount = 0;
    let tcsRate = Number(data.tcsRate) || (dbState.settings.defaultTcsRate || 0.1);
    let tcsAmount = 0;
    let netAmount = 0;
    let status = 'billed';
    let commitmentId = data.commitmentId || null;

    // Handle Commitment link & deduction
    if (rateType === 'commitment' && commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        rate = com.rate;
        // Deduct quantity from commitment
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
      billAmount = 0;
      tcsAmount = 0;
      netAmount = 0;
    } else {
      // Calculate bill:
    // User specification: even for bags rate, rate is billed for endproduct!
    billAmount = Math.round((endProductWeight * rate) * 100) / 100;

    // TCS deduction against purchase payment
    tcsAmount = Math.round((billAmount * (tcsRate / 100)) * 100) / 100;
    netAmount = Math.round((billAmount - tcsAmount) * 100) / 100;
    status = 'billed';
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
    rateUnit: data.rateUnit || 'per_kg_ep',
    rate,
    billAmount,
    tcsRate,
    tcsAmount,
    netAmount,
    status,
    settledBags: 0,
    remainingBags: bags,
    settledEndProduct: 0,
    remainingEndProduct: endProductWeight,
    commitmentId,
    remarks: data.remarks || '',
    createdAt: new Date().toISOString()
  };

  dbState.arrivals.push(newArrival);
  saveLocalDb();
  if (isMongoConnected && MongoArrival) {
    MongoArrival.create(newArrival).catch(e => console.error(e));
  }
  return newArrival;
},

updateArrival(id, data) {
  const index = dbState.arrivals.findIndex(a => a.id === id);
  if (index === -1) throw new Error('Arrival not found');
  const arr = dbState.arrivals[index];

  if ((arr.status === 'settled' || (arr.settlementIds && arr.settlementIds.length > 0)) && (data.weight !== undefined && data.weight !== arr.weight)) {
    throw new Error('Cannot change weight on an arrival that has already been settled in storage. Please reverse the settlement first.');
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
  const tcsRate = data.tcsRate !== undefined ? Number(data.tcsRate) : (arr.tcsRate || 0.1);

  let billAmount = 0;
  let tcsAmount = 0;
  let netAmount = 0;

  if (arr.status !== 'storage') {
    billAmount = Math.round((endProductWeight * rate) * 100) / 100;
    tcsAmount = Math.round((billAmount * (tcsRate / 100)) * 100) / 100;
    netAmount = Math.round((billAmount - tcsAmount) * 100) / 100;
  }

  // Adjust commitment quantity difference if linked
  if (arr.commitmentId) {
    const comIndex = dbState.commitments.findIndex(c => c.id === arr.commitmentId);
    if (comIndex !== -1) {
      const com = dbState.commitments[comIndex];
      const oldQty = com.type === 'bags' ? arr.bags : arr.endProductWeight;
      const newQty = com.type === 'bags' ? bags : endProductWeight;
      const diff = newQty - oldQty;

      const newFulfilled = Math.max(0, (com.fulfilledQty || 0) + diff);
      const newRemaining = Math.max(0, com.quantity - newFulfilled);
      dbState.commitments[comIndex] = {
        ...com,
        fulfilledQty: Math.round(newFulfilled * 100) / 100,
        remainingQty: Math.round(newRemaining * 100) / 100,
        status: newRemaining <= 0 ? 'fulfilled' : 'active'
      };
      if (isMongoConnected && MongoCommitment) {
        MongoCommitment.findOneAndUpdate({ id: com.id }, dbState.commitments[comIndex]).catch(e => console.error(e));
      }
    }
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

  // Safety check: cannot delete if settled in a settlement
  if (arr.status === 'settled' || (arr.settlementIds && arr.settlementIds.length > 0) || (arr.settledBags > 0)) {
    throw new Error(`Cannot delete arrival ${arr.arrivalNo} because it has already been settled in storage settlement. Please delete the settlement first to reverse stock.`);
  }

  // Reverse commitment deduction if linked
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
      if (isMongoConnected && MongoCommitment) {
        MongoCommitment.findOneAndUpdate({ id: com.id }, dbState.commitments[comIndex]).catch(e => console.error(e));
      }
    }
  }

  dbState.arrivals.splice(index, 1);
  saveLocalDb();
  if (isMongoConnected && MongoArrival) {
    MongoArrival.deleteOne({ id }).catch(e => console.error(e));
  }
  return { success: true };
},

deleteSettlement(id) {
  const index = dbState.settlements.findIndex(s => s.id === id);
  if (index === -1) return { success: true };
  const st = dbState.settlements[index];

  // 1. Restore underlying arrivals' remaining bags and end product!
  if (st.arrivalIds && st.arrivalIds.length > 0) {
    st.arrivalIds.forEach(arrId => {
      const aIdx = dbState.arrivals.findIndex(a => a.id === arrId);
      if (aIdx !== -1) {
        const arr = dbState.arrivals[aIdx];
        // Calculate ratio settled from this arrival
        const bagsToRestore = Math.min(arr.settledBags || 0, arr.bags);
        const epToRestore = Math.min(arr.settledEndProduct || 0, arr.endProductWeight);

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

        if (isMongoConnected && MongoArrival) {
          MongoArrival.findOneAndUpdate({ id: arr.id }, dbState.arrivals[aIdx]).catch(e => console.error(e));
        }
      }
    });
  }

  // 2. Reverse commitment deduction if settlement was against a commitment!
  if (st.commitmentId) {
    const comIndex = dbState.commitments.findIndex(c => c.id === st.commitmentId);
    if (comIndex !== -1) {
      const com = dbState.commitments[comIndex];
      const qtyToRestore = com.type === 'bags' ? st.settledBags : st.settledEndProduct;
      const newFulfilled = Math.max(0, (com.fulfilledQty || 0) - qtyToRestore);
      const newRemaining = Math.min(com.quantity, (com.remainingQty || 0) + qtyToRestore);

      dbState.commitments[comIndex] = {
        ...com,
        fulfilledQty: Math.round(newFulfilled * 100) / 100,
        remainingQty: Math.round(newRemaining * 100) / 100,
        status: newRemaining <= 0 ? 'fulfilled' : 'active'
      };
      if (isMongoConnected && MongoCommitment) {
        MongoCommitment.findOneAndUpdate({ id: com.id }, dbState.commitments[comIndex]).catch(e => console.error(e));
      }
    }
  }

  // 3. Remove settlement
  dbState.settlements.splice(index, 1);
  saveLocalDb();
  if (isMongoConnected && MongoSettlement) {
    MongoSettlement.deleteOne({ id }).catch(e => console.error(e));
  }
  return { success: true };
},

deleteCommitment(id) {
  const index = dbState.commitments.findIndex(c => c.id === id);
  if (index === -1) return { success: true };
  const com = dbState.commitments[index];
  if (com.fulfilledQty > 0) {
    throw new Error(`Cannot delete commitment ${com.commitmentNo} because ${com.fulfilledQty} ${com.type} has already been fulfilled by arrivals or settlements. Delete or edit the arrivals first.`);
  }

  dbState.commitments.splice(index, 1);
  saveLocalDb();
  if (isMongoConnected && MongoCommitment) {
    MongoCommitment.deleteOne({ id }).catch(e => console.error(e));
  }
  return { success: true };
},

  // SETTLEMENT OF STORAGE COFFEE
  // Settle individual or multiple arrivals together with average outturn!
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

    // Average outturn in kg per 50kg bag
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
      arrivalIds, // array of arrival IDs
      settleBags, // number of bags to settle (could be all 500 bags, or partial e.g. 450 bags)
      settlementRate, // rate per kg EP or per bag
      rateUnit = 'per_kg_ep', // 'per_kg_ep' or 'per_bag'
      tcsRate = 0.1,
      date = new Date().toISOString().split('T')[0],
      notes = ''
    } = settleData;

    const selectedArrivals = dbState.arrivals.filter(a => arrivalIds.includes(a.id));
    if (selectedArrivals.length === 0) throw new Error('No arrivals selected for settlement');

    // Calculate total available storage in selected arrivals
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

    const bagsToSettle = Math.min(Number(settleBags) || totalAvailBags, totalAvailBags);
    const averageOutturn = totalAvailWeight > 0 ? (totalAvailEndProduct / (totalAvailWeight / 50)) : 0;

    // Calculate equivalent end product to settle based on average outturn!
    // Equivalent EP = bagsToSettle * averageOutturn
    let settledEndProduct = 0;
    if (bagsToSettle >= totalAvailBags) {
      settledEndProduct = totalAvailEndProduct;
    } else {
      settledEndProduct = bagsToSettle * averageOutturn;
    }
    settledEndProduct = Math.round(settledEndProduct * 100) / 100;

    // Calculate Settlement Bill Amount
    let settlementGrossAmount = 0;
    if (rateUnit === 'per_bag') {
      settlementGrossAmount = bagsToSettle * settlementRate;
    } else {
      settlementGrossAmount = settledEndProduct * settlementRate;
    }
    settlementGrossAmount = Math.round(settlementGrossAmount * 100) / 100;

    const tcsAmount = Math.round((settlementGrossAmount * (tcsRate / 100)) * 100) / 100;
    const settlementNetAmount = Math.round((settlementGrossAmount - tcsAmount) * 100) / 100;

    const id = 'set_' + Date.now();
    const count = dbState.settlements.length + 1;
    const settlementNo = 'SET-' + String(count).padStart(4, '0');

    // Proportionally deduct settled bags and EP from each selected arrival
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

    // Deduct from commitment if settled against an open commitment
    const commitmentId = settleData.commitmentId || null;
    if (commitmentId) {
      const comIndex = dbState.commitments.findIndex(c => c.id === commitmentId);
      if (comIndex !== -1) {
        const com = dbState.commitments[comIndex];
        const qtyToDeduct = com.type === 'bags' ? bagsToSettle : settledEndProduct;
        const newFulfilled = (com.fulfilledQty || 0) + qtyToDeduct;
        const newRemaining = Math.max(0, com.quantity - newFulfilled);

        dbState.commitments[comIndex] = {
          ...com,
          fulfilledQty: Math.round(newFulfilled * 100) / 100,
          remainingQty: Math.round(newRemaining * 100) / 100,
          status: newRemaining <= 0 ? 'fulfilled' : 'active'
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
      arrivalIds,
      commitmentId,
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
      settlementNetAmount,
      notes,
      createdAt: new Date().toISOString()
    };

    dbState.settlements.push(newSettlement);
    saveLocalDb();
    if (isMongoConnected && MongoSettlement) {
      MongoSettlement.create(newSettlement).catch(e => console.error(e));
    }
    return newSettlement;
  },

  getSettlements(supplierId = null) {
    let list = dbState.settlements;
    if (supplierId) {
      list = list.filter(s => s.supplierId === supplierId);
    }
    return list.slice().reverse();
  },

  // PAYMENTS & TCS
  getPayments(supplierId = null) {
    let list = dbState.payments;
    if (supplierId) {
      list = list.filter(p => p.supplierId === supplierId);
    }
    return list.slice().reverse();
  },

  addPayment(data) {
    const id = 'pay_' + Date.now();
    const count = dbState.payments.length + 1;
    const paymentNo = 'PAY-' + String(count).padStart(4, '0');

    const newPayment = {
      id,
      paymentNo,
      date: data.date || new Date().toISOString().split('T')[0],
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      type: data.type || 'payment_paid', // 'payment_paid' (paid to supplier) or 'payment_received' (received from supplier)
      mode: data.mode || 'Bank Transfer',
      amount: Number(data.amount) || 0,
      reference: data.reference || '',
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    dbState.payments.push(newPayment);
    saveLocalDb();
    if (isMongoConnected && MongoPayment) {
      MongoPayment.create(newPayment).catch(e => console.error(e));
    }
    return newPayment;
  },

  deletePayment(id) {
    dbState.payments = dbState.payments.filter(p => p.id !== id);
    saveLocalDb();
    if (isMongoConnected && MongoPayment) {
      MongoPayment.deleteOne({ id }).catch(e => console.error(e));
    }
    return { success: true };
  },

  // GLOBAL DASHBOARD & SUMMARY METRICS
  getDashboardMetrics(dateFilter = {}) {
    let arrivals = dbState.arrivals;
    if (dateFilter.startDate) {
      arrivals = arrivals.filter(a => a.date >= dateFilter.startDate);
    }
    if (dateFilter.endDate) {
      arrivals = arrivals.filter(a => a.date <= dateFilter.endDate);
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
      if (arr.status === 'billed') {
        dailyTotalBill += (Number(arr.billAmount) || 0);
        if (arr.rate > 0) {
          totalRateSum += arr.rate;
          billedArrivalsCount++;
        }
      }
    });

    const dailyAvgRate = billedArrivalsCount > 0 ? totalRateSum / billedArrivalsCount : 0;

    // Global totals across all time
    let totalSuppliers = dbState.suppliers.length;
    let totalStorageBags = 0;
    let totalStorageEP = 0;
    let totalPurchasesValue = 0;
    let totalTcsAllTime = 0;
    let totalPaidAllTime = 0;
    let totalReceivedAllTime = 0;

    dbState.arrivals.forEach(arr => {
      if (arr.status === 'storage' || arr.status === 'partial_settled') {
        totalStorageBags += (arr.remainingBags !== undefined ? arr.remainingBags : arr.bags);
        totalStorageEP += (arr.remainingEndProduct !== undefined ? arr.remainingEndProduct : arr.endProductWeight);
      }
      if (arr.status === 'billed') {
        totalPurchasesValue += (Number(arr.netAmount) || Number(arr.billAmount) || 0);
        totalTcsAllTime += (Number(arr.tcsAmount) || 0);
      }
    });

    dbState.settlements.forEach(set => {
      totalPurchasesValue += (Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0);
      totalTcsAllTime += (Number(set.tcsAmount) || 0);
    });

    dbState.payments.forEach(p => {
      if (p.type === 'payment_paid' || !p.type) {
        totalPaidAllTime += (Number(p.amount) || 0);
      } else if (p.type === 'payment_received') {
        totalReceivedAllTime += (Number(p.amount) || 0);
      }
    });

    const netPayableGlobal = totalPurchasesValue - totalPaidAllTime + totalReceivedAllTime;

    return {
      daily: {
        totalWeight: Math.round(dailyTotalWeight * 100) / 100,
        totalBags: Math.round(dailyTotalBags * 100) / 100,
        totalEndProduct: Math.round(dailyTotalEndProduct * 100) / 100,
        totalBill: Math.round(dailyTotalBill * 100) / 100,
        avgRate: Math.round(dailyAvgRate * 100) / 100,
        arrivalsCount: arrivals.length
      },
      global: {
        totalSuppliers,
        totalPurchasesValue: Math.round(totalPurchasesValue * 100) / 100,
        totalStorageBags: Math.round(totalStorageBags * 100) / 100,
        totalStorageEP: Math.round(totalStorageEP * 100) / 100,
        totalTcsAllTime: Math.round(totalTcsAllTime * 100) / 100,
        totalPaidAllTime: Math.round(totalPaidAllTime * 100) / 100,
        totalReceivedAllTime: Math.round(totalReceivedAllTime * 100) / 100,
        netPayableGlobal: Math.round(netPayableGlobal * 100) / 100,
      }
    };
  },

  // DATA BACKUP & RESTORE
  exportFullBackup() {
    return {
      version: '1.0.0',
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
