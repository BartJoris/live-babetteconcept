# Product Import System - Complete Guide

## 🎉 What's Been Recreated

I've successfully recreated your complete Product Import Wizard system based on your chat history and screenshots. Here's everything that's been built:

### ✅ Pages Created

1. **`/product-import`** - Main import wizard (7 steps)
2. **`/categories-explorer`** - Debug categories and tags
3. **`/product-debug`** - Inspect product structure

### ✅ API Endpoints Created

1. **`/api/import-products`** - Handles product creation in Odoo
2. **`/api/debug-categories`** - Fetches all category types
3. **`/api/product-debug`** - Fetches complete product data

### ✅ Navigation Updated

Added "📦 Import" link to both desktop and mobile navigation menus.

---

## 🚀 How to Use the Product Import Wizard

### Step-by-Step Workflow

#### **Step 1: Upload** 📤
- Upload your vendor CSV file (semicolon-separated)
- Supports European decimal format (comma decimals: `21,6`)
- Expected format:
  ```csv
  EAN barcode;Reference;Description;Quality;Colour;Size;Quantity;Price;RRP;HS code
  5400562408965;225-2003-103;silas t-shirt takeaway;50% recycled cotton;natural;04;1;21,6;54;6109100010
  ```

#### **Step 2: Mapping** 🗺️
- Auto-groups products by Reference (e.g., `225-2003-103`)
- Shows statistics: Total rows, Unique products, Total variants
- Preview table with first 10 products

#### **Step 3: Selection** ☑️
- Checkboxes to select which products to import
- "Select All" / "Deselect All" buttons
- Real-time counter showing selected products and variants

#### **Step 4: Categories** 📁

**Batch Assignment:**
- **Merk (Brand)** - Select from MERK attribute values
- **Interne Categorie** - Required internal category

**Per Product:**
- Brand dropdown (with auto-detection suggestions)
- Internal category dropdown
- **eCommerce Categories** - Multi-select with removable tags
- **Productsjabloonlabels** - Product tags (e.g., "Winter 25-26")

**Refresh Data Button:**
- Click `🔄 Vernieuw Data` to reload categories if needed

#### **Step 5: Preview** 👁️
- Summary cards: Templates, Variants, Stock, Ready count
- Validation warnings for incomplete products
- Status per product (✓ Ready / ✗ Incomplete)
- Two options:
  - **🧪 Test Mode** - Test with 1 product first
  - **🚀 Direct Import** - Bulk import all

#### **Step 6: Test Mode** 🧪
- Select any product to test first
- Click **🧪 Test Dit Product**
- **API Preview Modal** shows exact JSON that will be sent
- Review all fields before confirming
- **Production Safety Check** - See exactly what will be created
- Click **✅ Bevestigen & Uitvoeren** to proceed

#### **Step 7: Results** 🎉
- Success/Error counts
- Detailed results table with:
  - Template IDs (clickable links to debug)
  - Variant counts
  - Error messages if any
- **🔄 Nieuwe Import** button to start over

---

## 🔍 Debug Tools

### Categories Explorer (`/categories-explorer`)

View all available categories in your Odoo system:
- **Internal Categories** (product.category) - ~227 categories
- **Public/eCommerce Categories** (product.public.category) - For website
- **Product Tags** (Productsjabloonlabels)
- **POS Categories** (pos.category)

**Features:**
- Download JSON for each type
- Search/filter in tables
- Diagnostic information if categories return 0

### Product Debug (`/product-debug`)

Inspect any product by Template ID:
- Enter Product ID (e.g., `7794`)
- Click **🔍 Fetch Product**
- View complete structure:
  - Template info
  - All variants with barcodes & prices
  - Attributes
  - Public categories
  - Raw JSON data

**Quick Check:**
- ✅ Green = Barcode/Price set correctly
- ❌ Red = Missing barcode or €0 cost price

**Actions:**
- **📥 Download JSON** - Save complete data
- **📋 Copy to Clipboard** - Quick copy

---

## ⚙️ What Gets Created in Odoo

When you import a product, the system creates:

### 1. Product Template
```javascript
{
  name: "silas t-shirt takeaway",
  categ_id: 210, // Internal category
  list_price: 54.00, // RRP from CSV
  standard_price: 21.60, // Cost price from CSV
  type: "consu", // Verbruiksartikel
  default_code: "225-2003-103", // Reference
  weight: 0.2, // Default 0.2kg
  available_in_pos: true, // ✓ Kassa enabled
  website_id: 1, // Website: Babette.
  website_published: true, // ✓ Kan gekocht worden
  public_categ_ids: [[6, 0, [336, 447]]], // eCommerce categories
  product_tag_ids: [[6, 0, [7]]], // Product labels
}
```

### ✨ Automatic Defaults Applied:
All imported products automatically get:
- ✅ **Productsoort**: Verbruiksartikel (consumable)
- ✅ **Gewicht**: 0,20 kg (per variant)
- ✅ **Kassa**: ✓ Kan verkocht worden
- ✅ **Website**: Babette. (gepubliceerd)
- ✅ **Facturatiebeleid**: Geleverde hoeveelheden
- ✅ **Voorraad bijhouden**: Via categorie-instellingen

