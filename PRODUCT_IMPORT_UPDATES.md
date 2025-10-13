# Product Import Updates

## Changes Summary

### 1. **Automatic eCommerce Image Import** 🆕
- **Vendor Website URL**: Enter the vendor's website URL to automatically download product images
- **Automatic Download**: System searches for products on vendor website and downloads images (usually 1-3 per product)
- **Direct Upload to Odoo**: Images are automatically uploaded to Odoo as `product.image` records
- **Supports Shopify**: Currently optimized for Shopify stores (like Hello Simone)
- **Shows in Results**: Import results table shows how many images were uploaded per product
- **Completely Optional**: Leave URL empty to skip image import

### 2. **Fully Editable Product & Variant Fields**
- **Default Stock**: All products now default to **0 voorraad** (stock quantity)
- **Product Name Editable**: Product names can be edited at the product level (highlighted input field)
- **All Variant Fields Editable**: Users can now edit ALL variant fields before import:
  - **Maat** (Size)
  - **EAN** (Barcode)
  - **Kostprijs** (Cost Price)
  - **Verkoopprijs** (Retail Price, previously "RRP")
  - **Voorraad** (Stock Quantity)
- **Location**: Field editing is available in **Step 3: Voorraad** (previously just "Selectie")
- **UI**: Each product shows an expandable card with editable product name and a table with all variants, where every field can be adjusted using input fields

### 3. **Multi-Vendor Support**
- **Vendor Selection**: Step 1 now requires selecting a vendor before file upload
- **Supported Vendors**:
  - **Ao76**: Original format (EAN barcode, Reference, Description, Quality, Colour, Size, Quantity, Price, RRP)
  - **Le New Black**: Order export format (Brand name, Product reference, Product name, Color name, Description, Size name, EAN13, Net amount)
    - **Special handling**: First line is order reference (skipped)
    - **RRP Calculation**: Automatically calculates retail price as 2.5x wholesale price (editable)

### 4. **Vendor-Specific Parsers**
- `parseAo76CSV()`: Handles Ao76 CSV format with semicolon separators
- `parseLeNewBlackCSV()`: Handles Le New Black CSV format (adjustable based on actual format)
- Easy to extend: Add new parsers by creating new functions and adding vendor types

## How to Use

### Step-by-Step Process:

1. **Step 1: Upload**
   - Select your vendor (Ao76 or Le New Black)
   - **Enter vendor website URL** (optional) - for automatic image downloading
     - Example: `https://www.hellosimone.fr/`
     - System will automatically search for products and download images
   - Upload the CSV file matching the vendor's format
   - Format preview is shown based on selected vendor
   - View automatic defaults that will be applied to all products

2. **Step 2: Mapping**
   - Review parsed products
   - Verify field mapping worked correctly

3. **Step 3: Voorraad** (NEW!)
   - Select which products to import
   - **Edit ALL variant fields** (Maat, EAN, Kostprijs, Verkoopprijs, Voorraad)
   - Each product shows all variants in a table with fully editable inputs
   - All fields can be corrected or adjusted before import

4. **Step 4: Categorieën**
   - Assign brand, internal category (required)
   - Add eCommerce categories (optional, multiple)
   - Add product labels (optional)
   - **ALL categories and tags** are now loaded from Odoo (not just sample subset)

5. **Step 5-7**: Preview, Test, Import
   - Preview shows all automatic defaults again
   - Import results show Odoo's `display_name` for each product (with reference code below)
   - "Product ID" column shows clickable link to view product in Odoo
   - Display name is fetched from Odoo after creation (includes full product context)

### Automatic Defaults Applied to All Products:

| Setting | Value |
|---------|-------|
| Productsoort | Verbruiksartikel |
| Gewicht | 0,20 kg |
| Voorraad bijhouden | ✓ Ingeschakeld |
| Kassa | ✓ Kan verkocht worden |
| Website | ✓ Gepubliceerd (Babette.) |
| Inkoop | ✗ Uitgeschakeld |
| Voorraad | 0 (instelbaar per variant) |
| Out of stock bericht | "Verkocht!" |
| Facturatiebeleid | Geleverde hoeveelheden |

## Technical Details

### New Types:
```typescript
type VendorType = 'ao76' | 'lenewblack' | null;
```

