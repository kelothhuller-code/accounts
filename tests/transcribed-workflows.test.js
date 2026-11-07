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
