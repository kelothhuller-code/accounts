const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { isolate, party } = require('./support');
const { previewRequest, commitRequest } = require('../electron/botEntry');

function commitFresh(db, state, body) {
  const preview = previewRequest(state, body);
  if (!preview.ok) return { ok: false, status: 422, errors: preview.errors, preview };
  const sent = { ...body, stateToken: preview.stateToken };
  const result = commitRequest(db, state, sent);
  result.sent = sent;
  return result;
}
const { createBotApiServer } = require('../electron/botApi');
const facts = require('./fixtures/transcribedRealRecords');

function baseEntry(over) {
  return {
    kind: 'arrival',
    date: '2026-11-06',
    party: 'Deepak',
    product: 'RC raw',
    billing: 'billed',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: 100,
    bags: 2,
    rate: 10,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    tdsRate: 0,
    tcsRate: 0,
    tdsAmount: 0,
    tcsAmount: 0,
    ...over
  };
}

test('preview rejects ambiguous parties, storage without confirmation, and does not write', () => {
  const { db, state } = isolate();
  party(db, 'Deepak');
  party(db, 'Deepak Traders');
  const before = state.arrivals.length;
  const preview = previewRequest(state, {
    entries: [baseEntry({ party: 'Deep' })]
  });
  assert.equal(preview.ok, false);
  assert.equal(preview.errors[0].code, 'AMBIGUOUS_PARTY');
  assert.equal(state.arrivals.length, before);

  const storage = previewRequest(state, {
    entries: [baseEntry({ party: 'Deepak Traders', billing: 'storage', weight: 50, bags: 1 })]
  });
  assert.equal(storage.errors.some(e => e.code === 'STORAGE_CONFIRMATION_REQUIRED'), true);
});

test('commit is atomic, idempotent, and does not overwrite on retry', () => {
  const { db, state } = isolate();
  const deepak = party(db, 'Deepak');
  db.addCommitment({
    supplierId: deepak.id,
    supplierName: 'Deepak',
    date: '2026-11-06',
    product: 'RC raw',
    quantity: 50,
    rate: 383,
    type: 'bags',
    category: 'purchase',
    legacyDisplayNo: 'COM-PUR0169'
  }, false);

  const body = {
    idempotencyKey: 'req-deepak-bill-0001',
    confirmations: { commitmentDeductions: true },
    partyAliases: { 'Deepak R': 'Deepak' },
    entries: [baseEntry({
      clientRef: 'row-deepak',
      party: { alias: 'Deepak R' },
      weight: 2500,
      bags: 50,
      rate: 383,
      rateUnit: 'per_bag',
      linkCommitment: true,
      legacyDisplayNo: 'COM-PUR0169'
    })]
  };
  const first = commitFresh(db, state, body);
  assert.equal(first.ok, true);
  assert.equal(first.result.saved.length, 1);
  assert.ok(first.result.saved[0].id);
  assert.notEqual(first.result.saved[0].id, 'COM-PUR0169');
  assert.equal(first.result.cloudSync, 'suppressed');
  const id = first.result.saved[0].id;
  const saved = state.arrivals.find(a => a.id === id);
  assert.equal(saved.bags, 50);
  assert.ok(saved.commitmentId);
  assert.equal(state.commitments[0].fulfilledQty, 50);
  assert.equal(state.commitments[0].remainingQty, 0);

  const replay = commitRequest(db, state, first.sent);
  assert.equal(replay.replayed, true);
  assert.equal(state.arrivals.length, 1);

  const conflict = commitRequest(db, state, { ...body, entries: [baseEntry({ weight: 1, bags: 1, rate: 1 })] });
  assert.equal(conflict.status, 409);
  assert.equal(state.arrivals.length, 1);
  assert.equal(state.arrivals[0].id, id);
});

test('failed commit rolls back and display numbers are not idempotency keys', () => {
  const { db, state } = isolate();
  party(db, 'YAS');
  party(db, 'HASHIM');
  const rolled = commitFresh(db, state, {
    idempotencyKey: 'req-rollback-0001',
    confirmations: { cashSales: true, storageBooking: true },
    entries: [
      baseEntry({ party: 'YAS', clientRef: 'ok', billing: 'cash' }),
      {
        kind: 'ep_transfer',
        clientRef: 'overdraw',
        date: '2026-11-06',
        party: 'YAS',
        toParty: 'HASHIM',
        product: 'RC EP',
        endProductWeight: 10
      }
    ]
  });
  assert.equal(rolled.rolledBack, true);
  assert.equal(state.arrivals.length, 0);
  const displayKey = commitRequest(db, state, {
    idempotencyKey: 'ARR0189',
    entries: [baseEntry({ party: 'YAS' })]
  });
  assert.equal(displayKey.ok, false);
  assert.equal(state.arrivals.length, 0);
});

