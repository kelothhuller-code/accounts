/**
 * TRANSCRIBED real-record facts from Accounts.
 * These are not a live-store export, not a backup, and not full live-store validation.
 * No internal ids were supplied for the SALAM → HASHIM move. Do not invent ids or repair pairs.
 * Rows marked doNotPost were never posted and must not be created as existing bills.
 */

const TRANSCRIPT_LABEL = 'transcribed-real-record-not-live-store-validation';

const commitments = [
  { legacyDisplayNo: 'COM-PUR0169', party: 'Deepak', product: 'RC raw', quantity: 50, rate: 383, type: 'bags', category: 'purchase' },
  { legacyDisplayNo: 'COM-PUR0170', party: 'YAS', product: 'RC raw', quantity: 50, rate: 383, type: 'bags', category: 'purchase' },
  { legacyDisplayNo: 'COM-PUR0171', party: 'NATESH', product: 'RC raw', quantity: 200, rate: 384.5, type: 'bags', category: 'purchase', date: '2026-11-06', fulfilledQty: 0 }
];

const angel = {
  legacyDisplayNo: 'ARR0189',
  party: 'Angel',
  product: 'RCA',
  weight: 15000,
  bags: 200,
  vehicleNo: 'KA18D3453',
  date: '2026-11-06',
  billing: 'storage',
  rate: 0,
  calculationBasis: 'direct',
  commitment: {
    legacyDisplayNo: 'COM-PUR0082',
    quantity: 20000,
    rate: 384.6,
    previousRate: 385.25,
    fulfilledQty: 0,
    note: 'Fulfilled stayed 0 because a billed status/note did not persist. That persistence bug is not fixed here.'
  }
};

const satish = {
  legacyDisplayNo: 'ARR0190',
  party: 'Satish',
  product: 'RC raw',
  weight: 7505,
  bags: 150,
  outturn: 26.6,
  outturnType: 'per_50kg',
  calculationBasis: 'end_product',
  rateUnit: 'per_kg_ep',
  rate: 384,
  gross: 1533181.44,
  net: 1533181.44,
  tax: 0,
  endProduct: 3992.66,
  commitment: { legacyDisplayNo: 'PUR0121', quantity: 150, type: 'bags', fulfilled: 150, remaining: 0 }
};

const saidurga = {
  party: 'Saidurga',
  date: '2026-11-06',
  product: 'RCA',
  weight: 15000,
  rate: 387.5,
  gross: 5812500,
  calculationBasis: 'direct',
  commitmentLegacyDisplayNo: 'COM-SALE0018',
  legacyDisplayNo: 'DSP0159'
};

const cp = {
  party: 'CP',
  date: '2026-11-05',
  vehicleNo: 'KA12C9696',
  physicalWeight: 7688,
  billing: 'storage',
  legacyDisplayNo: 'DSP0159',
  note: 'Same display number as Saidurga DSP0159 is a display collision, not an internal id collision.',
  cuttingKg: 35,
  billableWeight: 7653,
  unpostedInvoice: {
    doNotPost: true,
    rate: 385,
    gross: 2946405,
    invoiceDisplay: '231'
  }
};

const kamadhenu = {
  doNotPost: true,
  party: 'Kamadhenu',
  date: '2026-11-06',
  invoiceDisplay: '167',
  weightKg: 12115,
  rate: 7.5,
  taxable: 90862.5,
  cgstRate: 2.5,
  sgstRate: 2.5,
  igstRate: 5,
  badPreviewNet: 99948.75,
  expectedIntraNet: 95405.62,
  note: 'Not an existing bill. Do not create it as a posted historical record.'
};

const salamToHashim = {
  fromParty: 'SALAM',
  toParty: 'HASHIM',
  sourceHint: 'ARR0141',
  product: 'RC EP',
  bags: 134,
  endProduct: 9740,
  money: 0,
  alreadyPostedManually: true,
  verifiedIds: null,
  remark: 'SALAM ARR0141 RC EP 134 bags 9740 EP to HASHIM'
};

module.exports = {
  TRANSCRIPT_LABEL,
  commitments,
  angel,
  satish,
  saidurga,
  cp,
  kamadhenu,
  salamToHashim
};
