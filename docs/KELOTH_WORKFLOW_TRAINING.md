# Keloth CoffeeTracker Accounting Workflow & Training Protocol

> **Status:** Training & Reference Only. Live data entry is **PAUSED** until explicitly resumed by user.

---

## 1. Understand the Five Core Distinctions
Keep these strictly separated:
1. **Arrival / Dispatch:** Physical movement of goods into or out of the mill.
2. **Storage-In / Storage-Out:** A physical movement that is unbilled/unfixed financially.
3. **Commitment:** A binding contract specifying party, grade, direction (purchase/sale), quantity, and agreed rate.
4. **Bill / Storage Settlement:** Financial recognition of goods received, dispatched, or settled from storage.
5. **Payment:** Actual monetary movement (bank transfer, cash, UPI).

### Strict Rules:
- **Payment does NOT authorize settlement.**
- **Commitment does NOT prove physical delivery.**
- **Billing an existing storage movement must NEVER create another physical stock movement.**
- **Mandatory Commitment Link:** Every coffee bill or storage settlement **MUST** link to an available active commitment for the same party, grade, and rate, with sufficient remaining quantity. If none exists, stop and ask. **Never silently bill unlinked or invent a commitment.** (Older rules permitting unlinked billing are superseded).

---

## 2. Reading Images & Handwritten Sheets
- **Structure First:** Identify date, document type, column headings, and units before parsing rows.
- **Full Visible Extraction:** Party, vehicle no, grade, bags, gross/tare/net weight, handwritten deductions, raw weight, outturn (OT), Clean EP, rate, rate unit, amount, taxes, and status markings.
- **Cross-Check Without Silent Overwrites:** Cross-verify arithmetic. Never silently replace written numbers with calculated numbers. Flag handwriting ambiguity and mismatches.
- **Duplicate & False Transaction Traps:**
  - Watch for duplicate photos, forwarded slips, multi-trip vehicles, first vs final weighment slips, and sub-totals mistaken for transactions. A repeated image is never a new transaction.
- **Party Matching:** Match names against existing accounts before creating anything. Always ask before creating a new party or product.

---

## 3. Arrival Sheets & Physical Inward
- **Fields:** Date, party, vehicle, moisture, outturn, bags, actual weight, grade, rate, total.
- **Product & Clean EP Mapping:**
  - With outturn written $\rightarrow$ `RC Raw`.
  - Without outturn $\rightarrow$ `RC EP` (unless a specific processed grade is written).
  - Abbreviations like `AAA` map to corresponding RC grade. `AB` and `B` map to `RC B`.
  - **Moisture Alert:** Moisture $> 17\%$ must be flagged before proceeding.
- **Formula:**
  $$\text{Clean EP (kg)} = \frac{\text{Raw kg}}{50} \times \text{Outturn}$$
  *(e.g., 5,000 kg raw @ OT 26 = 2,600 kg EP).* Never confuse raw weight with billable EP.
- **Bag Counts:** Record actual written bags. Use $\frac{\text{Raw kg}}{50}$ and $\frac{\text{EP kg}}{75}$ as validation checks, never to overwrite actual bag counts. (Chethu trip quantity is typically 50 bags).
- **Per-50kg Rates:** If rate is quoted per 50kg EP, divide by 50 for the per-kg rate. Do not convert blindly without checking headings.
- **Storage Rule:** Normal arrivals remain in storage until the accountant sheet and explicit instructions establish billing/settlement.
- **Rejected Loads:** Record as an arrival with zero weight, zero bags, zero EP, with actual rejected-load details in remarks (no outward dispatch).

---

## 4. Accountant Sheet & Settlement Section
- **The Red Cross Rule:** An arrival is marked **BILLED** only when there is a **red cross before its TOTAL / amount**.
  - A strike-through on party name does NOT mean billed.
  - A red rate alone does NOT override the TOTAL-cross rule.
  - Other arrivals remain in storage unless explicitly instructed.
  - Even with a cross, the matching commitment requirement still applies. If missing, ask.
- **"Settled" Section:**
  - Settles existing storage; **NOT** new arrivals.
  - Match party, grade, raw weight, bags, EP, rate, storage availability, and open commitment.
  - For Keloth, eligible lots allocate oldest-first where permitted, but total raw weight and EP must match the sheet.
  - Use each lot's own outturn to calculate raw weight and bags—do not assume OT 26.
  - Hold coffee settlements until accountant sheet arrives. Payments never imply settlement.

---

