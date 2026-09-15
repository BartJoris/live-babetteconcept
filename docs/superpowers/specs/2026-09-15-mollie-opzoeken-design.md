# Mollie opzoeken: order → betaling → uitbetaling

## Problem

The accountant cannot find Odoo order numbers (e.g. S02118) in Mollie payouts. Payouts are batched settlements and do not list sale-order names. Odoo already books each webshop payment on account **580100 Mollie in transit**, with the Mollie payment id (`tr_…`) in the description. Payment date in Odoo is not the settlement date in Mollie.

## Goal

A logged-in page on this site where you can:

1. Look up one identifier (order, invoice, `tr_…`, or customer name) and see the chain **Odoo → Mollie payment → Mollie payout**.
2. See all **open 580100** journal lines, each enriched with the same Mollie status.
3. Download the visible table as CSV (for the accountant).

Out of scope: importing settlements into Odoo (already `/mollie-export`), PayPal/Worldline, changing Odoo bookings.

## Page

- Route: `/mollie-opzoeken`
- Auth: same session as other Boekhouding pages (`useAuth` / `withAuth`)
- Nav: Boekhouding menu, next to Mollie Export
- Not a tab on `/mollie-export` or `/boekhouding-inzichten`

### Search

One search field. Submit looks up:

- Mollie id if the query matches `tr_` + alphanumerics
- otherwise Odoo sale order, customer invoice, payment, and 580100 line description / partner name (case-insensitive)

Result table, one row per match, columns:

| Column | Meaning |
| --- | --- |
| Order / factuur | Odoo document name(s) |
| Relatie | Partner |
| Odoo-datum | Payment / move date |
| Bedrag | Residual or original debit on 580100 |
| Mollie-id | `tr_…` |
| Mollie-status | paid / refunded / … from Mollie |
| Uitbetaling | Settlement reference + settled date, or empty |
| Match-status | see Status below |

Empty search result: Dutch message naming the query, not a blank table.

### Open 580100

Load automatically when the page opens (search does not wait for this). All `account.move.line` on account code **580100** with a non-zero residual (`amount_residual != 0`). Same columns. Filter chips: all / already paid out in Mollie / still in transit.

Account lookup: `account.account` by code `580100`. If missing, `ilike` name `Mollie in transit`. If still missing, show an error; do not guess another account.

No date range required: the list is “still open”, not “posted in period”. Cap at 250 lines; if truncated, show a Dutch warning so the accountant knows to filter in Odoo.

### Download

Client-side CSV of the table currently shown (search results **or** open-items, whichever the user clicked download on). UTF-8 BOM, Belgian number/date style consistent with `/mollie-export`. No extra server export endpoint.

## Status values

Exactly these four match statuses (Dutch labels on the page):

| Status | When |
| --- | --- |
| `uitbetaald` | Mollie payment has a settlement link; show settlement reference + date |
| `in_transit` | Mollie payment exists, no settlement yet — **not an error** |
| `geen_mollie_id` | Odoo line/order found, description has no `tr_…` |
| `niet_in_mollie` | `tr_…` present (or queried) but Mollie returns 404 / unknown |

Also surface Mollie payment `status` (paid, refunded, …) as a separate column, not mixed into match-status.

## Data flow

Lookup is **Odoo first, then one Mollie GET per unique `tr_…`**. Do not list all Mollie payments to search by description.

1. **Query is `tr_…`:** `GET https://api.mollie.com/v2/payments/{id}`. Then find Odoo 580100 / payment lines whose name/ref contains that id.
2. **Otherwise:** Odoo `search_read` on `sale.order` (name), `account.move` (out invoices, name/ref), `account.payment`, and 580100 `account.move.line` (name, partner). Extract `tr_…` with the same parser as tests (see below).
3. For each unique `tr_…`: Mollie payment fetch. If `_links.settlement` exists, fetch that settlement (`id`, `reference`, `settledAt`).
4. Reuse `fetchMollie` from `lib/mollieSettlementShared.ts`. Do not duplicate HTTP helpers. Keep settlement CSV/import logic in that file; new lookup types and matching live in `lib/mollieLookup.ts`.

Odoo credentials: session uid/password via existing `OdooClient`, same as accounting insights.

Mollie credentials: `MOLLIE_API_KEY` (already used by `/api/mollie/settlements`).

## APIs

Both `withAuth`, `Cache-Control: private, no-store`, `maxDuration = 60`.

### `GET /api/mollie/lookup?q=`

- `q` required, trimmed, min 2 characters, max 80.
- Response JSON: `{ query, rows: LookupRow[] }`.
- 400 if `q` missing/invalid; 500 with Dutch message on Odoo/Mollie failure.

### `GET /api/mollie/in-transit`

- No query params.
- Response JSON: `{ accountCode, accountName, rows: LookupRow[] }`.
- Deduplicate Mollie fetches by `tr_…` across lines.

`LookupRow` (shared):

```
odooMoveName, odooOrderName, partnerName, odooDate, amount, currency,
molliePaymentId, molliePaymentStatus, settlementId, settlementReference,
settledAt, matchStatus
```

Nullable strings/numbers where data is missing. `matchStatus` is one of the four values above.

## Errors (UI)

- No rows: “Geen Odoo-order of betaling gevonden voor {query}.”
- `geen_mollie_id` / `niet_in_mollie` / `in_transit`: shown as row status, not a page-level error.
- Odoo or Mollie HTTP failure: red banner; disable CSV until data loaded.
- Missing `MOLLIE_API_KEY` or missing 580100 account: banner with that fact.

## Tests (Vitest, fixtures only)

File: `lib/mollieLookup.ts` + `lib/__tests__/mollieLookup.test.ts` (or colocated `__tests__`).

- Parse `tr_…` from `Mollie 502651 - Lien Van Haecke - tr_gV8HHoliPUS1X6xS1PU`.
- Ignore strings that look similar but are not Mollie ids.
- Query routing: `tr_…` vs `S02118` vs customer name.
- Status mapping for the four match statuses.
- CSV headers and one sample row.

No live Mollie or Odoo calls in tests.

## Non-goals

- Writing or reconciling Odoo moves.
- Searching Mollie payouts by order number (impossible; this page exists so nobody has to).
- Changing `/mollie-export` behaviour.
