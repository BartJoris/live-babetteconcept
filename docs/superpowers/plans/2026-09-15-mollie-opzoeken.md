# Mollie Opzoeken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in page `/mollie-opzoeken` that finds an Odoo order/invoice/`tr_…` and shows the Mollie payment plus which payout it landed in, and lists open 580100 lines with the same enrichment, downloadable as CSV.

**Architecture:** Pure matching/CSV in `lib/mollieLookup.ts`. Odoo search + Mollie GET in `lib/mollieLookupService.ts` (session Odoo credentials, `fetchMollie` from `lib/mollieSettlementShared.ts`). Thin GET handlers. Page + Boekhouding nav.

**Tech Stack:** Next.js pages router, `withAuth` / `useAuth`, OdooClient, Mollie API v2, Vitest, TypeScript.

## Global Constraints

- Route `/mollie-opzoeken` (not a tab on mollie-export).
- Match statuses only: `uitbetaald` | `in_transit` | `geen_mollie_id` | `niet_in_mollie`.
- Account: code `580100`, else name ilike `Mollie in transit`; never guess another account.
- Open list: residual != 0, cap 250, no date range.
- Lookup: Odoo first, then one Mollie GET per unique `tr_…`.
- CSV is client-side from the visible table; UTF-8 BOM.
- APIs: `withAuth`, `Cache-Control: private, no-store`, `maxDuration = 60`.
- Query `q`: trimmed, min 2, max 80 characters.
- Reuse `fetchMollie` / `escapeCSV` / `MolliePayment` / `MollieSettlement` from `lib/mollieSettlementShared.ts`.
- Odoo: session `uid` + `password` (same as accounting insights).
- Mollie: `MOLLIE_API_KEY` (fallback `MOLLIE_ACCESS_TOKEN` like import-odoo).
- Dutch UI copy. No live Mollie/Odoo in Vitest.

## File map

- Create: `lib/mollieLookup.ts` — types, parse query, extract `tr_…`, status, CSV, empty message
- Create: `lib/__tests__/mollieLookup.test.ts`
- Create: `lib/mollieLookupService.ts` — Odoo search, Mollie enrich, in-transit list
- Create: `pages/api/mollie/lookup.ts`
- Create: `pages/api/mollie/in-transit.ts`
- Create: `pages/mollie-opzoeken.tsx`
- Modify: `components/Navigation.tsx` — desktop + mobile Boekhouding, `isBoekhoudingActive`
- Modify: `vercel.json` — maxDuration 60 for the two APIs
- Modify: `lib/accounting/processGuide.ts` — bank_statement pitfall/next can mention `/mollie-opzoeken` only if a single extra sentence; otherwise leave (YAGNI: nav is enough)

---

### Task 1: Pure lookup helpers (TDD)

**Files:**
- Create: `lib/__tests__/mollieLookup.test.ts`
- Create: `lib/mollieLookup.ts`

**Produces:**
- `MatchStatus`, `LookupRow`, `LOOKUP_QUERY_MIN = 2`, `LOOKUP_QUERY_MAX = 80`, `IN_TRANSIT_LINE_CAP = 250`
- `parseLookupQuery(raw: unknown): { ok: true; query: string } | { ok: false; error: string }`
- `isMolliePaymentId(query: string): boolean`
- `extractMolliePaymentId(...texts: Array<string | null | undefined>): string | null`
- `classifyLookupQuery(query: string): 'mollie_id' | 'odoo_text'`
- `deriveMatchStatus(input: { molliePaymentId: string | null; paymentFound: boolean; settlementId: string | null }): MatchStatus`
- `matchStatusLabel(status: MatchStatus): string`
- `emptyLookupMessage(query: string): string`
- `applyMollieToRow(row: LookupRow, payment: { id: string; status: string; description?: string } | null, settlement: { id: string; reference: string; settledAt?: string } | null): LookupRow`
- `lookupRowsToCsv(rows: LookupRow[]): string`
- `rowFromOdooMoveLine(line: { name?: string; ref?: string | false; date?: string; amount_residual?: number; debit?: number; partner_id?: unknown; move_name?: string; currency_id?: unknown }): LookupRow`

