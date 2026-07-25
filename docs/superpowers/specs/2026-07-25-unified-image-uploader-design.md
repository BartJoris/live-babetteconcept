# Unified Product Image Uploader

## Goal

One shared image-upload interface for:

1. Import wizard (pre-import pool + post-import upload)
2. `/image-upload` (existing Odoo catalog by brand)
3. Brand dedicated pages (`*-images-import`)

No user-facing capability from those flows may be lost. Gap-fill (`/afbeeldingen`) and product-check gallery editor stay separate.

## Architecture

### Shell: `ProductImageUploader`

Single React component with modes:

| Mode | Product source | Typical entry |
|------|----------------|---------------|
| `wizard` | Parsed/imported products (controlled) | ImageStep, ImportStep |
| `catalog` | Odoo brand search (internal load) | `/image-upload` |
| `brand` | Adapter-supplied targets after match | `*-images-import` wrappers |

### Shared pipeline

1. **Sources** — files, folder(s), optional URLs, optional order file (CSV/PDF via adapter)
2. **Match** — plugin `extractReference` or brand adapter
3. **Review** — assign / reorder / remove / set main / unmatched / filters / overwrite warn
4. **Upload** — `/api/upload-product-images` (batch per template) + `ImageUploadProgressBar`
5. **Results** — per-product success/fail counts

### Brand adapters

Brand pages keep URL routes but become thin wrappers:

```
sources → adapter.match() → ProductImageUploader (brand mode) → batch upload
```

Adapters own filename/CSV/PDF rules (Emile lifestyle, WHK stills/looks, Wyncken PDF, etc.).

### Out of scope

- `/afbeeldingen` (published no-image queue)
- `product-check` gallery CRUD
- Destructive AO76 wipe unless adapter flag

## Migration

1. Introduce shell + shared types/client/progress (this change)
2. Wizard + `/image-upload` use the shell
3. Brand pages migrate to wrappers + adapters:
   - Done: Emile et Ida, Weekend House Kids, The New Society (match stays brand-specific; review/upload = `ProductImageUploader`)
   - Still dedicated pages (match + own upload, to migrate later): Wyncken, Onemore, Mini Rodini, Bobo Choses, Flöss, Petit Blush, Mipounet, Armed Angels, AO76/product-images-import

## Success criteria

- One primary review/upload UI component
- Batch upload API used by wizard, catalog, and migrated brand pages
- Existing filters/features of `/image-upload` still available in catalog mode
- Brand matching quirks preserved via adapters
