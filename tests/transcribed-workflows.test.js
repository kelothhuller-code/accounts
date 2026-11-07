const test = require('node:test');
const assert = require('node:assert/strict');
const { isolate, party } = require('./support');
const facts = require('./fixtures/transcribedRealRecords');

test('transcribed fixtures are labeled and do not post the unposted invoices', () => {
  assert.match(facts.TRANSCRIPT_LABEL, /not-live-store/);
  assert.equal(facts.kamadhenu.doNotPost, true);
  assert.equal(facts.cp.unpostedInvoice.doNotPost, true);
  assert.equal(facts.salamToHashim.verifiedIds, null);
});

test('transcribed purchase commitments, Angel storage, and Satish tax-zero bill', () => {
  const { db, state } = isolate();
  const parties = {};
  for (const name of ['Deepak', 'YAS', 'NATESH', 'Angel', 'Satish']) parties[name] = party(db, name);

  for (const row of facts.commitments) {
    const created = db.addCommitment({
      supplierId: parties[row.party].id,
      supplierName: row.party,
      date: row.date || '2026-11-01',
      product: row.product,
      quantity: row.quantity,
      rate: row.rate,
      type: row.type,
      category: row.category,
      legacyDisplayNo: row.legacyDisplayNo
    }, false);
    assert.equal(created.fulfilledQty, 0);
    assert.equal(created.remainingQty, row.quantity);
    assert.equal(created.rate, row.rate);
    assert.notEqual(created.id, row.legacyDisplayNo);
  }
  const natesh = state.commitments.find(c => c.legacyDisplayNo === 'COM-PUR0171');
  assert.equal(natesh.date, '2026-11-06');

  const angelCom = db.addCommitment({
    supplierId: parties.Angel.id,
    supplierName: 'Angel',
    date: '2026-11-01',
    product: 'RCA',
    quantity: facts.angel.commitment.quantity,
    rate: facts.angel.commitment.rate,
    type: 'end_product',
    category: 'purchase',
    legacyDisplayNo: facts.angel.commitment.legacyDisplayNo,
    notes: `previous rate ${facts.angel.commitment.previousRate}`
  }, false);
  const angelArr = db.addArrival({
    supplierId: parties.Angel.id,
    supplierName: 'Angel',
    date: facts.angel.date,
    product: facts.angel.product,
    vehicleNo: facts.angel.vehicleNo,
    weight: facts.angel.weight,
    bags: facts.angel.bags,
    calculationBasis: 'direct',
    rateType: 'storage',
    rate: 0,
    legacyDisplayNo: facts.angel.legacyDisplayNo,
    tdsRate: 0,
    tcsRate: 0
  }, false);
  assert.equal(angelArr.bags, 200);
  assert.notEqual(angelArr.bags, facts.angel.weight / 50);
  assert.equal(angelArr.status, 'storage');
  assert.equal(angelArr.netAmount, 0);
  assert.equal(angelArr.rate, 0);
  assert.equal(state.commitments.find(c => c.id === angelCom.id).fulfilledQty, 0);

  const satishCom = db.addCommitment({
    supplierId: parties.Satish.id,
    supplierName: 'Satish',
    date: '2026-11-06',
    product: 'RC raw',
    quantity: facts.satish.commitment.quantity,
    rate: facts.satish.rate,
    type: 'bags',
    category: 'purchase',
    legacyDisplayNo: facts.satish.commitment.legacyDisplayNo
  }, false);
  const satishArr = db.addArrival({
    supplierId: parties.Satish.id,
    supplierName: 'Satish',
    date: '2026-11-06',
    product: 'RC raw',
    weight: facts.satish.weight,
    bags: facts.satish.bags,
    outturn: facts.satish.outturn,
    outturnType: facts.satish.outturnType,
    calculationBasis: 'end_product',
    rateUnit: 'per_kg_ep',
    rate: facts.satish.rate,
    billType: 'gst_bill',
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    tdsRate: 0,
    tcsRate: 0,
    tdsAmount: 0,
    tcsAmount: 0,
    commitmentId: satishCom.id,
    rateType: 'commitment',
    legacyDisplayNo: facts.satish.legacyDisplayNo
  }, false);
  assert.equal(satishArr.endProductWeight, facts.satish.endProduct);
  assert.equal(satishArr.bags, 150);
  assert.equal(satishArr.netAmount, facts.satish.net);
  assert.equal(satishArr.billAmount, facts.satish.gross);
  assert.equal(satishArr.cgstAmount + satishArr.sgstAmount + satishArr.igstAmount, 0);
  const satishComAfter = state.commitments.find(c => c.id === satishCom.id);
  assert.equal(satishComAfter.fulfilledQty, 150);
  assert.equal(satishComAfter.remainingQty, 0);
  assert.notEqual(satishArr.taxTreatment === 'none' && satishArr.netAmount === 0, true);
});

