# Graph Report - live-babetteconcept  (2026-08-13)

## Corpus Check
- 470 files · ~384,060 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2780 nodes · 5576 edges · 208 communities (170 shown, 38 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 179 edges (avg confidence: 0.52)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0b6c5063`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- NextApiRequestWithSession
- onboard.ts
- sistersdepartment/index.ts
- useAuth
- auditLog.ts
- tools.ts
- repair-emileetida-barcodes.ts
- extractPdfText
- ProductImageUploader.tsx
- withAuth.ts
- withAuth
- rateLimiter.ts
- ValidationReport.tsx
- Webshoporders - Testing Guide voor Nieuwe Orders
- Sales Vacation Comparison
- mollieSettlementShared.ts
- cozmo/index.ts
- CategoryTreeSelect.tsx
- TypeScript and Next.js Types
- devDependencies
- SupplierFiles
- dependencies
- stockSnapshot.ts
- belgianRetailCalendar.ts
- Inventory Analysis
- generate-description.ts
- useImportWizard.ts
- wyncken/index.ts
- salesPosAggregates.ts
- Inventory Analysis UI
- Cellar Inventory Analysis
- count.ts
- parse-weekendhousekids-pdf.ts
- chatTools.ts
- ImportWizard.tsx
- sellThrough.ts
- DocumentPreview.tsx
- ParsedProduct
- Belgian School Vacations
- playup/index.ts
- Webshoporders Feature - Setup Guide
- Delivery Confirmation UI
- downloadRowsAsXlsx
- services/index.ts
- parse-tangerine-pdf.ts
- parseEuroPrice
- baje/index.ts
- Weekend House Kids — RRP PDF + smart-upload — design
- useImportWizard
- ean-utils.ts
- OdooImageService
- Fub Product Parsing
- Ecommerce Insights Dashboard
- Inventory Creation UI
- Cellar Inventory UI
- Emileetida Barcode Repair
- Lokaal Testen - Import System
- ✅ Product Import System - Status Update
- soldenDiscountAnalysis.ts
- BulkCategoryAssign.tsx
- nixnut/index.ts
- scripts
- Supplier File Detection
- Mollie Export Utilities
- quotation-export.ts
- suppliers/types.ts
- spreadsheet-utils.ts
- OdooImportService
- claudeandco/index.ts
- OdooValidationService
- Inventory Management UI
- Vercel Deployment Config
- token/route.ts
- convertSize
- sales-products.ts
- Inventory Merge UI
- Product Check UI
- Inventory Merge UI
- image-filename.ts
- suppliers/index.ts
- Camera Monitoring UI
- Sales Best Days Analysis
- ChatGPT → Babette MCP (OAuth)
- UploadStep.tsx
- import-products.ts
- Webshop Daily Sales
- Monthly Sales Comparison
- MCP stock snapshot & aged stock — design
- template-images.ts
- AO76 Image Upload
- Architecture
- BabeAndTess PDF Parsing
- Bobochoses Image Import
- Hvid Levering UI
- Yearly Sales Comparison
- Stock Sale UI
- Floss Import Cleanup
- Image Compression UI
- AO76 Image Scanning
- Brand Inventory Metrics
- search-minirodini-products.ts
- Image Upload Handling
- weekendhousekids-price-update.tsx
- analyze-supplier-file.ts
- Armed Angels Image Upload
- Brand Inventory Management
- Brand Performance Metrics
- thinkingmu/index.ts
- Label Printing Interface
- clients.ts
- Image Matching System
- Brand Performance Data
- Floss Image Upload
- Jenest Image Upload
- create-stock-quotation.ts
- shared/index.ts
- ParseContext
- ecommerce-insights.ts
- lookup-product-for-stock.ts
- Onemore Image Upload
- update-stock.ts
- fetch-size-values.ts
- TheNewSociety Image Upload
- WeekendHouseKids Image Upload
- Wyncken Image Upload
- mcp-auth.ts
- Floss Images Import
- MiniRodini Images Import
- Mipounet Images Import
- PetitBlush Images Import
- ThinkingMu Product Delivery
- Armed Angels Workflow Guides
- check-duplicate-barcodes.ts
- authorize/route.ts
- archive-variants.ts
- Image Directory Listing
- Mipounet AW26 Import Implementation Plan
- search-products-by-reference-batch.ts
- File map
- tokens.ts
- dashboard.tsx
- Bobochoses Product Search
- relaunch-loop.sh
- Mipounet Product Search
- Product Price Updates
- webshop-verkopen-ophalen.tsx
- getProtectedResourceMetadata
- PlayUp Barcode Update Guides
- DrBloom Size Fixes
- Application Navigation
- Floss CSV Import Guides
- pos-sales-by-date-range.ts
- Project Metadata
- Import partial results + downloadable log
- Mipounet AW26 — Order + I26 EAN + RRP PDF — design
- Wyncken AW26 sales-order import — design
- rename-size-values.ts
- ArmedAngels Images Import
- jwt.ts
- Ecommerce Depublication
- Onemore Images Import
- Wyncken Images Import
- Product Import System
- Searchable Select Component
- Ecommerce Management
- Image Fetch Debugging
- PlayUp Data Scraper
- Proxy Configuration
- inventaris-pos-match.tsx
- ESLint Configuration
- Next.js ESLint Config
- ExcelJS Library
- Formidable Library
- Odoo API Parameters
- Next.js Configuration
- Global Constraints
- PostCSS Configuration
- POS Security Hardening
- Tiny Big Sister Vendor Guide
- Barcode Duplicate Checker
- E-commerce Insights Guide
- E-commerce Insights Quick Start
- Emile et Ida Import Guide
- HVID Import Guide
- HVID Import Quick Reference
- Implementation Next Steps
- Play Up Import Tasks
- Armed Angels Image Upload
- floss-search-products.ts
- lookup-by-barcode.ts
- MCP OAuth for ChatGPT (design)
- rate-limiter-flexible
- odoo-call.ts
- search-product-by-reference.ts
- get-picking-details.ts
- @types/xml2js
- react-dom
- unpdf
- zod
- @testing-library/react
- @types/react

## God Nodes (most connected - your core abstractions)
1. `withAuth()` - 143 edges
2. `NextApiRequestWithSession` - 138 edges
3. `useAuth()` - 91 edges
4. `ParseContext` - 81 edges
5. `determineSizeAttribute()` - 79 edges
6. `parseEuroPrice()` - 73 edges
7. `OdooClient` - 73 edges
8. `toSentenceCase()` - 55 edges
9. `ParsedProduct` - 49 edges
10. `extractPdfText()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `ImageUploadProgressBarProps` --references--> `ImageUploadProgress`  [EXTRACTED]
  components/import/shared/ImageUploadProgressBar.tsx → lib/import/image-upload-client.ts
- `useImportWizard()` --indirect_call--> `transformProductForUpload()`  [INFERRED]
  hooks/useImportWizard.ts → components/import/shared/product-utils.ts
- `CategoriesStepProps` --references--> `UseImportWizardReturn`  [EXTRACTED]
  components/import/steps/CategoriesStep.tsx → hooks/useImportWizard.ts
- `StockStepProps` --references--> `UseImportWizardReturn`  [EXTRACTED]
  components/import/steps/StockStep.tsx → hooks/useImportWizard.ts
- `useImportWizard()` --indirect_call--> `determineSizeAttribute()`  [INFERRED]
  hooks/useImportWizard.ts → lib/import/shared/size-utils.ts

## Import Cycles
- 3-file cycle: `lib/import/shared/index.ts -> lib/import/shared/spreadsheet-utils.ts -> lib/suppliers/types.ts -> lib/import/shared/index.ts`

## Hyperedges (group relationships)
- **Armed Angels Image Upload Workflow** — armedangels_complete_workflow_guide, armedangels_image_import_system, armedangels_image_upload_quickstart, implementation_summary_armedangels_image_upload [EXTRACTED 1.00]
- **Flöss Vendor Import and Image Upload** — floss_csv_parser_fix, floss_vendor_implementation, floss_import_guide, floss_quick_start [EXTRACTED 1.00]
- **Play UP Image Import and Upload Workflow** — playup_import_complete, playup_image_import_procedure, playup_image_upload_guide, playup_quick_start [EXTRACTED 1.00]
- **Product Import System and Updates** — product_import_guide, product_import_updates, ux_improvements_product_import, setup_import_instructions [EXTRACTED 1.00]
- **Tiny Big sister Import Workflow** — tinycottons_implementation, tinycottons_import_guide [EXTRACTED 1.00]

## Communities (208 total, 38 thin omitted)

### Community 0 - "NextApiRequestWithSession"
Cohesion: 0.03
Nodes (46): NextApiRequestWithSession, isRetryableHttpStatus(), OdooCallParams, OdooClient, OdooResponse, RETRYABLE_HTTP_STATUSES, rpcRetryDelayMs(), BulkUnpublishRequest (+38 more)

### Community 1 - "onboard.ts"
Cohesion: 0.07
Nodes (47): CommitFileInput, commitFiles(), createBlob(), createBranch(), dispatchWorkflow(), getCommitTreeSha(), getDefaultBranchRef(), getFileContent() (+39 more)

### Community 2 - "sistersdepartment/index.ts"
Cohesion: 0.10
Nodes (24): transformProductForUpload(), ADULT_SIZE_MAPPING, EU_SIZE_TO_AGE, isUnitSize(), mapSizeToOdooFormat(), SizeAttribute, americanVintagePlugin, buildProducts() (+16 more)

### Community 3 - "useAuth"
Cohesion: 0.05
Nodes (47): AuthState, useAuth(), User, ArchiveerVarianten(), OdooCategory, ProductWithVariants, VariantInfo, AssistantPage() (+39 more)

### Community 4 - "auditLog.ts"
Cohesion: 0.10
Nodes (17): AuditEvent, AuditLogEntry, AuditLogger, logLoginFailure(), logLoginSuccess(), logLogout(), logProductImport(), logUnauthorizedAccess() (+9 more)

### Community 5 - "tools.ts"
Cohesion: 0.07
Nodes (43): getMcpOdooCredentials(), McpOdooCredentials, agedStockSchema, analyzeAssortmentSchema, analyzeSoldenDiscountsSchema, analyzeSoldenDiscountsTool(), BrandValue, countAssortmentSchema (+35 more)

### Community 6 - "repair-emileetida-barcodes.ts"
Cohesion: 0.19
Nodes (17): buildEmileetidaPriceLookup(), buildOrderConfirmationSrpMap(), emileetidaPriceKey(), EmileetidaPriceLookup, isEmileetidaOrderConfirmationCsv(), isEmileetidaTarifCsv(), lookupEmileetidaRrp(), CONFIRMATION_SNIPPET (+9 more)

### Community 7 - "extractPdfText"
Cohesion: 0.04
Nodes (58): ensureMathSumPrecisePolyfill(), extractPdfText(), normalizeTextResult(), ArmedAngelsProduct, config, handler(), BayiriProduct, config (+50 more)

### Community 8 - "ProductImageUploader.tsx"
Cohesion: 0.12
Nodes (26): FilterMode, formatDate(), isRecent(), OdooProduct, ProductImageUploader(), ProductImageUploaderProps, resolveCatalogReference(), matchFilenameToTarget() (+18 more)

### Community 9 - "withAuth.ts"
Cohesion: 0.04
Nodes (27): AuthenticatedApiHandler, WithAuthOptions, defaultSession, SessionData, sessionOptions, AnalysisResult, ImageGroup, ImageInfo (+19 more)

### Community 10 - "withAuth"
Cohesion: 0.04
Nodes (23): withAuth(), BrandDiagnosticsResponse, BrandSuggestionGroup, ProductWithIssue, ProductAvailability, callOdoo(), CreateVariantRequest, handler() (+15 more)

### Community 11 - "rateLimiter.ts"
Cohesion: 0.21
Nodes (15): logRateLimitExceeded(), apiLimiter, getClientId(), importLimiter, loginLimiter, rateLimitApi(), rateLimitImport(), rateLimitLogin() (+7 more)

### Community 12 - "ValidationReport.tsx"
Cohesion: 0.17
Nodes (9): FIELD_LABELS, generateMarkdownReport(), STATUS_CONFIG, allPassResults, mixedResults, ValidationReport(), ValidationReportProps, ProductValidation (+1 more)

### Community 13 - "Webshoporders - Testing Guide voor Nieuwe Orders"
Cohesion: 0.06
Nodes (30): Als je Dubbel Klikt (Test Duplicate Prevention):, Backend (Terminal):, Best Practice:, Bij Stap 3 (Bevestig Order):, Bij Stap 4 (Bevestig Levering):, 🔍 Debug Checklist, Features:, Frontend (Browser Console F12): (+22 more)

### Community 14 - "Sales Vacation Comparison"
Cohesion: 0.11
Nodes (36): arithmeticMean(), avgPerDayLabel(), collectConsecutiveYoYPctMarge(), collectConsecutiveYoYPctOmzet(), collectCrossVacationOmzetRatios(), comparableTotalsYoYMarge(), comparableTotalsYoYOmzet(), comparableYoYMarge() (+28 more)

### Community 15 - "mollieSettlementShared.ts"
Cohesion: 0.11
Nodes (32): bookingDateFromIso(), buildCSVOdoo(), buildCSVOdooBank(), buildOdooDescription(), collectSettlementOdooRows(), costToOdooRow(), escapeCSV(), fetchAllPaidPayments() (+24 more)

### Community 16 - "cozmo/index.ts"
Cohesion: 0.26
Nodes (9): buildEcommerceDescription(), cozmo, getRrp(), OrderRow, parse(), parseOrderCSV(), parsePriceCSV(), productKey() (+1 more)

### Community 17 - "CategoryTreeSelect.tsx"
Cohesion: 0.23
Nodes (15): buildTree(), CategoryItem, CategoryTreeSelect(), CategoryTreeSelectProps, TreeNode, CategoryLike, categoryPath(), categoryPathExists() (+7 more)

### Community 18 - "TypeScript and Next.js Types"
Cohesion: 0.06
Nodes (31): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+23 more)

