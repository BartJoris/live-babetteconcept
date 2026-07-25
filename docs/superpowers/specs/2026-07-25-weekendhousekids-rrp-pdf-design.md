# Weekend House Kids — RRP PDF + smart-upload — design

**Date:** 2026-07-25  
**Status:** Approved for planning  
**Surface:** Supplier plugin `weekendhousekids`, smart-upload, product-import wizard

## Goal

Import Weekend House Kids orders with real recommended retail prices (SRP/RRP) from the order-confirmation PDF, while keeping CSV as the product source. If RRP is missing, fall back to wholesale × 2.5 and make that fallback **clearly visible** in the import UI. Fix smart-upload so CSV + PDF can both be added before starting import.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | PDF parser + enrich (same pattern as Bobo Choses) |
| Order CSV | Required (`main_csv`) |
| RRP PDF | Optional (`rrp_pdf`) |
| RRP source | Prefer SRP from PDF; else wholesale × 2.5 |
| Fallback visibility | Banner + per-product label when × 2.5 is used |
| Empty EAN | Allowed; user fills later or leaves empty |
| Missing EAN warning | Visible warning; import not blocked |
| SRP match key | Product reference (`K26848`, `B26959`, …) — one SRP for all sizes |
| Smart-upload auto-redirect | Removed: always show file list + explicit **Start import** |
| WHK PDF detection | Add `pdfRules` for order confirmation / RRP PDF |

## Non-goals

- Changing the dedicated `/weekendhousekids-price-update` page (CSV confirmation flow stays as-is for now)
- OCR for scanned image-only PDFs (current sample has extractable text via `pdf-parse`)
- Auto-generating barcodes
- Changing wholesale/cost prices from the PDF (CSV `Unit price` remains cost)

## Sample inputs (AW26)

- **CSV:** `;`-delimited Le New Black-style order export (`Product reference`, `EAN13`, `Unit price`, …). Brand = Weekend House Kids. Some lines may have empty `EAN13`.
- **PDF:** Order confirmation `#3215121` with blocks like:
  - `Ref. K26848`
  - `SRP: 75 €` (also `52,50 €`)
  - Wholesale appears in the line table separately; **do not** overwrite CSV cost from PDF in this feature.

Observed: 13 unique refs, all have SRP in PDF; multipliers are not always exactly 2.5 (e.g. €32 → €75).

## Architecture

```
Order CSV (required)                 RRP / Order Confirmation PDF (optional)
        │                                         │
        ▼                                         ▼
  weekendhousekids.parse()             /api/parse-weekendhousekids-pdf
  → products, sizes, cost              → Map: Ref → SRP (€)
  → EAN may be empty
  → provisional rrp = cost × 2.5
  → rrpSource = 'fallback'
        │                                         │
        └──────────────────┬──────────────────────┘
                           ▼
                  processPdfResults()
                  → match on product.reference (case-insensitive)
                  → hit: rrp = SRP, rrpSource = 'pdf'
                  → miss / no PDF: keep × 2.5, rrpSource = 'fallback'
                           ▼
                  Product-import UI
                  → summary banner
                  → per-product RRP badge
                  → empty-EAN warning
```

Smart-upload / product-import reuse the existing plugin hooks:

- `fileInputs`: `main_csv` + optional `rrp_pdf`
- `serverSideFileInputs`: `['rrp_pdf']`
- `pdfParseEndpoint`: `/api/parse-weekendhousekids-pdf`
- `processPdfResults`

## Components

### 1. `lib/suppliers/weekendhousekids/index.ts`

- Keep existing CSV parse, size conversion, brand suggestion.
- **Stop skipping rows with empty EAN** — create variants with `ean: ''`.
- Set provisional `rrp = unitPrice * 2.5` and mark source as fallback (see data model).
- Add optional PDF file input + `processPdfResults` enrichment.
- Enrichment message example: `13 SRP prijzen uit PDF. 12/13 producten gematcht. 1× fallback ×2,5.`

### 2. `pages/api/parse-weekendhousekids-pdf.ts`

