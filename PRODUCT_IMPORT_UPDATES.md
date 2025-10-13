# Product Import Updates

## Changes Summary

### 1. **Fully Editable Product & Variant Fields**
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

### 2. **Multi-Vendor Support**
- **Vendor Selection**: Step 1 now requires selecting a vendor before file upload
- **Supported Vendors**:
  - **Ao76**: Original format (EAN barcode, Reference, Description, Quality, Colour, Size, Quantity, Price, RRP)
  - **Le New Black**: Order export format (Brand name, Product reference, Product name, Color name, Description, Size name, EAN13, Net amount)
    - **Special handling**: First line is order reference (skipped)
    - **RRP Calculation**: Automatically calculates retail price as 2.5x wholesale price (editable)

### 3. **Vendor-Specific Parsers**
- `parseAo76CSV()`: Handles Ao76 CSV format with semicolon separators
- `parseLeNewBlackCSV()`: Handles Le New Black CSV format (adjustable based on actual format)
- Easy to extend: Add new parsers by creating new functions and adding vendor types

## How to Use

### Step-by-Step Process:

1. **Step 1: Upload**
   - Select your vendor (Ao76 or Le New Black)
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
interface ProductVariant {
  size: string;
  quantity: number; // Now editable, defaults to 0
  ean: string;
  price: number;
  rrp: number;
}
```

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