### Community 19 - "devDependencies"
Cohesion: 0.07
Nodes (29): baseline-browser-mapping, eslint, gh-pages, jsdom, devDependencies, baseline-browser-mapping, eslint, gh-pages (+21 more)

### Community 20 - "SupplierFiles"
Cohesion: 0.09
Nodes (24): armedangelsPlugin, enrichCatalogWithInvoice(), isCatalogCSV(), isInvoiceCSV(), parse(), parseCatalogCSV(), parseInvoiceCSV(), parseQuotedCSVLine() (+16 more)

### Community 21 - "dependencies"
Cohesion: 0.07
Nodes (27): ai, @ai-sdk/openai, @ai-sdk/react, chart.js, iron-session, isomorphic-dompurify, @modelcontextprotocol/sdk, next (+19 more)

### Community 22 - "stockSnapshot.ts"
Cohesion: 0.17
Nodes (25): searchCategories(), sizeAttributeNamesForAudience(), buildTemplateBrandMap(), categorySearchAliases(), collectionAgeYears(), countAssortment(), euro(), fetchInStockVariants() (+17 more)

### Community 23 - "belgianRetailCalendar.ts"
Cohesion: 0.25
Nodes (25): addDaysYmd(), classifyDateInYear(), formatYmd(), getAfterSummerSalesRange(), getAfterWinterSalesRange(), getBeforeSummerSalesRange(), getBeforeWinterSalesRange(), getRetailCalendar() (+17 more)

