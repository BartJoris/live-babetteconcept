# Graph Report - .  (2026-08-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2531 nodes · 5192 edges · 208 communities (172 shown, 36 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 170 edges (avg confidence: 0.52)
- Token cost: 7,306 input · 2,039 output

## Graph Freshness
- Built from commit: `4d9a99bc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Odoo API Client
- Git Repository Operations
- Bayiri Product Parsing
- Authentication and Audit
- Audit Logging
- Odoo Credentials and Assortment Analysis
- CSV Parsing Utilities
- PDF Text Extraction
- Product Image Uploading
- API Authentication Middleware
- Image Analysis and Fetching
- Docling Client API
- Product Availability and Odoo Calls
- Product Naming Utilities
- Sales Vacation Comparison
- Mollie Payment Settlement
- Bulk Category Assignment UI
- Catalog and Invoice CSV Parsing
- TypeScript and Next.js Types
- Development Dependencies
- BabeAndTess Product Parsing
- AI and Charting Dependencies
- Category and Stock Snapshot Tools
- Belgian Retail Calendar
- Inventory Analysis
- Prompt and Description Generation
- Category Matching and Image Management
- Wyncken Barcode Processing
- POS Sales Aggregation
- Inventory Analysis UI
- Cellar Inventory Analysis
- Camera Status Store
- CSV and Product Mapping Config
- Chat API and AI Tools
- Import Wizard UI
- Assortment and Sell-Through Analysis
- Document Preview Components
- EAN Code Processing
- Belgian School Vacations
- Client Registration API
- OAuth Token API
- Delivery Confirmation UI
- Excel I/O Utilities
- Odoo Image Services
- PDF Parsing and Extraction
- Validation Reporting UI
- DrBloom Product Parsing
- MCP API Authentication
- Import Step UI
- Image Analysis Provider
- Emileetida Image Processing
- Fub Product Parsing
- Ecommerce Insights Dashboard
- Inventory Creation UI
- Cellar Inventory UI
- Emileetida Barcode Repair
- OAuth Authorization Endpoint
- PKCE and OAuth Tokens
- Solden Discount Analysis
- Odoo Product Image Upload
- PlayUp Product Parsing
- Build and Test Scripts
- Supplier File Detection
- Mollie Export Utilities
- POS Sales Data UI
- Webshop Sales Data UI
- Odoo Import Service
- Odoo Validation Service
- Cozmo Product Parsing
- Sisters Department Parsing
- Inventory Management UI
- Vercel Deployment Config
- ClaudeAndCo Product Parsing
- Wyncken Sales Order Parsing
- Supplier File Analysis
- Inventory Merge UI
- Product Check UI
- Inventory Merge UI
- POS Sales Range Queries
- Supplier File Upload
- Camera Monitoring UI
- Sales Best Days Analysis
- OAuth Protected Resource API
- ThinkingMu Product Parsing
- Product Data Models
- Webshop Daily Sales
- Monthly Sales Comparison
- JWT Token Utilities
- Security and Session Utils
- AO76 Image Upload
- Product Stock Lookup
- BabeAndTess PDF Parsing
- Bobochoses Image Import
- Hvid Levering UI
- Yearly Sales Comparison
- Stock Sale UI
- Floss Import Cleanup
- Image Compression UI
- AO76 Image Scanning
- Brand Inventory Metrics
- Product Duplicate Checking
- Image Upload Handling
- Bayiri PDF Product Parsing
- Product Search Normalization
- Armed Angels Image Upload
- Brand Inventory Management
- Brand Performance Metrics
- Inventory POS Matching
- Label Printing Interface
- EAN Barcode Utilities
- Image Matching System
- Brand Performance Data
- Floss Image Upload
- Jenest Image Upload
- Transaction Processing
- Barcode Analysis
- Product Variant Archiving
- Stock Updates
- Barcode Lookup Service
- Onemore Image Upload
- DrBloom PDF Parsing
- Sales Product Data
- TheNewSociety Image Upload
- WeekendHouseKids Image Upload
- Wyncken Image Upload
- Variant Archiving
- Dashboard and Session Data
- Floss Images Import
- MiniRodini Images Import
- Mipounet Images Import
- PetitBlush Images Import
- ThinkingMu Product Delivery
- Armed Angels Workflow Guides
- Brand Diagnostics
- Floss Product Search
- Picking Details Retrieval
- Image Directory Listing
- Archived Product Lookup
- Product Quantity Updates
- ClaudeAndCo Invoice Parsing
- Fub PDF Product Parsing
- PlayUp Invoice Parsing
- SistersDepartment Invoice Parsing
- POS Sales Reporting
- Template Image Management
- Bobochoses Product Search
- MiniRodini Product Search
- Mipounet Product Search
- Batch Product Reference Search
- Product Price Updates
- Webshop Sales Reporting
- PlayUp Barcode Updates
- Sales Products Overview
- WeekendHouseKids Price Updates
- PlayUp Barcode Update Guides
- DrBloom Size Fixes
- Application Navigation
- Floss CSV Import Guides
- Odoo API Calls
- Project Metadata
- Create Hvid Product
- Bulk Weight Updates
- Fetch PlayUp Images
- SundayCollective PDF Parsing
- Product Description Details
- Product Barcode Updates
- ArmedAngels Images Import
- Assistant Interface
- Ecommerce Depublication
- Onemore Images Import
- Wyncken Images Import
- Product Import System
- Searchable Select Component
- Ecommerce Management
- Image Fetch Debugging
- PlayUp Data Scraper
- Proxy Configuration
- Product Images Import
- ESLint Configuration
- Next.js ESLint Config
- ExcelJS Library
- Formidable Library
- Odoo API Parameters
- Next.js Configuration
- Iron Session Management
- React Library
- React DOM Types
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
- Create Product Variant
- XML2JS Types

## God Nodes (most connected - your core abstractions)
1. `withAuth()` - 143 edges
2. `NextApiRequestWithSession` - 138 edges
3. `useAuth()` - 89 edges
4. `determineSizeAttribute()` - 73 edges
5. `OdooClient` - 72 edges
6. `ParseContext` - 70 edges
7. `parseEuroPrice()` - 65 edges
8. `toSentenceCase()` - 49 edges
9. `ParsedProduct` - 46 edges
10. `extractPdfText()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `BulkCategoryAssignProps` --references--> `ParsedProduct`  [EXTRACTED]
  components/import/shared/BulkCategoryAssign.tsx → lib/suppliers/types.ts