## 5. Commitments (Contracts)
- **Separate Purchases & Sales:**
  - *"Sales to you"* = We **purchase**.
  - *"Bought from Keloth"* = We **sell**.
- **Bag Conversion:** 1 bag = 50 kg raw. Pending EP estimate = 26 kg EP/bag. Actual bag-based settlement uses settled EP $\div$ bags.
- **WhatsApp Deals:** An authorized WhatsApp deal confirmation establishes a commitment. Create the commitment first, then link the bill. Never silently alter an existing rate to match an invoice.
- **Do not short-close** remaining quantities without explicit instruction.

---

## 6. Dispatch Sheets & Store Out
- **Units:** $1\text{ MT} = 1{,}000\text{ kg}$. "Lifting" means the customer collected from our mill/location.
- **Storage First, Bill Later:**
  - Coffee dispatches start as `storage_out`.
  - When an invoice arrives:
    1. Match to existing movement (party, grade, vehicle, date, quantity).
    2. Check if already billed or represented by a settlement.
    3. Find matching active commitment.
    4. Apply authorized cutting and final billed quantity.
    5. Bill existing movement without creating another stock-out.
  - First-weight slips or lifting notes alone are not invoices.
- **Cutting & Returns:**
  - Keep physical loaded weight, cutting, and billed quantity traceable (e.g. CP 7,688 kg loaded $- 35\text{ kg cutting} = 7{,}653\text{ kg billed}$).
  - Returns must correct physical stock without double-counting (do not create both a dispatch correction and a separate return arrival).

---

## 7. Husk Entries
- **Classification:** Always Coffee Husk outward sale (`dispatchType: 'husk'`). Never a coffee purchase or EP settlement.
- **Tax Rules:**
  - No GST written $\rightarrow$ Cash Bill.
  - CGST/SGST shown $\rightarrow$ GST Bill with written rates (Kamadhenu example: 2.5% CGST + 2.5% SGST). Never add IGST on top of CGST/SGST.
  - **No 0.1% TDS/TCS deduction** on husk bills.
- **Mapping:** Anand husk maps to `GAJANANA`. (`Anand Coffee` and `ANANDAN BANGLORE` are separate coffee accounts).

---

## 8. Payment Pages & Reconciliation
- **Formula Check:**
  $$\text{Opening} + \text{Receipts} - \text{Bank Payments} - \text{Cash/UPI Payments} = \text{Closing}$$
  - Check that page opening equals the previous confirmed closing.
  - Closing breakdown entries (bank balances, cash in hand, wallet/GPay balances) are holdings, NOT receipts.
  - Red totals are sums, not transactions.
- **Post vs. Skip:**
  - Skip internal transfers between own bank/cash/wallet accounts (`CASH TO A/C`, `GP FAVAS` internal).
  - `AJU` / `GP AJU` = `AJMAL` (genuine external payments, post both ways).
  - Any discrepancy between calculated and written closing must be investigated—never invent adjustments.
- **Classifications:**
  - Security, minor repairs, unloading, analyser charges, mamool $\rightarrow$ `COMMON EXPENSE`.
  - Bank interest $\rightarrow$ `COMMON EXPENSE` (remark: *"Bank interest"*).
  - Dust sales, Somu Allana income $\rightarrow$ `COMMON INCOME`.
  - Screen purchases $\rightarrow$ Machinery expense.
  - "Sujith short" $\rightarrow$ `SUJITH`.
  - `OMSHREE LORRY` $\rightarrow$ separate lorry freight account, not OMSHREE coffee.
  - Octavious paying for Ragsys $\rightarrow$ 1 receipt under `RAGSYS` with payer note.
  - TDS paid to Keloth $\rightarrow$ payment to `KELOTH`, receipt under `TDS`.
  - Supplier payments never equal coffee settlements.

---

## 9. Tax Rules & Party-Specific Defaults
Never apply a single blanket default. Established party rules:
- `KELOTH` & `MUHAMAD`: No TDS / No TCS.
- `METRO` / `Majeed`: No TCS.
- `HASHIM`: 0.1% TCS on settlements.
- Sales TDS (0.1%): `HANGAL`, `BLAN`, `WESTERN COFFEE` (`WCC`), `KISHOR`, `KISHOR-SUN`, `JASVIC`, `SV`, `VIDHYA`, `Anand Coffee`.
- `OMSHREE`: TDS on full bill when single bill $> ₹50\text{ Lakh}$.
- `LEELAPRASAD`: TDS on portion exceeding $₹50\text{ Lakh}$ when single bill $> ₹50\text{ Lakh}$.
- `Husk`: No TDS / No TCS.
- Satheesh 06-Nov exception (₹384, no tax) is a specific one-time instruction; do not generalize.