- [ ] **Step 1: Write failing tests** in `lib/__tests__/mollieLookup.test.ts` covering: extract from screenshot omschrijving; ignore non-ids; query routing; four statuses; CSV headers; `parseLookupQuery`; empty message.

- [ ] **Step 2:** `npx vitest run lib/__tests__/mollieLookup.test.ts` — FAIL (module missing).

- [ ] **Step 3:** Implement `lib/mollieLookup.ts`.

- [ ] **Step 4:** Re-run tests — PASS.

---

### Task 2: Odoo + Mollie service

**Files:**
- Create: `lib/mollieLookupService.ts`

**Consumes:** Task 1 exports; `odooClient`; `fetchMollie`; `MolliePayment`; `MollieSettlement`; `many2oneName`.

**Produces:**
- `lookupByQuery(params: { uid: number; password: string; mollieToken: string; query: string }): Promise<LookupRow[]>`
- `listOpenInTransit(params: { uid: number; password: string; mollieToken: string }): Promise<{ accountCode: string; accountName: string; truncated: boolean; rows: LookupRow[] }>`
- Throws Dutch `Error` if 580100 account missing (in-transit only).

Behaviour:
- Find account: `account.account` `['code','=','580100']` else `['name','ilike','Mollie in transit']`.
- `tr_…` query: Mollie GET payment; Odoo 580100 lines `['|', ['name','ilike', id], ['ref','ilike', id]]`. Merge even if no Odoo line (row with payment only).
- Other query: `sale.order` name ilike; `account.move` out invoices name/ref/payment_reference ilike; `account.payment` name/ref/memo ilike; 580100 lines name/ref ilike; `res.partner` name ilike then lines by partner_id. Try `payment.transaction` on reference/provider_reference; ignore if model/field missing.
- Dedupe rows by `account.move.line` id, else by `tr_…`.
- Enrich unique `tr_…` with GET `/v2/payments/{id}`; 404 → `niet_in_mollie`; if `_links.settlement.href` then GET settlement.
- Concurrency: at most 5 Mollie GETs in flight.
- In-transit: posted lines, `amount_residual != 0`, order date desc, limit 250, `truncated` if count would exceed.

- [ ] Implement service. Keep I/O here; no Vitest against live APIs.

---

### Task 3: API routes

**Files:**
- Create: `pages/api/mollie/lookup.ts`
- Create: `pages/api/mollie/in-transit.ts`
- Modify: `vercel.json` add both paths `maxDuration: 60`

**lookup GET `?q=`:** parse query → 400 Dutch; no token → 500 `MOLLIE_API_KEY niet geconfigureerd`; session uid/password; `{ query, rows }`.

**in-transit GET:** `{ accountCode, accountName, truncated, rows }`; missing account → 500 with that fact.

Both: GET only, `private, no-store`, `export const maxDuration = 60`.

- [ ] Implement both handlers.

---

### Task 4: Page + navigation

**Files:**
- Create: `pages/mollie-opzoeken.tsx`
- Modify: `components/Navigation.tsx`

Page: auth spinner like mollie-export; title “Mollie opzoeken”; intro that payouts do not contain S02118; search form; results table; auto-load open 580100; filter chips all / uitbetaald / in_transit; CSV buttons (search vs open); banners for errors / empty / truncated; disable CSV when no rows.

Columns: Order/factuur, Relatie, Odoo-datum, Bedrag, Mollie-id, Mollie-status, Uitbetaling, Match-status.

Nav: add `/mollie-opzoeken` to `isBoekhoudingActive`, desktop dropdown after Mollie Export, mobile same.

- [ ] Implement page + nav.

---

### Task 5: Verify

- [ ] `npx vitest run lib/__tests__/mollieLookup.test.ts`
- [ ] `npm run typecheck`
- [ ] `graphify update .`
- [ ] Browser: `/mollie-opzoeken` — login gate, search S02118, open 580100 table, CSV download.