- `useImportWizard()` --indirect_call--> `isUnitOnlyProduct()`  [INFERRED]
  hooks/useImportWizard.ts → components/import/shared/product-utils.ts
- `useImportWizard()` --indirect_call--> `transformProductForUpload()`  [INFERRED]
  hooks/useImportWizard.ts → components/import/shared/product-utils.ts
- `CategoriesStepProps` --references--> `UseImportWizardReturn`  [EXTRACTED]
  components/import/steps/CategoriesStep.tsx → hooks/useImportWizard.ts
- `UploadStepProps` --references--> `UseImportWizardReturn`  [EXTRACTED]
  components/import/steps/UploadStep.tsx → hooks/useImportWizard.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Armed Angels Image Upload Workflow** — armedangels_complete_workflow_guide, armedangels_image_import_system, armedangels_image_upload_quickstart, implementation_summary_armedangels_image_upload [EXTRACTED 1.00]
- **Flöss Vendor Import and Image Upload** — floss_csv_parser_fix, floss_vendor_implementation, floss_import_guide, floss_quick_start [EXTRACTED 1.00]
- **Play UP Image Import and Upload Workflow** — playup_import_complete, playup_image_import_procedure, playup_image_upload_guide, playup_quick_start [EXTRACTED 1.00]
- **Product Import System and Updates** — product_import_guide, product_import_updates, ux_improvements_product_import, setup_import_instructions [EXTRACTED 1.00]
- **Tiny Big sister Import Workflow** — tinycottons_implementation, tinycottons_import_guide [EXTRACTED 1.00]

## Communities (208 total, 36 thin omitted)

### Community 0 - "Odoo API Client"
Cohesion: 0.03
Nodes (29): isRetryableHttpStatus(), OdooCallParams, OdooClient, OdooResponse, RETRYABLE_HTTP_STATUSES, rpcRetryDelayMs(), ProductMissingWeight, ProductNoImage (+21 more)

### Community 1 - "Git Repository Operations"
Cohesion: 0.07
Nodes (49): CommitFileInput, commitFiles(), createBlob(), createBranch(), getCommitTreeSha(), getDefaultBranchRef(), getFileContent(), getLatestWorkflowRunForBranch() (+41 more)

### Community 2 - "Bayiri Product Parsing"
Cohesion: 0.08
Nodes (39): toSentenceCase(), BayiriPdfProduct, bayiriPlugin, buildProducts(), convertBayiriSize(), processPdfResults(), emileetidaPlugin, flossPlugin (+31 more)

### Community 3 - "Authentication and Audit"
Cohesion: 0.06
Nodes (34): AuthState, useAuth(), User, ArmedAngelsImageMatcher(), CatalogProduct, ImageInventory, MatchedProduct, ProductFromCSV (+26 more)

### Community 4 - "Audit Logging"
Cohesion: 0.07
Nodes (31): AuditEvent, AuditLogEntry, AuditLogger, logLoginFailure(), logLoginSuccess(), logLogout(), logProductImport(), logRateLimitExceeded() (+23 more)

### Community 5 - "Odoo Credentials and Assortment Analysis"
Cohesion: 0.07
Nodes (43): getMcpOdooCredentials(), McpOdooCredentials, agedStockSchema, analyzeAssortmentSchema, analyzeAssortmentTool(), analyzeSoldenDiscountsSchema, BrandValue, countAssortmentSchema (+35 more)

### Community 6 - "CSV Parsing Utilities"
Cohesion: 0.12
Nodes (32): CSVParseOptions, CSVParseResult, detectDelimiter(), findHeader(), parseCSV(), parseSimple(), parseWithMultilineQuotes(), parseEuroPrice() (+24 more)

### Community 7 - "PDF Text Extraction"
Cohesion: 0.07
Nodes (31): ensureDomMatrixPolyfill(), ensureMathSumPrecisePolyfill(), extractPdfText(), normalizeTextResult(), ArmedAngelsProduct, config, handler(), BobochosesPrice (+23 more)

### Community 8 - "Product Image Uploading"
Cohesion: 0.11
Nodes (27): FilterMode, formatDate(), isRecent(), OdooProduct, ProductImageUploader(), ProductImageUploaderProps, ImageUploadProgressBar(), ImageUploadProgressBarProps (+19 more)

### Community 9 - "API Authentication Middleware"
Cohesion: 0.06
Nodes (14): AuthenticatedApiHandler, WithAuthOptions, defaultSession, SessionData, sessionOptions, BulkUnpublishRequest, UnpublishResult, ApiResponse (+6 more)

### Community 10 - "Image Analysis and Fetching"
Cohesion: 0.06
Nodes (20): withAuth(), AnalysisResult, ImageGroup, ImageInfo, callOdoo(), FetchImagesRequest, handler(), handler() (+12 more)

### Community 11 - "Docling Client API"
Cohesion: 0.12
Nodes (26): DoclingClient, ExtractedImage, ExtractedTable, extractImagesFromDocument(), extractTablesFromDocument(), parsePrice(), PRODUCT_FIELD_PATTERNS, suggestColumnMapping() (+18 more)

### Community 12 - "Product Availability and Odoo Calls"
Cohesion: 0.05
Nodes (20): NextApiRequestWithSession, AssignBrandRequest, AssignBrandResponse, ProductAvailability, OrderLine, callOdoo(), handler(), Data (+12 more)