### Community 24 - "Inventory Analysis"
Cohesion: 0.10
Nodes (25): AnalyseApiItem, AnalyseRow, Category, computeCategory(), computeDiff(), computeName(), computeOdooQty(), computeVariant() (+17 more)

### Community 25 - "generate-description.ts"
Cohesion: 0.14
Nodes (23): escapeHtml(), inlineMarkdownToHtml(), looksLikeHtml(), toEcommerceHtml(), extractResponsesText(), getPromptCategory(), getSystemPrompt(), getUserPrompt() (+15 more)

### Community 26 - "useImportWizard.ts"
Cohesion: 0.16
Nodes (18): CSV_CATEGORY_TO_DUTCH, findMatchingPublicCategories(), EnhancedImageManager(), EnhancedImageManagerProps, poolImageToPoolItem(), poolItemToPoolImage(), ImageManagerProps, ImageImportResult (+10 more)

### Community 27 - "wyncken/index.ts"
Cohesion: 0.11
Nodes (30): detectDelimiter(), extractWynckenBarcode(), isWynckenBarcodesCSV(), isWynckenMasterDataCSV(), parseWynckenBarcodesCSV(), WynckenBarcode, cachedBarcodes, cachedDescriptions (+22 more)

### Community 28 - "salesPosAggregates.ts"
Cohesion: 0.12
Nodes (22): fetchPosOrdersAndLinesForDateRange(), PosOrderLineRow, PosOrderRow, aggregateMonthlyDaily(), aggregateYearlyCompare(), buildDailyTotalsMap(), buildMonthlyInsights(), computeVacationPrefixTotals() (+14 more)

### Community 29 - "Inventory Analysis UI"
Cohesion: 0.12
Nodes (22): AnalyseApiItem, AnalyseRow, computeCategory(), computeDiff(), computeMerk(), computeName(), computeOdooQty(), computeVariant() (+14 more)

### Community 30 - "Cellar Inventory Analysis"
Cohesion: 0.12
Nodes (22): AnalyseApiItem, AnalyseRow, computeCategory(), computeDiff(), computeMerk(), computeName(), computeOdooQty(), computeVariant() (+14 more)

### Community 31 - "count.ts"
Cohesion: 0.09
Nodes (19): AnalysisResult, analyzeImage(), analyzeImageOpenAI(), analyzeImageYolo(), CameraConfig, getAnalysisProvider(), getCameras(), CameraStatus (+11 more)

### Community 32 - "parse-weekendhousekids-pdf.ts"
Cohesion: 0.31
Nodes (6): processPdfResults(), applyWeekendHouseKidsRrp(), ApplyWhkRrpResult, parseWeekendHouseKidsSrpFromText(), config, handler()

### Community 33 - "chatTools.ts"
Cohesion: 0.18
Nodes (16): dynamic, maxDuration, openai, POST(), runtime, requireAssistantSession(), buildAssistantSystemPrompt(), createMcpAiTools() (+8 more)

### Community 34 - "ImportWizard.tsx"
Cohesion: 0.13
Nodes (16): ImportWizard(), ImageUploadProgressBar(), ImageUploadProgressBarProps, ImageStep(), ImageStepProps, ImportStep(), ImportStepProps, MappingStep() (+8 more)

### Community 35 - "sellThrough.ts"
Cohesion: 0.14
Nodes (22): analyzeAssortmentTool(), resolveToolPeriod(), DateRange, aggregatePosForProducts(), analyzeAssortment(), AssortmentDimension, AssortmentPerformance, AudienceFilter (+14 more)

### Community 36 - "DocumentPreview.tsx"
Cohesion: 0.22
Nodes (9): COLUMN_OPTIONS, DocumentPreview(), DocumentPreviewProps, ExtractedImage, renderInline(), renderMarkdown(), TabId, TableData (+1 more)

### Community 37 - "ParsedProduct"
Cohesion: 0.18
Nodes (18): buildMipounetEanMap(), isMipounetEanCsv(), SEASON_PREFIXES, applyEanMap(), buildSrpMapFromConfirmationCsv(), collectCsvTexts(), convertMipounetSize(), extractColor() (+10 more)

