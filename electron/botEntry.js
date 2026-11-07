const crypto = require('crypto');
const { computeDocumentTax } = require('../shared/gst.cjs');

const DISPLAY_NUMBER = /^(arr|dsp|disp|com|trf|set|inv|pur|sale)([-_ ]|$)/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function payloadHash(body) {
  const copy = { ...body };
  delete copy.idempotencyKey;
  return crypto.createHash('sha256').update(JSON.stringify(stable(copy))).digest('hex');
}

function normName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function roundQty(n) {
  return Math.round(Number(n) * 100) / 100;
}

function assertIdempotencyKey(key) {
  if (typeof key !== 'string' || key.trim().length < 8) {
    return 'Idempotency key must be a string of at least 8 characters. Display numbers are not idempotency keys.';
  }
  const trimmed = key.trim();
  if (/^\d+$/.test(trimmed) || DISPLAY_NUMBER.test(trimmed)) {
    return `Idempotency key "${trimmed}" looks like a display number. Use a request id, not ARR/DSP/COM numbers.`;
  }
  return null;
}

function partyCandidates(suppliers, query) {
  const q = normName(query);
  if (!q) return [];
  return (suppliers || []).filter(s => {
    const n = normName(s.name);
    return n === q || n.includes(q) || q.includes(n);
  }).map(s => ({ id: s.id, name: s.name }));
}

function resolveParty(suppliers, spec, aliases, confirmFuzzy) {
  if (spec == null || spec === '') return { error: { code: 'PARTY_REQUIRED', message: 'Party is required.' } };
  const raw = typeof spec === 'string' ? { name: spec } : spec;
  if (raw.id) {
    const hit = (suppliers || []).find(s => s.id === raw.id);
    if (!hit) return { error: { code: 'PARTY_NOT_FOUND', message: `No party with id ${raw.id}.` } };
    return { party: hit, match: 'id' };
  }
  let name = raw.name || raw.alias || '';
  if (raw.alias && aliases && aliases[raw.alias]) name = aliases[raw.alias];
  else if (aliases && aliases[name]) name = aliases[name];

  if (typeof name === 'string' && aliases && aliases[name]) name = aliases[name];

  if (name && typeof name === 'object') {
    return resolveParty(suppliers, name, aliases, confirmFuzzy);
  }
  if (typeof name === 'string' && /^(sup_|party_)/.test(name)) {
    const byId = (suppliers || []).find(s => s.id === name);
    if (byId) return { party: byId, match: 'alias-id' };
  }

  const exact = (suppliers || []).filter(s => normName(s.name) === normName(name));
  if (exact.length === 1) return { party: exact[0], match: 'exact' };
  if (exact.length > 1) {
    return {
      error: {
        code: 'AMBIGUOUS_PARTY',
        message: `More than one party is named "${name}".`,
        candidates: exact.map(s => ({ id: s.id, name: s.name }))
      }
    };
  }

  const fuzzy = partyCandidates(suppliers, name).filter(c => normName(c.name) !== normName(name));
  if (fuzzy.length === 0) {
    return { error: { code: 'PARTY_NOT_FOUND', message: `No party matches "${name}".`, candidates: [] } };
  }
  if (fuzzy.length > 1 || !confirmFuzzy) {
    return {
      error: {
        code: fuzzy.length > 1 ? 'AMBIGUOUS_PARTY' : 'FUZZY_PARTY_CONFIRMATION_REQUIRED',
        message: fuzzy.length > 1
          ? `Party "${name}" matches multiple records. Pass an id or an explicit alias.`
          : `Party "${name}" is not an exact name. Fuzzy merge requires confirmations.fuzzyNameMerges.`,
        candidates: fuzzy
      }
    };
  }
  const party = suppliers.find(s => s.id === fuzzy[0].id);
  return { party, match: 'fuzzy' };
}

function fingerprint(parts) {
  return parts.map(p => String(p == null ? '' : p).trim().toLowerCase()).join('|');
}

