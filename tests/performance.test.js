const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isolate, party } = require('./support');

function synthArrival(i, supplierId) {
  return {
    id: `bench_arr_${i}`,
    arrivalNo: `ARR-B-${i}`,
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    supplierId,
    supplierName: 'Bench Party',
    product: i % 11 === 0 ? 'RC EP' : 'RCA',
    vehicleNo: i % 17 === 0 ? 'KA12C9696' : 'KA00',
    weight: 100 + (i % 50),
    bags: 2,
    endProductWeight: 40 + (i % 20),
    remainingEndProduct: i % 5 === 0 ? 40 : 0,
    remainingBags: i % 5 === 0 ? 2 : 0,
    status: i % 5 === 0 ? 'storage' : 'billed',
    rate: 100,
    taxableAmount: 1000,
    billAmount: 1000,
    netAmount: 1000,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    legacyDisplayNo: i % 1000 === 0 ? 'DSP0159' : undefined
  };
}

function time(fn) {
  const start = process.hrtime.bigint();
  const heapBefore = process.memoryUsage().heapUsed;
  const value = fn();
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    heapDeltaMb: Math.round(((heapAfter - heapBefore) / 1048576) * 100) / 100,
    value
  };
}

test('local save, search, and report timings on synthetic data', () => {
  const { db, state, dir } = isolate();
  const supplier = party(db, 'Bench Party');
  const sizes = [10000, 100000, 500000];
  const runs = [];
  for (const size of sizes) {
    state.arrivals = [];
    state.dispatches = [];
    for (let i = 0; i < size; i++) state.arrivals.push(synthArrival(i, supplier.id));
    const save = time(() => db.flushLocalNow());
    const search = time(() => db.getArrivals({ search: 'KA12C9696', page: 1, limit: 25, includeSummary: true }));
    const report = time(() => db.getDashboardMetrics({}));
    const ledger = time(() => db.getSupplierDetails(supplier.id).summary.totalRawWeight);
    const fileBytes = fs.statSync(path.join(dir, 'commodity_store.json')).size;
    runs.push({
      records: size,
      saveMs: save.elapsedMs,
      saveHeapDeltaMb: save.heapDeltaMb,
      searchMs: search.elapsedMs,
      searchReturned: search.value.items.length,
      searchTotal: search.value.totalCount,
      reportMs: report.elapsedMs,
      ledgerMs: ledger.elapsedMs,
      fileMb: Math.round((fileBytes / 1048576) * 100) / 100,
      rssMb: Math.round((process.memoryUsage().rss / 1048576) * 100) / 100
    });
    assert.equal(search.value.items.length <= 25, true);
    assert.ok(search.value.totalCount > 0);
    assert.equal(save.value.waitedForNetwork, false);
  }

  const domain = time(() => {
    for (let i = 0; i < 500; i++) {
      db.addArrival({
        supplierId: supplier.id,
        supplierName: supplier.name,
        date: '2026-11-06',
        product: 'RCA',
        calculationBasis: 'direct',
        weight: 10,
        bags: 1,
        rate: 10,
        rateType: 'fixed',
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        tdsAmount: 0,
        tcsAmount: 0
      }, false);
    }
  });
  const flush = time(() => db.flushLocalNow());

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    note: 'Isolated temp JSON store. No MongoDB and no production file. Full-file rewrite remains the save path.',
    runs,
    domainInserts: { count: 500, elapsedMs: domain.elapsedMs, flushMs: flush.elapsedMs, waitedForNetwork: flush.value.waitedForNetwork }
  };
  const batches = [];
  for (const count of [100, 1000]) {
    const batchParty = party(db, `Batch ${count}`);
    const startedRss = process.memoryUsage().rss;
    const measured = time(() => {
      for (let i = 0; i < count; i++) {
        db.addArrival({
          supplierId: batchParty.id,
          supplierName: batchParty.name,
          date: '2026-06-15',
          product: 'RCA',
          calculationBasis: 'direct',
          weight: 12,
          bags: 1,
          rate: 8,
          cgstRate: 2.5,
          sgstRate: 2.5,
          igstRate: 5,
          tdsRate: 0.1,
          tcsRate: 0.1
        }, false);
      }
    });
    const flush = time(() => db.flushLocalNow());
    const range = time(() => db.getDashboardMetrics({ startDate: '2026-01-01', endDate: '2026-12-31' }));
    batches.push({
      count,
      insertMs: measured.elapsedMs,
      flushMs: flush.elapsedMs,
      waitedForNetwork: flush.value.waitedForNetwork,
      rangeReportMs: range.elapsedMs,
      peakRssMb: Math.round((Math.max(startedRss, process.memoryUsage().rss) / 1048576) * 100) / 100
    });
  }
  report.batches = batches;
  fs.writeFileSync(path.join(outDir, 'benchmark.json'), JSON.stringify(report, null, 2));
  assert.ok(runs[0].saveMs >= 0);
  assert.ok(runs[1].saveMs >= 0);
});
