# Accounts bot entry

This is the supported way to prepare records faster than the forms. It uses the same arrival, dispatch, commitment, payment, and EP-transfer methods as the screens. It does not write MongoDB and it does not bypass confirmation gates.

The listener is `127.0.0.1:4820` inside the desktop app. It rejects any other address, any browser `Origin`, and any browser `Sec-Fetch-Site` other than `none`. There is no cross-origin header. If `COMMODITY_BOT_TOKEN` is set in the environment, requests must send the same value in `X-Commodity-Bot-Token`.

Do not expose this port on a network. Accounts has not used the older direct `POST /api/arrivals` routes; those writes now return `410` and point here.

## Routes

| Method | Path | Effect |
| --- | --- | --- |
| GET | `/api/bot/schema` | Field reference |
| GET | `/api/status`, `/api/products`, `/api/suppliers` | Read local data |
| POST | `/api/bot/preview` | Dry run. No writes |
| POST | `/api/bot/commit` | Writes only after preview rules pass |

## Commit body

`idempotencyKey` is a request id of at least 8 characters. It must not be a display number such as `ARR0189`, `DSP0159`, or `COM-PUR0169`. The same key and the same body return the first result and do not write again. The same key with a different body returns `409` and does not overwrite.

`partyAliases` maps an alias to an exact party name or supplier id before matching. Exact names match directly. A single inexact name is rejected unless `confirmations.fuzzyNameMerges` is true. Two matches are always rejected.

`entries[]` needs an explicit `date` (`YYYY-MM-DD`) and, for arrivals and dispatches, `billing`: `storage`, `billed`, or `cash`.

| Confirmation | Required when |
| --- | --- |
| `storageBooking` | `billing` is `storage`, or the row is an EP transfer |
| `commitmentDeductions` | A billed or cash row links an open commitment |
| `cashSales` | `billing` is `cash` |
| `fuzzyNameMerges` | A party name is not exact |
| `duplicates` | The same party, date, product, quantity, and rate already exist, or a settlement already covers that physical dispatch |
| `moneyMovement` | An EP transfer sets `moneyMovement: true` |

Storage does not fulfill a commitment. Payments do not create bills. `post: false` (or `doNotPost: true`) stays in the preview and is skipped on commit. That is how the Kamadhenu invoice and the CP cutting invoice stay unposted.

A successful commit returns internal ids plus quantities, tax, and remaining figures. Display numbers are labels only. Two rows may share `legacyDisplayNo` (the DSP0159 collision) and still have different ids.

Commit is one local transaction. If any row fails, the batch is restored and nothing from that request is kept. Disk save does not wait for the network, and this path does not start a cloud sync.

## Example

```json
{
  "idempotencyKey": "acct-2026-11-06-batch-7f3a",
  "partyAliases": { "Deepak R": "Deepak" },
  "confirmations": { "commitmentDeductions": true },
  "entries": [
    {
      "clientRef": "deepak-50",
      "kind": "arrival",
      "date": "2026-11-06",
      "party": { "alias": "Deepak R" },
      "product": "RC raw",
      "billing": "billed",
      "bags": 50,
      "weight": 2500,
      "rate": 383,
      "rateUnit": "per_bag",
      "linkCommitment": true,
      "cgstRate": 0,
      "sgstRate": 0,
      "igstRate": 0,
      "tdsRate": 0,
      "tcsRate": 0
    }
  ]
}
```

Preview that body with `POST /api/bot/preview`. Commit the same body, including the idempotency key, with `POST /api/bot/commit`.
