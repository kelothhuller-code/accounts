/**
 * Authoritative GST for bills and settlements.
 * Intra-state (CGST+SGST) and inter-state (IGST) are mutually exclusive.
 * Product masters store IGST as the interstate alternative (CGST+SGST), not a third tax.
 * Component rounding matches the historical per-line Math.round expression.
 * Summing individually rounded CGST and SGST can differ by 1 paise from one aggregate IGST round.
 */

function componentTax(taxable, rate) {
  return Math.round((Number(taxable) * ((Number(rate) || 0) / 100)) * 100) / 100;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function ratesClose(a, b) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.001;
}

/**
 * @returns {'intra'|'inter'|'none'|'ambiguous'}
 */
function resolveTaxTreatment({ billType, taxTreatment, cgstRate, sgstRate, igstRate } = {}) {
  if (billType && billType !== 'gst_bill') return 'none';
  if (taxTreatment === 'intra' || taxTreatment === 'inter' || taxTreatment === 'none') {
    return taxTreatment;
  }
  if (taxTreatment != null && taxTreatment !== '') {
    return 'ambiguous';
  }

  const cgst = Number(cgstRate) || 0;
  const sgst = Number(sgstRate) || 0;
  const igst = Number(igstRate) || 0;
  const split = cgst + sgst;

  if (igst > 0 && split > 0) {
    if (ratesClose(igst, split)) return 'intra';
    return 'ambiguous';
  }
  if (igst > 0) return 'inter';
  if (split > 0) return 'intra';
  return 'none';
}

function inferTaxTreatmentFromStoredAmounts(record) {
  if (!record) return 'none';
  if (record.taxTreatment === 'intra' || record.taxTreatment === 'inter' || record.taxTreatment === 'none') {
    return record.taxTreatment;
  }
  if (record.billType && record.billType !== 'gst_bill') return 'none';
  const cgst = Number(record.cgstAmount) || 0;
  const sgst = Number(record.sgstAmount) || 0;
  const igst = Number(record.igstAmount) || 0;
  if (igst > 0 && cgst === 0 && sgst === 0) return 'inter';
  if ((cgst > 0 || sgst > 0) && igst === 0) return 'intra';
  if (igst > 0 && (cgst > 0 || sgst > 0)) return 'intra';
  return resolveTaxTreatment({
    billType: record.billType || 'gst_bill',
    cgstRate: record.cgstRate,
    sgstRate: record.sgstRate,
    igstRate: record.igstRate
  });
}

/**
 * Recomputes tax, bill and net. Does not trust a submitted netAmount.
 * Submitted tdsAmount / tcsAmount are kept when provided (including 0), matching existing deduction semantics.
 */
function computeDocumentTax({
  billType = 'gst_bill',
  taxableAmount = 0,
  taxTreatment,
  cgstRate = 0,
  sgstRate = 0,
  igstRate = 0,
  tdsRate = 0,
  tcsRate = 0,
  tdsAmount,
  tcsAmount
} = {}) {
  const taxable = roundMoney(taxableAmount || 0);
  const treatment = resolveTaxTreatment({ billType, taxTreatment, cgstRate, sgstRate, igstRate });
  if (treatment === 'ambiguous') {
    const err = new Error(
      'Tax treatment is ambiguous: CGST/SGST and IGST are both set and are not one intra/inter alternative. Pass taxTreatment "intra" or "inter". They must not be added together.'
    );
    err.code = 'AMBIGUOUS_TAX_TREATMENT';
    throw err;
  }

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  if (treatment === 'intra') {
    cgstAmount = componentTax(taxable, cgstRate);
    sgstAmount = componentTax(taxable, sgstRate);
  } else if (treatment === 'inter') {
    igstAmount = componentTax(taxable, igstRate);
  }

  const billAmount = roundMoney(taxable + cgstAmount + sgstAmount + igstAmount);
  const resolvedTds = tdsAmount !== undefined && tdsAmount !== null && tdsAmount !== ''
    ? roundMoney(tdsAmount)
    : componentTax(taxable, tdsRate);
  const resolvedTcs = tcsAmount !== undefined && tcsAmount !== null && tcsAmount !== ''
    ? roundMoney(tcsAmount)
    : componentTax(taxable, tcsRate);
  const netAmount = roundMoney(billAmount - resolvedTds - resolvedTcs);

  return {
    taxTreatment: treatment,
    taxableAmount: taxable,
    cgstRate: treatment === 'none' ? 0 : (Number(cgstRate) || 0),
    sgstRate: treatment === 'none' ? 0 : (Number(sgstRate) || 0),
    igstRate: treatment === 'none' ? 0 : (Number(igstRate) || 0),
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstTotal: roundMoney(cgstAmount + sgstAmount + igstAmount),
    billAmount,
    tdsRate: Number(tdsRate) || 0,
    tcsRate: Number(tcsRate) || 0,
    tdsAmount: resolvedTds,
    tcsAmount: resolvedTcs,
    netAmount
  };
}

module.exports = {
  componentTax,
  roundMoney,
  resolveTaxTreatment,
  inferTaxTreatmentFromStoredAmounts,
  computeDocumentTax
};