function entryFingerprint(kind, partyId, entry) {
  return fingerprint([
    kind,
    partyId,
    entry.date,
    entry.product,
    entry.vehicleNo || entry.vehicle || '',
    roundQty(entry.weight || entry.endProductWeight || 0),
    roundQty(entry.endProductWeight || entry.weight || 0),
    roundQty(entry.rate || 0),
    entry.billing || entry.rateType || ''
  ]);
}

function recordFingerprint(kind, rec) {
  const billing = rec.status === 'storage' || rec.rateType === 'storage'
    ? 'storage'
    : (rec.status === 'storage_out' || rec.rateType === 'storage_out'
      ? 'storage'
      : (rec.billType === 'cash_bill' ? 'cash' : 'billed'));
  return fingerprint([
    kind,
    rec.supplierId || rec.partyId,
    rec.date,
    rec.product,
    rec.vehicleNo || '',
    roundQty(rec.weight || rec.endProductWeight || 0),
    roundQty(rec.endProductWeight || rec.weight || 0),
    roundQty(rec.rate || 0),
    billing
  ]);
}

function defaultTcs(dbState, kind) {
  const configured = dbState.settings && dbState.settings.defaultTcsRate;
  if (kind === 'arrival') return configured || 0.1;
  return configured || 0;
}

function findExisting(dbState, kind, partyId, entry) {
  const fp = entryFingerprint(kind, partyId, entry);
  const list = kind === 'dispatch' ? (dbState.dispatches || []) : (dbState.arrivals || []);
  const matches = list.filter(rec => recordFingerprint(kind === 'dispatch' ? 'dispatch' : 'arrival', rec) === fp);
  const settlementHits = [];
  if (kind === 'dispatch') {
    for (const set of dbState.settlements || []) {
      if ((set.supplierId || '') !== partyId) continue;
      if (entry.date && set.date && set.date !== entry.date) continue;
      if (entry.product && set.product && normName(set.product) !== normName(entry.product)) continue;
      const sw = Number(set.settledWeight) || Number(set.settledEndProduct) || 0;
      const ew = Number(entry.weight) || Number(entry.endProductWeight) || 0;
      if (sw && ew && Math.abs(sw - ew) <= 0.05) {
        settlementHits.push({ id: set.id, settlementNo: set.settlementNo, date: set.date, settledWeight: sw });
      }
    }
  }
  return {
    fingerprint: fp,
    records: matches.map(rec => ({
      id: rec.id,
      displayNo: rec.arrivalNo || rec.dispatchNo || rec.legacyDisplayNo || null,
      legacyDisplayNo: rec.legacyDisplayNo || null
    })),
    settlements: settlementHits
  };
}

function findCommitments(dbState, { partyId, product, rate, category }) {
  return (dbState.commitments || []).filter(c => {
    const owner = c.supplierId || c.partyId;
    if (owner !== partyId) return false;
    if ((c.category || 'purchase') !== category) return false;
    if (c.status === 'closed' || c.status === 'fulfilled') return false;
    if (!(Number(c.remainingQty) > 0)) return false;
    if (normName(c.product) !== normName(product)) return false;
    if (Math.abs((Number(c.rate) || 0) - (Number(rate) || 0)) > 0.001) return false;
    return true;
  });
}

