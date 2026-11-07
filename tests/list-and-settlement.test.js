const test = require('node:test');
const assert = require('node:assert/strict');
const { isolate, party } = require('./support');
const { componentTax } = require('../shared/gst.cjs');

test('paged arrivals keep global totals, filter, and newest-first order', () => {
  const { db } = isolate();
  const alpha = party(db, 'Alpha');
  const beta = party(db, 'Beta');
  for (let i = 0; i < 30; i++) {
    const owner = i % 2 === 0 ? alpha : beta;
    db.addArrival({
      supplierId: owner.id,
      supplierName: owner.name,
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      product: i % 3 === 0 ? 'RCA' : 'RC raw',
      calculationBasis: 'direct',
      weight: 100 + i,
      bags: 2,
      rate: 10,
      rateType: i % 5 === 0 ? 'storage' : 'fixed',
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      tdsAmount: 0,
      tcsAmount: 0,
      tdsRate: 0,
      tcsRate: 0
    }, false);
  }
  const full = db.getArrivals();
  const page = db.getArrivals({ page: 1, limit: 10, includeSummary: true });
  const page2 = db.getArrivals({ page: 2, limit: 10, includeSummary: true });
  assert.equal(page.items.length, 10);
  assert.equal(page.totalCount, 30);
  assert.equal(page.summary.count, 30);
  assert.equal(page.summary.main.rawWeight, full.reduce((sum, row) => sum + Number(row.weight), 0));
  assert.notDeepEqual(page.items.map(row => row.id), page2.items.map(row => row.id));
  assert.equal(page.items[0].id, full[0].id);
  assert.equal(page2.items[0].id, full[10].id);

  const filtered = db.getArrivals({ search: 'Beta', page: 1, limit: 5, includeSummary: true });
  const filteredAll = db.getArrivals({ search: 'Beta' });
  assert.equal(filtered.totalCount, filteredAll.length);
  assert.equal(filtered.summary.count, filteredAll.length);
  assert.ok(filtered.totalCount < 30);
  assert.ok(filtered.items.every(row => row.supplierName === 'Beta'));
  const ledger = db.getSupplierDetails(alpha.id).summary;
  const alphaRows = full.filter(row => row.supplierId === alpha.id && (row.status === 'billed' || row.status === 'cash_bill'));
  const expectedNet = alphaRows.reduce((sum, row) => sum + Number(row.netAmount), 0);
  assert.equal(ledger.totalPurchasesBilled, Math.round(expectedNet * 100) / 100);
});

test('storage settlement with the wizard TDS and TCS amounts matches the previous net', () => {
  const { db } = isolate();
  const supplier = party(db, 'Wizard Settle');
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
  const grossPreview = Math.round(arrival.endProductWeight * 100 * 100) / 100;
  const cgst = componentTax(grossPreview, 2.5);
  const sgst = componentTax(grossPreview, 2.5);
  const tds = componentTax(grossPreview, 0.1);
  const tcs = componentTax(grossPreview, 0.1);
  const oldNet = Math.round((grossPreview + cgst + sgst - tds - tcs) * 100) / 100;
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
    tdsRate: 0.1,
    tcsRate: 0.1,
    tdsAmount: tds,
    tcsAmount: tcs,
    settlementNetAmount: 1,
    date: '2026-11-02'
  });
  assert.equal(settlement.settlementGrossAmount, grossPreview);
  assert.equal(settlement.tdsAmount, tds);
  assert.equal(settlement.tcsAmount, tcs);
  assert.equal(settlement.settlementNetAmount, oldNet);
  assert.notEqual(settlement.settlementNetAmount, 1);
  assert.equal(db.getDispatches().length, 0);
});
