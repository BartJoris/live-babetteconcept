# Mipounet AW26 — Order + I26 EAN + RRP PDF — design

**Date:** 2026-07-25  
**Status:** Approved  
**Surface:** Supplier plugin `mipounet`, detect-supplier, `mipounet-images-import`

## Goal

Import Mipounet AW26/FW26 with order CSV, I26 EAN CSV, and optional RRP PDF (same `Ref.` / `SRP:` pattern as Weekend House Kids). Silhouette images match on `I26.{model}.{fabric}.{color}` → product ref `{model}.{color}`. LOOKS (`Shot_*`) are out of scope (no SKU in filename).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Order CSV | Required (`main_csv`) — products, sizes, wholesale |
| EAN CSV | Optional (`ean_csv`) — SKU `I26.` or legacy `MV26.` |
| RRP PDF | Optional (`rrp_pdf`) — prefer SRP; else ×2.5 + `rrpSource: 'fallback'` |
| SRP match key | `Ref. 271.23` → product.reference |
| Images | Only `04 SILHOUETTES` (`I26.` / `MV26.`); skip LOOKS |
| Fallback UI | Reuse StockStep red “RRP niet uit PDF” |

## Non-goals

- Matching LOOKS / Shot_* images
- OCR for image-only PDFs
- Changing wholesale from PDF

## Architecture

```
Order CSV → parse products (rrp provisional ×2.5)
EAN CSV  → map I26/MV26 SKU → ref|size → EAN
RRP PDF  → processPdfResults → rrpSource pdf|fallback
Images   → parse I26.{model}.{fabric}.{color}_FRONT → ref model.color
```

## Success criteria

1. Sample order + EAN: all ordered refs get EANs for ordered sizes  
2. Sample RRP PDF: all 10 refs get PDF SRP  
3. Without PDF: import works with ×2.5 + red fallback  
4. Silhouette filenames match products; Shot_* ignored  