function previewRequest(dbState, body) {
  const errors = [];
  const previews = [];
  const confirmations = body.confirmations || {};
  const aliases = body.partyAliases || {};
  const entries = Array.isArray(body.entries) ? body.entries : null;
  if (!entries) {
    errors.push({ code: 'ENTRIES_REQUIRED', message: 'entries must be an array.' });
    return { ok: false, errors, entries: [] };
  }

  entries.forEach((entry, index) => {
    const path = `entries[${index}]`;
    const clientRef = entry.clientRef || `row-${index + 1}`;
    if (entry.post === false || entry.doNotPost === true) {
      previews.push({
        clientRef,
        post: false,
        notPosted: true,
        message: 'Marked do-not-post. Preview only; commit will not write this row.',
        input: entry
      });
      return;
    }
    if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) {
      errors.push({ path, code: 'DATE_REQUIRED', message: 'Explicit date YYYY-MM-DD is required.' });
      return;
    }
    const kind = entry.kind;
    if (!['arrival', 'dispatch', 'commitment', 'payment', 'ep_transfer'].includes(kind)) {
      errors.push({ path, code: 'KIND_UNSUPPORTED', message: `Unsupported kind "${kind}".` });
      return;
    }

    const partyRes = resolveParty(dbState.suppliers || [], entry.party || entry.partyName || entry.supplierName, aliases, confirmations.fuzzyNameMerges === true);
    if (partyRes.error) {
      errors.push({ path, clientRef, ...partyRes.error });
      return;
    }
    let counterParty = null;
    if (kind === 'ep_transfer') {
      const toRes = resolveParty(dbState.suppliers || [], entry.toParty || entry.toPartyName, aliases, confirmations.fuzzyNameMerges === true);
      if (toRes.error) {
        errors.push({ path, clientRef, ...toRes.error, message: `Destination: ${toRes.error.message}` });
        return;
      }
      counterParty = toRes.party;
      if (counterParty.id === partyRes.party.id) {
        errors.push({ path, code: 'SAME_PARTY', message: 'Source and destination parties must be different.' });
        return;
      }
    }

    if (kind === 'commitment') {
      previews.push({
        clientRef,
        kind,
        post: true,
        party: { id: partyRes.party.id, name: partyRes.party.name, match: partyRes.match },
        date: entry.date,
        product: entry.product,
        quantity: Number(entry.quantity) || 0,
        rate: Number(entry.rate) || 0,
        category: entry.category || 'purchase',
        type: entry.type || 'bags',
        legacyDisplayNo: entry.legacyDisplayNo || null,
        payload: {
          supplierId: partyRes.party.id,
          supplierName: partyRes.party.name,
          date: entry.date,
          product: entry.product,
          quantity: Number(entry.quantity) || 0,
          rate: Number(entry.rate) || 0,
          category: entry.category || 'purchase',
          type: entry.type || 'bags',
          notes: entry.notes || entry.remarks || '',
          legacyDisplayNo: entry.legacyDisplayNo || ''
        }
      });
      return;
    }

    if (kind === 'payment') {
      previews.push({
        clientRef,
        kind,
        post: true,
        note: 'Payments never create arrival, dispatch, or settlement bills.',
        party: { id: partyRes.party.id, name: partyRes.party.name, match: partyRes.match },
        amount: Number(entry.amount) || 0,
        payload: {
          supplierId: partyRes.party.id,
          supplierName: partyRes.party.name,
          date: entry.date,
          amount: Number(entry.amount) || 0,
          type: entry.paymentType || entry.type || 'payment_paid',
          mode: entry.mode || 'bank',
          notes: entry.notes || '',
          legacyDisplayNo: entry.legacyDisplayNo || ''
        }
      });
      return;
    }

    if (kind === 'ep_transfer') {
      if (confirmations.storageBooking !== true) {
        errors.push({
          path,
          clientRef,
          code: 'STORAGE_CONFIRMATION_REQUIRED',
          message: 'EP transfer books a rate-0 storage arrival for the destination. Set confirmations.storageBooking.'
        });
        return;
      }
      if (entry.moneyMovement === true && confirmations.moneyMovement !== true) {
        errors.push({
          path,
          clientRef,
          code: 'MONEY_MOVEMENT_CONFIRMATION_REQUIRED',
          message: 'Money movement is off unless the entry sets moneyMovement and confirmations.moneyMovement is true.'
        });
        return;
      }
      previews.push({
        clientRef,
        kind,
        post: true,
        party: { id: partyRes.party.id, name: partyRes.party.name, match: partyRes.match },
        toParty: { id: counterParty.id, name: counterParty.name },
        endProductWeight: entry.endProductWeight,
        bags: entry.bags,
        moneyMovement: entry.moneyMovement === true,
        payload: {
          fromPartyId: partyRes.party.id,
          toPartyId: counterParty.id,
          date: entry.date,
          product: entry.product,
          transferType: entry.transferType || 'store_in',
          bags: entry.bags,
          weight: entry.weight,
          endProductWeight: entry.endProductWeight,
          lotIds: entry.lotIds || null,
          moneyMovement: entry.moneyMovement === true,
          rate: entry.moneyMovement === true ? entry.rate : 0,
          notes: entry.notes || entry.remarks || ''
        }
      });
      return;
    }

    const billing = entry.billing;
    if (!['storage', 'billed', 'cash'].includes(billing)) {
      errors.push({
        path,
        clientRef,
        code: 'BILLING_REQUIRED',
        message: 'Explicit billing is required: "storage", "billed", or "cash".'
      });
      return;
    }
    if (billing === 'storage' && confirmations.storageBooking !== true) {
      errors.push({ path, clientRef, code: 'STORAGE_CONFIRMATION_REQUIRED', message: 'Storage booking requires confirmations.storageBooking.' });
      return;
    }
    if (billing === 'cash' && confirmations.cashSales !== true) {
      errors.push({ path, clientRef, code: 'CASH_CONFIRMATION_REQUIRED', message: 'Cash sale/purchase requires confirmations.cashSales.' });
      return;
    }
    if ((entry.linkCommitment || entry.commitmentId || entry.commitment) && billing === 'storage') {
      errors.push({
        path,
        clientRef,
        code: 'STORAGE_DOES_NOT_FULFILL_COMMITMENT',
        message: 'Storage stays unbilled until a bill or settlement is authorized. It does not fulfill a commitment.'
      });
      return;
    }

    let commitmentId = null;
    let commitmentMatch = null;
    if (billing !== 'storage' && (entry.linkCommitment || entry.commitmentId || entry.commitment)) {
      if (confirmations.commitmentDeductions !== true) {
        errors.push({
          path,
          clientRef,
          code: 'COMMITMENT_CONFIRMATION_REQUIRED',
          message: 'Linking a commitment deducts remaining quantity. Set confirmations.commitmentDeductions.'
        });
        return;
      }
      const category = kind === 'dispatch' ? 'sale' : 'purchase';
      if (entry.commitmentId) {
        commitmentId = entry.commitmentId;
        commitmentMatch = (dbState.commitments || []).find(c => c.id === entry.commitmentId) || null;
        if (!commitmentMatch) {
          errors.push({ path, clientRef, code: 'COMMITMENT_NOT_FOUND', message: `Commitment id ${entry.commitmentId} was not found.` });
          return;
        }
      } else {
        const displayHint = entry.commitment && (entry.commitment.displayNo || entry.commitment.legacyDisplayNo);
        const hits = findCommitments(dbState, {
          partyId: partyRes.party.id,
          product: entry.product,
          rate: entry.rate,
          category
        }).filter(c => !displayHint || c.legacyDisplayNo === displayHint || c.commitmentNo === displayHint);
        if (hits.length !== 1) {
          errors.push({
            path,
            clientRef,
            code: hits.length === 0 ? 'COMMITMENT_NOT_FOUND' : 'AMBIGUOUS_COMMITMENT',
            message: hits.length === 0
              ? 'No open commitment with the same grade (product) and rate.'
              : 'More than one open commitment has this grade and rate.',
            candidates: hits.map(c => ({ id: c.id, commitmentNo: c.commitmentNo, legacyDisplayNo: c.legacyDisplayNo || null, rate: c.rate, remainingQty: c.remainingQty }))
          });
          return;
        }
        commitmentId = hits[0].id;
        commitmentMatch = hits[0];
      }
    }

    const existing = findExisting(dbState, kind, partyRes.party.id, entry);
    if ((existing.records.length > 0 || existing.settlements.length > 0) && confirmations.duplicates !== true) {
      errors.push({
        path,
        clientRef,
        code: 'DUPLICATE_PREFLIGHT',
        message: existing.settlements.length
          ? 'A storage settlement already covers this party, date, product and quantity. Refusing a second physical dispatch.'
          : 'An existing record matches this party, date, product, quantity and rate. Commit would create a duplicate.',
        existingMatches: existing.records,
        existingSettlements: existing.settlements
      });
      return;
    }

    const tcsRate = entry.tcsRate !== undefined && entry.tcsRate !== '' ? Number(entry.tcsRate) : (billing === 'storage' ? 0 : defaultTcs(dbState, kind));
    const tdsRate = entry.tdsRate !== undefined && entry.tdsRate !== '' ? Number(entry.tdsRate) : 0;
    const billType = billing === 'cash' ? 'cash_bill' : 'gst_bill';
    const rateType = billing === 'storage'
      ? (kind === 'dispatch' ? 'storage_out' : 'storage')
      : (commitmentId ? 'commitment' : 'fixed');

    let taxablePreview = 0;
    if (billing !== 'storage') {
      const basis = entry.calculationBasis || 'end_product';
      const rateUnit = entry.rateUnit || (basis === 'direct' ? 'per_kg_raw' : 'per_kg_ep');
      const qty = rateUnit === 'per_bag'
        ? Number(entry.bags) || 0
        : (rateUnit === 'per_kg_raw' || basis === 'direct'
          ? Number(entry.weight) || 0
          : Number(entry.endProductWeight) || Number(entry.weight) || 0);
      const billQty = entry.applyCuttingToBill === true && entry.cuttingKg
        ? roundQty(qty - Number(entry.cuttingKg))
        : qty;
      taxablePreview = roundQty(billQty * (Number(entry.rate) || 0));
    }
    let taxPreview = null;
    if (billing !== 'storage') {
      try {
        taxPreview = computeDocumentTax({
          billType,
          taxableAmount: taxablePreview,
          taxTreatment: entry.taxTreatment,
          cgstRate: entry.cgstRate,
          sgstRate: entry.sgstRate,
          igstRate: entry.igstRate,
          tdsRate,
          tcsRate,
          tdsAmount: entry.tdsAmount,
          tcsAmount: entry.tcsAmount
        });
      } catch (err) {
        errors.push({ path, clientRef, code: err.code || 'TAX', message: err.message });
        return;
      }
    }

    const payload = {
      supplierId: partyRes.party.id,
      supplierName: partyRes.party.name,
      date: entry.date,
      product: entry.product,
      vehicleNo: entry.vehicleNo || entry.vehicle || '',
      weight: entry.weight,
      bags: entry.bags,
      outturn: entry.outturn,
      outturnType: entry.outturnType,
      calculationBasis: entry.calculationBasis,
      rateUnit: entry.rateUnit,
      endProductWeight: entry.endProductWeight,
      rate: billing === 'storage' ? 0 : entry.rate,
      rateType,
      billType,
      taxTreatment: entry.taxTreatment,
      cgstRate: entry.cgstRate,
      sgstRate: entry.sgstRate,
      igstRate: entry.igstRate,
      tdsRate,
      tcsRate,
      commitmentId,
      remarks: entry.remarks || entry.notes || '',
      legacyDisplayNo: entry.legacyDisplayNo || '',
      cuttingKg: entry.cuttingKg,
      applyCuttingToBill: entry.applyCuttingToBill === true,
      dispatchType: entry.dispatchType
    };

    previews.push({
      clientRef,
      kind,
      post: true,
      party: { id: partyRes.party.id, name: partyRes.party.name, match: partyRes.match },
      billing,
      rateType,
      billType,
      commitment: commitmentMatch ? {
        id: commitmentMatch.id,
        commitmentNo: commitmentMatch.commitmentNo,
        legacyDisplayNo: commitmentMatch.legacyDisplayNo || null,
        rate: commitmentMatch.rate,
        remainingQty: commitmentMatch.remainingQty
      } : null,
      existingMatches: existing.records,
      duplicateSettlements: existing.settlements,
      tax: taxPreview,
      cuttingKg: entry.cuttingKg || 0,
      physicalWeight: entry.weight,
      payload
    });
  });

  return { ok: errors.length === 0, errors, entries: previews, stateToken: stateToken(dbState) };
}

