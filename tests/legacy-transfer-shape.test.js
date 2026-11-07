const test = require('node:test');
const assert = require('node:assert/strict');
const { isolate } = require('./support');

test('a settled manual transfer shape is not paired, reposted, or changed on read', () => {
  const { db, state } = isolate();
  const sourceParty = db.addSupplier({ name: 'Shape Source' }, false);
  const destParty = db.addSupplier({ name: 'Shape Dest' }, false);
  state.arrivals.push({
    id: 'arr_shape_source',
    arrivalNo: 'ARR-SHAPE-1',
    date: '2026-10-30',
    supplierId: sourceParty.id,
    supplierName: sourceParty.name,
    product: 'RC EP',
    status: 'transferred',
    rateType: 'storage',
    weight: 9740,
    bags: 134,
    endProductWeight: 9740,
    remainingEndProduct: 0,
    remainingBags: 0,
    settledEndProduct: 0,
    rate: 0,
    netAmount: 0,
    billAmount: 0
  });
  state.dispatches.push({
    id: 'disp_shape_out',
    dispatchNo: 'DSP-SHAPE-1',
    date: '2026-11-04',
    supplierId: sourceParty.id,
    supplierName: sourceParty.name,
    product: 'RC EP',
    status: 'transferred',
    rateType: 'transfer',
    weight: 9740,
    bags: 134,
    endProductWeight: 9740,
    remainingEndProduct: 0,
    remainingBags: 0,
    rate: 0,
    netAmount: 0,
    billAmount: 0
  });
  state.arrivals.push({
    id: 'arr_shape_target',
    arrivalNo: 'ARR-SHAPE-2',
    date: '2026-11-04',
    supplierId: destParty.id,
    supplierName: destParty.name,
    product: 'RC EP',
    status: 'settled',
    rateType: 'storage',
    weight: 9740,
    bags: 134,
    endProductWeight: 9740,
    remainingEndProduct: 0,
    remainingBags: 0,
    settledEndProduct: 9740,
    settledBags: 134,
    settlementIds: ['set_shape'],
    rate: 0,
    netAmount: 0,
    billAmount: 0
  });
  const before = JSON.stringify({
    arrivals: state.arrivals,
    dispatches: state.dispatches,
    epTransfers: state.epTransfers
  });
  const sourceLedger = db.getSupplierDetails(sourceParty.id).summary;
  const destLedger = db.getSupplierDetails(destParty.id).summary;
  assert.equal(sourceLedger.storageEndProduct, 0);
  assert.equal(destLedger.storageEndProduct, 0);
  assert.equal(sourceLedger.totalSalesBilled, 0);
  assert.equal(destLedger.totalPurchasesBilled, 0);
  assert.equal(sourceLedger.epTransferredOut, 0);
  const look = db.findLegacyManualEpMove({
    fromPartyId: sourceParty.id,
    toPartyId: destParty.id,
    endProductWeight: 9740
  });
  assert.equal(look.paired, false);
  assert.equal(look.recognized, false);
  assert.throws(() => db.addEpTransfer({
    fromPartyId: sourceParty.id,
    toPartyId: destParty.id,
    product: 'RC EP',
    endProductWeight: 9740,
    bags: 134,
    weight: 9740
  }), /Insufficient/);
  assert.deepEqual(db.deleteEpTransfer('trf_missing'), { success: true });
  assert.equal(JSON.stringify({
    arrivals: state.arrivals,
    dispatches: state.dispatches,
    epTransfers: state.epTransfers
  }), before);
  assert.equal(state.epTransfers.length, 0);
  assert.equal(state.arrivals.find(a => a.id === 'arr_shape_target').settledEndProduct, 9740);
  assert.equal(state.arrivals.find(a => a.id === 'arr_shape_target').status, 'settled');
});
