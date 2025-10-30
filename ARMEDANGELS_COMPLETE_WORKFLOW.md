# 🎯 Armed Angels Complete Workflow Guide

This guide covers the **complete end-to-end workflow** for importing Armed Angels products and images to Odoo, just like the PlayUp system.

## 📋 Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   ARMED ANGELS IMPORT FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. PDF Invoice → CSV (Auto)                                     │
│     /armedangels-pdf-converter                                   │
│     ✅ Output: armedangels-products-*.csv                        │
│                                                                   │
│  2. Analyze Images (Optional)                                    │
│     /armedangels-images-import                                   │
│     ✅ Output: armedangels-images-inventory.csv                  │
│     💾 Paste `ls` output from image folder                       │
│                                                                   │
│  3. Match Images to Products                                     │
│     /armedangels-image-matcher                                   │
│     📥 Inputs:                                                    │
│       • Product CSV (from step 1)                                │
│       • Image inventory CSV (from step 2)                        │
│       • Catalog CSV (with SKU/Template IDs)                      │
│     ✅ Outputs:                                                   │
│       • Matched products with Template IDs                       │
│       • Image list CSV                                           │
│       • Copy script (bash)                                       │
│                                                                   │
│  4. Copy Images to Local Folder                                  │
│     Run the download copy script                                 │
│     📁 Result: ~/Downloads/Armed_Angels_Images/ folder           │
│                                                                   │
│  5. Upload Products to Odoo                                      │
│     /product-import                                              │
│     Upload the product CSV → Creates products in Odoo            │
│                                                                   │
│  6. Upload Images to Odoo  🆕                                     │
│     /armedangels-images-upload                                   │
│     📁 Inputs:                                                    │
│       • Image folder path                                        │
│       • Catalog CSV (for Template IDs)                           │
│     ✅ Result: Images uploaded to product galleries              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Step-by-Step Instructions

### Step 1: Convert PDF to CSV

```
Page: /armedangels-pdf-converter
```

1. **Upload Invoice PDF**
   - Click "Upload PDF"
   - Select your Armed Angels invoice (e.g., `Customer invoice 200-08485663.pdf`)

2. **Extract Products**
   - System automatically parses the PDF
   - Shows product list with references, colors, sizes, quantities, and prices

3. **Download CSV**
   - Click "Download as CSV"
   - File: `armedangels-products-200-08485663.csv`
   - **Keep this file** - you'll need it for matching and importing

---

### Step 2: Analyze Image Filenames (Optional)

```
Page: /armedangels-images-import
```

**When to use:** If you have a large folder of Armed Angels images and want to inventory them before matching.

1. **Get Image List**
   ```bash
   ls /path/to/armed/angels/images > image-list.txt
   ```
   Or just:
   ```bash
   ls ~/Downloads/Armed_Angels_Raw/
   ```

2. **Paste Output**
   - Open the page
   - Paste the `ls` output into the text area
   - Click "Analyze Filenames"

3. **View Results**
   - See grouped images by reference-color combination
   - Download inventory: `armedangels-images-inventory.csv`

---

### Step 3: Match Images to Products

```
Page: /armedangels-image-matcher
```

**This is the KEY step** - matches your images to products and extracts Template IDs.

#### Inputs Required:

1. **Product CSV**
   - From Step 1: `armedangels-products-200-08485663.csv`
   - Contains: reference, color, size, price

2. **Image Inventory CSV**
   - From Step 2 (or created earlier): `armedangels-images-inventory.csv`
   - Contains: reference, color, image_count
   - Optional - if you skip this, no image matching happens

3. **Catalog CSV**
   - The master catalog with Template IDs
   - Format: `Item Number;Color Code;SKU Number` (semicolon-separated)
   - **Critical**: SKU Number is used as the Template ID
   - Example row: `30005160;3232;123456`
   - This maps products to their Odoo template IDs

#### How to Match:

1. **Upload Product CSV**
   - Click file input
   - Select `armedangels-products-200-08485663.csv`

2. **Upload Image Inventory CSV** (Optional)
   - Click file input
   - Select `armedangels-images-inventory.csv`
   - If skipped, you can still upload without image info

3. **Upload Catalog CSV**
   - Click file input
   - Select your catalog file
   - Should be raw Armed Angels format or processed format

4. **Click "Match Products"**
   - System matches products to:
     - Image inventory (if provided)
     - Catalog (for Template IDs)
   - Shows "With Images" and "Without Images" counts

#### Results:

- **Product Table** with columns:
  - Reference
  - Color
  - Product Name
  - Image Count
  - Template ID ← **This is what you need for uploads**

- **Download Options:**
  - 📄 **Image List CSV**: List of all matched images
  - 🚀 **Copy Script**: Bash script to copy images locally

---

### Step 4: Copy Images to Local Folder

```bash
# Download and run the copy script
chmod +x ~/Downloads/copy-matched-images.sh
~/Downloads/copy-matched-images.sh
```

**Result:**
```
📁 ~/Downloads/Armed_Angels_Matched_Images/
├─ 📁 30005160-3232/
│  ├─ image1.jpg
│  ├─ image2.jpg
│  └─ image3.jpg
├─ 📁 30005161-4545/
│  └─ image1.jpg
└─ ...
```

