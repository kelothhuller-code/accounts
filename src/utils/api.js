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

const BROWSER_STORAGE_KEY = 'coffee_mock_store_v2';
function getBrowserStore() {
  const data = localStorage.getItem(BROWSER_STORAGE_KEY);
  if (data) {
    try { return JSON.parse(data); } catch (e) {}
  }
  return {
    suppliers: [
      { id: 'sup_1', name: 'Estate Coffee Growers', phone: '9845012345', place: 'Chikmagalur', gst: '29ABCDE1234F1Z5', notes: 'Premium Arabica & Robusta', openingBalance: 0, openingBalanceType: 'credit' },
      { id: 'sup_2', name: 'Valley Hill Plantations', phone: '9448098765', place: 'Coorg', gst: '29FGHIJ5678K1Z3', notes: 'Robusta Cherry Specialist', openingBalance: 0, openingBalanceType: 'credit' },
    ],
    products: [
      { id: 'prod_rc_raw', code: 'RC_RAW', name: 'RC Raw', isMain: true, description: 'Robusta Cherry Raw Coffee' },
      { id: 'prod_rc_ep', code: 'RC_EP', name: 'RC EP', isMain: true, description: 'Robusta Cherry Clean / End Product' },
      { id: 'prod_ac_raw', code: 'AC_RAW', name: 'AC Raw', isMain: true, description: 'Arabica Cherry Raw Coffee' },
      { id: 'prod_husk', code: 'HUSK', name: 'Coffee Husk', isMain: true, description: 'Coffee Husk (2.5% CGST + 2.5% SGST)' },
      { id: 'prod_rc_a', code: 'RC_A', name: 'RC A', isMain: false, description: 'Robusta Cherry A Grade' },
      { id: 'prod_rc_b', code: 'RC_B', name: 'RC B', isMain: false, description: 'Robusta Cherry B Grade' },
      { id: 'prod_rc_c', code: 'RC_C', name: 'RC C', isMain: false, description: 'Robusta Cherry C Grade' },
      { id: 'prod_rc_aa', code: 'RC_AA', name: 'RC AA', isMain: false, description: 'Robusta Cherry AA Grade' },
      { id: 'prod_rc_pb', code: 'RC_PB', name: 'RC PB', isMain: false, description: 'Robusta Cherry Peaberry' },
      { id: 'prod_rc_og', code: 'RC_OG', name: 'RC OG', isMain: false, description: 'Robusta Cherry Ongoing/Other' },
      { id: 'prod_rc_bits', code: 'RC_BITS', name: 'RC Bits', isMain: false, description: 'Robusta Cherry Bits / Blacks' },
    ],
    arrivals: [],
    dispatches: [],
    commitments: [],
    settlements: [],
    payments: [],
    epTransfers: [],
    commitmentWashes: [],
    settings: {
      mongoUri: 'mongodb://127.0.0.1:27017/coffeetracker',
      defaultTcsRate: 0.1,
      defaultCgstRate: 2.5,
      defaultSgstRate: 2.5,
      companyName: 'Coffee Trading & Processing Co.',
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
  if (action === 'products:get') return store.products;
  if (action === 'suppliers:get') {
    return store.suppliers.map(s => ({
      ...s,
      totalRawWeight: 0, totalBags: 0, totalEndProduct: 0,
      totalDispatchWeight: 0, totalDispatchBags: 0, totalHuskWeight: 0, totalHuskBags: 0,
      storageBags: 0, storageWeight: 0, storageEndProduct: 0, storageAvgOutturn: 0,
      totalPurchasesBilled: 0, totalSalesBilled: 0, totalBilledAmount: 0, totalPaid: 0, totalReceived: 0,
      totalCgst: 0, totalSgst: 0, totalIgst: 0, totalTdsDeducted: 0, totalTcsDeducted: 0, netPayable: 0
    }));
  }
  if (action === 'suppliers:get-one') {
    const s = store.suppliers.find(x => x.id === payload.id);
    if (!s) return null;
    return {
      summary: s,
      arrivals: store.arrivals.filter(a => a.supplierId === payload.id),
      dispatches: store.dispatches.filter(d => d.supplierId === payload.id || d.partyId === payload.id),
      settlements: store.settlements.filter(st => st.supplierId === payload.id),
      payments: store.payments.filter(p => p.supplierId === payload.id),
      commitments: store.commitments.filter(c => c.supplierId === payload.id),
      epTransfers: store.epTransfers.filter(t => t.fromPartyId === payload.id || t.toPartyId === payload.id),
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
  if (action === 'stock:requirement-insight') {
    return {
      openingCoffeeEP: 0, totalArrivalEP: 0, totalDispatchEP: 0,
      totalStoreInEP: 0, totalStoreOutEP: 0, purchaseCommitmentsPendingEP: 0,
      saleCommitmentsPendingEP: 0, netPositionEP: 0, actionNeeded: 'BALANCED'
    };
  }
  if (action === 'dashboard:metrics') {
    return {
      daily: { totalWeight: 0, totalBags: 0, totalEndProduct: 0, totalBill: 0, avgRate: 0, arrivalsCount: 0, dispatchWeight: 0, dispatchBags: 0, dispatchValue: 0 },
      global: { totalSuppliers: store.suppliers.length, totalPurchasesValue: 0, totalSalesValue: 0, totalStorageBags: 0, totalStorageEP: 0, totalTcsAllTime: 0, totalTdsAllTime: 0, totalGstAllTime: 0, totalPaidAllTime: 0, totalReceivedAllTime: 0, netPayableGlobal: 0 }
    };
  }
  return { success: true };
}