---

## 10. Established Name Mappings
- `Ganesh Commodities` $\rightarrow$ `NISAR EDAVETTAN`
- `Deepak Cherambane` $\rightarrow$ `MANDAPANNA DEEPAK` (distinct from `Mysore Coffee/DEEPAK`)
- `Angel Coffee` $\rightarrow$ `ANGEL`
- `Satheesh Kanoor` $\rightarrow$ `BASWESHARA/SATHEESH`
- `Chetan` $\rightarrow$ `CHETHU`
- `Mountain Coffee` / `PH Sons` / `Hameed` $\rightarrow$ `PH SONS (HAMEED)`
- `Farmer Four` $\rightarrow$ `CJ`
- `Blancofy` / `Praveen Abbi` $\rightarrow$ `BLAN`
- `Hareesh` (commitments) $\rightarrow$ `SAIDURGA`
- `Janaki Coffee` / `Basheer balel` $\rightarrow$ `BASHEER KBR` (distinct from `MUDIGERE`)
- `Alavika` $\rightarrow$ `ALAVI`
- `GREEN` $\rightarrow$ `RASHEED`
- `WING` / `Wide Ventures` $\rightarrow$ `BROFFY`
- `JASVIR` (dispatch context) $\rightarrow$ `JASVIC`
- `Sun Brew` $\rightarrow$ `KISHOR-SUN`
- `Shashank` $\rightarrow$ `SASANK`
- `Ragu` (bag entries) $\rightarrow$ `HOMBALE`
- `Uppachi` $\rightarrow$ `HASHIM` (except explicit WCC deals $\rightarrow$ `WESTERN COFFEE`)
- `Salamkka` / `SALAM Kadanga` $\rightarrow$ `SALAM` (distinct from `SALAM ASS` and `ROYAL MOIDU`)
- `AJU` $\rightarrow$ `AJMAL`
- `Kuttu` $\rightarrow$ `MIDLAJ K` (Owner)
- `Plain MIDLAJ` on expense lines $\rightarrow$ `MIDLAJ VALAD` (Accountant)
- `Basavaraj` / `Shashidara` / `Sashi` on payment sheets $\rightarrow$ `COMMON EXPENSE` (Security)
- Ambiguous Kishore receipts $\rightarrow$ allocate to whichever of `KISHOR` or `KISHOR-SUN` owes more; ask if unclear.

---

## 11. Bags, Freight & Extras
- Check bag sales at bottom of payment pages and dispatch messages.
- Established rates: `Hombale` PP bags @ ₹45/kg; `SASANK` PP bags @ ₹35/kg bulk.
- Coffee rate stays at commitment rate; do not hide bag costs or lorry rent in coffee rates.
- Driver freight pass-through recorded as separate money movements when they occur.

---

## 12. Clean EP Ownership Transfers
- Must preserve physical coffee & EP, with **no money movement**.
- Recognize existing legacy manual transfer pairs (e.g. `SALAM` $\rightarrow$ `HASHIM` 9,740 kg via `ARR-0141`, `DSP-0157`, `ARR-0183`) and never duplicate them.

---

## 13. Balance Sheets & Reconciliation
- Left side = **Payables** (amounts we owe).
- Right side = **Receivables** (amounts owed to us).
- Storage figures on sheets are **quantities in kg EP**, NOT currency values.
- Company EP formula:
  $$\text{Net Owned EP} = \text{Opening EP} + \text{Arrivals} - \text{Dispatches} - \text{Unsettled Store In} + \text{Unsettled Store Out}$$
- Never create a balancing entry or alter historical invoices to force agreement.

---

## 14. WhatsApp Verification Channels
- 4 groups: *Keloth huller 2 arrival*, *Keloth huller 2 Dispatch*, *Hitech Bills*, *Keloth Bills*.
- Cross-reference evidence against books and existing entries; do not create an entry for every chat slip.
- Pair first-weight slips with later final slips into a single load.

---

## 15. Pre-Save, Post-Save & Safety Gating
- **Pre-save:** Validate duplicates (party, date, vehicle, grade, quantity, existing settlements).
- **Post-save:** Read back and verify status, quantities, rate, taxes, net invoice, commitment deduction, remaining EP, and ledger balance.
- **Stop & Report:** Never silently retry failed saves, create parties, merge accounts, short-close commitments, write off differences, or overwrite local records.
