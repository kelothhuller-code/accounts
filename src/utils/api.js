// Universal API Client - communicates with Electron main process IPC
export async function dbAction(action, payload = null) {
  if (window.api && window.api.invoke) {
    try {
      const result = await window.api.invoke('db-action', action, payload);
      if (result && result.error) {
        console.error(`dbAction error on [${action}]:`, result.error);
        throw new Error(result.error);
      }
      return result;
    } catch (err) {
      console.error(`IPC call failed for [${action}]:`, err);
      throw err;
    }
  } else {
    console.warn(`Running in browser mode without Electron IPC: [${action}]`);
    return mockBrowserFallback(action, payload);
  }
}

const BROWSER_STORAGE_KEY = 'commodity_mock_store_v3';

function getBrowserStore() {
  const data = localStorage.getItem(BROWSER_STORAGE_KEY) || localStorage.getItem('coffee_mock_store_v2');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) { }
  }
  return {
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
      defaultTcsRate: 0.1,
      defaultCgstRate: 0,
      defaultSgstRate: 0,
      companyName: 'Global Commodity Trading & Processing Co.',
      openingStock: { coffeeBags: 0, coffeeWeight: 0, coffeeEP: 0, huskBags: 0, huskWeight: 0 }
    }
  };
}

function saveBrowserStore(store) {
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(store));
}

