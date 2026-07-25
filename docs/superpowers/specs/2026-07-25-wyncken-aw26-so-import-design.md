# Wyncken AW26 sales-order import — design

**Date:** 2026-07-25  
**Status:** Approved for implementation  
**Surface:** `lib/suppliers/wyncken`, `pages/api/parse-wyncken-pdf`, detect-supplier, smart-upload combine path

## Goal

Import Wyncken AW26 from:

1. **Sales order PDF** (`SO-00321…`) — ordered style/colour/sizes with per-size qty  
2. **Master Data CSV** — description, WSP EUR, RRP EUR, textile  
3. **Barcodes CSV** — EAN per size  

Proforma (`PF-…`) is out of scope for quantities (no size grid).

## Decisions

| Topic | Choice |
|-------|--------|
| Primary PDF | Sales order (SO), not proforma |
| Quantities | From SO size grid (e.g. 2→1, 3→1, …); sizes with `-` skipped |
| Stock zero | Not forced — user may set qty to 0 in UI later |
| Barcode delimiter | Support `;` and `,` |
| EAN source | Prefer 12–13 digit barcode; if scientific/`E+`, take digits from Barcode Image Path URL |
| File detection | Barcodes = has `Barcode` + `Size`; Master = has `Textile Content` / `RRP (EUR)` |
| Combine | PDF JSON + both CSVs must feed `combineData` (smart-upload + wizard) |

## Architecture

```
SO PDF → parse size lines + style/colour/price
              ↓
        WynckenPdfProduct[]  (sizes: [{size, qty}, …])
              ↓
Master CSV + Barcodes CSV → descriptions + EANs
              ↓
        combineData → ParsedProduct (qty from SO, rrp/wsp from master, ean from barcodes)
```

## Gaps fixed

1. `parseBarcodesCSV` used `,` only → empty map on AW26 `;` file  
2. Barcode column Excel scientific notation → wrong EAN  
3. Detection confused barcodes file (has empty Description column) with master  
4. `processPdfResults` ignored CSVs; `parse` needs `pdf_invoice` JSON in file map  
5. SO size grid not parsed (proforma-only qty total applied to every size)

## Success criteria

- Smart-upload / product-import with SO + Master + Barcodes yields ordered lines only  
- Example: Still Life Faux Fur Jacket ROSE/ECRU → sizes 2,3,4,6,8 each qty 1  
- Real EANs (from URL), EUR RRP/WSP from master  
- Typecheck + unit tests for barcode parse + SO size grid  