### Community 38 - "Belgian School Vacations"
Cohesion: 0.15
Nodes (17): BY_SALES_YEAR, dateToYmd(), getOverallSalesYearCalendarBounds(), getSalesYearCalendarBounds(), getVacationPeriodsForSalesYears(), isKnownSalesYear(), listKnownSalesYears(), SCHOOL_VACATION_IDS (+9 more)

### Community 39 - "playup/index.ts"
Cohesion: 0.13
Nodes (19): articleFromModelReference(), buildProductsFromEAN(), detectDelimiter(), EANProduct, extractPlayUpImageReference(), findHeaderRow(), formatDescription(), formatSizeForOdoo() (+11 more)

### Community 40 - "Webshoporders Feature - Setup Guide"
Cohesion: 0.07
Nodes (26): API Endpoints (8), 🎯 Complete Workflow, Components (2), 📚 Documentation, Feature 1: Product Availability Checking, Feature 2: Delivery Confirmation, Feature 3: Document Downloads, Feature 4: Product Images (+18 more)

### Community 41 - "Delivery Confirmation UI"
Cohesion: 0.12
Nodes (12): DeliveryConfirmationDialog(), DeliveryConfirmationDialogProps, MoveLine, Picking, Product, ProductAvailabilityDialog(), ProductAvailabilityDialogProps, ImageModalProps (+4 more)

### Community 42 - "downloadRowsAsXlsx"
Cohesion: 0.07
Nodes (32): cellToPlain(), downloadRowsAsXlsx(), readXlsxFirstSheetAsJsonRecords(), triggerXlsxDownload(), trimSheetName(), ExportLine, OfferteExcelPage(), OrderMeta (+24 more)

### Community 43 - "services/index.ts"
Cohesion: 0.18
Nodes (11): FetchedImage, IMAGE_EXTENSIONS, OdooImageError, ImportProductData, ImportVariantData, OdooImportError, SizeAttributeResult, VariantUpdateResult (+3 more)

### Community 44 - "parse-tangerine-pdf.ts"
Cohesion: 0.19
Nodes (18): ensureDomMatrixPolyfill(), ensurePdfWorker(), pdf-parse, config, extractProductsFromPdfTables(), extractTextFromPdf(), extractTextWithRotations(), handler() (+10 more)

### Community 45 - "parseEuroPrice"
Cohesion: 0.18
Nodes (18): rowToObject(), parseEuroPrice(), FlossPdfProduct, parseFlossCSV(), parseFlossOrderRows(), parseFlossRows(), extractColor(), parse() (+10 more)

### Community 46 - "baje/index.ts"
Cohesion: 0.36
Nodes (6): bajePlugin, buildReference(), extractBajeImageReference(), parse(), context, CSV_PATH

### Community 47 - "Weekend House Kids — RRP PDF + smart-upload — design"
Cohesion: 0.11
Nodes (17): 1. `lib/suppliers/weekendhousekids/index.ts`, 2. `pages/api/parse-weekendhousekids-pdf.ts`, 3. Detection — `pages/api/detect-supplier.ts`, 4. Smart-upload — `pages/smart-upload.tsx`, 5. Import UI — RRP / EAN visibility, Architecture, Components, Data flow details (+9 more)

### Community 48 - "useImportWizard"
Cohesion: 0.51
Nodes (8): isUnitOnlyProduct(), useImportWizard(), buildImportLogPayload(), buildPartialVariantMessage(), isImportFullSuccess(), isImportRecoverable(), resolveImportStatus(), summarizeImportResults()

### Community 49 - "ean-utils.ts"
Cohesion: 0.73
Nodes (4): calculateEAN13CheckDigit(), generateEAN13(), generateUniqueEAN13Batch(), isValidEAN13()

### Community 50 - "OdooImageService"
Cohesion: 0.36
Nodes (3): OdooImageService, handler(), handler()

### Community 51 - "Fub Product Parsing"
Cohesion: 0.21
Nodes (14): buildProducts(), extractColor(), extractMaterial(), FubCsvProduct, FubPdfProduct, fubPlugin, generateReference(), matchKey() (+6 more)

### Community 52 - "Ecommerce Insights Dashboard"
Cohesion: 0.14
Nodes (15): CancelledOrder, CustomerInsight, EcommerceData, EcommerceInsightsPage(), formatEuro(), formatNumber(), InsightsData, MONTH_LABELS (+7 more)

### Community 53 - "Inventory Creation UI"
Cohesion: 0.14
Nodes (15): CachedProduct, cellInputStyle, defaultSettings, getCache(), inputStyle, KelderInventarisPage(), labelStyle, LoadMode (+7 more)

### Community 54 - "Cellar Inventory UI"
Cohesion: 0.14
Nodes (15): CachedProduct, cellInputStyle, defaultSettings, getCache(), inputStyle, KelderInventarisPage(), labelStyle, LoadMode (+7 more)

### Community 55 - "Emileetida Barcode Repair"
Cohesion: 0.25
Nodes (14): ADULT_SIZE_MAP, authenticate(), convertEmileSize(), findHeader(), findVariant(), loadVariantsByTemplates(), main(), mapSizeToOdoo() (+6 more)

### Community 56 - "Lokaal Testen - Import System"
Cohesion: 0.17
Nodes (11): Import Wizard (`/product-import`), Lokaal Testen - Import System, Pagina's testen, Project structuur (nieuw), Snel starten, Spreadsheet-import (Excel / Numbers / ODS), Spreadsheet-import (Excel / Numbers / ODS), Test bestanden (+3 more)

### Community 57 - "✅ Product Import System - Status Update"
Cohesion: 0.13
Nodes (14): Attribute Lines:, ✅ Created Missing `callOdooMethod` Function, ✅ Enhanced UI, ✅ Fixed All API Call Formats, ✅ Fixed CSV Decimal Parsing, Per Variant:, ✅ Product Import System - Status Update, 🎯 Ready to Import! (+6 more)

### Community 58 - "soldenDiscountAnalysis.ts"
Cohesion: 0.15
Nodes (19): DEFAULT_LINE_FIELDS, DEFAULT_ORDER_FIELDS, fetchPosLinesForOrderIds(), FetchPosOrdersAndLinesOptions, fetchPosOrdersInDateRange(), toEndDateTime(), toStartDateTime(), collectCategoryTreeIds() (+11 more)

### Community 59 - "BulkCategoryAssign.tsx"
Cohesion: 0.11
Nodes (23): BulkCategoryAssign(), BulkCategoryAssignProps, CategoryOption, FuzzyOption, fuzzyScore(), FuzzySearchSelect(), FuzzySearchSelectProps, HighlightedText() (+15 more)

### Community 60 - "nixnut/index.ts"
Cohesion: 0.36
Nodes (6): buildReference(), extractNixnutImageReference(), nixnutPlugin, parse(), context, CSV_PATH

