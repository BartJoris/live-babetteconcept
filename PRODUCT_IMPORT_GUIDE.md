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
4. **`/api/floss-upload-images`** - Handles Flöss image uploads (NEW!)

### ✅ Navigation Updated

Added "📦 Import" link to both desktop and mobile navigation menus.

---

## 🚀 How to Use the Product Import Wizard

### Step-by-Step Workflow

#### **Step 1: Upload** 📤

First, select your vendor. We now support:
- **🏷️ Ao76** - Standard format with EAN, Reference, Description, Size
- **🎨 Le New Black** - Order export with Brand name, Product reference, EAN13, Net amount
- **🎮 Play UP** - PDF invoice + website prices with authentication
- **🌸 Flöss** - Style Details with Style No, Quality, Barcode, Prices

- Upload your vendor CSV file (semicolon-separated)
- Supports European decimal format (comma decimals: `21,6`)

#### **Flöss Format** 🌸

Expected CSV format:
```csv
Table 1
Style No;Style Name;Brand;Type;Category;Quality;Color;Size;Qty;Barcode;Weight;Country;Customs Tariff No;Wholesale Price EUR;Recommended Retail Price EUR;...
F10625;Apple Knit Cardigan;Flöss Aps;Cardigan;;100% Cotton;Red Apple;68/6M;1;5715777018640;120;Bangladesh;6110201000;22,00;55,00;...
F10637;Heart Cardigan;Flöss Aps;Cardigan;;100% Cotton;Poppy Red/Soft White;68/6M;1;5715777019197;120;Bangladesh;6110201000;22,00;55,00;...
```

**Key Details:**
- First line: Table header (Table 1)
- Second line: Column headers
- Data starts from line 3
- Style No is used as product reference (e.g., F10625)
- Prices use European format (commas as decimal separator)
- Barcode is automatically linked as EAN to variants
- Brand "Flöss Aps" is auto-detected

#### **Step 2: Mapping** 🗺️
- Auto-groups products by Style No (e.g., `F10625`)
- Shows statistics: Total rows, Unique products, Total variants
- Preview table with first 10 products

#### **Step 3: Selection** ☑️
- Checkboxes to select which products to import
- "Select All" / "Deselect All" buttons
- Real-time counter showing selected products and variants

#### **Step 4: Categories** 📁

**Batch Assignment:**
- **Merk (Brand)** - Flöss brand is auto-detected
- **Interne Categorie** - Required internal category

**Per Product:**
- Brand dropdown (with auto-detection)
- Internal category dropdown
- **eCommerce Categories** - Multi-select with removable tags
- **Productsjabloonlabels** - Product tags

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

#### **Step 7: Results & Image Upload** 🎉

After successful import, you can optionally upload images:

**For Flöss:** 🌸
1. Click **📁 Selecteer Afbeeldingen**
2. Select images from your Flöss order folder
3. System automatically matches images by Style No
4. Images are organized by sequence:
   - **Main** images get sequence 1
   - **Extra 0** gets sequence 2
   - **Extra 1** gets sequence 3, etc.

**Image File Naming:** 
Must follow this format: `F10625 - Apple Knit Cardigan - Red Apple - Main.jpg`
- Style No must be at the beginning (e.g., F10625)
- Can include product name, color, and image type
- Supported formats: JPG, JPEG, PNG

**Automatic Features:**
- ✅ Style No extraction from filename
- ✅ Color detection from filename  
- ✅ Sequence assignment (Main → 1, Extra → 2+)
- ✅ Template ID matching
- ✅ Base64 encoding and upload
- ✅ Error handling with detailed feedback

---

## 🌸 Flöss Vendor - Complete Guide

### What Gets Created in Odoo

When you import a Flöss product, the system creates:

