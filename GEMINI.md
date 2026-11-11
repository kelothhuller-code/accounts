# Keloth Accounts & CoffeeTracker Guidelines

## Strict Accounting Rules

1. **Mandatory Pre-Posting Calculation Check:**
   - Before posting any sheet (Arrivals, Dispatches, Husk, Payments, Settlements), perform an exhaustive, independent calculation check of every single arithmetic operation (gross amounts, outturns, clean EP formulas, tax breakdowns, subtotals, cumulative roll-forwards, and weighted averages).
   - Never silently alter written figures with calculated numbers without flagging mismatches to the user.

2. **Mandatory Opening Balance Verification:**
   - On every payment/cash reconciliation sheet, always verify that the written opening balance and the individual account breakdown match the previous confirmed day's closing balance down to the rupee.
   - Any mismatch between yesterday's closing and today's opening must be investigated and reported before posting.

3. **Mandatory Commitment Link:**
   - Every coffee bill or storage settlement must link to an available active commitment for the same party, grade, and rate, with sufficient remaining quantity. Never silently bill unlinked or invent a commitment.

4. **Red Cross Rule for Arrivals:**
   - An arrival is marked BILLED only when there is a red cross before its TOTAL / amount.
   - Strike-through on party name or a red rate alone does NOT mean billed.
   - Normal arrivals remain in storage unless explicit instructions establish billing/settlement.

5. **Coffee Husk Rules:**
   - Always Coffee Husk outward sale (`dispatchType: 'husk'`).
   - CGST/SGST 2.5% each (5% total). No 0.1% TDS/TCS on husk bills.