### Community 13 - "Product Naming Utilities"
Cohesion: 0.11
Nodes (25): isUnitOnlyProduct(), transformProductForUpload(), DEFAULT_PRODUCT_NAME_TEMPLATE, formatProductName(), NameCasingMode, NameTemplateCasing, toTitleCase(), ADULT_SIZE_MAPPING (+17 more)

### Community 14 - "Sales Vacation Comparison"
Cohesion: 0.11
Nodes (36): arithmeticMean(), avgPerDayLabel(), collectConsecutiveYoYPctMarge(), collectConsecutiveYoYPctOmzet(), collectCrossVacationOmzetRatios(), comparableTotalsYoYMarge(), comparableTotalsYoYOmzet(), comparableYoYMarge() (+28 more)

### Community 15 - "Mollie Payment Settlement"
Cohesion: 0.11
Nodes (32): bookingDateFromIso(), buildCSVOdoo(), buildCSVOdooBank(), buildOdooDescription(), collectSettlementOdooRows(), costToOdooRow(), escapeCSV(), fetchAllPaidPayments() (+24 more)

### Community 16 - "Bulk Category Assignment UI"
Cohesion: 0.09
Nodes (25): BulkCategoryAssign(), BulkCategoryAssignProps, CategoryOption, buildTree(), CategoryItem, CategoryTreeSelect(), CategoryTreeSelectProps, TreeNode (+17 more)

### Community 17 - "Catalog and Invoice CSV Parsing"
Cohesion: 0.11
Nodes (25): determineSizeAttribute(), armedangelsPlugin, enrichCatalogWithInvoice(), isCatalogCSV(), isInvoiceCSV(), parse(), parseCatalogCSV(), parseInvoiceCSV() (+17 more)

### Community 18 - "TypeScript and Next.js Types"
Cohesion: 0.06
Nodes (31): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+23 more)

### Community 19 - "Development Dependencies"
Cohesion: 0.06
Nodes (31): baseline-browser-mapping, eslint, gh-pages, jsdom, devDependencies, baseline-browser-mapping, eslint, gh-pages (+23 more)

### Community 20 - "BabeAndTess Product Parsing"
Cohesion: 0.14
Nodes (25): rowToObject(), convertSize(), babeandtess, BabeAndTessPdfProduct, convertBabeAndTessSize(), extractColorCode(), normalizeColorName(), parseBabeAndTessCsv() (+17 more)

### Community 21 - "AI and Charting Dependencies"
Cohesion: 0.07
Nodes (29): ai, @ai-sdk/openai, @ai-sdk/react, chart.js, isomorphic-dompurify, @modelcontextprotocol/sdk, next, node-fetch (+21 more)

### Community 22 - "Category and Stock Snapshot Tools"
Cohesion: 0.17
Nodes (26): listCategoriesTool(), collectCategoryTreeIds(), searchCategories(), buildTemplateBrandMap(), categorySearchAliases(), collectionAgeYears(), countAssortment(), euro() (+18 more)

### Community 23 - "Belgian Retail Calendar"
Cohesion: 0.25
Nodes (25): addDaysYmd(), classifyDateInYear(), formatYmd(), getAfterSummerSalesRange(), getAfterWinterSalesRange(), getBeforeSummerSalesRange(), getBeforeWinterSalesRange(), getRetailCalendar() (+17 more)

### Community 24 - "Inventory Analysis"
Cohesion: 0.10
Nodes (25): AnalyseApiItem, AnalyseRow, Category, computeCategory(), computeDiff(), computeName(), computeOdooQty(), computeVariant() (+17 more)

### Community 25 - "Prompt and Description Generation"
Cohesion: 0.18
Nodes (19): extractResponsesText(), getPromptCategory(), getSystemPrompt(), getUserPrompt(), handler(), PromptCategory, RequestBody, BABETTE_SYSTEM_PROMPT (+11 more)

### Community 26 - "Category Matching and Image Management"
Cohesion: 0.16
Nodes (19): CSV_CATEGORY_TO_DUTCH, findMatchingPublicCategories(), EnhancedImageManager(), EnhancedImageManagerProps, poolImageToPoolItem(), poolItemToPoolImage(), ImageManagerProps, Category (+11 more)

### Community 27 - "Wyncken Barcode Processing"
Cohesion: 0.16
Nodes (22): detectDelimiter(), extractWynckenBarcode(), isWynckenBarcodesCSV(), isWynckenMasterDataCSV(), parseWynckenBarcodesCSV(), WynckenBarcode, cachedBarcodes, cachedDescriptions (+14 more)

### Community 28 - "POS Sales Aggregation"
Cohesion: 0.13
Nodes (20): fetchPosOrdersAndLinesForDateRange(), aggregateMonthlyDaily(), aggregateYearlyCompare(), buildDailyTotalsMap(), buildMonthlyInsights(), computeVacationPrefixTotals(), DailyBucket, DailySalesRow (+12 more)

### Community 29 - "Inventory Analysis UI"
Cohesion: 0.12
Nodes (22): AnalyseApiItem, AnalyseRow, computeCategory(), computeDiff(), computeMerk(), computeName(), computeOdooQty(), computeVariant() (+14 more)

### Community 30 - "Cellar Inventory Analysis"
Cohesion: 0.12
Nodes (22): AnalyseApiItem, AnalyseRow, computeCategory(), computeDiff(), computeMerk(), computeName(), computeOdooQty(), computeVariant() (+14 more)

### Community 31 - "Camera Status Store"
Cohesion: 0.08
Nodes (14): CameraStatus, CameraStore, CountEntry, globalStore, CancelledOrder, CustomerInsight, EcommerceData, InsightsData (+6 more)

