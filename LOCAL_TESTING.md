# Lokaal Testen - Import System

## Vereisten

- Node.js 20+ (`nvm use`)
- `.env.local` met Odoo credentials (kopieer `env.example`)

## Snel starten

```bash
# 1. Installeer dependencies
npm install

# 2. Draai alle checks (typecheck + tests + build)
npm run verify

# 3. Start dev server
npm run dev
```

Open http://localhost:3000/product-import voor de import wizard.

## Tests draaien

```bash
# Alle tests draaien (eenmalig)
npm run test:run

# Tests draaien in watch mode (voor development)
npm test

# TypeScript check
npm run typecheck

# Alles tegelijk (typecheck + tests + build)
npm run verify
```

### Test bestanden

| Bestand | Wat het test |
|---------|-------------|
| `lib/import/shared/csv-utils.test.ts` | CSV parsing, delimiter detectie, multiline quotes |
| `lib/import/shared/price-utils.test.ts` | Europese prijsformaten |
| `lib/import/shared/size-utils.test.ts` | Maat conversies, attribuut detectie |
| `lib/import/shared/ean-utils.test.ts` | EAN-13 generatie en validatie |
| `lib/import/shared/name-utils.test.ts` | Productnaam formatting |
| `lib/validation/product.test.ts` | Zod schema validatie |
| `components/import/ValidationReport.test.tsx` | Validatie rapport UI |

## Spreadsheet-import (Excel / Numbers / ODS)

De import wizard kan naast de leverancier-specifieke CSV/PDF-parsers ook een
generieke spreadsheet importeren (`.xlsx`, `.xls`, `.numbers`, `.ods`, `.csv`)
via de "Of importeer vanuit een spreadsheet" sectie. Dit gebeurt volledig
client-side met SheetJS (`xlsx`-pakket) — geen losse service nodig, werkt
identiek lokaal en op Vercel.

## Pagina's testen

### Import Wizard (`/product-import`)
1. Ga naar http://localhost:3000/product-import
2. Selecteer een leverancier (bijv. Floss, Armedangels)
3. Upload een CSV bestand uit `example-import/`
4. Loop door alle stappen: Upload -> Mapping -> Voorraad -> Categorieen -> Preview -> Test -> Import

### Validatie (`/validate-import`)
1. Ga naar http://localhost:3000/validate-import
2. Voer template IDs in (komma-gescheiden)
3. Klik "Valideer" om producten te controleren in Odoo

### Spreadsheet-import (Excel / Numbers / ODS)
1. Ga naar http://localhost:3000/product-import
2. Open de "Of importeer vanuit een spreadsheet" sectie op stap 1
3. Upload een `.xlsx`, `.numbers` of `.ods` bestand — de DocumentPreview component toont de gevonden tabellen

## Project structuur (nieuw)

```
components/import/
  ImportWizard.tsx              # Wizard container
  ValidationReport.tsx          # Validatie rapport component
  shared/
    SearchableSelect.tsx        # Zoekbare dropdown
    FuzzySearchSelect.tsx       # Fuzzy search dropdown
    CategoryTreeSelect.tsx      # Categorie boom selector
    MultiTagSelect.tsx          # Multi-select met tags
    BulkCategoryAssign.tsx      # Bulk categorie toewijzing
    ImageManager.tsx            # Afbeeldingen beheer
    EnhancedImageManager.tsx    # Verbeterde afbeeldingen beheer
    DocumentPreview.tsx         # Tabel-preview + kolom-mapping (spreadsheet-import)
    CategoryMatcher.tsx         # CSV-naar-Odoo matching
  steps/
    UploadStep.tsx              # Stap 1: Leverancier + upload
    MappingStep.tsx             # Stap 2: Product mapping
    StockStep.tsx               # Stap 3: Voorraad
    CategoriesStep.tsx          # Stap 4: Categorieen
    PreviewStep.tsx             # Stap 5: Preview
    TestStep.tsx                # Stap 6: Test
    ImportStep.tsx              # Stap 7: Import + resultaten

hooks/
  useImportWizard.ts            # Wizard state management

lib/
  import/
    services/                   # Geconsolideerde Odoo services
      odoo-import.service.ts    # Product creatie
      odoo-image.service.ts     # Afbeeldingen upload
      odoo-validation.service.ts # Post-import validatie
    shared/                     # Gedeelde utilities
      csv-utils.ts              # CSV parsing
      price-utils.ts            # Prijs parsing
      size-utils.ts             # Maat conversies
      name-utils.ts             # Naam formatting
      ean-utils.ts              # EAN-13 barcodes
      spreadsheet-utils.ts       # Excel/Numbers/ODS parsing (SheetJS)
```