### Modified Interface:
```typescript
interface ParsedProduct {
  reference: string;
  name: string; // Formatted name for Odoo
  originalName?: string; // Original name from CSV (used for image search)
  // ... other fields
}

interface ProductVariant {
  size: string;
  quantity: number; // Now editable, defaults to 0
  ean: string;
  price: number;
  rrp: number;
}
```

### New API Endpoints:
- `/api/fetch-product-images`: Fetches and uploads product images from vendor website
  - Searches Shopify stores by product name
  - Downloads images (up to 3)
  - Converts to base64 and uploads to Odoo
  - Returns count of successfully uploaded images

### New Functions:
- `parseAo76CSV(text: string)`: Parses Ao76 format
- `parseLeNewBlackCSV(text: string)`: Parses Le New Black format
  - Skips first line (order reference)
  - Uses line 2 as headers
  - Groups by `Product reference` field
  - Combines `Brand name` + `Product name` for product name
  - Calculates RRP as `Net amount * 2.5`
  - Uses `Description` field as material
- `updateProductName(productRef, newName)`: Updates the product name at the product level
- `updateVariantQuantity(productRef, variantIndex, newQuantity)`: Updates stock for a specific variant
- `updateVariantField(productRef, variantIndex, field, value)`: Updates any variant field (size, ean, price, rrp, quantity)

### Le New Black Field Mapping:
```typescript
CSV Field              → Product Field
─────────────────────────────────────
Product reference      → reference (grouping key)
Brand name + Product name → name (formatted: "Hello Simone - Bear fleece jacket cookie")
                         Brand: Title Case (all words capitalized)
                         Product: Sentence case (first word capitalized)
Color name             → color
Description            → material
Size name              → size
EAN13                  → ean
Net amount             → price (cost price)
Net amount * 2.5       → rrp (calculated retail price)
Brand name             → also used for brand detection
```

### UI Changes:
- **"RRP" renamed to "Verkoopprijs"** throughout the application
- Step 3 now displays products as expandable cards
- **Product name is now editable** at the product level (highlighted input field above variants)
- Each card shows a table of all variants with **fully editable fields**:
  - Product Name: large text input (at product level)
  - Maat: text input (at variant level)
  - EAN: text input (full width for long barcodes)
  - Kostprijs: number input with € symbol and decimal support (step: 0.01)
  - Verkoopprijs: number input with € symbol and decimal support (step: 0.01)
  - Voorraad: number input (integers only)
- Step renamed from "Selectie" to "Voorraad" (icon: 📦)
- Vendor selection UI added to Step 1

## Adding New Vendors

To add a new vendor:

1. Add vendor to `VendorType`:
   ```typescript
   type VendorType = 'ao76' | 'lenewblack' | 'newvendor' | null;
   ```

2. Create parser function:
   ```typescript
   const parseNewVendorCSV = (text: string) => {
     // Parse logic specific to vendor format
     // Always set quantity: 0 as default
   };
   ```

3. Add to file upload handler:
   ```typescript
   if (selectedVendor === 'newvendor') {
     parseNewVendorCSV(text);
   }
   ```

4. Add vendor selection button in Step 1 UI

## Notes

- Stock quantity defaults to **0** for all variants
- Users must manually set stock before import if needed
- The API only creates stock entries when quantity > 0
- Vendor format previews are shown dynamically based on selection
- Reset button now also clears vendor selection
- **All variant fields are now editable** - you can correct any parsing errors before import:
  - Fix incorrect sizes
  - Correct EAN barcodes
  - Adjust cost prices
  - Modify retail prices (verkoopprijs)
  - Set stock quantities
- Price fields support decimals (0.01 steps) for accurate pricing

### Category & Tag Loading

- **ALL eCommerce categories** are now loaded from Odoo (not just those from sample products)
- **ALL product tags** are now loaded (complete list)
- This means you'll see categories like "Merken / Hello Simone" and any other category in your system
- Previously only a limited subset based on sample products was shown
- First time loading may take slightly longer due to fetching complete lists

### Automatic Image Import 📸

#### Debug Tool Available! 🐛
**Before importing**, use the **Image Fetch Debug Tool** to test if products can be found:
- Access via: `/image-fetch-debug` or click "🐛 Test Image Matching" button in Step 1
- Test product reference and name matching
- Preview images before import
- See all available products on vendor website
- Identify products that won't be found automatically