### Community 61 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, lint, postinstall, start, test, test:coverage (+3 more)

### Community 62 - "Supplier File Detection"
Cohesion: 0.18
Nodes (9): detectCSV(), DetectionMatch, DetectionResponse, detectPDF(), FileDetectionInput, FileDetectionResult, handler(), SUPPLIER_RULES (+1 more)

### Community 63 - "Mollie Export Utilities"
Cohesion: 0.32
Nodes (12): currentYear, formatDate(), getCustomPeriodIssue(), getQuarterDates(), isRangeValid(), isValidDateOnly(), MollieExport(), pad() (+4 more)

### Community 64 - "quotation-export.ts"
Cohesion: 0.21
Nodes (14): compareQuotationLines(), extractBrandFromProductName(), parseQuotationRef(), productNameWithoutBrand(), QuotationRef, SortableQuotationLine, sortQuotationLines(), ApiResponse (+6 more)

### Community 65 - "suppliers/types.ts"
Cohesion: 0.16
Nodes (15): applyNameCasing(), applySizeConversion(), createCSVSupplier(), getColumnValue(), parsePrice(), resolveColumn(), ColumnMapping, DeclarativeCSVConfig (+7 more)

### Community 66 - "spreadsheet-utils.ts"
Cohesion: 0.27
Nodes (8): ExtractedTable, parsePrice(), parseSpreadsheetFile(), PRODUCT_FIELD_PATTERNS, suggestColumnMapping(), tableToDelimitedText(), tableToProducts(), NUMBERS_FIXTURE

### Community 67 - "OdooImportService"
Cohesion: 0.27
Nodes (3): OdooImportService, getClientIp(), handler()

### Community 68 - "claudeandco/index.ts"
Cohesion: 0.25
Nodes (8): buildProducts(), claudeAndCoPlugin, convertCCSize(), CsvVariant, InvoiceItem, parse(), parseCatalogCSV(), processPdfResults()

### Community 69 - "OdooValidationService"
Cohesion: 0.27
Nodes (3): OdooValidationService, handler(), validateRequestSchema

### Community 70 - "Inventory Management UI"
Cohesion: 0.20
Nodes (11): getLocalInventories(), inputStyle, InventarisBeheerPage(), InventoryRow, labelStyle, modalBackdropStyle, modalStyle, SavedInventory (+3 more)

### Community 71 - "Vercel Deployment Config"
Cohesion: 0.17
Nodes (11): maxDuration, maxDuration, functions, app/api/assistant/chat/route.ts, app/api/mcp/route.ts, pages/api/import-products.ts, pages/api/suppliers/onboard.ts, pages/api/**/*.ts (+3 more)

### Community 72 - "token/route.ts"
Cohesion: 0.20
Nodes (14): dynamic, oauthError(), POST(), readBody(), runtime, dynamic, GET(), runtime (+6 more)

### Community 73 - "convertSize"
Cohesion: 0.21
Nodes (15): convertSize(), babeandtess, BabeAndTessPdfProduct, convertBabeAndTessSize(), extractColorCode(), normalizeColorName(), parseBabeAndTessCsv(), processBabeAndTessPdfResults() (+7 more)

### Community 74 - "sales-products.ts"
Cohesion: 0.33
Nodes (5): Category, DailySalesProduct, OrderLine, Product, SalesProductData

### Community 75 - "Inventory Merge UI"
Cohesion: 0.18
Nodes (10): inputStyle, InventoryRow, labelStyle, LoadedFile, modalBackdropStyle, modalStyle, tdStyle, thStyle (+2 more)

### Community 76 - "Product Check UI"
Cohesion: 0.22
Nodes (10): Brand, compressImage(), GalleryImage, ProductCheckItem, ProductCheckPage(), readFileAsDataUrl(), SortColumn, SortDirection (+2 more)

### Community 77 - "Inventory Merge UI"
Cohesion: 0.18
Nodes (10): inputStyle, InventoryRow, labelStyle, LoadedFile, modalBackdropStyle, modalStyle, tdStyle, thStyle (+2 more)

### Community 78 - "image-filename.ts"
Cohesion: 0.23
Nodes (13): aliasEmileetidaColor(), COLOR_ALIASES, colorsMatchEmileetida(), EmileetidaImageInfo, extractEmileetidaImageInfo(), extractEmileetidaReferences(), extractLifestyleInfo(), normalizeEmileetidaColor() (+5 more)

### Community 79 - "suppliers/index.ts"
Cohesion: 0.11
Nodes (23): buildProducts(), drbloomPlugin, extractNameAndSize(), processPdfResults(), SIZE_SUFFIXES, emileetidaPlugin, flossPlugin, allPlugins (+15 more)

### Community 80 - "Camera Monitoring UI"
Cohesion: 0.31
Nodes (9): AnalyzeResult, CameraCard(), CameraMonitorPage(), CameraStatus, CountEntry, formatTime(), getCountBg(), getCountColor() (+1 more)

### Community 81 - "Sales Best Days Analysis"
Cohesion: 0.29
Nodes (9): buildYearList(), ChannelTotals, DayRow, emptyChannel(), formatBE(), MonthlyCompareRow, periodsForYear(), SalesBestDaysPage() (+1 more)

### Community 82 - "ChatGPT → Babette MCP (OAuth)"
Cohesion: 0.15
Nodes (12): Belgian trading calendar, ChatGPT → Babette MCP (OAuth), ChatGPT web (Developer mode), Cursor (unchanged), Discount manners (`analyze_solden_discounts`), Discovery endpoints, Example prompts, Metric (+4 more)

### Community 83 - "UploadStep.tsx"
Cohesion: 0.36
Nodes (4): getVendorFormatLabel(), UploadStep(), isIOS(), supportsDirectoryPicker()

### Community 84 - "import-products.ts"
Cohesion: 0.19
Nodes (11): ImportProductStatus, ImportResultLike, ImportProductsInput, importProductsSchema, OdooCallInput, Product, productSchema, ProductVariant (+3 more)

### Community 85 - "Webshop Daily Sales"
Cohesion: 0.25
Nodes (6): bodySchema, fetchSaleOrderLines(), fetchSaleOrderLinesWithFields(), SaleOrder, SaleOrderLine, WebshopDailyRow

### Community 86 - "Monthly Sales Comparison"
Cohesion: 0.36
Nodes (8): DailyComparePage(), formatBE(), getDaysInMonth(), getWeekday(), isBelgianHoliday(), isWeekend(), MONTH_LABELS, WEEKDAY_LABELS