function stateToken(dbState) {
  const pack = (rows, fields) => (rows || []).map(row => fields.map(field => row[field] == null ? '' : row[field]).join('\t')).join('\n');
  const body = JSON.stringify({
    counters: dbState.counters || {},
    suppliers: pack(dbState.suppliers, ['id', 'name']),
    arrivals: pack(dbState.arrivals, ['id', 'updatedAt', 'status', 'remainingEndProduct', 'remainingBags', 'netAmount']),
    dispatches: pack(dbState.dispatches, ['id', 'updatedAt', 'status', 'remainingEndProduct', 'netAmount']),
    commitments: pack(dbState.commitments, ['id', 'fulfilledQty', 'remainingQty', 'status']),
    epTransfers: pack(dbState.epTransfers, ['id', 'endProductWeight', 'transferValue']),
    settlements: (dbState.settlements || []).length,
    payments: (dbState.payments || []).length
  });
  return crypto.createHash('sha256').update(body).digest('hex');
}

function snapshotState(dbState) {
  const keys = [
    'suppliers', 'products', 'arrivals', 'dispatches', 'commitments', 'settlements',
    'payments', 'partyBills', 'balanceAdjustments', 'epTransfers', 'commitmentWashes',
    'millingLogs', 'openingStockEntries'
  ];
  const snap = { counters: JSON.parse(JSON.stringify(dbState.counters || {})), botIdempotency: JSON.parse(JSON.stringify(dbState.botIdempotency || {})) };
  for (const key of keys) snap[key] = JSON.parse(JSON.stringify(dbState[key] || []));
  return snap;
}