#### How It Works:
1. **Enter Vendor Website URL** in Step 1 (e.g., `https://www.hellosimone.fr/`)
2. **System automatically searches** for each product using a smart 2-strategy approach:
   - **Strategy 1 (Primary)**: Search by **Product Reference** (e.g., "AW25-BFLJC")
     - Most accurate - usually finds exactly 1 match
     - Searches in both product title and URL handle
     - Fetches up to 500 products (2 pages) to maximize coverage
   - **Strategy 2 (Fallback)**: Search by **Original Product Name** from CSV
     - Used if reference search finds no matches
     - For Le New Black: "Bear fleece jacket Cookie" (original), NOT "Hello Simone - Bear fleece jacket cookie" (formatted)
     - May find multiple matches - uses first one
3. **Downloads images** (usually 1-3 per product) from the matched product
4. **Uploads to Odoo** as `product.image` records linked to the product template
5. **Shows results** in import results table with image count per product

#### Supported Platforms:
- **Shopify stores** (like Hello Simone) - fully supported
  - Uses Shopify's products.json API
  - Searches by product reference first (most accurate)
  - Falls back to product name if needed
  - Downloads first 3 images per product
- Other platforms can be added with custom parsers

#### When Images Are Fetched:
- **During full import** (not in test mode)
- After product template and variants are created
- Runs for each product automatically if URL is provided
- Failures don't stop the import - product is still created

#### Benefits:
- ⏱️ **Saves hours of manual work** - no need to manually download and upload images
- 🎯 **Automatic matching** - finds products by reference or name
- 🖼️ **Multiple images** - downloads up to 3 images per product
- ✅ **Reliable** - continues even if some images fail
- 📊 **Transparent** - see exactly how many images were uploaded per product
- 🐛 **Debug tool** - test matching before import

#### Troubleshooting: Product Not Found

If a product can't be found on the website (e.g., `AW25-MIBPLS`):

1. **Use Debug Tool** (`/image-fetch-debug`):
   - Load all products from vendor website
   - Search by reference (e.g., `AW25-MIBPLS`)
   - See if product exists and what its exact name/handle is

2. **Common Reasons**:
   - Product not yet published on website
   - Different reference format (website might use different SKU)
   - Product in different collection or out of stock
   - Website only shows subset of products

3. **Solutions**:
   - **Import continues anyway** - products are created in Odoo without images
   - Add images manually later in Odoo
   - Update product name in CSV to match website exactly
   - Skip vendor URL to disable image import for this batch

#### Search Strategy Example:

**CSV Input:**
```
Product reference: AW25-BFLJC
Product name: Bear fleece jacket Cookie
```

**Search Process:**
1. ✅ Search hellosimone.fr for reference `"AW25-BFLJC"`
2. ✅ Found 1 exact match (title: "Bear fleece jacket Cookie - AW25-BFLJC")
3. ✅ Extract 3 images from product
4. ✅ Upload to Odoo

**If reference fails:**
1. ⚠️ Search by reference found 0 matches
2. 🔄 Fallback: Search by name `"Bear fleece jacket Cookie"`
3. ✅ Found match
4. ✅ Download and upload images

#### Example Output:
```
Product: Hello Simone - Bear fleece jacket cookie
Varianten: 4
Afbeeldingen: 📸 3
```

### Le New Black Specific Notes:
- **Order Reference Line**: The first line contains an order reference (e.g., `order-2995931-20251013`) and is automatically skipped
- **Product Name Format**: Automatically combines brand and product name with proper capitalization
  - Example: `Hello Simone - Bear fleece jacket cookie`
  - Brand name: **Title Case** (all words capitalized): "Hello Simone"
  - Product name: **Sentence case** (first word capitalized): "Bear fleece jacket cookie"
  - Format: `Brand Name - Product name`
  - **Fully editable** in Step 3 if you want a different format
- **No Retail Price**: Le New Black only provides wholesale prices (`Net amount`), so retail prices are calculated automatically using a 2.5x markup
- **RRP Adjustment**: You can adjust the calculated retail prices in Step 3 before import
- **Product Names**: Include the color name at the end (e.g., "Bear fleece jacket cookie")
- **Size Formats**: Uses "Y" for years (3Y, 4Y, 6Y, 8Y) and "M" for months (6M, 12M, 18M)
- **European Price Format**: Uses comma as decimal separator (e.g., "65,00") which is automatically converted