### Community 87 - "MCP stock snapshot & aged stock — design"
Cohesion: 0.15
Nodes (12): Architecture, Assistant prompt additions, Decisions (locked), Goal, MCP stock snapshot & aged stock — design, Non-goals, Out of scope follow-ups, Performance & pitfalls (+4 more)

### Community 88 - "template-images.ts"
Cohesion: 0.40
Nodes (3): config, GalleryImage, TemplateImagesResponse

### Community 89 - "AO76 Image Upload"
Cohesion: 0.39
Nodes (7): expandHome(), findTemplateId(), getCandidateReferences(), getReferenceAndSequence(), handler(), IMAGE_EXTENSIONS, UploadResult

### Community 90 - "Architecture"
Cohesion: 0.20
Nodes (9): Architecture, Brand adapters, Goal, Migration, Out of scope, Shared pipeline, Shell: `ProductImageUploader`, Success criteria (+1 more)

### Community 91 - "BabeAndTess PDF Parsing"
Cohesion: 0.39
Nodes (7): BabeAndTessPdfProduct, babeAndTessSizeToOdoo(), config, extractTextFromPdf(), handler(), parseEuroPrice(), parseOrderPdf()

### Community 92 - "Bobochoses Image Import"
Cohesion: 0.29
Nodes (7): BobochosesImagesImport(), COLOR_MAP, CsvProduct, getColorName(), ImageFile, ProductWithImages, UploadResult

### Community 93 - "Hvid Levering UI"
Cohesion: 0.25
Nodes (5): CategorizedProduct, CheckResult, ProductCardProps, ProductLine, ProductMatch

### Community 94 - "Yearly Sales Comparison"
Cohesion: 0.29
Nodes (7): CompareData, formatBE(), MONTH_LABELS, MonthData, MONTHS, SalesComparePage(), YearlyData

### Community 95 - "Stock Sale UI"
Cohesion: 0.32
Nodes (7): btnStyle, calcSalePrice(), escapeHtml(), StocksalePage(), StocksaleRow, tdStyle, thStyle

### Community 96 - "Floss Import Cleanup"
Cohesion: 0.39
Nodes (6): ARCHIVE_ALL, archiveTemplate(), authenticate(), main(), rpc(), TEMPLATES

### Community 97 - "Image Compression UI"
Cohesion: 0.38
Nodes (6): AfbeeldingenPage(), compressDataUrl(), Product, ProductState, readFileAsDataUrl(), StagedImage

### Community 98 - "AO76 Image Scanning"
Cohesion: 0.43
Nodes (6): expandHome(), getCandidateReferences(), getReferenceAndSequence(), handler(), IMAGE_EXTENSIONS, ScannedProduct

### Community 99 - "Brand Inventory Metrics"
Cohesion: 0.38
Nodes (6): BrandInventoryMetrics, BrandInventoryResponse, getPeriodAndSeason(), getSeasonDateRanges(), handler(), SeasonData

### Community 100 - "search-minirodini-products.ts"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 101 - "Image Upload Handling"
Cohesion: 0.33
Nodes (6): callOdoo(), config, handler(), ImageUpload, UploadRequest, UploadResult

### Community 102 - "weekendhousekids-price-update.tsx"
Cohesion: 0.40
Nodes (4): MatchedProduct, OrderCSVProduct, UpdateResult, WeekendHouseKidsPriceUpdate()

### Community 103 - "analyze-supplier-file.ts"
Cohesion: 0.16
Nodes (16): AISuggestion, AnalysisResponse, analyzeColumn(), analyzeCSV(), ColumnAnalysis, detectDelimiter(), FileAnalysis, generateAISuggestion() (+8 more)

### Community 104 - "Armed Angels Image Upload"
Cohesion: 0.33
Nodes (6): callOdoo(), config, handler(), MatchedProduct, UploadResponse, UploadResult

### Community 105 - "Brand Inventory Management"
Cohesion: 0.33
Nodes (6): BrandInventoryData, BrandInventoryMetrics, BrandInventoryPage(), formatBE(), SeasonData, STATUS_CONFIG

### Community 106 - "Brand Performance Metrics"
Cohesion: 0.33
Nodes (6): BrandMetrics, BrandPerformanceData, BrandPerformancePage(), formatBE(), PERIOD_LABELS, PeriodData

### Community 107 - "thinkingmu/index.ts"
Cohesion: 0.31
Nodes (7): buildProducts(), CsvEnrichment, parse(), parseJoorCSV(), processPdfResults(), ThinkingMuPdfItem, thinkingMuPlugin

### Community 108 - "Label Printing Interface"
Cohesion: 0.33
Nodes (6): btnStyle, escapeHtml(), LabelPrintenPage(), LabelRow, tdStyle, thStyle

### Community 109 - "clients.ts"
Cohesion: 0.15
Nodes (16): dynamic, POST(), runtime, RFC-8252, CimdDocument, clientFromJwt(), fetchCimdClient(), isHttpsUrl() (+8 more)

### Community 110 - "Image Matching System"
Cohesion: 0.47
Nodes (5): Ao76ImageMatcher(), CSVProduct, getColorCode(), getImageReference(), MatchedProduct

### Community 111 - "Brand Performance Data"
Cohesion: 0.40
Nodes (5): BrandMetrics, BrandPerformanceResponse, getPeriod(), handler(), PeriodData

### Community 112 - "Floss Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, FlossImageUploadRequest, handler(), UploadResult

### Community 113 - "Jenest Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), JenestImageUploadRequest, UploadResult

### Community 114 - "create-stock-quotation.ts"
Cohesion: 0.50
Nodes (3): ApiResponse, OrderLine, RequestBody

### Community 115 - "shared/index.ts"
Cohesion: 0.10
Nodes (30): CSVParseOptions, CSVParseResult, detectDelimiter(), findHeader(), parseCSV(), parseSimple(), parseWithMultilineQuotes(), DEFAULT_PRODUCT_NAME_TEMPLATE (+22 more)

### Community 116 - "ParseContext"
Cohesion: 0.10
Nodes (40): toSentenceCase(), determineSizeAttribute(), buildProductsFromCsvOnly(), convertGoldieSize(), CsvRow, goldieAndAcePlugin, InvoiceProduct, processGoldieAndAcePdfResults() (+32 more)

### Community 117 - "ecommerce-insights.ts"
Cohesion: 0.17
Nodes (10): CancelledOrder, CustomerInsight, EcommerceData, InsightsData, MonthData, PaymentMethod, ReturnInsight, TopProduct (+2 more)

### Community 118 - "lookup-product-for-stock.ts"
Cohesion: 0.25
Nodes (6): ApiResponse, FIELDS_FAST, FIELDS_WITH_IMAGE, OdooRawProduct, SuccessFound, SuccessNotFound

