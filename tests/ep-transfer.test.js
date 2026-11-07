const test = require('node:test');
const assert = require('node:assert/strict');
const { isolate, party } = require('./support');
const { salamToHashim } = require('./fixtures/transcribedRealRecords');

function storageArrival(db, supplier, extra) {
  const ep = extra.endProductWeight;
  const weight = extra.weight != null ? extra.weight : ep;
  return db.addArrival({
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: extra.date || '2026-10-01',
    product: extra.product || 'RC EP',
    weight,
    bags: extra.bags,
    outturn: extra.outturn != null ? extra.outturn : 50,
    outturnType: 'per_50kg',
    calculationBasis: 'end_product',
    rateType: 'storage',
    rate: 0,
    tdsRate: 0,
    tcsRate: 0
  }, false);
}

function storageEp(db, id) {
  return db.getSupplierDetails(id).summary.storageEndProduct;
}

test('SALAM quantities move once, default to no money, and delete restores them', () => {
  const { db } = isolate();
  const salam = party(db, 'SALAM');
  const hashim = party(db, 'HASHIM');
  const other = party(db, 'Witness');
  const source = storageArrival(db, salam, { bags: 134, weight: 9740, endProductWeight: 9740, date: '2026-10-01' });
  storageArrival(db, other, { bags: 10, weight: 500, endProductWeight: 500, date: '2026-09-01' });
  const beforeTotal = storageEp(db, salam.id) + storageEp(db, hashim.id) + storageEp(db, other.id);

  const transfer = db.addEpTransfer({
    fromPartyId: salam.id,
    toPartyId: hashim.id,
    date: '2026-11-06',
    product: 'RC EP',
    bags: 134,
    endProductWeight: 9740,
    rate: 99,
    notes: 'stock only'
  });

  assert.equal(transfer.endProductWeight, 9740);
  assert.equal(transfer.moneyMovement, false);
  assert.equal(transfer.transferValue, 0);
  assert.equal(transfer.rate, 0);
  assert.equal(transfer.weight, 9740);
  assert.equal(transfer.weightDefaultedToEp, true);
  const src = db.getArrivals().find(a => a.id === source.id);
  assert.equal(src.remainingEndProduct, 0);
  assert.equal(src.remainingBags, 0);
  const dest = db.getArrivals().find(a => a.transferId === transfer.id);
  assert.equal(dest.supplierId, hashim.id);
  assert.equal(dest.remainingEndProduct, 9740);
  assert.equal(dest.rate, 0);
  assert.equal(dest.status, 'storage');
  assert.equal(dest.netAmount, 0);
  const afterTotal = storageEp(db, salam.id) + storageEp(db, hashim.id) + storageEp(db, other.id);
  assert.equal(afterTotal, beforeTotal);
  assert.equal(storageEp(db, salam.id), 0);
  assert.equal(storageEp(db, hashim.id), 9740);
  assert.equal(db.getSupplierDetails(salam.id).summary.transferFinancialNet || 0, 0);

  const witness = db.getArrivals().find(a => a.supplierId === other.id);
  db.deleteEpTransfer(transfer.id);
  assert.equal(db.getArrivals().find(a => a.id === source.id).remainingEndProduct, 9740);
  assert.equal(db.getArrivals().find(a => a.id === source.id).remainingBags, 134);
  assert.equal(db.getArrivals().some(a => a.transferId === transfer.id), false);
  assert.equal(db.getArrivals().find(a => a.id === witness.id).remainingEndProduct, 500);
  assert.equal(storageEp(db, salam.id) + storageEp(db, hashim.id), beforeTotal - 500);
});

test('missing weight defaults to EP and not bags times 50', () => {
  const { db } = isolate();
  const salam = party(db, 'SALAM');
  const hashim = party(db, 'HASHIM');
  storageArrival(db, salam, { bags: 134, endProductWeight: 9740, weight: 9740 });
  const transfer = db.addEpTransfer({
    fromPartyId: salam.id,
    toPartyId: hashim.id,
    product: 'RC EP',
    bags: 134,
    endProductWeight: 9740
  });
  assert.equal(transfer.weight, 9740);
  assert.equal(transfer.weightDefaultedToEp, true);
  assert.notEqual(transfer.weight, 134 * 50);
  assert.throws(() => db.addEpTransfer({
    fromPartyId: salam.id,
    toPartyId: hashim.id,
    product: 'RC EP',
    bags: 10
  }), /End-product weight is required/);
});

test('lots allocate oldest first unless a lot is selected, and later settlement blocks delete', () => {
  const { db, state } = isolate();
  const from = party(db, 'From');
  const to = party(db, 'To');
  const older = storageArrival(db, from, { date: '2026-01-01', bags: 10, weight: 1000, endProductWeight: 1000 });
  const newer = storageArrival(db, from, { date: '2026-06-01', bags: 20, weight: 5000, endProductWeight: 5000 });
  const other = storageArrival(db, to, { date: '2026-01-01', bags: 1, weight: 100, endProductWeight: 100, product: 'RC EP' });
  const transfer = db.addEpTransfer({
    fromPartyId: from.id,
    toPartyId: to.id,
    product: 'RC EP',
    endProductWeight: 1500,
    bags: 12
  });
  assert.equal(transfer.allocations[0].lotId, older.id);
  assert.equal(db.getArrivals().find(a => a.id === older.id).remainingEndProduct, 0);
  assert.equal(db.getArrivals().find(a => a.id === newer.id).remainingEndProduct, 4500);

  const picked = db.addEpTransfer({
    fromPartyId: from.id,
    toPartyId: to.id,
    product: 'RC EP',
    endProductWeight: 400,
    lotIds: [newer.id]
  });
  assert.deepEqual(picked.allocations.map(a => a.lotId), [newer.id]);

  const numbers = [transfer.transferNo, picked.transferNo];
  db.deleteEpTransfer(picked.id);
  const third = db.addEpTransfer({
    fromPartyId: from.id,
    toPartyId: to.id,
    product: 'RC EP',
    endProductWeight: 100,
    lotIds: [newer.id]
  });
  assert.ok(!numbers.includes(third.transferNo));
  const seq = numbers.concat(third.transferNo).map(n => Number(n.slice(4)));
  assert.ok(seq[1] > seq[0] && seq[2] > seq[1]);

  const dest = state.arrivals.find(a => a.id === transfer.destArrivalId);
  dest.settlementIds = ['set_later'];
  dest.settledEndProduct = 100;
  dest.status = 'partial_settled';
  const untouched = db.getArrivals().find(a => a.id === other.id).remainingEndProduct;
  assert.throws(() => db.deleteEpTransfer(transfer.id), /later settlement/);
  assert.equal(db.getArrivals().find(a => a.id === other.id).remainingEndProduct, untouched);
  assert.equal(state.epTransfers.some(t => t.id === transfer.id), true);
});