### 1. Product Template
```javascript
{
  name: "Apple Knit Cardigan - Red Apple",  // Style Name - Color
  categ_id: 210,  // Internal category (user selected)
  list_price: 55.00,  // RRP from CSV
  standard_price: 22.00,  // Wholesale Price EUR
  type: "consu",  // Consumable
  default_code: "F10625",  // Style No
  available_in_pos: true,  // ✓ POS enabled
  website_id: 1,  // Website: Babette.
  website_published: true,  // ✓ Can be purchased
  public_categ_ids: [[6, 0, [336, 447]]],  // eCommerce categories
  product_tag_ids: [[6, 0, [7]]],  // Product labels
}
```

### 2. Brand Attribute (MERK)
- Auto-assigned: Flöss Aps
- Links to brand attribute line

### 3. Size Attribute (MAAT Kinderen)
- Creates or finds size attribute
- Creates size value (e.g., "68/6M")
- Creates attribute line with size

### 4. Product Variants (Auto-generated by Odoo)
- Odoo automatically generates 1 variant per row
- System updates each variant with:
  - **Barcode** (from Barcode column)
  - **Cost Price** (standard_price from Wholesale Price EUR)
  - **Stock Quantity** (editable, default 0)

### 5. Product Images (Optional)
- Upload images from Flöss order folder
- Auto-matched by Style No
- Organized by sequence (Main = 1, Extra = 2+)
- Color metadata extracted from filename

---

## ✨ Automatic Defaults Applied (All Vendors):
All imported products automatically get:
- ✅ **Productsoort**: Verbruiksartikel (consumable)
- ✅ **Gewicht**: 0,20 kg (per variant)
- ✅ **Kassa**: ✓ Can be sold
- ✅ **Website**: Babette. (published)
- ✅ **Facturatiebeleid**: Delivered quantities
- ✅ **Voorraad bijhouden**: Via category settings

---

## 📊 CSV Format Requirements for Each Vendor

### Flöss Format 🌸

Your CSV **must** have these columns (semicolon-separated):

**Required:**
- `Style No` - Unique product identifier (e.g., F10625)
- `Style Name` - Product name
- `Barcode` - EAN/UPC code
- `Wholesale Price EUR` - Cost price (comma decimal: `22,00`)
- `Recommended Retail Price EUR` - RRP (comma decimal: `55,00`)

**Optional but useful:**
- `Quality` - Material composition (e.g., "100% Cotton")
- `Color` - Color name
- `Size` - Size value (e.g., "68/6M")
- `Qty` - Stock quantity
- `Brand` - Brand name (Flöss Aps)
- `Gender` - Target gender (Girl, Boy, Unisex)

**Important:**
- Decimals use **commas** not dots (`22,00` not `22.00`)
- First line: "Table 1" (table header)
- Second line: Column headers
- Data starts from line 3
- One row = one variant

### Example:
```csv
Table 1
Style No;Style Name;Brand;Type;Category;Quality;Color;Size;Qty;Barcode;...;Wholesale Price EUR;Recommended Retail Price EUR
F10625;Apple Knit Cardigan;Flöss Aps;Cardigan;;100% Cotton;Red Apple;68/6M;1;5715777018640;...;22,00;55,00
F10637;Heart Cardigan;Flöss Aps;Cardigan;;100% Cotton;Poppy Red/Soft White;68/6M;1;5715777019197;...;22,00;55,00
```

---

## 🖼️ Flöss Image Upload

After importing products, you can upload product images from your Flöss order folder.

### Image File Requirements:
- **Naming Format:** `F10625 - Apple Knit Cardigan - Red Apple - Main.jpg`
- **Style No:** Must be at the beginning of filename
- **Formats:** JPG, JPEG, PNG
- **Sequence:**
  - "Main" → Image 1
  - "Extra 0" → Image 2
  - "Extra 1" → Image 3
  - "Extra 2" → Image 4
  - "Extra 3" → Image 5

### Upload Process:
1. After import completes (Step 7)
2. Section **"🌸 Afbeeldingen Importeren"** appears
3. Click **"📁 Selecteer Afbeeldingen"**
4. Select all images from your Flöss order folder
5. System automatically:
   - Extracts Style No from each filename
   - Matches to imported products
   - Determines sequence (Main vs Extra)
   - Extracts color from filename
6. Uploads to Odoo as product images

