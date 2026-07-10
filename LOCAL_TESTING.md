# Lokaal Testen - Import System

## Vereisten

- Node.js 20+ (`nvm use`)
- Docker Desktop (voor Docling document processing)
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

## Docling (Document Processing)

Docling verwerkt PDF/DOCX documenten en extraheert tabellen en afbeeldingen.

### Vereiste: Podman Desktop

Zorg dat Podman Desktop draait en de machine gestart is:

1. Open **Podman Desktop** app
2. Controleer dat de machine status "Running" is (linksonder)
3. Als de machine gestopt is, klik op "Start" in Podman Desktop

### Starten

```bash
# Via npm script (gebruikt podman run)
npm run docling:start

# Of handmatig:
podman run -d --name docling --replace \
  -p 5001:5001 \
  -e DOCLING_SERVE_ENABLE_UI=1 \
  ghcr.io/docling-project/docling-serve-cpu:latest
```

De eerste keer wordt de image gedownload (~4.4 GB). Dit duurt een paar minuten.

Docling UI: http://localhost:5001/ui
API docs: http://localhost:5001/docs

### Stoppen

```bash
npm run docling:stop
```

### Testen

```bash
# Check of Docling draait
curl http://localhost:5001/health

# Test document verwerking via de app API
curl -X POST http://localhost:3000/api/parse-document \
  -F "file=@test-document.pdf"
```

### Podman troubleshooting

Als `podman` geen verbinding kan maken:

```bash
# Check machine status
podman machine inspect --format '{{.State}}'

# Herstart de machine via Podman Desktop UI, of:
podman machine stop
podman machine start

# Controleer connectie
podman ps
```

### Zonder Podman

Docling is optioneel. De import wizard werkt volledig zonder Docling - het is een extra feature voor document-gebaseerde imports. De API geeft een duidelijke foutmelding als Docling niet draait.

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

### Document Import (vereist Docling)
1. Start Docling: `npm run docling:start`
2. Upload een PDF via `/api/parse-document`
3. De DocumentPreview component toont tabellen en afbeeldingen

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
    DocumentPreview.tsx         # Document preview (Docling)
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
  docling/                      # Docling integratie
    client.ts                   # REST API client
    types.ts                    # TypeScript types
    extractors.ts               # Data extractie
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
```
