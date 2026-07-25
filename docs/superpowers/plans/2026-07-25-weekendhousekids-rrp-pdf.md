# Weekend House Kids RRP PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Weekend House Kids with real SRP from optional RRP PDF, visible ×2.5 fallback, empty EAN allowed, and smart-upload that waits for an explicit Start.

**Architecture:** Pure PDF-text SRP parser in `lib/suppliers/weekendhousekids/rrp.ts`; API endpoint wraps `pdf-parse`; plugin enriches via `processPdfResults`; `rrpSource` on `ParsedProduct` drives StockStep badges; smart-upload drops auto-redirect.

**Tech Stack:** Next.js pages API, pdf-parse, vitest, existing SupplierPlugin hooks.

## Global Constraints

- RRP PDF optional; fallback = wholesale × 2.5 with visible UI label
- Empty EAN allowed (not skipped)
- Match SRP on product reference; first SRP wins on duplicates
- Smart-upload: no auto-redirect; user clicks Start import
- Do not change `/weekendhousekids-price-update` in this plan

## File map

| File | Role |
|------|------|
| `lib/suppliers/types.ts` | Add optional `rrpSource?: 'pdf' \| 'fallback'` on `ParsedProduct` |
| `lib/suppliers/weekendhousekids/rrp.ts` | Parse SRP map from PDF text; apply to products |
| `lib/suppliers/weekendhousekids/rrp.test.ts` | Unit tests for parser + enrichment |
| `lib/suppliers/weekendhousekids/index.ts` | Empty EAN, fallback source, PDF input, processPdfResults |
| `pages/api/parse-weekendhousekids-pdf.ts` | Auth + pdf-parse + return priceMap |
| `pages/api/detect-supplier.ts` | WHK pdfRules → `rrp_pdf` |
| `pages/smart-upload.tsx` | Remove auto-redirect; clarify multi-file copy |
| `components/import/steps/StockStep.tsx` | Banner + RRP badges + empty EAN hint |

---

### Task 1: SRP parser + enrichment (TDD)

**Files:**
- Create: `lib/suppliers/weekendhousekids/rrp.ts`
- Create: `lib/suppliers/weekendhousekids/rrp.test.ts`
- Modify: `lib/suppliers/types.ts` (add `rrpSource?`)

**Interfaces:**
- Produces: `parseWeekendHouseKidsSrpFromText(text: string): Map<string, number>`
- Produces: `applyWeekendHouseKidsRrp(products, priceMap): { products, matched, fallback, message }`

- [ ] **Step 1: Add `rrpSource` to ParsedProduct**

```ts
rrpSource?: 'pdf' | 'fallback';
```

- [ ] **Step 2: Write failing tests** (fixture with 13 refs including `52,50`; empty map; first-wins duplicate; apply match/miss)

- [ ] **Step 3: Implement `rrp.ts`**

Parse `Ref. CODE` then next `SRP: N €`. Apply map; unmatched keep ×2.5 + `rrpSource: 'fallback'`.

- [ ] **Step 4: Run** `npx vitest run lib/suppliers/weekendhousekids/rrp.test.ts` — PASS

- [ ] **Step 5: Commit** `feat(whk): parse SRP from order confirmation PDF text`

---

### Task 2: Wire plugin + API + detection

**Files:**
- Modify: `lib/suppliers/weekendhousekids/index.ts`
- Create: `pages/api/parse-weekendhousekids-pdf.ts`
- Modify: `pages/api/detect-supplier.ts` (WHK pdfRules)

- [ ] **Step 1: Update plugin** — allow empty EAN; set `rrpSource: 'fallback'`; add `rrp_pdf` input; `pdfParseEndpoint`; `processPdfResults` calling `applyWeekendHouseKidsRrp`

- [ ] **Step 2: Create API** — copy Bobo pattern; return `{ success, priceMap: Record<string, number>, count }`

- [ ] **Step 3: Add pdfRules** for filenames containing weekend/whk/rrp/srp → `rrp_pdf`

- [ ] **Step 4: Commit** `feat(whk): optional RRP PDF enrich on product import`

---

### Task 3: Smart-upload multi-file + StockStep UI

**Files:**
- Modify: `pages/smart-upload.tsx`
- Modify: `components/import/steps/StockStep.tsx`

- [ ] **Step 1: Remove auto-redirect** when `allFilesMatched` — always set `detected` and let user click Start

- [ ] **Step 2: Update copy** — multiple files before start

- [ ] **Step 3: StockStep** — banner for fallback/no-PDF; badge next to RRP; orange empty EAN

- [ ] **Step 4: Run** `npm run typecheck` + WHK vitest

- [ ] **Step 5: Commit** `fix(smart-upload): wait for Start before redirect; show WHK RRP source`