function restoreState(dbState, snap) {
  for (const key of Object.keys(snap)) dbState[key] = snap[key];
}

function commitRequest(dbController, dbState, body, hooks = {}) {
  const keyError = assertIdempotencyKey(body && body.idempotencyKey);
  if (keyError) return { ok: false, status: 400, errors: [{ code: 'IDEMPOTENCY_KEY', message: keyError }] };

  const key = body.idempotencyKey.trim();
  const hash = payloadHash(body);
  if (!dbState.botIdempotency || typeof dbState.botIdempotency !== 'object' || Array.isArray(dbState.botIdempotency)) {
    dbState.botIdempotency = {};
  }
  const prior = dbState.botIdempotency[key];
  if (prior) {
    if (prior.hash !== hash) {
      return {
        ok: false,
        status: 409,
        errors: [{ code: 'IDEMPOTENCY_CONFLICT', message: 'This idempotency key was already used with a different request. Nothing was overwritten.' }]
      };
    }
    return { ok: true, status: 200, replayed: true, result: prior.result };
  }

  if (!body.stateToken || typeof body.stateToken !== 'string') {
    return {
      ok: false,
      status: 409,
      errors: [{ code: 'PREVIEW_REQUIRED', message: 'Commit requires the stateToken from a preview of the current books. Nothing was written.' }]
    };
  }
  const currentToken = stateToken(dbState);
  if (body.stateToken !== currentToken) {
    return {
      ok: false,
      status: 409,
      errors: [{ code: 'STALE_PREVIEW', message: 'The books changed after preview. Preview again. Nothing was written.' }]
    };
  }

  const preview = previewRequest(dbState, body);
  if (!preview.ok) return { ok: false, status: 422, errors: preview.errors, preview };
  if (preview.stateToken !== currentToken) {
    return {
      ok: false,
      status: 409,
      errors: [{ code: 'STALE_PREVIEW', message: 'Preview changed the books. Nothing was written.' }]
    };
  }

  const snap = snapshotState(dbState);
  const previousFile = dbController.readLocalFile ? dbController.readLocalFile() : null;
  const saved = [];
  try {
    if (hooks.beforeWrite) hooks.beforeWrite();
    for (const row of preview.entries) {
      if (row.post === false || row.notPosted) {
        saved.push({ clientRef: row.clientRef, notPosted: true });
        continue;
      }
      let created;
      if (row.kind === 'arrival') created = dbController.addArrival(row.payload, false);
      else if (row.kind === 'dispatch') created = dbController.addDispatch(row.payload, false);
      else if (row.kind === 'commitment') created = dbController.addCommitment(row.payload, false);
      else if (row.kind === 'payment') created = dbController.addPayment(row.payload, false);
      else if (row.kind === 'ep_transfer') created = dbController.addEpTransfer(row.payload, { shouldSave: false, skipCloud: true });
      else throw new Error(`Cannot commit kind ${row.kind}`);

      saved.push({
        clientRef: row.clientRef,
        kind: row.kind,
        id: created.id,
        displayNo: created.arrivalNo || created.dispatchNo || created.commitmentNo || created.transferNo || created.paymentNo || null,
        legacyDisplayNo: created.legacyDisplayNo || null,
        quantities: {
          weight: created.weight,
          bags: created.bags,
          endProductWeight: created.endProductWeight,
          remainingBags: created.remainingBags,
          remainingEndProduct: created.remainingEndProduct,
          quantity: created.quantity,
          remainingQty: created.remainingQty,
          fulfilledQty: created.fulfilledQty
        },
        tax: created.taxTreatment ? {
          taxTreatment: created.taxTreatment,
          taxableAmount: created.taxableAmount,
          cgstAmount: created.cgstAmount,
          sgstAmount: created.sgstAmount,
          igstAmount: created.igstAmount,
          billAmount: created.billAmount,
          tdsAmount: created.tdsAmount,
          tcsAmount: created.tcsAmount,
          netAmount: created.netAmount
        } : (created.netAmount !== undefined ? { netAmount: created.netAmount, billAmount: created.billAmount } : null),
        status: created.status || null,
        rate: created.rate,
        commitmentId: created.commitmentId || null
      });
    }
    const result = {
      idempotencyKey: key,
      saved,
      cloudSync: 'suppressed'
    };
    dbState.botIdempotency[key] = { hash, result, createdAt: new Date().toISOString() };
    if (dbController.flushLocalNow) dbController.flushLocalNow();
    return { ok: true, status: 201, replayed: false, result };
  } catch (err) {
    restoreState(dbState, snap);
    if (dbController.writeLocalFile) dbController.writeLocalFile(previousFile);
    if (hooks.afterRollback) hooks.afterRollback();
    return {
      ok: false,
      status: 422,
      rolledBack: true,
      errors: [{ code: 'COMMIT_FAILED', message: err.message || 'Commit failed and was rolled back.' }]
    };
  }
}