### Community 32 - "CSV and Product Mapping Config"
Cohesion: 0.14
Nodes (18): ApplyMipounetRrpResult, ColumnMapping, DeclarativeCSVConfig, FileDetectionRule, FileInputConfig, FileInputType, ImageMatchingConfig, NameCasing (+10 more)

### Community 33 - "Chat API and AI Tools"
Cohesion: 0.18
Nodes (16): dynamic, maxDuration, openai, POST(), runtime, requireAssistantSession(), buildAssistantSystemPrompt(), createMcpAiTools() (+8 more)

### Community 34 - "Import Wizard UI"
Cohesion: 0.15
Nodes (13): ImportWizard(), ImageStep(), ImageStepProps, ImportStepProps, MappingStep(), MappingStepProps, PlayUpImageStepProps, PreviewStep() (+5 more)

### Community 35 - "Assortment and Sell-Through Analysis"
Cohesion: 0.17
Nodes (20): aggregatePosForProducts(), analyzeAssortment(), AssortmentDimension, AssortmentPerformance, AudienceFilter, BrandRankRow, buildBrandTemplateMap(), computeSellThroughPct() (+12 more)

### Community 36 - "Document Preview Components"
Cohesion: 0.13
Nodes (14): COLUMN_OPTIONS, DocumentPreview(), DocumentPreviewProps, ExtractedImage, renderInline(), renderMarkdown(), TabId, TableData (+6 more)

### Community 37 - "EAN Code Processing"
Cohesion: 0.21
Nodes (15): buildMipounetEanMap(), isMipounetEanCsv(), SEASON_PREFIXES, applyEanMap(), buildSrpMapFromConfirmationCsv(), collectCsvTexts(), convertMipounetSize(), extractColor() (+7 more)

### Community 38 - "Belgian School Vacations"
Cohesion: 0.15
Nodes (17): BY_SALES_YEAR, dateToYmd(), getOverallSalesYearCalendarBounds(), getSalesYearCalendarBounds(), getVacationPeriodsForSalesYears(), isKnownSalesYear(), listKnownSalesYears(), SCHOOL_VACATION_IDS (+9 more)

### Community 39 - "Client Registration API"
Cohesion: 0.15
Nodes (16): dynamic, POST(), runtime, RFC-8252, CimdDocument, clientFromJwt(), fetchCimdClient(), isHttpsUrl() (+8 more)

### Community 40 - "OAuth Token API"
Cohesion: 0.20
Nodes (14): dynamic, oauthError(), POST(), readBody(), runtime, dynamic, GET(), runtime (+6 more)

### Community 41 - "Delivery Confirmation UI"
Cohesion: 0.12
Nodes (12): DeliveryConfirmationDialog(), DeliveryConfirmationDialogProps, MoveLine, Picking, Product, ProductAvailabilityDialog(), ProductAvailabilityDialogProps, ImageModalProps (+4 more)

### Community 42 - "Excel I/O Utilities"
Cohesion: 0.15
Nodes (17): cellToPlain(), downloadRowsAsXlsx(), readXlsxFirstSheetAsJsonRecords(), triggerXlsxDownload(), trimSheetName(), btnStyle, effectiveSetQty(), inputStyle (+9 more)

### Community 43 - "Odoo Image Services"
Cohesion: 0.18
Nodes (11): FetchedImage, IMAGE_EXTENSIONS, OdooImageError, ImportProductData, ImportVariantData, OdooImportError, SizeAttributeResult, VariantUpdateResult (+3 more)

### Community 44 - "PDF Parsing and Extraction"
Cohesion: 0.20
Nodes (17): ensurePdfWorker(), pdf-parse, config, extractProductsFromPdfTables(), extractTextFromPdf(), extractTextWithRotations(), handler(), isOrderProformaFormat() (+9 more)

### Community 45 - "Validation Reporting UI"
Cohesion: 0.17
Nodes (9): FIELD_LABELS, generateMarkdownReport(), STATUS_CONFIG, allPassResults, mixedResults, ValidationReport(), ValidationReportProps, ProductValidation (+1 more)

### Community 46 - "DrBloom Product Parsing"
Cohesion: 0.18
Nodes (14): buildProducts(), drbloomPlugin, extractNameAndSize(), processPdfResults(), SIZE_SUFFIXES, convertSizeToDutch(), enrichWithSRP(), isOrderConfirmationCSV() (+6 more)

### Community 47 - "MCP API Authentication"
Cohesion: 0.22
Nodes (13): DELETE(), dynamic, GET(), handle(), maxDuration, POST(), runtime, authorizeMcpRequest() (+5 more)

### Community 48 - "Import Step UI"
Cohesion: 0.31
Nodes (12): ImportStep(), useImportWizard(), buildImportLogPayload(), buildPartialVariantMessage(), ImportProductStatus, ImportResultLike, isImportFullSuccess(), isImportRecoverable() (+4 more)

### Community 49 - "Image Analysis Provider"
Cohesion: 0.22
Nodes (10): AnalysisResult, analyzeImage(), analyzeImageOpenAI(), analyzeImageYolo(), CameraConfig, getAnalysisProvider(), getCameras(), fetchSnapshot() (+2 more)

### Community 50 - "Emileetida Image Processing"
Cohesion: 0.23
Nodes (13): aliasEmileetidaColor(), COLOR_ALIASES, colorsMatchEmileetida(), EmileetidaImageInfo, extractEmileetidaImageInfo(), extractEmileetidaReferences(), extractLifestyleInfo(), normalizeEmileetidaColor() (+5 more)

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

### Community 56 - "OAuth Authorization Endpoint"
Cohesion: 0.25
Nodes (13): AuthzParams, dynamic, GET(), html(), oauthErrorRedirect(), POST(), prepareAuthorize(), readParams() (+5 more)

