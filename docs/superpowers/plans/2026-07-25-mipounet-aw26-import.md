# Mipounet AW26 Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Order CSV + I26 EAN + optional RRP PDF + I26 silhouette image match.

**Architecture:** Mirror Weekend House Kids: CSV products, optional PDF enrich via `processPdfResults`, `rrpSource` for StockStep. Separate `ean_csv` so smart-upload does not overwrite order CSV.

**Tech stack:** Existing supplier plugin system, `extractPdfText`, vitest/jest as used by WHK rrp tests.

---

### Task 1: RRP module + tests

**Files:**
- Create: `lib/suppliers/mipounet/rrp.ts`
- Create: `lib/suppliers/mipounet/rrp.test.ts`

Parse `Ref. 271.23` + following `SRP: 59 €` (dot refs, not WHK alphanumeric-only). Apply with ×2.5 fallback + `rrpSource`.

### Task 2: EAN I26 + plugin wire

**Files:**
- Modify: `lib/suppliers/mipounet/index.ts`
- Create: `lib/suppliers/mipounet/ean.test.ts` (or combine in index tests)

Accept `I26` and `MV26`; file inputs `main_csv`, `ean_csv`, `rrp_pdf`; `processPdfResults`; provisional RRP ×2.5; name includes color.

### Task 3: API + detect

**Files:**
- Create: `pages/api/parse-mipounet-pdf.ts`
- Modify: `pages/api/detect-supplier.ts` — order without “export”, EAN→`ean_csv`, PDF→`rrp_pdf`
- Modify: `pages/smart-upload.tsx` — after PDF parse, call `processPdfResults` with CSV products (WHK-style enrich)

### Task 4: Images I26

**Files:**
- Modify: `pages/mipounet-images-import.tsx` — match `I26.` and `MV26.`

### Task 5: Verify

Run unit tests; smoke-parse sample CSVs + PDF text fixture.