test('duplicate preflight and Kamadhenu do-not-post', () => {
  const { db, state } = isolate();
  const partyRow = party(db, 'Saidurga');
  db.addDispatch({
    supplierId: partyRow.id,
    supplierName: 'Saidurga',
    date: '2026-11-06',
    product: 'RCA',
    calculationBasis: 'direct',
    rateUnit: 'per_kg_raw',
    weight: 15000,
    rate: 387.5,
    billType: 'gst_bill',
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    tdsAmount: 0,
    tcsAmount: 0
  }, false);
  const dup = previewRequest(state, {
    entries: [{
      kind: 'dispatch',
      date: '2026-11-06',
      party: 'Saidurga',
      product: 'RCA',
      billing: 'billed',
      calculationBasis: 'direct',
      rateUnit: 'per_kg_raw',
      weight: 15000,
      rate: 387.5,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      tdsAmount: 0,
      tcsAmount: 0
    }]
  });
  assert.equal(dup.errors[0].code, 'DUPLICATE_PREFLIGHT');

  const preview = previewRequest(state, {
    entries: [{
      kind: 'dispatch',
      post: false,
      doNotPost: true,
      date: facts.kamadhenu.date,
      party: 'Saidurga',
      product: 'Husk',
      billing: 'billed',
      weight: facts.kamadhenu.weightKg,
      rate: facts.kamadhenu.rate,
      calculationBasis: 'direct',
      cgstRate: 2.5,
      sgstRate: 2.5,
      igstRate: 5,
      clientRef: 'kamadhenu-not-posted'
    }]
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.entries[0].notPosted, true);
  const committed = commitFresh(db, state, {
    idempotencyKey: 'req-kamadhenu-skip-1',
    entries: preview.entries[0].input ? [preview.entries[0].input] : [{
      kind: 'dispatch',
      post: false,
      date: facts.kamadhenu.date,
      party: 'Saidurga',
      product: 'Husk',
      billing: 'billed',
      weight: 1,
      rate: 1
    }]
  });
  assert.equal(committed.ok, true);
  assert.equal(state.dispatches.length, 1);
});

test('local bot HTTP rejects browser origin and serves preview without cloud sync', async () => {
  const { db, state } = isolate();
  party(db, 'NATESH');
  const server = createBotApiServer({ dbController: db, dbState: state });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const originStatus = await new Promise(resolve => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/api/bot/schema',
        headers: { Origin: 'https://example.test', 'X-Commodity-Bot': '1' }
      }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.end();
    });
    assert.equal(originStatus, 403);

    const noHeader = await fetch(`http://127.0.0.1:${port}/api/bot/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(noHeader.status, 403);

    const gone = await fetch(`http://127.0.0.1:${port}/api/arrivals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Commodity-Bot': '1' },
      body: '{}'
    });
    assert.equal(gone.status, 410);

    const preview = await fetch(`http://127.0.0.1:${port}/api/bot/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Commodity-Bot': '1' },
      body: JSON.stringify({
        entries: [baseEntry({
          party: 'NATESH',
          billing: 'storage',
          weight: 100,
          bags: 2
        })]
      })
    });
    const body = await preview.json();
    assert.equal(body.ok, false);
    assert.equal(state.arrivals.length, 0);
  } finally {
    server.close();
  }
});

test('preview persists nothing, stale token does not overwrite, and rollback restores the file', () => {
  const { db, state } = isolate();
  party(db, 'Deepak');
  db.flushLocalNow();
  const before = JSON.stringify(state);
  const fileBefore = Buffer.from(db.readLocalFile());
  const countersBefore = JSON.stringify(state.counters || {});
  const preview = previewRequest(state, { entries: [baseEntry({ party: 'Deepak', billing: 'cash' })] });
  assert.equal(preview.ok, false);
  const storagePreview = previewRequest(state, {
    confirmations: { cashSales: true },
    entries: [baseEntry({ party: 'Deepak', billing: 'cash' })]
  });
  assert.equal(storagePreview.ok, true);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(state.counters || {}), countersBefore);
  assert.ok(fileBefore.equals(db.readLocalFile()));

  const body = {
    idempotencyKey: 'req-freshness-0001',
    confirmations: { cashSales: true },
    entries: [baseEntry({ party: 'Deepak', billing: 'cash', clientRef: 'cash-1' })]
  };
  const token = storagePreview.stateToken;
  party(db, 'Someone Else');
  const stale = commitRequest(db, state, { ...body, stateToken: token });
  assert.equal(stale.status, 409);
  assert.equal(stale.errors[0].code, 'STALE_PREVIEW');
  assert.equal(state.arrivals.length, 0);

  const freshPreview = previewRequest(state, body);
  process.env.COMMODITY_TEST_FLUSH = 'throw-after';
  const failed = commitRequest(db, state, { ...body, stateToken: freshPreview.stateToken });
  delete process.env.COMMODITY_TEST_FLUSH;
  assert.equal(failed.rolledBack, true);
  assert.equal(state.arrivals.length, 0);
  assert.ok(fileBefore.equals(db.readLocalFile()));

  const ok = commitFresh(db, state, body);
  assert.equal(ok.ok, true);
  const savedPath = db.localFilePath();
  const bytes = fs.readFileSync(savedPath);
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-restart-'));
  fs.writeFileSync(path.join(dir2, 'commodity_store.json'), bytes);
  db.loadIsolated(dir2);
  const replay = commitRequest(db, state, ok.sent);
  assert.equal(replay.replayed, true);
  assert.equal(state.arrivals.length, 1);
});
