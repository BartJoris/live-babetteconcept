# 🖼️ Play UP Image Import Procedure

Complete step-by-step guide to import Play UP products with matched images.

---

## 📋 Overview

This procedure allows you to:
1. Match CSV products with local image files
2. Export only the matched images
3. Copy matched images to a dedicated folder
4. Import products with images into Odoo

**Total Time:** ~10-15 minutes

---

## 🗂️ Prerequisites

- **CSV File:** `playup-products-CFTI22502214 (1).csv` (or similar)
- **Image Folder:** `~/Downloads/Play_Up_AW25_Images/` with 842 images
- **Image List:** `example-import/Playup/all-images.txt` (already created)

---

## 📝 Step-by-Step Procedure

### **Step 1: Match Images with CSV Products**

1. Navigate to **🖼️ Play UP Image Matcher** in the navigation menu
   - URL: `http://localhost:3001/playup-image-matcher`

2. **Upload CSV File:**
   - Click "Upload Product CSV"
   - Select: `playup-products-CFTI22502214 (1).csv`
   - ✅ You'll see: "140 product rows loaded, X unique products"

3. **Upload Image List:**
   - Click "Upload Image List (txt)"
   - Select: `example-import/Playup/all-images.txt`
   - ✅ You'll see: "842 images loaded"

4. **Match:**
   - Click **"🔍 Match Images with Products"**
   - Wait 1-2 seconds
   - ✅ Review the statistics showing matched/unmatched products

---

### **Step 2: Export Matched Images**

After matching, you'll see the **"📥 Export Matched Images"** section.

#### **Option A: Download Copy Script (Recommended)**

1. Click **"🚀 Download Copy Script"**
   - This downloads `copy-matched-images.sh`

2. **Run the script:**
   ```bash
   cd ~/Downloads
   chmod +x copy-matched-images.sh
   ./copy-matched-images.sh
   ```

3. ✅ **Result:** All matched images are now in:
   ```
   ~/Downloads/Play_Up_Matched_Images/
   ```

#### **Option B: Manual Copy with Image List**

1. Click **"📄 Download Image List"**
   - This downloads `matched-images.txt` with all matched image paths

2. **Manually copy images:**
   ```bash
   mkdir -p ~/Downloads/Play_Up_Matched_Images
   
   # Read each line and copy
   while read -r line; do
     cp "$line" ~/Downloads/Play_Up_Matched_Images/
   done < ~/Downloads/matched-images.txt
   ```

---

### **Step 3: Verify Matched Images**

```bash
# Count images in the matched folder
ls ~/Downloads/Play_Up_Matched_Images/ | wc -l

# Preview first few images
ls ~/Downloads/Play_Up_Matched_Images/ | head -10
```

**Expected Output:**
- Image files like: `1AR11002_P6179_1.jpg`, `1AR11002_P6179_2.jpg`, etc.
- Total: ~200-400 images (depending on CSV products)

---

### **Step 4: Update CSV with Image Paths (Optional)**

If you want to reference images in your CSV for import:

```bash
cd /Users/bajoris/git/pos-sessies/example-import/Playup

# Create CSV with image references
cat playup-products-CFTI22502214\ \(1\).csv | head -1 > playup-products-with-images.csv
tail -n +2 playup-products-CFTI22502214\ \(1\).csv | while IFS=',' read -r article color rest; do
  # Find matching images
  images=$(ls ~/Downloads/Play_Up_Matched_Images/${article}_${color}_*.jpg 2>/dev/null | tr '\n' '|' | sed 's/|$//')
  echo "${article},${color},${rest},${images}" >> playup-products-with-images.csv
done
```

---

### **Step 5: Import Products with Images**

#### **Method 1: Direct Import from Image Matcher (Recommended) ⭐**

1. After matching images in the Image Matcher, click **"➡️ Continue to Import"**
2. You'll be automatically redirected to the Product Import page with:
   - Play UP vendor pre-selected ✅
   - Products pre-loaded with matched image references ✅
   - Step 1.5 (Image Management) opened automatically ✅

3. **On Step 1.5:**
   - ✅ See statistics: X products with Y images
   - 📁 View matched image filenames for each product
   - 📁 **Upload images manually** using "📁 Upload Foto's" button
   - Images are pre-filtered - you know exactly which ones to upload!

4. **Upload images:**
   - Click "📁 Upload Foto's" for each product
   - Navigate to `~/Downloads/Play_Up_Matched_Images/`
   - Select the images matching that product's article + color
   - Example: For product `1AR11002` + color `P6179`, select `1AR11002_P6179_1.jpg`, `1AR11002_P6179_2.jpg`, etc.
   - Images will be converted to data URLs and embedded

5. **Continue Import:**
   - Click **"➡️ Ga Verder"** to proceed to brand/category mapping (Step 2)
   - Complete steps 2-6 as normal
   - Images will be uploaded to Odoo during final import (Step 7)

#### **Method 2: Manual CSV Upload (Alternative)**

1. Go to **📦 Import** page
2. Select **Play UP** as vendor
3. Upload your CSV manually
4. **Upload Images Manually:**
   - Use the image matcher results to know which images to upload
   - Upload from `~/Downloads/Play_Up_Matched_Images/`

---

## 🎯 Quick Reference

### File Locations

```
Input Files:
├── CSV: example-import/Playup/playup-products-CFTI22502214 (1).csv
├── Images: ~/Downloads/Play_Up_AW25_Images/ (842 files)
└── Image List: example-import/Playup/all-images.txt

Output Files:
├── Matched Images: ~/Downloads/Play_Up_Matched_Images/
├── Copy Script: ~/Downloads/copy-matched-images.sh
└── Image List: ~/Downloads/matched-images.txt
```

### Matching Pattern

```
CSV Product: Article=1AR11002, Color=P6179
     ↓
Matches Images: 1AR11002_P6179_1.jpg
                1AR11002_P6179_2.jpg
                etc.
```

---

## 🔍 Troubleshooting

### Issue: "No images matched"
- **Check:** Image filenames follow pattern `{Article}_{Color}_{Number}.jpg`
- **Check:** Article codes in CSV match image filenames exactly
- **Example:** CSV article `1AR11002` should match files starting with `1AR11002_`

### Issue: "Script not executable"
```bash
chmod +x ~/Downloads/copy-matched-images.sh
```

### Issue: "Too many images copied"
- This is normal! Some products have multiple colors/variants
- Each variant gets its own set of images

---

## 📊 Expected Results

For a CSV with **140 product rows** (covering ~30-40 unique products):

- **Products with Images:** 30-35
- **Products without Images:** 5-10
- **Total Images Matched:** 150-300
- **Images Copied:** Same as matched

---

## ✅ Success Checklist

- [ ] CSV uploaded and parsed successfully
- [ ] Image list uploaded (842 images)
- [ ] Matching completed with statistics shown
- [ ] Copy script downloaded and executed
- [ ] Matched images folder created with correct images
- [ ] Image count verified
- [ ] Ready for product import

---

## 🚀 Next Steps

After completing this procedure:

1. **Review matched products** in the Image Matcher
2. **Verify image quality** in the matched folder
3. **Proceed to Product Import** with the matched images
4. **Upload images** during import (manual or batch)

---

**Questions?** Check the Image Matcher UI for real-time statistics and filtering options!

