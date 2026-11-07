const test = require('node:test');
const assert = require('node:assert/strict');
const { isolate, party } = require('./support');
const { computeDocumentTax, componentTax } = require('../shared/gst.cjs');
const { kamadhenu } = require('./fixtures/transcribedRealRecords');

test('split GST and aggregate IGST differ by one paise on the Kamadhenu taxable value', () => {
  const intra = computeDocumentTax({
    billType: 'gst_bill',
    taxableAmount: kamadhenu.taxable,
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5,
    tdsAmount: 0,
    tcsAmount: 0
  });
  const inter = computeDocumentTax({
    billType: 'gst_bill',
    taxableAmount: kamadhenu.taxable,
    taxTreatment: 'inter',
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5,
    tdsAmount: 0,
    tcsAmount: 0
  });
  assert.equal(intra.taxTreatment, 'intra');
  assert.equal(intra.netAmount, kamadhenu.expectedIntraNet);
  assert.equal(intra.cgstAmount + intra.sgstAmount, 4543.12);
  assert.equal(intra.igstAmount, 0);
  assert.equal(inter.igstAmount, 4543.13);
  assert.equal(Math.round((inter.gstTotal - intra.gstTotal) * 100) / 100, 0.01);
  assert.notEqual(intra.netAmount, kamadhenu.badPreviewNet);
});

test('dispatch save recomputes net and ignores a doubled submitted net', () => {
  const { db } = isolate();
  const customer = party(db, 'Kamadhenu Preview');
  const saved = db.addDispatch({
    supplierId: customer.id,
    supplierName: customer.name,
    date: '2026-11-06',
    product: 'Husk',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: 12115,
    bags: 0,
    rate: 7.5,
    rateType: 'fixed',
    billType: 'gst_bill',
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5,
    tdsRate: 0,
    tcsRate: 0,
    tdsAmount: 0,
    tcsAmount: 0,
    netAmount: kamadhenu.badPreviewNet,
    billAmount: kamadhenu.badPreviewNet
  }, false);
  assert.equal(saved.netAmount, 95405.62);
  assert.equal(saved.billAmount, 95405.62);
  assert.equal(saved.igstAmount, 0);
  assert.equal(saved.taxTreatment, 'intra');
  assert.equal(saved.submittedNetAmountIgnored, kamadhenu.badPreviewNet);
  const ledger = db.getSupplierDetails(customer.id).summary;
  assert.equal(ledger.totalSalesBilled, 95405.62);
});

test('explicit interstate treatment uses IGST only', () => {
  const { db } = isolate();
  const customer = party(db, 'Interstate Buyer');
  const saved = db.addDispatch({
    supplierId: customer.id,
    supplierName: customer.name,
    date: '2026-11-06',
    product: 'Husk',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: 12115,
    rate: 7.5,
    billType: 'gst_bill',
    taxTreatment: 'inter',
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5,
    tdsAmount: 0,
    tcsAmount: 0
  }, false);
  assert.equal(saved.taxTreatment, 'inter');
  assert.equal(saved.cgstAmount, 0);
  assert.equal(saved.sgstAmount, 0);
  assert.equal(saved.igstAmount, 4543.13);
  assert.equal(saved.netAmount, 95405.63);
});

test('ambiguous rates are rejected instead of summed', () => {
  assert.throws(() => computeDocumentTax({
    billType: 'gst_bill',
    taxableAmount: 1000,
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 12
  }), /ambiguous/i);
});

test('TDS and TCS stay deductible from the recomputed bill', () => {
  const { db } = isolate();
  const supplier = party(db, 'Tax Deduction Party');
  const saved = db.addArrival({
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: '2026-11-06',
    product: 'RC raw',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: 1000,
    bags: 20,
    rate: 10,
    billType: 'gst_bill',
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 0,
    tdsRate: 0.1,
    tcsRate: 0.1
  }, false);
  const taxable = 10000;
  const cgst = componentTax(taxable, 2.5);
  const sgst = componentTax(taxable, 2.5);
  const tds = componentTax(taxable, 0.1);
  const tcs = componentTax(taxable, 0.1);
  assert.equal(saved.taxableAmount, taxable);
  assert.equal(saved.cgstAmount, cgst);
  assert.equal(saved.sgstAmount, sgst);
  assert.equal(saved.tdsAmount, tds);
  assert.equal(saved.tcsAmount, tcs);
  assert.equal(saved.netAmount, Math.round((taxable + cgst + sgst - tds - tcs) * 100) / 100);
  assert.equal(saved.igstAmount, 0);
});