### Community 119 - "Onemore Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), OnemoreImageUploadRequest, UploadResult

### Community 120 - "update-stock.ts"
Cohesion: 0.67
Nodes (3): callOdoo(), handler(), UpdateStockRequest

### Community 122 - "TheNewSociety Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), TheNewSocietyImageUploadRequest, UploadResult

### Community 123 - "WeekendHouseKids Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), UploadResult, WeekendHouseKidsImageUploadRequest

### Community 124 - "Wyncken Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), UploadResult, WynckenImageUploadRequest

### Community 125 - "mcp-auth.ts"
Cohesion: 0.22
Nodes (13): DELETE(), dynamic, GET(), handle(), maxDuration, POST(), runtime, authorizeMcpRequest() (+5 more)

### Community 127 - "Floss Images Import"
Cohesion: 0.33
Nodes (4): FlossImage, OdooProduct, ProductGroup, UploadResult

### Community 128 - "MiniRodini Images Import"
Cohesion: 0.33
Nodes (4): CsvProduct, ImageFile, ProductWithImages, UploadResult

### Community 129 - "Mipounet Images Import"
Cohesion: 0.40
Nodes (5): ImageFile, MipounetImagesImport(), parseImageFilename(), ProductGroup, UploadResult

### Community 130 - "PetitBlush Images Import"
Cohesion: 0.33
Nodes (4): OdooProduct, PetitBlushImage, ProductGroup, UploadResult

### Community 131 - "ThinkingMu Product Delivery"
Cohesion: 0.33
Nodes (4): CategorizedProduct, CheckResult, ProductLine, ProductMatch

### Community 132 - "Armed Angels Workflow Guides"
Cohesion: 0.70
Nodes (5): Armed Angels Complete Workflow Guide, Armed Angels Image Import System, Armed Angels Image Upload Quick Start, Armed Angels Import System Guide, Armed Angels Image Upload Implementation Summary

### Community 133 - "check-duplicate-barcodes.ts"
Cohesion: 0.19
Nodes (10): callOdoo(), CategorizedProduct, findBaseProduct(), handler(), parseProductInfo(), ProductMatch, escapeCSV(), formatPaymentsAsCSV() (+2 more)

### Community 134 - "authorize/route.ts"
Cohesion: 0.25
Nodes (13): AuthzParams, dynamic, GET(), html(), oauthErrorRedirect(), POST(), prepareAuthorize(), readParams() (+5 more)

### Community 135 - "archive-variants.ts"
Cohesion: 0.12
Nodes (8): OdooVariant, ProductWithVariants, VariantInfo, OdooMatch, OdooRawProduct, handler(), MAAT_ATTRIBUTES, ProductDescriptionDetail

### Community 136 - "Image Directory Listing"
Cohesion: 0.60
Nodes (4): getAllowedRoots(), handler(), isPathAllowed(), ListDirectoryResponse

### Community 138 - "Mipounet AW26 Import Implementation Plan"
Cohesion: 0.29
Nodes (6): Mipounet AW26 Import Implementation Plan, Task 1: RRP module + tests, Task 2: EAN I26 + plugin wire, Task 3: API + detect, Task 4: Images I26, Task 5: Verify

### Community 139 - "search-products-by-reference-batch.ts"
Cohesion: 0.50
Nodes (4): BatchSearchRequest, callOdoo(), handler(), ProductSearchResult

### Community 140 - "File map"
Cohesion: 0.29
Nodes (6): File map, Global Constraints, Task 1: SRP parser + enrichment (TDD), Task 2: Wire plugin + API + detection, Task 3: Smart-upload multi-file + StockStep UI, Weekend House Kids RRP PDF Implementation Plan

### Community 143 - "tokens.ts"
Cohesion: 0.27
Nodes (10): verifyPkceS256(), exchangeAuthorizationCode(), issueTokenPair(), ACCESS_TOKEN_TTL_SEC, AccessTokenPayload, AUTH_CODE_TTL_SEC, AuthCodePayload, OAUTH_SCOPE (+2 more)

### Community 144 - "dashboard.tsx"
Cohesion: 0.33
Nodes (5): DashboardPage(), LastSessionData, OrderLine, Sale, SessionData

### Community 145 - "Bobochoses Product Search"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 146 - "relaunch-loop.sh"
Cohesion: 0.90
Nodes (4): cleanup(), deregister_if_configured(), log(), relaunch-loop.sh script

### Community 147 - "Mipounet Product Search"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 149 - "Product Price Updates"
Cohesion: 0.40
Nodes (3): UpdateProductPriceRequest, UpdateRequest, UpdateResult

### Community 152 - "webshop-verkopen-ophalen.tsx"
Cohesion: 0.15
Nodes (12): cellInputStyle, defaultSettings, inputStyle, labelStyle, LoadMode, modalBackdropStyle, modalStyle, ScannedRow (+4 more)

### Community 153 - "getProtectedResourceMetadata"
Cohesion: 0.28
Nodes (7): dynamic, GET(), runtime, dynamic, GET(), runtime, getProtectedResourceMetadata()

### Community 154 - "PlayUp Barcode Update Guides"
Cohesion: 0.40
Nodes (5): Play Up Barcode Update Guide, Play UP Image Import Procedure, Play UP Image Upload Guide, Play UP Image Import Complete, Play UP Quick Start

### Community 155 - "DrBloom Size Fixes"
Cohesion: 0.60
Nodes (4): authenticate(), CONFIG, main(), rpc()

### Community 157 - "Floss CSV Import Guides"
Cohesion: 0.50
Nodes (4): Flöss CSV Parser Fix, Flöss Import Guide, Flöss Vendor Quick Start, Flöss Vendor Implementation

### Community 158 - "pos-sales-by-date-range.ts"
Cohesion: 0.14
Nodes (11): callOdoo(), CreateHvidProductRequest, handler(), callOdoo(), handler(), UpdateQuantitiesRequest, UpdateQuantity, PosOrder (+3 more)

### Community 159 - "Project Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 161 - "Import partial results + downloadable log"
Cohesion: 0.29
Nodes (6): API, Goal, Import partial results + downloadable log, Prevention (already shipped), Status model, UI

### Community 162 - "Mipounet AW26 — Order + I26 EAN + RRP PDF — design"
Cohesion: 0.29
Nodes (6): Architecture, Decisions (locked), Goal, Mipounet AW26 — Order + I26 EAN + RRP PDF — design, Non-goals, Success criteria

### Community 163 - "Wyncken AW26 sales-order import — design"
Cohesion: 0.29
Nodes (6): Architecture, Decisions, Gaps fixed, Goal, Success criteria, Wyncken AW26 sales-order import — design

