# 🌸 Flöss Vendor - Quick Start Guide

## What's New? 🎉

Your Product Import Wizard now supports **Flöss** vendor with full image upload capability!

### New Features:
- ✅ Flöss CSV parsing (Style Details format)
- ✅ Auto-detection of Flöss brand
- ✅ Barcode auto-assignment
- ✅ Image upload from Flöss order folder
- ✅ Automatic Style No matching
- ✅ Color metadata extraction
- ✅ Sequence assignment (Main → 1, Extra → 2-5)

---

## 🚀 Quick Start (5 Steps)

### Step 1: Prepare Your Files
Get these files ready:
- 📄 `Style Details.csv` from Flöss
- 📁 Folder with product images (e.g., `Order-6109-Images`)

**Image file names must follow this format:**
```
F10625 - Apple Knit Cardigan - Red Apple - Main.jpg
F10625 - Apple Knit Cardigan - Red Apple - Extra 0.jpg
F10637 - Heart Cardigan - Poppy Red-Soft White - Main.jpg
```

### Step 2: Go to Import Page
Open: http://localhost:3000/product-import

### Step 3: Select Flöss Vendor
Click the 🌸 **Flöss** button in Step 1

### Step 4: Upload & Configure
1. Upload your `Style Details.csv`
2. Review products in Step 2 (Mapping)
3. Select products in Step 3
4. Assign categories in Step 4
5. Preview in Step 5
6. Test 1 product in Step 6
7. Import all in Step 7

### Step 5: Upload Images
After import completes:
1. Click **📁 Selecteer Afbeeldingen**
2. Select all images from your folder
3. System matches and uploads automatically
4. See results with success count

---

## 📊 CSV Format (What You Need)

Your `Style Details.csv` must have:

| Column | Example | Required |
|--------|---------|----------|
| Style No | F10625 | ✅ YES |
| Style Name | Apple Knit Cardigan | ✅ YES |
| Quality | 100% Cotton | ✅ YES |
| Color | Red Apple | ✅ YES |
| Size | 68/6M | ✅ YES |
| Barcode | 5715777018640 | ✅ YES |
| Wholesale Price EUR | 22,00 | ✅ YES |
| Recommended Retail Price EUR | 55,00 | ✅ YES |
| Qty | 1 | Optional |
| Brand | Flöss Aps | Auto-detected |

**Important Format Notes:**
- First line: `Table 1`
- Second line: Headers (semicolon-separated)
- Data starts from line 3
- **Decimal separator is comma (,) not dot (.)**
  - ✅ Correct: `22,00`
  - ❌ Wrong: `22.00`

---

## 🖼️ Image File Naming (Critical!)

**Format:** `StyleNo - ProductName - Color - ImageType.jpg`

**Examples:**
```
F10625 - Apple Knit Cardigan - Red Apple - Main.jpg
F10625 - Apple Knit Cardigan - Red Apple - Extra 0.jpg
F10637 - Heart Cardigan - Poppy Red-Soft White - Main.jpg
F10693 - Caila Raincoat - Berry Gingham - Extra 1.jpg
```

**Rules:**
- ✅ Style No MUST be at the beginning (F10625, F10637, etc.)
- ✅ "Main" image = Display image #1
- ✅ "Extra 0" = Additional image #2
- ✅ "Extra 1" = Additional image #3
- ✅ Supported formats: JPG, JPEG, PNG
- ❌ Don't rename files - keep original names!

---

## 🎯 Workflow Overview

```
1. Select 🌸 Flöss vendor
   ↓
2. Upload Style Details.csv
   ↓
3. Review products (mapping)
   ↓
4. Select products to import
   ↓
5. Assign categories
   ↓
6. Preview & test
   ↓
7. Import products
   ↓
8. Upload images (NEW!)
   ↓
✅ Done! Products in Odoo with images
```

---

## ✨ What Gets Created in Odoo

For each Flöss product, the system creates:

### Product Template
- Name: "Style Name - Color" (e.g., "Apple Knit Cardigan - Red Apple")
- Reference: Style No (e.g., F10625)
- Cost Price: Wholesale Price EUR (€22.00)
- Retail Price: Recommended Retail Price EUR (€55.00)
- Brand: Flöss Aps (auto-assigned)
- Internal Category: Your selection
- Status: Published, Available for POS & Website

### Product Variant
- Size: From CSV (e.g., 68/6M)
- Barcode: From CSV (e.g., 5715777018640)
- Cost: Wholesale price
- Stock: 0 (editable)

### Product Images (After Step 8)
- Main image (sequence 1)
- Extra images (sequence 2-5)
- Color name detected from filename
- Properly sequenced

---

## ⚠️ Important Notes

### Before Import
- ✅ Backup your CSV file
- ✅ Verify all barcodes are correct
- ✅ Check image filenames match Style Nos
- ✅ Test with 1-2 products first

### File Names Matter!
- Your images MUST start with Style No
- Example: `F10625 - ...`
- The system extracts "F10625" from this
- If you rename files, images won't match!

### Prices Format
- Use **commas** for decimals: `22,00` not `22.00`
- European format is expected
- Currency is EUR

### Odoo Setup
- Brand "Flöss Aps" must exist in Odoo
- Internal category must be selected
- Warehouse location auto-configured

---

## 🐛 Troubleshooting

### "CSV parsing failed"
→ Check first line is "Table 1"
→ Check headers on line 2
→ Data should start from line 3
→ Ensure semicolon separation

### "No valid images found"
→ Filenames MUST start with Style No (F10625 - ...)
→ Check file extensions (.jpg, .jpeg, .png)
→ Select files that match imported Style Nos

### "No template ID found for style"
→ Product wasn't imported successfully
→ Import it first in Step 7
→ Then upload images

### Image upload hangs
→ Check your Odoo connection
→ Verify credentials in browser
→ Try with fewer images first
→ Check image file sizes

---

## 📞 Support

**Questions?**
1. Check `/product-debug` to inspect created products
2. See browser console (F12) for detailed errors
3. Review Step 7 results for error messages
4. Verify CSV format matches example

---

## 🎊 You're Ready!

Your system is now set up for Flöss imports with images! 

**Next Steps:**
1. ✅ Gather Style Details.csv
2. ✅ Collect product images
3. ✅ Visit http://localhost:3000/product-import
4. ✅ Select 🌸 Flöss
5. ✅ Follow the 7-step wizard
6. ✅ Upload images after import

Happy importing! 🚀🌸