### 2. Brand Attribute (MERK)
- Creates attribute line with selected brand
- Brand value linked to product

### 3. Size Attribute (MAAT Kinderen)
- Creates or finds size attribute
- Creates size values (04, 06, 08, 10, 12)
- Creates attribute line with all sizes

### 4. Product Variants (Auto-generated by Odoo)
- Odoo automatically generates variants based on attributes
- System then updates each variant with:
  - **Barcode** (EAN from CSV)
  - **Cost Price** (standard_price from CSV)
  - **Stock Quantity** (if > 0)

---

## 🐛 Troubleshooting

### Issue: Barcodes not assigned
**Fixed!** The system now:
1. Waits 1 second after variant creation
2. Fetches generated variants
3. Matches by size name
4. Updates each variant individually
5. Skips if barcode already exists elsewhere

### Issue: Cost prices = 0
**Fixed!** System now:
- Parses comma decimals (`21,6` → `21.6`)
- Sets `standard_price` on each variant
- Verifies in Step 7 results

### Issue: Categories show 0
**Solution:**
1. Visit `/categories-explorer`
2. Check if categories exist
3. Click **🔄 Vernieuw Data** in import wizard
4. System uses smart fetching via sample products

### Issue: Can't see public categories
**Solution:**
- Public categories are fetched from existing products (6758, 7004)
- System discovers category IDs, then fetches those specific records
- Works around Odoo 18 access restrictions

---

## 📊 CSV Format Requirements

Your CSV **must** have these columns (semicolon-separated):
- `EAN barcode` - Unique barcode per variant
- `Reference` - Groups variants into products
- `Description` - Product name
- `Quality` - Material/composition
- `Colour` - Color code and name
- `Size` - Size value (04, 06, 08, etc.)
- `Quantity` - Stock quantity
- `Price` - Cost price (comma decimal: `21,6`)
- `RRP` - Recommended Retail Price (comma decimal: `54,0`)
- `HS code` - (optional)

**Important:**
- Decimals use **commas** not dots (`21,6` not `21.6`)
- Multiple rows with same Reference = 1 product with multiple variants
- Sizes are text (can be `04`, `UNIT`, etc.)

---

## 🔐 Production Safety Features

### API Preview Modal
Before ANY import, you see:
- Complete product summary
- 4 expandable API call steps:
  1. Create Product Template
  2. Add Brand Attribute
  3. Add Size Attribute
  4. Update Variants (with all barcodes & prices)
- Full JSON payloads
- **Must confirm** before execution

### Test Mode
- Test with 1 product first
- Verify in Odoo before bulk import
- Use `/product-debug` to inspect result
- Switch to production DB only after testing

---

## 🎯 Quick Start

1. **Prepare CSV** - Use your `leverancier.csv` format
2. **Go to** `/product-import`
3. **Upload CSV** - Drag & drop or click
4. **Map & Select** - Review and select products
5. **Assign Categories**:
   - Select brand (or use auto-detected)
   - Pick internal category (required)
   - Add eCommerce categories (optional, multiple)
   - Add product labels (optional)
6. **Preview** - Check summary
7. **Test** - Import 1 product first
8. **Debug** - Visit `/product-debug?id=TEMPLATE_ID`
9. **Verify** - Check barcodes and prices
10. **Bulk Import** - Import remaining products

---

## 📝 Important Notes

### From Your Test Database
Looking at `product-7794-debug.json`, I noticed:
- ✅ Template created correctly
- ✅ Public categories assigned: [336, 447]
- ✅ Product tag assigned: [7]
- ✅ Attributes created: MERK + MAAT Kinderen
- ❌ **Barcodes were `false`** (THIS IS NOW FIXED)
- ❌ **Standard_price was `0`** (THIS IS NOW FIXED)

### The Fix
The updated import system now:
1. Parses comma decimals properly
2. Waits for Odoo to generate variants
3. Fetches variants with proper attribute matching
4. Updates each variant with correct barcode & cost price
5. Handles duplicate barcode errors gracefully

---

## 🚦 Environment Switching

To test on your test database before production:

1. Edit `.env.local`:
```bash
ODOO_URL=https://YOUR-TEST-DB.odoo.com/jsonrpc
ODOO_DATABASE=your-test-db-name
```

2. Restart dev server:
```bash
npm run dev
```

3. Test the import

4. Switch back to production when ready

---

## ✨ Features Included

- ✅ CSV upload with European decimal format
- ✅ Auto-brand detection
- ✅ Multi-select eCommerce categories
- ✅ Product tags (Productsjabloonlabels)
- ✅ Batch assignments (brand, category)
- ✅ Per-product customization
- ✅ Test mode (1 product)
- ✅ API preview modal (production safety)
- ✅ Progress tracking
- ✅ Error handling
- ✅ Results with links
- ✅ Debug tools
- ✅ Categories explorer

---

## 📞 Support

If you encounter issues:
1. Check `/categories-explorer` - Are categories loading?
2. Use `/product-debug` - Inspect created products
3. Check browser console - See API logs
4. Review Step 7 results - Detailed error messages

---

## 🎊 Ready to Go!

Your Product Import Wizard is fully recreated and ready to use!

Start at: **`/product-import`**

Happy importing! 📦✨

