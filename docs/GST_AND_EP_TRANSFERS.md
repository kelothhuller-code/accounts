# GST and EP transfers

## GST

Product masters store IGST as the interstate alternative of CGST+SGST. A bill applies one treatment:

- `intra` charges CGST and SGST. IGST amount is zero.
- `inter` charges IGST. CGST and SGST amounts are zero.
- `none` is a cash bill or a zero-rate bill.

When both rate families are present and IGST equals CGST+SGST, new bills default to intra-state. Pass `taxTreatment: "inter"` to use IGST. Rates that are both positive and are not that alternative are rejected instead of added.

Each component is rounded with the existing half-up expression `Math.round(taxable * rate / 100 * 100) / 100`. On taxable ₹90,862.50 at 2.5% + 2.5%, the split is ₹2,271.56 + ₹2,271.56 = ₹4,543.12 and the net is ₹95,405.62. One 5% IGST round is ₹4,543.13, one paise higher. TDS and TCS are still deducted from that bill. A submitted net that does not match is ignored and stored as `submittedNetAmountIgnored`.

Opening an old bill and saving it recomputes that one bill with the treatment selected on the form. Loading, ledger display, and `preserveStoredTax` updates do not rewrite other historical rows. There is no migration of past invoices. The Kamadhenu 6 Nov invoice 167 was not posted; the doubled preview of ₹99,948.75 is not a stored bill.

Satish ARR0190 is a transcribed zero-tax exception (gross and net ₹15,33,181.44). It is not a new default. Omitted arrival TCS still uses the settings default.

## EP transfers

A new transfer consumes source lots, oldest first unless `lotIds` are sent, and adds one rate-0 unbilled storage arrival for the destination. Quantity moves once. Money is posted only when `moneyMovement` is true; the destination lot is still unbilled so it can be billed later against the destination's own commitment.

If weight is omitted, quantity is the end-product weight. It is not `bags * 50`. Bags already on the record are kept. Raw coffee EP remains `raw / 50 * outturn`. Graded direct bills use the weight. A transcribed bag count that is not `raw / 50` or `EP / 75` is stored as entered.

Transfer numbers come from a monotonic counter, not from the list length, so a delete does not reuse the next number. Delete puts the allocated quantity back and removes the linked destination arrival. It refuses, and changes nothing, when a later settlement or bill touched those lots.

Older transfers that already have a linked storage-out and a linked storage arrival are left in place. The ledger counts that stock once. A hand-posted pair (moved-out source plus a rate-0 destination arrival, matched by party, EP quantity, and remarks) is recognized and is not reposted or stitched together. The SALAM → HASHIM 9,740 EP move is in that category: no verified ids were supplied, and this change does not create or repair it.

## What was not changed

Outturn math, commitment wash, party-bill, and balance-adjustment formulas are unchanged. Settlement GST still matches the old CGST+SGST result when IGST is zero. Storage stays unbilled until a bill or settlement is entered. A settlement does not also create a physical dispatch.