test('omitted arrival TCS still uses the existing default rate', () => {
  const { db } = isolate();
  const supplier = party(db, 'Default TCS');
  const saved = db.addArrival({
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: '2026-11-01',
    product: 'RC raw',
    calculationBasis: 'direct',
    weight: 1000,
    bags: 20,
    rate: 10,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    tdsRate: 0,
    tdsAmount: 0
  }, false);
  assert.equal(saved.tcsRate, 0.1);
  assert.equal(saved.tcsAmount, 10);
  assert.equal(saved.netAmount, 9990);
});

test('historical doubled net is not rewritten on read or ledger', () => {
  const { db, state } = isolate();
  const supplier = party(db, 'Historical Doubled');
  state.dispatches.push({
    id: 'disp_historical_doubled',
    dispatchNo: 'DSP-OLD',
    date: '2026-10-01',
    supplierId: supplier.id,
    supplierName: supplier.name,
    product: 'Husk',
    weight: 12115,
    rate: 7.5,
    status: 'billed',
    billType: 'gst_bill',
    taxableAmount: 90862.5,
    cgstAmount: 2271.56,
    sgstAmount: 2271.56,
    igstAmount: 4543.13,
    billAmount: 99948.75,
    netAmount: 99948.75,
    tdsAmount: 0,
    tcsAmount: 0
  });
  const before = JSON.stringify(state.dispatches[0]);
  const ledger = db.getSupplierDetails(supplier.id).summary;
  assert.equal(ledger.totalSalesBilled, 99948.75);
  assert.equal(JSON.stringify(state.dispatches[0]), before);
  const edited = db.updateDispatch('disp_historical_doubled', { preserveStoredTax: true, remarks: 'note only' });
  assert.equal(edited.netAmount, 99948.75);
  assert.equal(edited.igstAmount, 4543.13);
});

test('settlement with only CGST and SGST matches the previous component sum', () => {
  const { db } = isolate();
  const supplier = party(db, 'Settle Party');
  const arrival = db.addArrival({
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: '2026-11-01',
    product: 'RC raw',
    weight: 500,
    bags: 10,
    outturn: 26,
    rateType: 'storage',
    calculationBasis: 'end_product'
  }, false);
  const settlement = db.settleStorageArrivals({
    supplierId: supplier.id,
    supplierName: supplier.name,
    arrivalIds: [arrival.id],
    settleMode: 'end_product',
    settleEndProduct: arrival.endProductWeight,
    settlementRate: 100,
    rateUnit: 'per_kg_ep',
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 0,
    tdsRate: 0,
    tcsRate: 0,
    date: '2026-11-02'
  });
  const gross = settlement.settlementGrossAmount;
  assert.equal(settlement.cgstAmount, componentTax(gross, 2.5));
  assert.equal(settlement.sgstAmount, componentTax(gross, 2.5));
  assert.equal(settlement.igstAmount, 0);
  assert.equal(settlement.settlementNetAmount, Math.round((gross + settlement.cgstAmount + settlement.sgstAmount) * 100) / 100);
  assert.equal(db.getDispatches().length, 0);
});

test('cash bill has no GST and a payment does not create a bill', () => {
  const { db, state } = isolate();
  const supplier = party(db, 'Cash Party');
  const beforeArrivals = state.arrivals.length;
  const beforeDispatches = state.dispatches.length;
  const pay = db.addPayment({
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: '2026-11-06',
    amount: 500,
    type: 'payment_paid'
  }, false);
  assert.ok(pay.id);
  assert.equal(state.arrivals.length, beforeArrivals);
  assert.equal(state.dispatches.length, beforeDispatches);
  const cash = db.addDispatch({
    supplierId: supplier.id,
    supplierName: supplier.name,
    date: '2026-11-06',
    product: 'RCA',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: 10,
    rate: 100,
    billType: 'cash_bill',
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5,
    tdsAmount: 0,
    tcsAmount: 0
  }, false);
  assert.equal(cash.taxTreatment, 'none');
  assert.equal(cash.cgstAmount, 0);
  assert.equal(cash.igstAmount, 0);
  assert.equal(cash.netAmount, 1000);
});