test('legacy linked transfer is counted once and a manual SALAM pair is not reposted', () => {
  const { db, state } = isolate();
  const salam = party(db, salamToHashim.fromParty);
  const hashim = party(db, salamToHashim.toParty);
  const source = storageArrival(db, salam, {
    bags: salamToHashim.bags,
    weight: salamToHashim.endProduct,
    endProductWeight: salamToHashim.endProduct
  });
  const legacyId = 'trf_legacy_manual_shape';
  state.epTransfers.push({
    id: legacyId,
    transferNo: 'TRF-LEGACY',
    date: '2026-08-01',
    fromPartyId: salam.id,
    toPartyId: hashim.id,
    product: 'RC EP',
    bags: 134,
    weight: 9740,
    endProductWeight: 9740,
    rate: 0,
    transferValue: 0,
    notes: 'legacy linked'
  });
  state.dispatches.push({
    id: 'disp_legacy_out',
    dispatchNo: 'DISP-TRF-LEGACY',
    date: '2026-08-01',
    supplierId: salam.id,
    supplierName: salam.name,
    product: 'RC EP',
    bags: 134,
    weight: 9740,
    endProductWeight: 9740,
    status: 'storage_out',
    rateType: 'storage_out',
    rate: 0,
    netAmount: 0,
    transferId: legacyId
  });
  state.arrivals.push({
    id: 'arr_legacy_in',
    arrivalNo: 'ARR-TRF-LEGACY',
    date: '2026-08-01',
    supplierId: hashim.id,
    supplierName: hashim.name,
    product: 'RC EP',
    bags: 134,
    weight: 9740,
    endProductWeight: 9740,
    remainingEndProduct: 9740,
    remainingBags: 134,
    status: 'storage',
    rateType: 'storage',
    rate: 0,
    netAmount: 0,
    transferId: legacyId
  });
  assert.equal(storageEp(db, salam.id), 0);
  assert.equal(storageEp(db, hashim.id), 9740);

  state.dispatches.push({
    id: 'disp_hand_salam',
    date: '2026-09-01',
    supplierId: salam.id,
    supplierName: salam.name,
    product: 'RC EP',
    bags: 134,
    weight: 9740,
    endProductWeight: 9740,
    status: 'storage_out',
    rateType: 'storage_out',
    rate: 0,
    netAmount: 0,
    notes: salamToHashim.remark
  });
  state.arrivals.push({
    id: 'arr_hand_hashim',
    date: '2026-09-01',
    supplierId: hashim.id,
    supplierName: hashim.name,
    product: 'RC EP',
    bags: 134,
    weight: 9740,
    endProductWeight: 9740,
    remainingEndProduct: 9740,
    remainingBags: 134,
    status: 'storage',
    rateType: 'storage',
    rate: 0,
    netAmount: 0,
    notes: salamToHashim.remark
  });
  const recognized = db.findLegacyManualEpMove({
    fromPartyId: salam.id,
    toPartyId: hashim.id,
    endProductWeight: 9740,
    remarkNeedle: 'ARR0141'
  });
  assert.equal(recognized.recognized, true);
  assert.equal(recognized.pairs.some(p => p.sourceId === 'disp_hand_salam' && p.destId === 'arr_hand_hashim'), true);
  assert.equal(recognized.pairs.every(p => p.sourceId !== source.id), true);
  const countBefore = state.arrivals.length + state.dispatches.length + state.epTransfers.length;
  assert.throws(() => db.addEpTransfer({
    fromPartyId: salam.id,
    toPartyId: hashim.id,
    product: 'RC EP',
    bags: 134,
    endProductWeight: 9740,
    notes: salamToHashim.remark
  }), /legacy manual/i);
  assert.equal(state.arrivals.length + state.dispatches.length + state.epTransfers.length, countBefore);
});

test('optional money movement is explicit', () => {
  const { db } = isolate();
  const from = party(db, 'Money From');
  const to = party(db, 'Money To');
  storageArrival(db, from, { endProductWeight: 100, weight: 100, bags: 2 });
  const transfer = db.addEpTransfer({
    fromPartyId: from.id,
    toPartyId: to.id,
    product: 'RC EP',
    endProductWeight: 100,
    moneyMovement: true,
    rate: 10
  });
  assert.equal(transfer.transferValue, 1000);
  assert.equal(db.getSupplierDetails(from.id).summary.transferFinancialNet, -1000);
  assert.equal(db.getSupplierDetails(to.id).summary.transferFinancialNet, 1000);
  const dest = db.getArrivals().find(a => a.transferId === transfer.id);
  assert.equal(dest.netAmount, 0);
  assert.equal(dest.status, 'storage');
});