### Community 57 - "PKCE and OAuth Tokens"
Cohesion: 0.27
Nodes (10): verifyPkceS256(), exchangeAuthorizationCode(), issueTokenPair(), ACCESS_TOKEN_TTL_SEC, AccessTokenPayload, AUTH_CODE_TTL_SEC, AuthCodePayload, OAUTH_SCOPE (+2 more)

### Community 58 - "Solden Discount Analysis"
Cohesion: 0.22
Nodes (13): analyzeSoldenDiscountsTool(), DateRange, analyzeSoldenDiscounts(), classifyDiscountManner(), DayDiscountStats, DiscountBucket, DiscountManner, emptyManner() (+5 more)

### Community 59 - "Odoo Product Image Upload"
Cohesion: 0.23
Nodes (6): OdooImageService, config, handler(), ImageItem, UploadRequest, handler()

### Community 60 - "PlayUp Product Parsing"
Cohesion: 0.19
Nodes (10): buildProductsFromEAN(), detectDelimiter(), EANProduct, formatDescription(), formatSizeForOdoo(), InvoiceItem, parseEANCSV(), parseQuotedCSVLine() (+2 more)

### Community 61 - "Build and Test Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, dev, docling:logs, docling:start, docling:stop, lint, postinstall (+6 more)

### Community 62 - "Supplier File Detection"
Cohesion: 0.18
Nodes (9): detectCSV(), DetectionMatch, DetectionResponse, detectPDF(), FileDetectionInput, FileDetectionResult, handler(), SUPPLIER_RULES (+1 more)

### Community 63 - "Mollie Export Utilities"
Cohesion: 0.32
Nodes (12): currentYear, formatDate(), getCustomPeriodIssue(), getQuarterDates(), isRangeValid(), isValidDateOnly(), MollieExport(), pad() (+4 more)

### Community 64 - "POS Sales Data UI"
Cohesion: 0.15
Nodes (12): cellInputStyle, defaultSettings, inputStyle, labelStyle, LoadMode, modalBackdropStyle, modalStyle, PosVerkopenOphalenPage() (+4 more)

### Community 65 - "Webshop Sales Data UI"
Cohesion: 0.15
Nodes (12): cellInputStyle, defaultSettings, inputStyle, labelStyle, LoadMode, modalBackdropStyle, modalStyle, ScannedRow (+4 more)

### Community 66 - "Odoo Import Service"
Cohesion: 0.29
Nodes (3): OdooImportService, getClientIp(), handler()

### Community 67 - "Odoo Validation Service"
Cohesion: 0.27
Nodes (3): OdooValidationService, handler(), validateRequestSchema

### Community 68 - "Cozmo Product Parsing"
Cohesion: 0.26
Nodes (9): buildEcommerceDescription(), cozmo, getRrp(), OrderRow, parse(), parseOrderCSV(), parsePriceCSV(), productKey() (+1 more)

### Community 69 - "Sisters Department Parsing"
Cohesion: 0.26
Nodes (10): buildProducts(), InvoiceItem, isProductRow(), isSizeRow(), parse(), parseCatalogCSV(), parseCSVLine(), processPdfResults() (+2 more)

### Community 70 - "Inventory Management UI"
Cohesion: 0.20
Nodes (11): getLocalInventories(), inputStyle, InventarisBeheerPage(), InventoryRow, labelStyle, modalBackdropStyle, modalStyle, SavedInventory (+3 more)

### Community 71 - "Vercel Deployment Config"
Cohesion: 0.17
Nodes (11): maxDuration, maxDuration, functions, app/api/assistant/chat/route.ts, app/api/mcp/route.ts, pages/api/import-products.ts, pages/api/suppliers/onboard.ts, pages/api/**/*.ts (+3 more)

### Community 72 - "ClaudeAndCo Product Parsing"
Cohesion: 0.25
Nodes (8): buildProducts(), claudeAndCoPlugin, convertCCSize(), CsvVariant, InvoiceItem, parse(), parseCatalogCSV(), processPdfResults()

### Community 73 - "Wyncken Sales Order Parsing"
Cohesion: 0.35
Nodes (8): isWynckenSalesOrderText(), parseSizeGrid(), parseWynckenSalesOrderText(), WynckenPdfProduct, WynckenSizeQty, config, handler(), parseProformaText()

### Community 74 - "Supplier File Analysis"
Cohesion: 0.29
Nodes (10): AISuggestion, AnalysisResponse, analyzeColumn(), analyzeCSV(), ColumnAnalysis, detectDelimiter(), FileAnalysis, generateAISuggestion() (+2 more)

### Community 75 - "Inventory Merge UI"
Cohesion: 0.18
Nodes (10): inputStyle, InventoryRow, labelStyle, LoadedFile, modalBackdropStyle, modalStyle, tdStyle, thStyle (+2 more)

### Community 76 - "Product Check UI"
Cohesion: 0.22
Nodes (10): Brand, compressImage(), GalleryImage, ProductCheckItem, ProductCheckPage(), readFileAsDataUrl(), SortColumn, SortDirection (+2 more)

### Community 77 - "Inventory Merge UI"
Cohesion: 0.18
Nodes (10): inputStyle, InventoryRow, labelStyle, LoadedFile, modalBackdropStyle, modalStyle, tdStyle, thStyle (+2 more)

### Community 78 - "POS Sales Range Queries"
Cohesion: 0.24
Nodes (9): DEFAULT_LINE_FIELDS, DEFAULT_ORDER_FIELDS, fetchPosLinesForOrderIds(), FetchPosOrdersAndLinesOptions, fetchPosOrdersInDateRange(), PosOrderLineRow, PosOrderRow, toEndDateTime() (+1 more)

### Community 79 - "Supplier File Upload"
Cohesion: 0.29
Nodes (9): createParseContext(), getSupplier(), decodeChoice(), DetectionMatch, DetectionState, encodeChoice(), FileDetectionResult, SmartUploadPage() (+1 more)