**Why?** Odoo image upload needs local filesystem access. This organizes images in the expected folder structure.

---

### Step 5: Upload Products to Odoo

```
Page: /product-import
```

1. **Select CSV File**
   - Upload: `armedangels-products-200-08485663.csv`

2. **Choose Import Type**
   - Select "Armed Angels (CSV)" from dropdown

3. **Click Import**
   - Creates products in Odoo
   - Shows progress and results
   - Products are now in Odoo system

---

### Step 6: Upload Images to Odoo 🆕

```
Page: /armedangels-images-upload
```

**This is the NEW step** - uploads images to the product galleries you just created.

#### Inputs Required:

1. **Catalog CSV**
   - Same file from Step 3
   - Needed to extract Template IDs
   - Upload via file input

2. **Image Folder Path**
   - Full path to your organized images folder
   - Example: `/Users/bajoris/Downloads/Armed_Angels_Matched_Images`
   - Or: `~/Downloads/Armed_Angels_Matched_Images`
   - Tilde (`~`) is expanded to home directory automatically

#### How to Upload:

1. **Upload Catalog CSV**
   - The system needs Template IDs to know which product to upload to
   - It parses the catalog to build a reference-color → Template ID map

2. **Enter Image Folder Path**
   - Paste the full path to your images folder
   - Expected structure: `folder/30005160-3232/` (reference-color folders)

3. **Click "Start Upload"**
   - System:
     - Lists all subfolders in your image folder
     - Matches each folder to a catalog entry
     - Uploads up to 5 images per product:
       - 1st image → Set as product main image
       - 2-5 images → Add to product media gallery

#### Results:

- **Success/Failure Stats:**
  - Total products processed
  - Successful uploads
  - Failed uploads
  - Total images uploaded

- **Detailed Results Table:**
  - Reference
  - Color
  - Template ID
  - Images uploaded
  - Status (✅ Success or ❌ Error)
  - Message

---

## 📊 Expected File Formats

### Product CSV (Step 1 Output)
```csv
Reference,Color,Size,Quantity,Price,Supplier Code,RRP
30005160,3232,S,2,50.00,AA-001,120.00
30005160,3232,M,1,50.00,AA-001,120.00
```

### Image Inventory CSV (Step 2 Output)
```csv
Reference,Color,Image Count
30005160,3232,3
30005161,4545,2
```

### Catalog CSV (Input for Steps 3 & 6)
```
Item Number;Color Code;SKU Number
30005160;3232;123456
30005161;4545;123457
```

---

## 🔧 Troubleshooting

### Images Not Found
- **Problem**: "With Images: 0" in matcher
- **Solution**: 
  - Check color codes match exactly
  - Image inventory should have same reference-color as products
  - Verify `ls` output was pasted correctly

### No Template IDs
- **Problem**: Template ID column is empty
- **Solution**:
  - Upload the correct catalog CSV
  - Ensure it has Item Number, Color Code, and SKU Number columns
  - File format should be semicolon-separated (raw Armed Angels format)

### Upload Says "Folder Not Found"
- **Problem**: Error when starting upload
- **Solution**:
  - Check folder path is correct and exists
  - Use absolute path: `/Users/username/path/to/folder`
  - Verify folder structure: `folder/30005160-3232/` with product subfolders

### Some Images Failed to Upload
- **Problem**: Upload completes but some products show error
- **Solution**:
  - Check product folder has correct naming: `reference-color`
  - Verify images are `.jpg`, `.jpeg`, or `.png`
  - Check Odoo product templates exist

---

## 📚 Related Workflows

### PlayUp Image Upload
Similar workflow exists for PlayUp at `/playup-image-matcher`

### Flöss Image Upload
Image upload for Flöss products via `/api/floss-upload-images`

### Other Brands
The system supports Le New Black, Flöss, Armed Angels, and PlayUp with similar workflows.

---

## ✨ Complete Workflow Example

```bash
# 1. Extract from PDF
# Via UI: /armedangels-pdf-converter
# Output: armedangels-products-200-08485663.csv

# 2. Get image list (optional)
ls ~/Downloads/Raw_Images > image-list.txt
# Via UI: /armedangels-images-import
# Output: armedangels-images-inventory.csv

# 3. Match images to products
# Via UI: /armedangels-image-matcher
# Inputs: Products CSV + Image Inventory CSV + Catalog CSV
# Output: Matched results + copy script

# 4. Copy images locally
chmod +x ~/Downloads/copy-matched-images.sh
~/Downloads/copy-matched-images.sh
# Result: ~/Downloads/Armed_Angels_Matched_Images/

# 5. Upload products
# Via UI: /product-import
# Input: armedangels-products-200-08485663.csv
# Result: Products in Odoo

# 6. Upload images
# Via UI: /armedangels-images-upload
# Inputs: Catalog CSV + Image folder path
# Result: Images in Odoo product galleries
```

---

## 🎯 Next Steps After Upload

1. **Verify in Odoo**
   - Check that products appear with images
   - Verify gallery has correct images

2. **Update Inventory**
   - If needed, sync quantities/prices

3. **Publish to eCommerce**
   - Once verified, publish products to storefront

---

**Last Updated:** 2025-10-30  
**Version:** 2.0 (Complete Workflow with Image Upload)


