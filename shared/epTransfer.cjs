/**
 * Pure EP transfer planning. Stock moves once: source lots are consumed and
 * the destination receives one storage arrival. Money is posted only when requested.
 * Missing weight defaults to the end-product quantity, never bags * 50.
 */

function roundQty(n) {
  return Math.round(Number(n) * 100) / 100;
}

function resolveTransferQuantities({ bags, weight, endProductWeight } = {}) {
  const bagsProvided = !(bags === undefined || bags === null || bags === '');
  const weightProvided = !(weight === undefined || weight === null || weight === '');
  const epProvided = !(endProductWeight === undefined || endProductWeight === null || endProductWeight === '');

  const bagsNum = bagsProvided ? Number(bags) : 0;
  const weightNum = weightProvided ? Number(weight) : 0;
  const epNum = epProvided ? Number(endProductWeight) : 0;

  if (bagsProvided && !Number.isFinite(bagsNum)) {
    throw new Error('Bags must be a number when provided.');
  }
  if (weightProvided && (!Number.isFinite(weightNum) || weightNum < 0)) {
    throw new Error('Weight must be a non-negative number when provided.');
  }

  let ep = epNum > 0 ? epNum : 0;
  if (!(ep > 0) && weightNum > 0) ep = weightNum;
  if (!(ep > 0)) {
    throw new Error('End-product weight is required. When weight is absent the quantity is EP, not bags × 50.');
  }

  const resolvedWeight = weightNum > 0 ? weightNum : ep;
  return {
    bags: bagsProvided ? roundQty(bagsNum) : 0,
    bagsProvided,
    weight: roundQty(resolvedWeight),
    weightProvided,
    endProductWeight: roundQty(ep),
    weightDefaultedToEp: !(weightNum > 0)
  };
}

function sortLotsOldestFirst(lots) {
  return lots.slice().sort((a, b) => {
    const da = String(a.date || '');
    const db = String(b.date || '');
    if (da !== db) return da < db ? -1 : 1;
    const ca = String(a.createdAt || '');
    const cb = String(b.createdAt || '');
    if (ca !== cb) return ca < cb ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Consume EP (and bags) from lots. Explicit lotIds keep the caller's order.
 * Opening stock is a synthetic lot id "opening" and is used only after real lots
 * unless it is explicitly selected.
 */
function planAllocations(lots, neededEp, neededBags, lotIds) {
  const needed = roundQty(neededEp);
  const bagsNeeded = roundQty(neededBags || 0);
  if (!(needed > 0)) throw new Error('Transfer EP must be greater than zero.');

  let ordered;
  if (Array.isArray(lotIds) && lotIds.length > 0) {
    const byId = new Map(lots.map(l => [String(l.id), l]));
    ordered = [];
    for (const id of lotIds) {
      const lot = byId.get(String(id));
      if (!lot) {
        const err = new Error(`Selected lot ${id} is not an available source lot for this party and product.`);
        err.code = 'LOT_NOT_AVAILABLE';
        throw err;
      }
      ordered.push(lot);
    }
  } else {
    const real = sortLotsOldestFirst(lots.filter(l => l.kind !== 'opening'));
    const opening = lots.filter(l => l.kind === 'opening');
    ordered = real.concat(opening);
  }

  const allocations = [];
  let epLeft = needed;
  let bagsLeft = bagsNeeded;

  for (const lot of ordered) {
    if (epLeft <= 0.0001) break;
    const remEP = roundQty(lot.remainingEndProduct || 0);
    const remBags = roundQty(lot.remainingBags || 0);
    if (remEP <= 0) continue;
    const takeEP = roundQty(Math.min(remEP, epLeft));
    let takeBags = 0;
    if (bagsLeft > 0 && remBags > 0) {
      if (takeEP >= remEP - 0.0001) takeBags = Math.min(remBags, bagsLeft);
      else takeBags = Math.min(remBags, bagsLeft, roundQty(remBags * (takeEP / remEP)));
      takeBags = roundQty(takeBags);
    }
    allocations.push({
      lotId: lot.id,
      lotKind: lot.kind,
      endProduct: takeEP,
      bags: takeBags,
      remainingEndProductBefore: remEP,
      remainingBagsBefore: remBags,
      settledEndProductAtTransfer: roundQty(lot.settledEndProduct || 0),
      settlementCountAtTransfer: Array.isArray(lot.settlementIds) ? lot.settlementIds.length : 0
    });
    epLeft = roundQty(epLeft - takeEP);
    bagsLeft = roundQty(Math.max(0, bagsLeft - takeBags));
  }

  return {
    ok: epLeft <= 0.02,
    shortfallEp: epLeft > 0.02 ? epLeft : 0,
    allocations,
    unallocatedBags: bagsLeft
  };
}

function sumAllocated(allocations, field) {
  return roundQty((allocations || []).reduce((s, a) => s + (Number(a[field]) || 0), 0));
}

module.exports = {
  roundQty,
  resolveTransferQuantities,
  sortLotsOldestFirst,
  planAllocations,
  sumAllocated
};