function schema() {
  return {
    audience: 'Local Accounts bot on 127.0.0.1 only. Not a public endpoint.',
    routes: {
      'GET /api/bot/schema': 'This document.',
      'POST /api/bot/preview': 'Dry run. No writes.',
      'POST /api/bot/commit': 'Explicit commit. Requires idempotencyKey. Retries with the same key and body return the original result and do not write again.'
    },
    idempotencyKey: 'Caller-generated request id, at least 8 characters. Must not be a display number (ARR, DSP, COM, invoice numbers).',
    confirmations: {
      storageBooking: 'Required for billing "storage" and for EP transfers (they book a rate-0 destination arrival).',
      commitmentDeductions: 'Required before a billed/cash row links and deducts an open commitment.',
      cashSales: 'Required for billing "cash".',
      fuzzyNameMerges: 'Required to accept a single non-exact party name. Multiple matches always fail.',
      duplicates: 'Required to write a row whose fingerprint already exists. Existing rows are never overwritten.',
      moneyMovement: 'Required when an EP transfer sets moneyMovement true. Default transfers move stock only.'
    },
    partyAliases: 'Optional map of alias string to an exact party name or supplier id. Applied before name matching.',
    billing: ['storage', 'billed', 'cash'],
    taxTreatment: ['intra', 'inter', 'none'],
    doNotPost: 'entries[].post false or doNotPost true is preview-only and is skipped on commit.',
    cloudSync: 'Bulk preview and commit do not push to MongoDB.'
  };
}

module.exports = {
  schema,
  previewRequest,
  commitRequest,
  resolveParty,
  assertIdempotencyKey,
  payloadHash,
  stateToken
};