function mockBrowserFallback(action, payload) {
  const store = getBrowserStore();
  if (action === 'db:status') return { isMongoConnected: false, mongoError: 'Web Browser Mode' };
  if (action === 'db:push-to-mongo') return { success: true, message: 'Local data pushed to cloud successfully (browser mode).' };
  if (action === 'db:pull-from-mongo') return { success: true, message: 'Cloud data pulled to local successfully (browser mode).' };
  if (action === 'db:deduplicate-parties') return { success: true, message: 'Party accounts deduplicated (browser mode).' };
  if (action === 'db:clear-local' || action === 'db:reset-database') {
    const emptyStore = {
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
        defaultTcsRate: 0.1,
        defaultCgstRate: 0,
        defaultSgstRate: 0,
        companyName: 'Global Commodity Trading & Processing Co.',
        openingStock: { coffeeBags: 0, coffeeWeight: 0, coffeeEP: 0, huskBags: 0, huskWeight: 0 },
        processingProfiles: {}
      }
    };
    saveBrowserStore(emptyStore);
    return { success: true, isMongoConnected: false };
  }
  if (action === 'products:get') return store.products;
  if (action === 'products:add') {
    const newProd = { id: 'prod_' + Date.now(), ...payload };
    store.products.push(newProd);
    saveBrowserStore(store);
    return { success: true, product: newProd };
  }
  if (action === 'products:update') {
    const idx = store.products.findIndex(p => p.id === payload.id);
    if (idx !== -1) {
      store.products[idx] = { ...store.products[idx], ...payload.data };
      saveBrowserStore(store);
    }
    return { success: true };
  }
  if (action === 'products:delete') {
    store.products = store.products.filter(p => p.id !== payload.id);
    saveBrowserStore(store);
    return { success: true };
  }

  if (action === 'processing-profiles:get') {
    if (!store.settings.processingProfiles) {
      store.settings.processingProfiles = {};
      saveBrowserStore(store);
    }
    return store.settings.processingProfiles;
  }

  if (action === 'processing-profiles:save') {
    if (!store.settings.processingProfiles) store.settings.processingProfiles = {};
    store.settings.processingProfiles[payload.sourceProduct] = payload.outputs;
    saveBrowserStore(store);
    return { success: true, profiles: store.settings.processingProfiles };
  }

  if (action === 'processing-profiles:delete') {
    if (store.settings && store.settings.processingProfiles) {
      delete store.settings.processingProfiles[payload.sourceProduct || payload.id];
      saveBrowserStore(store);
    }
    return { success: true, profiles: store.settings?.processingProfiles || {} };
  }

  if (action === 'suppliers:get') {
    return store.suppliers.map(s => {
      const arrs = store.arrivals.filter(a => a.supplierId === s.id);
      const disps = store.dispatches.filter(d => d.supplierId === s.id || d.partyId === s.id);
      const sets = store.settlements.filter(st => st.supplierId === s.id);
      const pays = store.payments.filter(p => p.supplierId === s.id);
      const epTrfs = (store.epTransfers || []).filter(t => t.fromPartyId === s.id || t.toPartyId === s.id);

      // Helper: determine if a record is secondary using stored flag first, product definition second
      const isSecRec = (rec) => {
        if (!rec) return false;
        if (rec.isSecondary === true) return true;
        if (rec.isMain === true) return false;
        if (rec.isSecondary === false) return false;
        const pObj = (store.products || []).find(p => p.name === rec.product);
        if (pObj) {
          if (pObj.isSecondary === true || pObj.category === 'Secondary Product' || pObj.category === 'husk') return true;
          if (pObj.isMain === true || pObj.category === 'Primary Product') return false;
        }
        return (rec.product && rec.product.toString().toLowerCase().includes('husk')) || rec.dispatchType === 'husk';
      };

      // Split arrival totals by main vs secondary
      let totalRawWeightMain = 0, totalRawWeightSecondary = 0;
      let totalBagsMain = 0, totalBagsSecondary = 0;
      let totalArrivalEPMain = 0, totalArrivalEPSecondary = 0;
      let storeInBags = 0, storeInEP = 0, storeInEPMain = 0, storeInEPSecondary = 0;

      arrs.forEach(arr => {
        const sec = isSecRec(arr);
        const w = Number(arr.weight) || 0;
        const b = Number(arr.bags) || 0;
        const ep = Number(arr.endProductWeight) || 0;
        if (sec) { totalRawWeightSecondary += w; totalBagsSecondary += b; totalArrivalEPSecondary += ep; }
        else { totalRawWeightMain += w; totalBagsMain += b; totalArrivalEPMain += ep; }
        if (arr.status === 'storage' || arr.status === 'partial_settled') {
          const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : b;
          const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : ep;
          storeInBags += remBags;
          storeInEP += remEP;
          if (sec) storeInEPSecondary += remEP; else storeInEPMain += remEP;
        }
      });

      // Split dispatch totals by main vs secondary
      let storeOutBags = 0, storeOutEP = 0, storeOutEPMain = 0, storeOutEPSecondary = 0;
      let totalDispatchEP = 0, totalDispatchEPSecondary = 0;
      let totalDispatchWeight = 0, totalDispatchBags = 0;

      disps.forEach(d => {
        const sec = isSecRec(d);
        const w = Number(d.weight) || 0;
        const b = Number(d.bags) || 0;
        const ep = Number(d.endProductWeight || d.weight) || 0;
        totalDispatchWeight += w;
        totalDispatchBags += b;
        if (sec) totalDispatchEPSecondary += ep; else totalDispatchEP += ep;
        if (d.status === 'storage_out' || d.rateType === 'storage_out' || d.status === 'partial_settled') {
          const remBags = d.remainingBags !== undefined ? Number(d.remainingBags) : b;
          const remEP = d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep;
          storeOutBags += remBags;
          storeOutEP += remEP;
          if (sec) storeOutEPSecondary += remEP; else storeOutEPMain += remEP;
        }
      });

      let storageBags = Math.max(0, (Number(s.openingStorageBags) || 0) + storeInBags - storeOutBags);
      let storageEP = Math.max(0, (Number(s.openingStorageEP) || 0) + storeInEP - storeOutEP);

      epTrfs.forEach(trf => {
        const ep = Number(trf.endProductWeight) || 0;
        const b = Number(trf.bags) || 0;
        if (trf.fromPartyId === s.id) { storageEP = Math.max(0, storageEP - ep); storageBags = Math.max(0, storageBags - b); }
        if (trf.toPartyId === s.id) { storageEP += ep; storageBags += b; }
      });

      const avgOutturn = storageBags > 0 ? (storageEP / storageBags) : 0;

      const purArrivals = arrs.filter(a => a.status === 'billed' || a.status === 'cash_bill').reduce((acc, a) => acc + (Number(a.netAmount) || Number(a.billAmount) || 0), 0);
      const purSettlements = sets.filter(st => st.settlementCategory !== 'sales_storage').reduce((acc, st) => acc + (Number(st.settlementNetAmount) || Number(st.settlementGrossAmount) || 0), 0);
      const totPurchases = purArrivals + purSettlements;
      const saleDispatches = disps.filter(d => d.status === 'billed' || d.status === 'cash_bill').reduce((acc, d) => acc + (Number(d.netAmount) || Number(d.billAmount) || 0), 0);
      const saleSettlements = sets.filter(st => st.settlementCategory === 'sales_storage').reduce((acc, st) => acc + (Number(st.settlementNetAmount) || Number(st.settlementGrossAmount) || 0), 0);
      const totSales = saleDispatches + saleSettlements;
      const totPaid = pays.filter(p => p.type === 'payment_paid' || !p.type).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const totRecv = pays.filter(p => p.type === 'payment_received').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const totTcs = arrs.reduce((acc, a) => acc + (Number(a.tcsAmount) || 0), 0) + disps.reduce((acc, d) => acc + (Number(d.tcsAmount) || 0), 0) + sets.reduce((acc, st) => acc + (Number(st.tcsAmount) || 0), 0);
      const totTds = arrs.reduce((acc, a) => acc + (Number(a.tdsAmount) || 0), 0) + disps.reduce((acc, d) => acc + (Number(d.tdsAmount) || 0), 0) + sets.reduce((acc, st) => acc + (Number(st.tdsAmount) || 0), 0);

      return {
        ...s,
        totalRawWeight: totalRawWeightMain + totalRawWeightSecondary,
        totalRawWeightMain,
        totalRawWeightSecondary,
        totalBags: totalBagsMain + totalBagsSecondary,
        totalBagsMain,
        totalBagsSecondary,
        totalEndProduct: totalArrivalEPMain + totalArrivalEPSecondary,
        totalArrivalEPMain,
        totalArrivalEPSecondary,
        totalDispatchWeight,
        totalDispatchBags,
        totalDispatchEP,
        totalDispatchEPSecondary,
        storeInBags,
        storeInEP,
        storeInEPMain,
        totalStoreInEPSecondary: storeInEPSecondary,
        storeOutBags,
        storeOutEP,
        storeOutEPMain,
        totalStoreOutEPSecondary: storeOutEPSecondary,
        storageBags,
        storageEndProduct: storageEP,
        storageAvgOutturn: Math.round(avgOutturn * 100) / 100,
        totalPurchasesBilled: totPurchases,
        totalSalesBilled: totSales,
        totalBilledAmount: totPurchases + totSales,
        totalTcsDeducted: totTcs,
        totalTdsDeducted: totTds,
        totalPaid: totPaid,
        totalReceived: totRecv,
        netPayable: totPurchases - totSales - totPaid + totRecv
      };
    });
  }
  if (action === 'suppliers:get-one') {
    const s = store.suppliers.find(x => x.id === payload.id);
    if (!s) return null;

    const arrs = store.arrivals.filter(a => a.supplierId === payload.id);
    const disps = store.dispatches.filter(d => d.supplierId === payload.id || d.partyId === payload.id);
    const sets = store.settlements.filter(st => st.supplierId === payload.id);
    const pays = store.payments.filter(p => p.supplierId === payload.id);
    const epTrfs = (store.epTransfers || []).filter(t => t.fromPartyId === payload.id || t.toPartyId === payload.id);

    const purArrivals = arrs.filter(a => a.status === 'billed' || a.status === 'cash_bill').reduce((acc, a) => acc + (Number(a.netAmount) || Number(a.billAmount) || 0), 0);
    const purSettlements = sets.filter(st => st.settlementCategory !== 'sales_storage').reduce((acc, st) => acc + (Number(st.settlementNetAmount) || Number(st.settlementGrossAmount) || 0), 0);
    const totPurchases = purArrivals + purSettlements;

    const saleDispatches = disps.filter(d => d.status === 'billed' || d.status === 'cash_bill').reduce((acc, d) => acc + (Number(d.netAmount) || Number(d.billAmount) || 0), 0);
    const saleSettlements = sets.filter(st => st.settlementCategory === 'sales_storage').reduce((acc, st) => acc + (Number(st.settlementNetAmount) || Number(st.settlementGrossAmount) || 0), 0);
    const totSales = saleDispatches + saleSettlements;

    const totPaid = pays.filter(p => p.type === 'payment_paid' || !p.type).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const totRecv = pays.filter(p => p.type === 'payment_received').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    const totTcs = arrs.reduce((acc, a) => acc + (Number(a.tcsAmount) || 0), 0)
      + disps.reduce((acc, d) => acc + (Number(d.tcsAmount) || 0), 0)
      + sets.reduce((acc, st) => acc + (Number(st.tcsAmount) || 0), 0);

    const totTds = arrs.reduce((acc, a) => acc + (Number(a.tdsAmount) || 0), 0)
      + disps.reduce((acc, d) => acc + (Number(d.tdsAmount) || 0), 0)
      + sets.reduce((acc, st) => acc + (Number(st.tdsAmount) || 0), 0);

    // Helper: determine if a record is secondary using stored flag first, product definition second
    const isSecRecOne = (rec) => {
      if (!rec) return false;
      if (rec.isSecondary === true) return true;
      if (rec.isMain === true) return false;
      if (rec.isSecondary === false) return false;
      const pObj = (store.products || []).find(p => p.name === rec.product);
      if (pObj) {
        if (pObj.isSecondary === true || pObj.category === 'Secondary Product' || pObj.category === 'husk') return true;
        if (pObj.isMain === true || pObj.category === 'Primary Product') return false;
      }
      return (rec.product && rec.product.toString().toLowerCase().includes('husk')) || rec.dispatchType === 'husk';
    };

    let totalRawWeightMain = 0, totalRawWeightSecondary = 0;
    let totalBagsMain = 0, totalBagsSecondary = 0;
    let totalArrivalEPMain = 0, totalArrivalEPSecondary = 0;
    let storeInBags = 0, storeInEP = 0, storeInEPMain = 0, storeInEPSecondary = 0;

    arrs.forEach(arr => {
      const sec = isSecRecOne(arr);
      const w = Number(arr.weight) || 0;
      const b = Number(arr.bags) || 0;
      const ep = Number(arr.endProductWeight) || 0;
      if (sec) { totalRawWeightSecondary += w; totalBagsSecondary += b; totalArrivalEPSecondary += ep; }
      else { totalRawWeightMain += w; totalBagsMain += b; totalArrivalEPMain += ep; }
      if (arr.status === 'storage' || arr.status === 'partial_settled') {
        const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : b;
        const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : ep;
        storeInBags += remBags;
        storeInEP += remEP;
        if (sec) storeInEPSecondary += remEP; else storeInEPMain += remEP;
      }
    });

    let storeOutBags = 0, storeOutEP = 0, storeOutEPMain = 0, storeOutEPSecondary = 0;
    let totalDispatchEP = 0, totalDispatchEPSecondary = 0;
    let totalDispatchWeight = 0, totalDispatchBags = 0;

    disps.forEach(d => {
      const sec = isSecRecOne(d);
      const w = Number(d.weight) || 0;
      const b = Number(d.bags) || 0;
      const ep = Number(d.endProductWeight || d.weight) || 0;
      totalDispatchWeight += w;
      totalDispatchBags += b;
      if (sec) totalDispatchEPSecondary += ep; else totalDispatchEP += ep;
      if (d.status === 'storage_out' || d.rateType === 'storage_out' || d.status === 'partial_settled') {
        const remBags = d.remainingBags !== undefined ? Number(d.remainingBags) : b;
        const remEP = d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep;
        storeOutBags += remBags;
        storeOutEP += remEP;
        if (sec) storeOutEPSecondary += remEP; else storeOutEPMain += remEP;
      }
    });

    let storageBags = Math.max(0, (Number(s.openingStorageBags) || 0) + storeInBags - storeOutBags);
    let storageEP = Math.max(0, (Number(s.openingStorageEP) || 0) + storeInEP - storeOutEP);

    epTrfs.forEach(trf => {
      const ep = Number(trf.endProductWeight) || 0;
      const b = Number(trf.bags) || 0;
      if (trf.fromPartyId === s.id) {
        storageEP = Math.max(0, storageEP - ep);
        storageBags = Math.max(0, storageBags - b);
      }
      if (trf.toPartyId === s.id) {
        storageEP += ep;
        storageBags += b;
      }
    });

    const avgOutturn = storageBags > 0 ? (storageEP / storageBags) : 0;

    const summary = {
      ...s,
      totalRawWeight: totalRawWeightMain + totalRawWeightSecondary,
      totalRawWeightMain,
      totalRawWeightSecondary,
      totalBags: totalBagsMain + totalBagsSecondary,
      totalBagsMain,
      totalBagsSecondary,
      totalEndProduct: totalArrivalEPMain + totalArrivalEPSecondary,
      totalArrivalEPMain,
      totalArrivalEPSecondary,
      totalDispatchWeight,
      totalDispatchBags,
      totalDispatchEP,
      totalDispatchEPSecondary,
      storeInBags,
      storeInEP,
      storeInEPMain,
      totalStoreInEPSecondary: storeInEPSecondary,
      storeOutBags,
      storeOutEP,
      storeOutEPMain,
      totalStoreOutEPSecondary: storeOutEPSecondary,
      storageBags,
      storageEndProduct: storageEP,
      storageAvgOutturn: Math.round(avgOutturn * 100) / 100,
      totalPurchasesBilled: totPurchases,
      totalSalesBilled: totSales,
      totalBilledAmount: totPurchases + totSales,
      totalTcsDeducted: totTcs,
      totalTdsDeducted: totTds,
      totalPaid: totPaid,
      totalReceived: totRecv,
      netPayable: totPurchases - totSales - totPaid + totRecv
    };

    return {
      summary,
      arrivals: arrs,
      dispatches: disps,
      settlements: sets,
      payments: pays,
      commitments: store.commitments.filter(c => c.supplierId === payload.id),
      epTransfers: epTrfs,
      washes: store.commitmentWashes.filter(w => w.supplierId === payload.id)
    };
  }

  if (action === 'arrivals:get') return store.arrivals;
  if (action === 'dispatches:get') return store.dispatches;
  if (action === 'commitments:get') return store.commitments;
  if (action === 'settlements:get') return store.settlements;
  if (action === 'payments:get') return store.payments;
  if (action === 'ep-transfers:get') return store.epTransfers;
  if (action === 'commitments:get-washes') return store.commitmentWashes;
  if (action === 'commitments:close') {
    const idx = store.commitments.findIndex(c => c.id === (payload?.id || payload));
    if (idx !== -1) {
      const com = store.commitments[idx];
      const finalQty = payload?.closedQty !== undefined ? Number(payload.closedQty) : (com.fulfilledQty || com.quantity);
      store.commitments[idx] = {
        ...com,
        quantity: Math.round(finalQty * 100) / 100,
        remainingQty: 0,
        status: 'closed',
        notes: payload?.notes ? (com.notes ? `${com.notes} | ${payload.notes}` : payload.notes) : com.notes
      };
      saveBrowserStore(store);
      return store.commitments[idx];
    }
    return { success: true };
  }

  if (action === 'stock:requirement-insight') {
    const isSecRec = (rec) => {
      if (!rec) return false;
      if (rec.isSecondary !== undefined) return rec.isSecondary === true;
      if (rec.isMain !== undefined) return rec.isMain === false;
      const pObj = (store.products || []).find(p => p.name === rec.product || p.code === rec.product);
      if (pObj) {
        if (pObj.isSecondary === true) return true;
        if (pObj.isMain === true) return false;
      }
      return (rec.product || '').toLowerCase().includes('husk');
    };

    const openEntries = store.openingStockEntries || [];
    let godownOpenStockEP = 0;
    let godownOpenStockBags = 0;
    let godownOpenStockEPSec = 0;
    let godownOpenStockBagsSec = 0;

    let stockAdjustmentsEP = 0;
    let stockAdjustmentsBags = 0;
    let stockAdjustmentsEPSec = 0;
    let stockAdjustmentsBagsSec = 0;

    openEntries.forEach(entry => {
      const isSec = isSecRec(entry);
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

    if (godownOpenStockEP === 0 && (Number(store.settings?.openingStock?.coffeeEP) || 0) > 0) {
      godownOpenStockEP = Number(store.settings.openingStock.coffeeEP) || 0;
      godownOpenStockBags = Number(store.settings.openingStock.coffeeBags) || 0;
    }
    if (godownOpenStockEPSec === 0 && (Number(store.settings?.openingStock?.huskWeight) || 0) > 0) {
      godownOpenStockEPSec = Number(store.settings.openingStock.huskWeight) || 0;
      godownOpenStockBagsSec = Number(store.settings.openingStock.huskBags) || 0;
    }

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

    (store.arrivals || []).forEach(a => {
      const ep = Number(a.endProductWeight) || 0;
      const bags = Number(a.bags) || 0;
      const weight = Number(a.weight) || 0;
      const isSec = isSecRec(a);

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

    (store.dispatches || []).forEach(d => {
      const ep = Number(d.endProductWeight) || Number(d.weight) || 0;
      const bags = Number(d.bags) || 0;
      const weight = Number(d.weight) || 0;
      const isSec = isSecRec(d);

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

    let purchaseCommitmentsPendingEP = 0;
    let purchaseCommitmentsPendingBags = 0;
    let purchaseCommitmentsPendingEPSec = 0;
    let purchaseCommitmentsPendingBagsSec = 0;

    (store.commitments || [])
      .filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active')
      .forEach(c => {
        const isSec = isSecRec(c);
        const rem = Number(c.remainingQty) !== undefined ? Number(c.remainingQty) : (Number(c.quantity) || 0);
        const prodObj = (store.products || []).find(p => p.name === c.product);
        let epQty = rem;
        if (c.type === 'bags') {
          const outturn = prodObj?.defaultOutturn || 26;
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

    (store.commitments || [])
      .filter(c => c.category === 'sale' && c.status === 'active')
      .forEach(c => {
        const isSec = isSecRec(c);
        const rem = Number(c.remainingQty) !== undefined ? Number(c.remainingQty) : (Number(c.quantity) || 0);
        const prodObj = (store.products || []).find(p => p.name === c.product);
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
  }

  if (action === 'milling:get') return store.millingLogs || [];
  if (action === 'milling:add') {
    const id = 'mill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const count = (store.millingLogs || []).length + 1;
    const record = {
      id,
      millingNo: payload.millingNo || `MILL-${String(count).padStart(4, '0')}`,
      date: payload.date || new Date().toISOString().split('T')[0],
      godown: payload.godown || 'Main Godown',
      sourceProduct: payload.sourceProduct || '',
      sourceBags: Number(payload.sourceBags) || 0,
      sourceWeight: Number(payload.sourceWeight) || 0,
      sourceOutturn: Number(payload.sourceOutturn) || 0,
      inputEPWeight: Number(payload.inputEPWeight) || 0,
      outputs: (payload.outputs || []).map(o => ({
        product: o.product,
        percentage: Number(o.percentage) || 0,
        yieldWeight: Number(o.yieldWeight) || 0,
        isSecondary: Boolean(o.isSecondary)
      })),
      notes: payload.notes || '',
      createdAt: new Date().toISOString()
    };
    if (!store.millingLogs) store.millingLogs = [];
    store.millingLogs.unshift(record);
    saveBrowserStore(store);
    return record;
  }
  if (action === 'milling:delete') {
    store.millingLogs = (store.millingLogs || []).filter(m => m.id !== (payload?.id || payload));
    saveBrowserStore(store);
    return { success: true };
  }

  if (action === 'stock:get-entries') return store.openingStockEntries || [];
  if (action === 'stock:add-entry') {
    const id = 'opstock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const record = {
      id,
      date: payload.date || new Date().toISOString().split('T')[0],
      godown: payload.godown || 'Main Godown',
      supplierId: payload.supplierId || null,
      supplierName: payload.supplierName || 'Global / Unallocated',
      product: payload.product || '',
      isSecondary: Boolean(payload.isSecondary),
      bags: Number(payload.bags) || 0,
      weight: Number(payload.weight) || 0,
      outturn: Number(payload.outturn) || 0,
      endProductWeight: Number(payload.endProductWeight) || 0,
      notes: payload.notes || '',
      createdAt: new Date().toISOString()
    };
    if (!store.openingStockEntries) store.openingStockEntries = [];
    store.openingStockEntries.unshift(record);

    if (payload.supplierId) {
      const supIdx = (store.suppliers || []).findIndex(s => s.id === payload.supplierId);
      if (supIdx !== -1) {
        store.suppliers[supIdx].openingStorageBags = (store.suppliers[supIdx].openingStorageBags || 0) + record.bags;
        store.suppliers[supIdx].openingStorageEP = (store.suppliers[supIdx].openingStorageEP || 0) + record.endProductWeight;
      }
    }
    saveBrowserStore(store);
    return record;
  }
  if (action === 'stock:delete-entry') {
    store.openingStockEntries = (store.openingStockEntries || []).filter(e => e.id !== (payload?.id || payload));
    saveBrowserStore(store);
    return { success: true };
  }

  if (action === 'dashboard:metrics') {
    let arrivals = (store.arrivals || []).slice();
    let dispatches = (store.dispatches || []).slice();
    let settlements = (store.settlements || []).slice();

    if (payload?.startDate) {
      arrivals = arrivals.filter(a => a.date >= payload.startDate);
      dispatches = dispatches.filter(d => d.date >= payload.startDate);
      settlements = settlements.filter(s => s.date >= payload.startDate);
    }
    if (payload?.endDate) {
      arrivals = arrivals.filter(a => a.date <= payload.endDate);
      dispatches = dispatches.filter(d => d.date <= payload.endDate);
      settlements = settlements.filter(s => s.date <= payload.endDate);
    }

    let dailyTotalWeight = 0, dailyTotalBags = 0, dailyTotalEndProduct = 0, dailyTotalBill = 0;
    let dailyStorageInBags = 0, dailyStorageInEP = 0, billedArrivalsCount = 0, totalRateSum = 0;

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
        dailyTotalBill += (Number(arr.netAmount) || Number(arr.billAmount) || 0);
        if (arr.rate > 0) { totalRateSum += arr.rate; billedArrivalsCount++; }
      }
    });

    let dailyDispatchWeight = 0, dailyDispatchBags = 0, dailyDispatchValue = 0, dailyStorageOutBags = 0, dailyStorageOutEP = 0;
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
        dailyDispatchValue += (Number(d.netAmount) || Number(d.billAmount) || 0);
      }
    });

    let dailySettledBags = 0, dailySettledEP = 0, dailySettledValue = 0;
    settlements.forEach(s => {
      dailySettledBags += (Number(s.settledBags) || 0);
      dailySettledEP += (Number(s.settledEndProduct) || 0);
      dailySettledValue += (Number(s.settlementNetAmount) || Number(s.settlementGrossAmount) || 0);
    });

    let totalPurchasesValue = 0, totalSalesValue = 0, totalTcsAllTime = 0, totalTdsAllTime = 0, totalGstAllTime = 0;
    let totalPaidAllTime = 0, totalReceivedAllTime = 0, totalStorageBags = 0, totalStorageEP = 0, totalStoreOutBags = 0, totalStoreOutEP = 0;

    const productStockMap = new Map();
    (store.products || []).forEach(p => {
      productStockMap.set(p.name, {
        product: p.name, code: p.code, calculationBasis: p.calculationBasis || 'direct',
        storeInBags: 0, storeInWeight: 0, storeInEP: 0, storeOutBags: 0, storeOutEP: 0, netBags: 0, netEP: 0, avgOutturn: 0
      });
    });

    store.arrivals.forEach(arr => {
      const remBags = arr.remainingBags !== undefined ? Number(arr.remainingBags) : Number(arr.bags);
      const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : Number(arr.endProductWeight);
      const remWeight = arr.bags > 0 ? (remBags / arr.bags) * (Number(arr.weight) || 0) : Number(arr.weight || 0);

      if (arr.status === 'storage' || arr.status === 'partial_settled') {
        totalStorageBags += remBags;
        totalStorageEP += remEP;
        const prodKey = arr.product || 'Other';
        if (!productStockMap.has(prodKey)) {
          productStockMap.set(prodKey, { product: prodKey, code: prodKey.toUpperCase(), calculationBasis: 'end_product', storeInBags: 0, storeInWeight: 0, storeInEP: 0, storeOutBags: 0, storeOutEP: 0, netBags: 0, netEP: 0, avgOutturn: 0 });
        }
        const item = productStockMap.get(prodKey);
        item.storeInBags += remBags; item.storeInWeight += remWeight; item.storeInEP += remEP;
      }
      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        totalPurchasesValue += (Number(arr.netAmount) || Number(arr.billAmount) || 0);
        totalTcsAllTime += (Number(arr.tcsAmount) || 0);
        totalTdsAllTime += (Number(arr.tdsAmount) || 0);
        totalGstAllTime += (Number(arr.cgstAmount) || 0) + (Number(arr.sgstAmount) || 0) + (Number(arr.igstAmount) || 0);
      }
    });

    store.dispatches.forEach(disp => {
      const remBags = disp.remainingBags !== undefined ? Number(disp.remainingBags) : Number(disp.bags);
      const remEP = disp.remainingEndProduct !== undefined ? Number(disp.remainingEndProduct) : Number(disp.endProductWeight || disp.weight || 0);
      if (disp.status === 'storage_out' || disp.rateType === 'storage_out' || disp.status === 'partial_settled') {
        totalStoreOutBags += remBags; totalStoreOutEP += remEP;
        const prodKey = disp.product || 'Other';
        if (productStockMap.has(prodKey)) {
          const item = productStockMap.get(prodKey);
          item.storeOutBags += remBags; item.storeOutEP += remEP;
        }
      }
      if (disp.status === 'billed' || disp.status === 'cash_bill') {
        totalSalesValue += (Number(disp.netAmount) || Number(disp.billAmount) || 0);
        totalTcsAllTime += (Number(disp.tcsAmount) || 0);
        totalTdsAllTime += (Number(disp.tdsAmount) || 0);
        totalGstAllTime += (Number(disp.cgstAmount) || 0) + (Number(disp.sgstAmount) || 0) + (Number(disp.igstAmount) || 0);
      }
    });

    store.settlements.forEach(set => {
      const bill = Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0;
      if (set.settlementCategory === 'sales_storage') totalSalesValue += bill;
      else totalPurchasesValue += bill;
      totalTcsAllTime += (Number(set.tcsAmount) || 0);
      totalTdsAllTime += (Number(set.tdsAmount) || 0);
    });

    store.payments.forEach(p => {
      if (p.type === 'payment_paid' || !p.type) totalPaidAllTime += (Number(p.amount) || 0);
      else if (p.type === 'payment_received') totalReceivedAllTime += (Number(p.amount) || 0);
    });

    // Opening financial balances & party storage stock
    let totalOpeningPayable = 0;    // Credit opening balance (We owe party)
    let totalOpeningReceivable = 0; // Debit opening balance (Party owes us)
    let totalPartyOpeningStorageBags = 0;
    let totalPartyOpeningStorageEP = 0;

    (store.suppliers || []).forEach(s => {
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
    const openStockSettings = store.settings?.openingStock || {};
    let godownOpeningBags = Number(openStockSettings.coffeeBags) || 0;
    let godownOpeningEP = Number(openStockSettings.coffeeEP) || 0;

    (store.openingStockEntries || []).forEach(e => {
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

    const storageByProduct = Array.from(productStockMap.values()).map(item => {
      const netBags = Math.round((item.storeInBags - item.storeOutBags) * 100) / 100;
      const netEP = Math.round((item.storeInEP - item.storeOutEP) * 100) / 100;
      const avgOutturn = item.storeInWeight > 0 ? Math.round(((item.storeInEP / (item.storeInWeight / 50))) * 100) / 100 : 0;
      return { ...item, netBags, netEP, avgOutturn };
    }).filter(item => item.storeInBags > 0 || item.storeOutBags > 0 || item.netBags > 0);

    const activePurchaseCommitments = store.commitments.filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active');
    const activeSaleCommitments = store.commitments.filter(c => c.category === 'sale' && c.status === 'active');

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
        avgRate: billedArrivalsCount > 0 ? Math.round((totalRateSum / billedArrivalsCount) * 100) / 100 : 0,
        arrivalsCount: arrivals.length,
        dispatchesCount: dispatches.length,
        settlementsCount: settlements.length
      },
      global: {
        totalSuppliers: store.suppliers.length,
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
      recentArrivals: (store.arrivals || []).slice(-8).reverse(),
      recentDispatches: (store.dispatches || []).slice(-8).reverse(),
      recentSettlements: (store.settlements || []).slice(-8).reverse()
    };
  }

  if (action === 'settings:get') return store.settings || {};
  if (action === 'settings:update') {
    store.settings = { ...store.settings, ...(payload || {}) };
    saveBrowserStore(store);
    return store.settings;
  }

  if (action === 'fy:summary') {
    const fys = new Set();
    const getFy = (d) => {
      if (!d) return '2026-2027';
      const parts = d.split('-');
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      if (isNaN(yr) || isNaN(mo)) return '2026-2027';
      return mo >= 4 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
    };
    (store.arrivals || []).forEach(a => fys.add(getFy(a.date)));
    (store.dispatches || []).forEach(d => fys.add(getFy(d.date)));
    (store.settlements || []).forEach(s => fys.add(getFy(s.date)));
    (store.payments || []).forEach(p => fys.add(getFy(p.date)));
    (store.millingLogs || []).forEach(m => fys.add(getFy(m.date)));
    fys.add('2026-2027');
    const sortedFys = Array.from(fys).sort().reverse();
    const closedList = store.settings?.closedFiscalYears || [];

    const years = sortedFys.map(fy => {
      const closedRecord = closedList.find(c => c.fy === fy);
      const arrivalsCount = (store.arrivals || []).filter(a => getFy(a.date) === fy).length;
      const dispatchesCount = (store.dispatches || []).filter(d => getFy(d.date) === fy).length;
      const settlementsCount = (store.settlements || []).filter(s => getFy(s.date) === fy).length;
      const paymentsCount = (store.payments || []).filter(p => getFy(p.date) === fy).length;
      const millingCount = (store.millingLogs || []).filter(m => getFy(m.date) === fy).length;
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
        hasArchive: !!closedRecord
      };
    });

    return {
      currentFy: '2026-2027',
      availableFiscalYears: sortedFys,
      closedFiscalYears: closedList,
      years
    };
  }

  if (action === 'fy:close') {
    if (!store.settings) store.settings = {};
    if (!store.settings.closedFiscalYears) store.settings.closedFiscalYears = [];
    const fyToClose = payload.fyToClose;
    let lockedCount = 0;
    const lockItem = (i) => {
      const parts = (i.date || '').split('-');
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      const itemFy = (!isNaN(yr) && !isNaN(mo)) ? (mo >= 4 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`) : '2026-2027';
      if (itemFy === fyToClose) {
        i.isLocked = true;
        i.fy = fyToClose;
        lockedCount++;
      }
    };
    (store.arrivals || []).forEach(lockItem);
    (store.dispatches || []).forEach(lockItem);
    (store.settlements || []).forEach(lockItem);
    (store.payments || []).forEach(lockItem);
    (store.millingLogs || []).forEach(lockItem);

    const record = {
      fy: fyToClose,
      closedAt: new Date().toISOString(),
      notes: payload.notes || '',
      lockedCount
    };
    const existIdx = store.settings.closedFiscalYears.findIndex(f => f.fy === fyToClose);
    if (existIdx !== -1) {
      store.settings.closedFiscalYears[existIdx] = record;
    } else {
      store.settings.closedFiscalYears.push(record);
    }
    saveBrowserStore(store);
    return { success: true, closedFy: fyToClose, lockedTransactionsCount: lockedCount };
  }

  if (action === 'fy:reopen') {
    if (store.settings?.closedFiscalYears) {
      store.settings.closedFiscalYears = store.settings.closedFiscalYears.filter(f => f.fy !== payload.fy);
    }
    const unlockItem = (i) => {
      if (i.fy === payload.fy) i.isLocked = false;
    };
    (store.arrivals || []).forEach(unlockItem);
    (store.dispatches || []).forEach(unlockItem);
    (store.settlements || []).forEach(unlockItem);
    (store.payments || []).forEach(unlockItem);
    (store.millingLogs || []).forEach(unlockItem);
    saveBrowserStore(store);
    return { success: true, reopenedFy: payload.fy };
  }

  if (action === 'fy:export-archive') {
    const fy = payload?.fy;
    const getFy = (d) => {
      if (!d) return '2026-2027';
      const parts = d.split('-');
      const yr = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      if (isNaN(yr) || isNaN(mo)) return '2026-2027';
      return mo >= 4 ? `${yr}-${yr + 1}` : `${yr - 1}-${yr}`;
    };
    const archiveData = {
      financialYear: fy,
      exportedAt: new Date().toISOString(),
      data: {
        arrivals: (store.arrivals || []).filter(a => (a.fy || getFy(a.date)) === fy),
        dispatches: (store.dispatches || []).filter(d => (d.fy || getFy(d.date)) === fy),
        settlements: (store.settlements || []).filter(s => (s.fy || getFy(s.date)) === fy),
        payments: (store.payments || []).filter(p => (p.fy || getFy(p.date)) === fy),
        millingLogs: (store.millingLogs || []).filter(m => (m.fy || getFy(m.date)) === fy)
      }
    };
    return { success: true, fy, content: JSON.stringify(archiveData, null, 2) };
  }

  if (action === 'arrivals:bulk-add') {
    const items = payload?.items || payload || [];
    const created = items.map((item, idx) => ({
      id: 'arr_' + Date.now() + '_' + idx,
      arrivalNo: 'ARR-' + String((store.arrivals || []).length + idx + 1).padStart(4, '0'),
      date: item.date || new Date().toISOString().split('T')[0],
      ...item
    }));
    store.arrivals = [...(store.arrivals || []), ...created];
    saveBrowserStore(store);
    return { success: true, count: created.length, items: created };
  }

  if (action === 'dispatches:bulk-add') {
    const items = payload?.items || payload || [];
    const created = items.map((item, idx) => ({
      id: 'disp_' + Date.now() + '_' + idx,
      dispatchNo: 'DSP-' + String((store.dispatches || []).length + idx + 1).padStart(4, '0'),
      date: item.date || new Date().toISOString().split('T')[0],
      ...item
    }));
    store.dispatches = [...(store.dispatches || []), ...created];
    saveBrowserStore(store);
    return { success: true, count: created.length, items: created };
  }

  if (action === 'suppliers:bulk-add') {
    const items = payload?.items || payload || [];
    const created = items.map((item, idx) => ({
      id: 'sup_' + Date.now() + '_' + idx,
      createdAt: new Date().toISOString(),
      ...item
    }));
    store.suppliers = [...(store.suppliers || []), ...created];
    saveBrowserStore(store);
    return { success: true, count: created.length, items: created };
  }

  if (action === 'payments:bulk-add') {
    const items = payload?.items || payload || [];
    const created = items.map((item, idx) => ({
      id: 'pay_' + Date.now() + '_' + idx,
      paymentNo: 'PAY-' + String((store.payments || []).length + idx + 1).padStart(4, '0'),
      date: item.date || new Date().toISOString().split('T')[0],
      ...item
    }));
    store.payments = [...(store.payments || []), ...created];
    saveBrowserStore(store);
    return { success: true, count: created.length, items: created };
  }

  return { success: true };
}