- Auth + formidable upload (same pattern as `parse-bobochoses-pdf`).
- Extract text with `pdf-parse`.
- Parse pairs: `Ref. <CODE>` … nearest following `SRP: <number> €`.
- Accept comma decimals (`52,50`).
- Return `{ success, priceMap: Record<string, number>, count }` where values are SRP in EUR.
- Fail clearly if no text / no refs found.

### 3. Detection — `pages/api/detect-supplier.ts`

For `weekendhousekids`, add `pdfRules`:

- Filename hints: `weekend`, `whk`, `rrp`, `srp`
- Content is not available for PDF in detect API today (filename-only, like Bobo) — rely on filename + user override if needed
- Map to `fileInputId: 'rrp_pdf'`

### 4. Smart-upload — `pages/smart-upload.tsx`

**Bug:** After the first fully matched file, `allFilesMatched` triggers immediate `goToImport`, so users cannot add a second file (RRP PDF).

**Fix (global for smart-upload):**

- Remove automatic redirect on detection success.
- Always land on `status === 'detected'` with file list, “+ Meer bestanden”, and **Start import**.
- Keep `multiple` on the file input (already present).
- Copy: clarify that several CSV/PDF files can be added before starting.

### 5. Import UI — RRP / EAN visibility

Extend shared types lightly:

```ts
// ProductVariant or ParsedProduct
rrpSource?: 'pdf' | 'fallback';
```

Prefer **product-level** `rrpSource` (SRP is per reference). When enriching, set all variants’ `rrp` from the same SRP.

UI (stock/mapping preview — wherever RRP is shown today):

- Banner when any product uses fallback:  
  **“X producten gebruiken RRP = inkoop × 2,5 (geen match in PDF).”**
- Banner when no PDF uploaded:  
  **“Geen RRP-PDF — alle verkoopprijzen zijn inkoop × 2,5.”**
- Per product near RRP: badge **“RRP uit PDF”** (green) or **“×2,5”** (orange).
- Empty EAN: warning count / orange empty fields (editable; not blocking).

If a full product-level badge is hard to wire in one pass, minimum bar:

1. Enrichment `alert`/message from `processPdfResults` (already supported).
2. Orange badge on RRP cells when `rrpSource === 'fallback'`.

## Data flow details

| Step | Behavior |
|------|----------|
| CSV only | Products with fallback RRP; banner “geen RRP-PDF” |
| CSV + PDF, all matched | All `rrpSource: 'pdf'` |
| CSV + PDF, partial | Matched = PDF; unmatched = fallback + listed in message |
| PDF only | Message: upload CSV first; no products created from PDF alone |
| Empty EAN rows | Included; user edits EAN in stock step or leaves blank |

## Error handling

| Case | Response |
|------|----------|
| PDF unreadable / no text | API 500/400 with clear error; CSV products keep × 2.5 + fallback banner |
| PDF has no `Ref.`/`SRP` | Empty map + message; import continues with fallback |
| Ref in CSV not in PDF | That product keeps × 2.5 + orange badge |
| Ref in PDF not in CSV | Ignored (PDF is price-only) |
| Duplicate Ref in PDF | First SRP wins; later duplicates ignored; log count |

## Testing

- Unit: PDF text parser against fixture excerpt from AW26 confirmation (13 refs / SRPs including `52,50`).
- Unit: CSV parse includes empty-EAN variants for `K26948`.
- Unit: `processPdfResults` sets `rrp` + `rrpSource` correctly for match/miss.
- Manual: smart-upload add CSV then PDF without auto-jump; Start import; verify badges.

## Out of scope / follow-ups

- Wire PDF into `/weekendhousekids-price-update` if still needed later.
- Stronger PDF detection via server-side text sniff if filename rules prove weak.

## Success criteria

1. AW26 CSV + RRP PDF import uses real SRP for all 13 products when PDF matches.
2. Without PDF, import works and clearly shows × 2.5 fallback.
3. Empty EAN products appear and are editable.
4. Smart-upload allows adding multiple files before import starts.