### Community 165 - "rename-size-values.ts"
Cohesion: 0.50
Nodes (3): ApiResponse, RenameMapping, RenameResult

### Community 167 - "jwt.ts"
Cohesion: 0.50
Nodes (7): base64url(), base64urlJson(), getSigningSecret(), JwtPayload, signHs256(), signJwt(), verifyJwt()

### Community 171 - "Product Import System"
Cohesion: 0.50
Nodes (4): Product Import System Guide, Product Import Updates, Product Import Setup Instructions, Product Import UX Improvements

### Community 177 - "inventaris-pos-match.tsx"
Cohesion: 0.14
Nodes (11): ArmedAngelsImageMatcher(), CatalogProduct, ImageInventory, MatchedProduct, ProductFromCSV, InventarisPosMatchPage(), InventoryRow, ScannedRow (+3 more)

### Community 184 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Global Constraints, MCP Stock Snapshot Implementation Plan, Task 1: Pure helpers + unit tests, Task 2: MCP wiring, Task 3: Smoke

### Community 207 - "floss-search-products.ts"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 208 - "lookup-by-barcode.ts"
Cohesion: 0.33
Nodes (4): ApiResponse, OdooRawProduct, SuccessFound, SuccessNotFound

### Community 209 - "MCP OAuth for ChatGPT (design)"
Cohesion: 0.33
Nodes (5): Approach, Endpoints, Env, Goal, MCP OAuth for ChatGPT (design)

### Community 213 - "search-product-by-reference.ts"
Cohesion: 0.67
Nodes (3): callOdoo(), handler(), SearchRequest

## Knowledge Gaps
- **994 isolated node(s):** `runtime`, `dynamic`, `runtime`, `dynamic`, `runtime` (+989 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `withAuth()` connect `withAuth` to `NextApiRequestWithSession`, `onboard.ts`, `auditLog.ts`, `check-duplicate-barcodes.ts`, `repair-emileetida-barcodes.ts`, `archive-variants.ts`, `Image Directory Listing`, `withAuth.ts`, `extractPdfText`, `rateLimiter.ts`, `search-products-by-reference-batch.ts`, `mollieSettlementShared.ts`, `Bobochoses Product Search`, `Mipounet Product Search`, `Product Price Updates`, `generate-description.ts`, `wyncken/index.ts`, `salesPosAggregates.ts`, `pos-sales-by-date-range.ts`, `count.ts`, `parse-weekendhousekids-pdf.ts`, `rename-size-values.ts`, `Belgian School Vacations`, `parse-tangerine-pdf.ts`, `Supplier File Detection`, `quotation-export.ts`, `OdooValidationService`, `sales-products.ts`, `image-filename.ts`, `floss-search-products.ts`, `lookup-by-barcode.ts`, `odoo-call.ts`, `import-products.ts`, `search-product-by-reference.ts`, `get-picking-details.ts`, `Webshop Daily Sales`, `template-images.ts`, `AO76 Image Upload`, `BabeAndTess PDF Parsing`, `AO76 Image Scanning`, `Brand Inventory Metrics`, `search-minirodini-products.ts`, `Image Upload Handling`, `analyze-supplier-file.ts`, `Armed Angels Image Upload`, `Brand Performance Data`, `Floss Image Upload`, `Jenest Image Upload`, `create-stock-quotation.ts`, `ecommerce-insights.ts`, `lookup-product-for-stock.ts`, `Onemore Image Upload`, `update-stock.ts`, `fetch-size-values.ts`, `TheNewSociety Image Upload`, `WeekendHouseKids Image Upload`, `Wyncken Image Upload`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `NextApiRequestWithSession` connect `NextApiRequestWithSession` to `onboard.ts`, `auditLog.ts`, `check-duplicate-barcodes.ts`, `repair-emileetida-barcodes.ts`, `archive-variants.ts`, `Image Directory Listing`, `withAuth.ts`, `withAuth`, `extractPdfText`, `search-products-by-reference-batch.ts`, `mollieSettlementShared.ts`, `Bobochoses Product Search`, `Mipounet Product Search`, `Product Price Updates`, `generate-description.ts`, `wyncken/index.ts`, `salesPosAggregates.ts`, `pos-sales-by-date-range.ts`, `parse-weekendhousekids-pdf.ts`, `rename-size-values.ts`, `Belgian School Vacations`, `parse-tangerine-pdf.ts`, `Supplier File Detection`, `quotation-export.ts`, `OdooValidationService`, `sales-products.ts`, `image-filename.ts`, `floss-search-products.ts`, `lookup-by-barcode.ts`, `odoo-call.ts`, `import-products.ts`, `search-product-by-reference.ts`, `get-picking-details.ts`, `Webshop Daily Sales`, `template-images.ts`, `AO76 Image Upload`, `BabeAndTess PDF Parsing`, `AO76 Image Scanning`, `Brand Inventory Metrics`, `search-minirodini-products.ts`, `Image Upload Handling`, `analyze-supplier-file.ts`, `Armed Angels Image Upload`, `Brand Performance Data`, `Floss Image Upload`, `Jenest Image Upload`, `create-stock-quotation.ts`, `ecommerce-insights.ts`, `lookup-product-for-stock.ts`, `Onemore Image Upload`, `update-stock.ts`, `fetch-size-values.ts`, `TheNewSociety Image Upload`, `WeekendHouseKids Image Upload`, `Wyncken Image Upload`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `useAuth` to `Sales Vacation Comparison`, `dashboard.tsx`, `Inventory Analysis`, `webshop-verkopen-ophalen.tsx`, `Inventory Analysis UI`, `Cellar Inventory Analysis`, `Delivery Confirmation UI`, `downloadRowsAsXlsx`, `inventaris-pos-match.tsx`, `Ecommerce Insights Dashboard`, `Inventory Creation UI`, `Cellar Inventory UI`, `Mollie Export Utilities`, `Inventory Management UI`, `Inventory Merge UI`, `Inventory Merge UI`, `Camera Monitoring UI`, `Sales Best Days Analysis`, `Monthly Sales Comparison`, `Yearly Sales Comparison`, `Stock Sale UI`, `weekendhousekids-price-update.tsx`, `Brand Inventory Management`, `Brand Performance Metrics`, `Label Printing Interface`, `Image Matching System`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **What connects `runtime`, `dynamic`, `runtime` to the rest of the system?**
  _994 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `NextApiRequestWithSession` be split into smaller, more focused modules?**
  _Cohesion score 0.029601029601029602 - nodes in this community are weakly interconnected._
- **Should `onboard.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07474747474747474 - nodes in this community are weakly interconnected._
- **Should `sistersdepartment/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10080645161290322 - nodes in this community are weakly interconnected._