test('graded direct bill, display-number collision, cutting, and partial commitment', () => {
  const { db, state } = isolate();
  const saidurga = party(db, 'Saidurga');
  const cp = party(db, 'CP');
  const sale = db.addCommitment({
    supplierId: saidurga.id,
    supplierName: 'Saidurga',
    date: '2026-11-06',
    product: 'RCA',
    quantity: 20000,
    rate: 387.5,
    type: 'end_product',
    category: 'sale',
    legacyDisplayNo: facts.saidurga.commitmentLegacyDisplayNo
  }, false);
  const billed = db.addDispatch({
    supplierId: saidurga.id,
    supplierName: 'Saidurga',
    date: facts.saidurga.date,
    product: 'RCA',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: facts.saidurga.weight,
    rate: facts.saidurga.rate,
    billType: 'gst_bill',
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    tdsAmount: 0,
    tcsAmount: 0,
    commitmentId: sale.id,
    rateType: 'commitment',
    legacyDisplayNo: facts.saidurga.legacyDisplayNo
  }, false);
  assert.equal(billed.netAmount, facts.saidurga.gross);
  assert.equal(state.commitments.find(c => c.id === sale.id).remainingQty, 5000);
  assert.equal(state.commitments.find(c => c.id === sale.id).status, 'active');

  const physical = db.addDispatch({
    supplierId: cp.id,
    supplierName: 'CP',
    date: facts.cp.date,
    vehicleNo: facts.cp.vehicleNo,
    product: 'RCA',
    calculationBasis: 'direct',
    weight: facts.cp.physicalWeight,
    bags: 0,
    rateType: 'storage_out',
    cuttingKg: facts.cp.cuttingKg,
    legacyDisplayNo: facts.cp.legacyDisplayNo,
    tdsRate: 0,
    tcsRate: 0
  }, false);
  assert.equal(physical.weight, 7688);
  assert.equal(physical.cuttingKg, 35);
  assert.equal(physical.billableWeight, 7653);
  assert.equal(physical.status, 'storage_out');
  assert.equal(physical.netAmount, 0);
  assert.notEqual(physical.id, billed.id);
  assert.equal(physical.legacyDisplayNo, billed.legacyDisplayNo);
  const found = db.getDispatches({ search: 'DSP0159' });
  assert.equal(found.length, 2);

  const unposted = state.dispatches.filter(d => d.legacyDisplayNo === '231' || (d.weight === 7653 && d.rate === 385));
  assert.equal(unposted.length, 0);
});