### Community 80 - "Camera Monitoring UI"
Cohesion: 0.31
Nodes (9): AnalyzeResult, CameraCard(), CameraMonitorPage(), CameraStatus, CountEntry, formatTime(), getCountBg(), getCountColor() (+1 more)

### Community 81 - "Sales Best Days Analysis"
Cohesion: 0.29
Nodes (9): buildYearList(), ChannelTotals, DayRow, emptyChannel(), formatBE(), MonthlyCompareRow, periodsForYear(), SalesBestDaysPage() (+1 more)

### Community 82 - "OAuth Protected Resource API"
Cohesion: 0.28
Nodes (7): dynamic, GET(), runtime, dynamic, GET(), runtime, getProtectedResourceMetadata()

### Community 83 - "ThinkingMu Product Parsing"
Cohesion: 0.31
Nodes (7): buildProducts(), CsvEnrichment, parse(), parseJoorCSV(), processPdfResults(), ThinkingMuPdfItem, thinkingMuPlugin

### Community 84 - "Product Data Models"
Cohesion: 0.31
Nodes (7): ImportProductsInput, importProductsSchema, OdooCallInput, Product, productSchema, ProductVariant, productVariantSchema

### Community 85 - "Webshop Daily Sales"
Cohesion: 0.25
Nodes (6): bodySchema, fetchSaleOrderLines(), fetchSaleOrderLinesWithFields(), SaleOrder, SaleOrderLine, WebshopDailyRow

### Community 86 - "Monthly Sales Comparison"
Cohesion: 0.36
Nodes (8): DailyComparePage(), formatBE(), getDaysInMonth(), getWeekday(), isBelgianHoliday(), isWeekend(), MONTH_LABELS, WEEKDAY_LABELS

### Community 87 - "JWT Token Utilities"
Cohesion: 0.50
Nodes (7): base64url(), base64urlJson(), getSigningSecret(), JwtPayload, signHs256(), signJwt(), verifyJwt()

### Community 88 - "Security and Session Utils"
Cohesion: 0.39
Nodes (5): timingSafeEqualString(), handler(), handler(), PosOrder, PosSession

### Community 89 - "AO76 Image Upload"
Cohesion: 0.39
Nodes (7): expandHome(), findTemplateId(), getCandidateReferences(), getReferenceAndSequence(), handler(), IMAGE_EXTENSIONS, UploadResult

### Community 90 - "Product Stock Lookup"
Cohesion: 0.25
Nodes (6): ApiResponse, FIELDS_FAST, FIELDS_WITH_IMAGE, OdooRawProduct, SuccessFound, SuccessNotFound

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

### Community 100 - "Product Duplicate Checking"
Cohesion: 0.43
Nodes (6): callOdoo(), CategorizedProduct, findBaseProduct(), handler(), parseProductInfo(), ProductMatch

### Community 101 - "Image Upload Handling"
Cohesion: 0.33
Nodes (6): callOdoo(), config, handler(), ImageUpload, UploadRequest, UploadResult

### Community 102 - "Bayiri PDF Product Parsing"
Cohesion: 0.43
Nodes (6): BayiriProduct, config, extractProducts(), handler(), SIZE_TOKEN_RE, SIZE_TOKENS

### Community 103 - "Product Search Normalization"
Cohesion: 0.43
Nodes (6): callOdoo(), handler(), normalizeColorToken(), ProductResult, SearchRequest, stripHtml()

### Community 104 - "Armed Angels Image Upload"
Cohesion: 0.33
Nodes (6): callOdoo(), config, handler(), MatchedProduct, UploadResponse, UploadResult

### Community 105 - "Brand Inventory Management"
Cohesion: 0.33
Nodes (6): BrandInventoryData, BrandInventoryMetrics, BrandInventoryPage(), formatBE(), SeasonData, STATUS_CONFIG

### Community 106 - "Brand Performance Metrics"
Cohesion: 0.33
Nodes (6): BrandMetrics, BrandPerformanceData, BrandPerformancePage(), formatBE(), PERIOD_LABELS, PeriodData

### Community 107 - "Inventory POS Matching"
Cohesion: 0.29
Nodes (6): InventarisPosMatchPage(), InventoryRow, ScannedRow, tdStyle, thStyle, UploadShape

### Community 108 - "Label Printing Interface"
Cohesion: 0.33
Nodes (6): btnStyle, escapeHtml(), LabelPrintenPage(), LabelRow, tdStyle, thStyle

### Community 109 - "EAN Barcode Utilities"
Cohesion: 0.73
Nodes (4): calculateEAN13CheckDigit(), generateEAN13(), generateUniqueEAN13Batch(), isValidEAN13()

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

### Community 114 - "Transaction Processing"
Cohesion: 0.40
Nodes (4): escapeCSV(), formatPaymentsAsCSV(), MollieListResponse, MolliePayment

### Community 115 - "Barcode Analysis"
Cohesion: 0.33
Nodes (3): AnalyseApiItem, OdooMatch, OdooRawProduct

### Community 116 - "Product Variant Archiving"
Cohesion: 0.33
Nodes (3): OdooVariant, ProductWithVariants, VariantInfo

### Community 117 - "Stock Updates"
Cohesion: 0.67
Nodes (3): callOdoo(), handler(), UpdateStockRequest

### Community 118 - "Barcode Lookup Service"
Cohesion: 0.33
Nodes (4): ApiResponse, OdooRawProduct, SuccessFound, SuccessNotFound

### Community 119 - "Onemore Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), OnemoreImageUploadRequest, UploadResult

### Community 120 - "DrBloom PDF Parsing"
Cohesion: 0.47
Nodes (5): config, DrBloomItem, extractItems(), handler(), parseEuro()

### Community 121 - "Sales Product Data"
Cohesion: 0.33
Nodes (5): Category, DailySalesProduct, OrderLine, Product, SalesProductData

