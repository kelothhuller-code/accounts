/**
 * Single-pass newest-first page window. Avoids copying and reversing the full array
 * when the caller asks for a page. Summary folds match the arrival and dispatch screens.
 */

function isSecondaryArrival(a) {
  if (a.isSecondary !== undefined) return a.isSecondary === true;
  return String(a.product || '').toLowerCase().includes('husk');
}

function isSecondaryDispatch(d) {
  if (d.isSecondary !== undefined) return d.isSecondary === true;
  if (d.isMain === true) return false;
  return d.dispatchType === 'husk' || String(d.product || '').toLowerCase().includes('husk');
}

function emptySide() {
  return {
    rawWeight: 0,
    bags: 0,
    endProduct: 0,
    pendingEp: 0,
    billedEp: 0,
    billedValue: 0,
    count: 0
  };
}

function summarizeArrivals(records) {
  const main = emptySide();
  const secondary = emptySide();
  const products = new Set();
  for (const a of records) {
    if (a.product) products.add(a.product);
    const side = isSecondaryArrival(a) ? secondary : main;
    const w = Number(a.weight) || 0;
    const b = Number(a.bags) || 0;
    const ep = Number(a.endProductWeight) || 0;
    side.rawWeight += w;
    side.bags += b;
    side.endProduct += ep;
    side.count += 1;
    if (a.status === 'storage' || a.status === 'partial_settled') {
      side.pendingEp += a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : ep;
    }
    if (a.status === 'billed' || a.status === 'cash_bill') {
      side.billedEp += ep;
      side.billedValue += Number(a.netAmount) || Number(a.billAmount) || 0;
    }
  }
  const finish = (side) => ({
    rawWeight: Math.round(side.rawWeight * 100) / 100,
    bags: Math.round(side.bags * 100) / 100,
    endProduct: Math.round(side.endProduct * 100) / 100,
    pendingEp: Math.round(side.pendingEp * 100) / 100,
    billedEp: Math.round(side.billedEp * 100) / 100,
    billedValue: Math.round(side.billedValue * 100) / 100,
    avgRate: side.billedEp > 0 ? (side.billedValue / side.billedEp).toFixed(2) : '0',
    count: side.count
  });
  return {
    count: records.length,
    main: finish(main),
    secondary: finish(secondary),
    productNames: Array.from(products).sort()
  };
}

function summarizeDispatches(records) {
  const main = emptySide();
  const secondary = emptySide();
  let billedSales = 0;
  let gst = 0;
  const products = new Set();
  for (const d of records) {
    if (d.product) products.add(d.product);
    const side = isSecondaryDispatch(d) ? secondary : main;
    const w = Number(d.weight) || 0;
    const b = Number(d.bags) || 0;
    const ep = Number(d.endProductWeight) || w;
    side.rawWeight += w;
    side.bags += b;
    side.endProduct += ep;
    side.count += 1;
    const isStore = d.rateType === 'storage_out' || d.status === 'storage_out';
    if (isStore) {
      side.pendingEp += d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep;
    } else {
      side.billedEp += ep;
      side.billedValue += Number(d.netAmount) || Number(d.billAmount) || 0;
      billedSales += Number(d.netAmount) || Number(d.billAmount) || 0;
      gst += (Number(d.cgstAmount) || 0) + (Number(d.sgstAmount) || 0) + (Number(d.igstAmount) || 0);
    }
  }
  const finish = (side) => ({
    rawWeight: Math.round(side.rawWeight * 100) / 100,
    bags: Math.round(side.bags * 100) / 100,
    endProduct: Math.round(side.endProduct * 100) / 100,
    pendingEp: Math.round(side.pendingEp * 100) / 100,
    billedEp: Math.round(side.billedEp * 100) / 100,
    billedValue: Math.round(side.billedValue * 100) / 100,
    avgRate: side.billedEp > 0 ? (side.billedValue / side.billedEp).toFixed(2) : '0',
    count: side.count
  });
  return {
    count: records.length,
    main: finish(main),
    secondary: finish(secondary),
    billedSales: Math.round(billedSales * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    productNames: Array.from(products).sort()
  };
}

/**
 * Newest-first page without cloning the full match list.
 * `records` is chronological (oldest at index 0), matching on-disk order.
 */
function pageNewestFirst(records, match, page, limit) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 50);
  const start = (p - 1) * l;
  const items = [];
  let total = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    if (!match(rec)) continue;
    if (total >= start && items.length < l) items.push(rec);
    total += 1;
  }
  return {
    items,
    totalCount: total,
    page: p,
    limit: l,
    totalPages: Math.max(1, Math.ceil(total / l))
  };
}

module.exports = {
  isSecondaryArrival,
  isSecondaryDispatch,
  summarizeArrivals,
  summarizeDispatches,
  pageNewestFirst
};
