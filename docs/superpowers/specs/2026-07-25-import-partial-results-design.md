# Import partial results + downloadable log

## Goal
Partial variant updates (e.g. 3/4 EANs after Odoo 429) must not look like full success. Users see a clear “gedeeltelijk” state and can download an import log.

## Status model
Per product: `status: 'success' | 'partial' | 'failed'`.
- `success` boolean remains for compatibility: `true` only when `status === 'success'`.
- `partial: true` when some variants missed updates after retry.
- Image auto-upload / retry include `success` and `partial` (any with `templateId`).

## API
When `variantsUpdated < expectedVariants` after retry → `status: 'partial'`, Dutch warning message, `variantsExpected` field.
Batch summary: `successful`, `partial`, `failed`.
Audit includes partial counts.

## UI
- Title “Import voltooid!” only when zero partial and zero failed.
- Stat cards: Succesvol / Gedeeltelijk / Mislukt / Totaal.
- Variants column: `updated/expected` (e.g. `3/4`).
- Message not truncated.
- Retry button for failed + partial.
- “Importlog downloaden” → JSON with summary + per-product rows.

## Prevention (already shipped)
429 retry in `odooClient`, lower variant write concurrency.