### Community 122 - "TheNewSociety Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), TheNewSocietyImageUploadRequest, UploadResult

### Community 123 - "WeekendHouseKids Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), UploadResult, WeekendHouseKidsImageUploadRequest

### Community 124 - "Wyncken Image Upload"
Cohesion: 0.40
Nodes (5): callOdoo(), config, handler(), UploadResult, WynckenImageUploadRequest

### Community 125 - "Variant Archiving"
Cohesion: 0.33
Nodes (4): ArchiveerVarianten(), OdooCategory, ProductWithVariants, VariantInfo

### Community 126 - "Dashboard and Session Data"
Cohesion: 0.33
Nodes (5): DashboardPage(), LastSessionData, OrderLine, Sale, SessionData

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

### Community 133 - "Brand Diagnostics"
Cohesion: 0.40
Nodes (3): BrandDiagnosticsResponse, BrandSuggestionGroup, ProductWithIssue

### Community 134 - "Floss Product Search"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 136 - "Image Directory Listing"
Cohesion: 0.60
Nodes (4): getAllowedRoots(), handler(), isPathAllowed(), ListDirectoryResponse

### Community 138 - "Product Quantity Updates"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), UpdateQuantitiesRequest, UpdateQuantity

### Community 139 - "ClaudeAndCo Invoice Parsing"
Cohesion: 0.50
Nodes (4): ClaudeCoInvoiceItem, config, extractInvoiceItems(), handler()

### Community 140 - "Fub PDF Product Parsing"
Cohesion: 0.50
Nodes (4): config, extractProducts(), FubPdfProduct, handler()

### Community 141 - "PlayUp Invoice Parsing"
Cohesion: 0.50
Nodes (4): config, extractInvoiceItems(), handler(), PlayUpInvoiceItem

### Community 142 - "SistersDepartment Invoice Parsing"
Cohesion: 0.50
Nodes (4): config, extractInvoiceItems(), handler(), SistersInvoiceItem

### Community 143 - "POS Sales Reporting"
Cohesion: 0.40
Nodes (4): PosOrder, PosOrderLine, Product, SalesRow

### Community 144 - "Template Image Management"
Cohesion: 0.40
Nodes (3): config, GalleryImage, TemplateImagesResponse

### Community 145 - "Bobochoses Product Search"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 146 - "MiniRodini Product Search"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 147 - "Mipounet Product Search"
Cohesion: 0.50
Nodes (4): callOdoo(), handler(), ProductResult, SearchRequest

### Community 148 - "Batch Product Reference Search"
Cohesion: 0.50
Nodes (4): BatchSearchRequest, callOdoo(), handler(), ProductSearchResult

### Community 149 - "Product Price Updates"
Cohesion: 0.40
Nodes (3): UpdateProductPriceRequest, UpdateRequest, UpdateResult

### Community 150 - "Webshop Sales Reporting"
Cohesion: 0.40
Nodes (4): Product, SaleOrder, SaleOrderLine, SalesRow

### Community 151 - "PlayUp Barcode Updates"
Cohesion: 0.40
Nodes (4): DeliveryProduct, EANProduct, MatchedProduct, PlayUpBarcodeUpdate()

### Community 152 - "Sales Products Overview"
Cohesion: 0.40
Nodes (4): DailySalesProduct, ProductDetail, SalesProductData, SalesProductsPage()

### Community 153 - "WeekendHouseKids Price Updates"
Cohesion: 0.40
Nodes (4): MatchedProduct, OrderCSVProduct, UpdateResult, WeekendHouseKidsPriceUpdate()

### Community 154 - "PlayUp Barcode Update Guides"
Cohesion: 0.40
Nodes (5): Play Up Barcode Update Guide, Play UP Image Import Procedure, Play UP Image Upload Guide, Play UP Image Import Complete, Play UP Quick Start

### Community 155 - "DrBloom Size Fixes"
Cohesion: 0.60
Nodes (4): authenticate(), CONFIG, main(), rpc()

### Community 157 - "Floss CSV Import Guides"
Cohesion: 0.50
Nodes (4): Flöss CSV Parser Fix, Flöss Import Guide, Flöss Vendor Quick Start, Flöss Vendor Implementation

### Community 159 - "Project Metadata"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 160 - "Create Hvid Product"
Cohesion: 0.67
Nodes (3): callOdoo(), CreateHvidProductRequest, handler()

### Community 162 - "Fetch PlayUp Images"
Cohesion: 0.67
Nodes (3): callOdoo(), FetchPlayUpImagesRequest, handler()

### Community 163 - "SundayCollective PDF Parsing"
Cohesion: 0.50
Nodes (3): config, handler(), SundayCollectiveProduct

### Community 164 - "Product Description Details"
Cohesion: 0.67
Nodes (3): handler(), MAAT_ATTRIBUTES, ProductDescriptionDetail

### Community 165 - "Product Barcode Updates"
Cohesion: 0.67
Nodes (3): callOdoo(), handler(), UpdateBarcodeRequest

### Community 167 - "Assistant Interface"
Cohesion: 0.83
Nodes (3): AssistantPage(), partText(), toolLabel()

### Community 171 - "Product Import System"
Cohesion: 0.50
Nodes (4): Product Import System Guide, Product Import Updates, Product Import Setup Instructions, Product Import UX Improvements

### Community 177 - "Product Images Import"
Cohesion: 0.67
Nodes (3): Ao76ImagesImport(), ProductToFetch, ProductWithImages

### Community 206 - "Create Product Variant"
Cohesion: 0.67
Nodes (3): callOdoo(), CreateVariantRequest, handler()