### Features:
- ✅ Batch upload (select all images at once)
- ✅ Automatic Style No extraction
- ✅ Color metadata detection
- ✅ Sequence assignment
- ✅ Error handling for unmatched images
- ✅ Progress tracking

---

## 🐛 Troubleshooting

### Issue: "No valid images found"
**Solution:** 
- Ensure filenames start with Style No (e.g., F10625 - ...)
- Check filename format: `F10625 - Product Name - Color - Main.jpg`
- Verify file extensions are .jpg or .png (case-insensitive)

### Issue: Barcodes not assigned
**Solution:**
- Verify "Barcode" column exists in CSV
- Ensure barcode values are not empty
- Check that Style No matches between CSV and images

### Issue: Categories show 0
**Solution:**
1. Visit `/categories-explorer`
2. Check if categories exist
3. Click **🔄 Vernieuw Data** in import wizard
4. System uses smart fetching via sample products

### Issue: Image import fails
**Solution:**
- Check Odoo credentials are set
- Verify images are valid JPG/PNG files
- Ensure file names start with Style No
- Check browser console for detailed error messages

---

## 🎯 Quick Start (Flöss)

1. **Prepare CSV** - Export "Style Details.csv" from Flöss
2. **Go to** `/product-import`
3. **Select vendor** - Choose 🌸 Flöss
4. **Upload CSV** - Drag & drop or click
5. **Map & Select** - Review and select products
6. **Assign Categories**:
   - Select brand (Flöss auto-detected)
   - Pick internal category (required)
   - Add eCommerce categories (optional)
   - Add product labels (optional)
7. **Preview** - Check summary
8. **Test** - Import 1 product first
9. **Debug** - Visit `/product-debug?id=TEMPLATE_ID`
10. **Verify** - Check barcodes and prices
11. **Bulk Import** - Import remaining products
12. **Upload Images** - Select images from Flöss order folder
13. **Verify Results** - Check image counts and success status

---

## 📝 Important Notes

### From Your Flöss Data
- ✅ Style No used as product reference
- ✅ Barcode directly linked as EAN
- ✅ Prices parsed with European decimals
- ✅ Brand auto-detected as Flöss Aps
- ✅ Colors properly extracted
- ✅ Sizes correctly mapped

### Image Matching
- Style No extraction works with patterns like: `F10625`, `F10627`, etc.
- Color names extracted from filename (middle part before Main/Extra)
- Sequence assigned automatically (Main=1, Extra=2-5)

---

## 🔐 Production Safety Features

### API Preview Modal
Before ANY import, you see:
- Complete product summary
- 4 expandable API call steps
- Full JSON payloads
- **Must confirm** before execution

### Test Mode
- Test with 1 product first
- Verify in Odoo before bulk import
- Use `/product-debug` to inspect result
- Switch to production DB only after testing

### Image Upload Safety
- Preview number of images to upload
- See Style No matches before uploading
- Detailed error reporting per image
- Can retry failed uploads

---

## ✨ Features Included

- ✅ Flöss CSV import with proper parsing
- ✅ European decimal format support
- ✅ Barcode auto-assignment
- ✅ Image upload from local folder
- ✅ Automatic Style No matching
- ✅ Color metadata extraction
- ✅ Sequence assignment (Main, Extra)
- ✅ Batch image processing
- ✅ Error handling & detailed feedback
- ✅ Progress tracking
- ✅ Results with counts and details
- ✅ Debug tools (`/product-debug`)
- ✅ Categories explorer

---

## 📞 Support

If you encounter issues:
1. Check `/categories-explorer` - Are categories loading?
2. Use `/product-debug` - Inspect created products
3. Check browser console - See API logs
4. Review Step 7 results - Detailed error messages
5. Verify CSV format matches example

---

## 🎊 Ready to Go!

Your Product Import Wizard with **Flöss vendor support** is fully implemented and ready to use!

Start at: **`/product-import`**

**New features:**
- 🌸 Flöss vendor support
- 🖼️ Local image folder upload
- 🎯 Automatic Style No matching
- 🎨 Color metadata extraction

Happy importing! 📦✨