test('settle Angel storage arrival against COM-PUR-0082 commitment', () => {
  const { db, state } = isolate();
  const angel = party(db, 'Angel');

  const angelCom = db.addCommitment({
    supplierId: angel.id,
    supplierName: 'Angel',
    date: '2026-10-27',
    product: 'RCA',
    quantity: facts.angel.commitment.quantity,
    rate: facts.angel.commitment.rate,
    type: 'end_product',
    category: 'purchase',
    legacyDisplayNo: facts.angel.commitment.legacyDisplayNo
  }, false);

  const angelArr = db.addArrival({
    supplierId: angel.id,
    supplierName: 'Angel',
    date: facts.angel.date,
    product: facts.angel.product,
    vehicleNo: facts.angel.vehicleNo,
    weight: facts.angel.weight,
    bags: facts.angel.bags,
    calculationBasis: 'direct',
    rateType: 'storage',
    rate: 0,
    legacyDisplayNo: facts.angel.legacyDisplayNo,
    tdsRate: 0,
    tcsRate: 0
  }, false);

  assert.equal(angelArr.bags, 200);
  assert.equal(angelArr.weight, 15000);
  assert.equal(angelArr.remainingBags, 200);
  assert.equal(angelArr.remainingEndProduct, 15000);

  // Settle 200 bags / 15,000 kg against COM-PUR-0082
  const settlement = db.settleStorageArrivals({
    supplierId: angel.id,
    supplierName: 'Angel',
    settlementCategory: 'purchase_storage',
    arrivalIds: [angelArr.id],
    commitmentId: angelCom.id,
    settleMode: 'end_product',
    settleBags: 200,
    settleWeight: 15000,
    settleEndProduct: 15000,
    agreedOutturn: 50,
    isDirectWeight: true,
    settlementRate: facts.angel.commitment.rate,
    rateUnit: 'per_kg_ep',
    settlementGrossAmount: 15000 * 384.6,
    cgstRate: 0,
    cgstAmount: 0,
    sgstRate: 0,
    sgstAmount: 0,
    tcsRate: 0,
    tcsAmount: 0,
    tdsRate: 0.1,
    tdsAmount: 5769,
    settlementNetAmount: 5763231,
    date: '2026-11-06',
    notes: 'Settled Angel RCA 200 bags against COM-PUR-0082'
  });

  assert.equal(settlement.settledBags, 200);
  assert.equal(settlement.settledWeight, 15000);
  assert.equal(settlement.settledEndProduct, 15000);
  assert.equal(settlement.settlementGrossAmount, 5769000);
  assert.equal(settlement.tdsAmount, 5769);
  assert.equal(settlement.settlementNetAmount, 5763231);

  // Check arrival status and remaining quantities
  const updatedArr = state.arrivals.find(a => a.id === angelArr.id);
  assert.equal(updatedArr.status, 'settled');
  assert.equal(updatedArr.remainingBags, 0);
  assert.equal(updatedArr.remainingEndProduct, 0);
  assert.equal(updatedArr.settledBags, 200);
  assert.equal(updatedArr.settledEndProduct, 15000);

  // Check commitment deduction
  const updatedCom = state.commitments.find(c => c.id === angelCom.id);
  assert.equal(updatedCom.fulfilledQty, 15000);
  assert.equal(updatedCom.remainingQty, 5000);
  assert.equal(updatedCom.status, 'active');
});

test('updateArrival transitions storage arrival to commitment bill', () => {
  const { db, state } = isolate();
  const angel = party(db, 'Angel 2');

  const com = db.addCommitment({
    supplierId: angel.id,
    supplierName: 'Angel 2',
    date: '2026-10-27',
    product: 'RCA',
    quantity: 20000,
    rate: 384.6,
    type: 'end_product',
    category: 'purchase'
  }, false);

  const arr = db.addArrival({
    supplierId: angel.id,
    supplierName: 'Angel 2',
    date: '2026-11-06',
    product: 'RCA',
    weight: 15000,
    bags: 200,
    calculationBasis: 'direct',
    rateType: 'storage',
    rate: 0
  }, false);

  assert.equal(arr.status, 'storage');
  assert.equal(arr.netAmount, 0);

  // Update arrival from storage to commitment
  const updated = db.updateArrival(arr.id, {
    rateType: 'commitment',
    commitmentId: com.id,
    rate: 384.6,
    tdsRate: 0.1,
    tcsRate: 0
  });

  assert.equal(updated.status, 'billed');
  assert.equal(updated.rateType, 'commitment');
  assert.equal(updated.commitmentId, com.id);
  assert.equal(updated.billAmount, 5769000);
  assert.equal(updated.tdsAmount, 5769);
  assert.equal(updated.netAmount, 5763231);

  // Commitment fulfilledQty should be updated
  const comAfter = state.commitments.find(c => c.id === com.id);
  assert.equal(comAfter.fulfilledQty, 15000);
  assert.equal(comAfter.remainingQty, 5000);
});