## Knowledge Gaps
- **839 isolated node(s):** `runtime`, `dynamic`, `runtime`, `dynamic`, `runtime` (+834 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `withAuth()` connect `Image Analysis and Fetching` to `Odoo API Client`, `Git Repository Operations`, `Audit Logging`, `Brand Diagnostics`, `Floss Product Search`, `Picking Details Retrieval`, `Image Directory Listing`, `API Authentication Middleware`, `Archived Product Lookup`, `Product Quantity Updates`, `Product Availability and Odoo Calls`, `PDF Text Extraction`, `ClaudeAndCo Invoice Parsing`, `Mollie Payment Settlement`, `Docling Client API`, `Fub PDF Product Parsing`, `PlayUp Invoice Parsing`, `SistersDepartment Invoice Parsing`, `POS Sales Reporting`, `Template Image Management`, `Bobochoses Product Search`, `MiniRodini Product Search`, `Mipounet Product Search`, `Prompt and Description Generation`, `Batch Product Reference Search`, `Product Price Updates`, `POS Sales Aggregation`, `Webshop Sales Reporting`, `Odoo API Calls`, `Camera Status Store`, `Create Hvid Product`, `Bulk Weight Updates`, `Fetch PlayUp Images`, `SundayCollective PDF Parsing`, `Product Description Details`, `CSV Parsing Utilities`, `Belgian School Vacations`, `Product Barcode Updates`, `PDF Parsing and Extraction`, `Import Step UI`, `Image Analysis Provider`, `Emileetida Image Processing`, `Odoo Product Image Upload`, `Supplier File Detection`, `Odoo Validation Service`, `Wyncken Sales Order Parsing`, `Supplier File Analysis`, `Create Product Variant`, `Webshop Daily Sales`, `AO76 Image Upload`, `Product Stock Lookup`, `BabeAndTess PDF Parsing`, `AO76 Image Scanning`, `Brand Inventory Metrics`, `Product Duplicate Checking`, `Image Upload Handling`, `Bayiri PDF Product Parsing`, `Product Search Normalization`, `Armed Angels Image Upload`, `Brand Performance Data`, `Floss Image Upload`, `Jenest Image Upload`, `Transaction Processing`, `Barcode Analysis`, `Product Variant Archiving`, `Stock Updates`, `Barcode Lookup Service`, `Onemore Image Upload`, `DrBloom PDF Parsing`, `Sales Product Data`, `TheNewSociety Image Upload`, `WeekendHouseKids Image Upload`, `Wyncken Image Upload`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `NextApiRequestWithSession` connect `Product Availability and Odoo Calls` to `Odoo API Client`, `Git Repository Operations`, `Audit Logging`, `Brand Diagnostics`, `Floss Product Search`, `Picking Details Retrieval`, `Image Directory Listing`, `API Authentication Middleware`, `Image Analysis and Fetching`, `Archived Product Lookup`, `Product Quantity Updates`, `PDF Text Extraction`, `ClaudeAndCo Invoice Parsing`, `Mollie Payment Settlement`, `Docling Client API`, `Fub PDF Product Parsing`, `PlayUp Invoice Parsing`, `SistersDepartment Invoice Parsing`, `POS Sales Reporting`, `Template Image Management`, `Bobochoses Product Search`, `MiniRodini Product Search`, `Mipounet Product Search`, `Prompt and Description Generation`, `Batch Product Reference Search`, `Product Price Updates`, `POS Sales Aggregation`, `Webshop Sales Reporting`, `Odoo API Calls`, `Camera Status Store`, `Create Hvid Product`, `Bulk Weight Updates`, `Fetch PlayUp Images`, `SundayCollective PDF Parsing`, `Product Description Details`, `CSV Parsing Utilities`, `Belgian School Vacations`, `Product Barcode Updates`, `PDF Parsing and Extraction`, `Import Step UI`, `Emileetida Image Processing`, `Odoo Product Image Upload`, `Supplier File Detection`, `Odoo Validation Service`, `Wyncken Sales Order Parsing`, `Supplier File Analysis`, `Create Product Variant`, `Webshop Daily Sales`, `AO76 Image Upload`, `Product Stock Lookup`, `BabeAndTess PDF Parsing`, `AO76 Image Scanning`, `Brand Inventory Metrics`, `Product Duplicate Checking`, `Image Upload Handling`, `Bayiri PDF Product Parsing`, `Product Search Normalization`, `Armed Angels Image Upload`, `Brand Performance Data`, `Floss Image Upload`, `Jenest Image Upload`, `Barcode Analysis`, `Product Variant Archiving`, `Stock Updates`, `Barcode Lookup Service`, `Onemore Image Upload`, `DrBloom PDF Parsing`, `Sales Product Data`, `TheNewSociety Image Upload`, `WeekendHouseKids Image Upload`, `Wyncken Image Upload`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Authentication and Audit` to `Sales Vacation Comparison`, `PlayUp Barcode Updates`, `Sales Products Overview`, `Inventory Analysis`, `WeekendHouseKids Price Updates`, `Inventory Analysis UI`, `Cellar Inventory Analysis`, `Assistant Interface`, `Delivery Confirmation UI`, `Excel I/O Utilities`, `Product Images Import`, `Ecommerce Insights Dashboard`, `Inventory Creation UI`, `Cellar Inventory UI`, `Mollie Export Utilities`, `POS Sales Data UI`, `Webshop Sales Data UI`, `Inventory Management UI`, `Inventory Merge UI`, `Inventory Merge UI`, `Camera Monitoring UI`, `Sales Best Days Analysis`, `Monthly Sales Comparison`, `Yearly Sales Comparison`, `Stock Sale UI`, `Brand Inventory Management`, `Brand Performance Metrics`, `Inventory POS Matching`, `Label Printing Interface`, `Image Matching System`, `Variant Archiving`, `Dashboard and Session Data`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **What connects `runtime`, `dynamic`, `runtime` to the rest of the system?**
  _839 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Odoo API Client` be split into smaller, more focused modules?**
  _Cohesion score 0.03442340791738382 - nodes in this community are weakly interconnected._
- **Should `Git Repository Operations` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Bayiri Product Parsing` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._