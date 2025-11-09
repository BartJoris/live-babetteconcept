# 🎯 Armed Angels Image Upload - Quick Start

## The Final Step ✨

You've matched images to products and copied them locally. Now it's time to **upload them to Odoo product galleries** - just like PlayUp!

---

## 3-Minute Quick Start

### Go to Page
```
Navigate to: /armedangels-images-upload
```

### What You Need
```
1️⃣  Catalog CSV (from image matcher)
    File: bSQUBgZvGNH7uBPJ.csv or similar
    Contains: Item Number, Color Code, SKU Number
    
2️⃣  Image Folder Path
    Where your matched images are organized
    Example: ~/Downloads/Armed_Angels_Matched_Images
    Structure:
      📁 Folder/
      ├─ 📁 30005160-3232/  (reference-color)
      │  ├─ image1.jpg
      │  ├─ image2.jpg
      │  └─ image3.jpg
      └─ 📁 30005161-4545/
```

### Steps
```
1. Upload Catalog CSV
   Click file input → Select your catalog file
   ✅ You'll see "Catalog CSV loaded"

2. Enter Folder Path
   Paste: /Users/username/Downloads/Armed_Angels_Matched_Images
   Or: ~/Downloads/Armed_Angels_Matched_Images

3. Click "Start Upload"
   System will:
   • List all product folders (reference-color)
   • Extract Template IDs from catalog
   • Upload images to Odoo products
   • Show results when done

4. Review Results
   See which products succeeded/failed
   Total images uploaded displayed
```

---

## What Happens Under the Hood

```
Input Catalog:
  30005160;3232;123456  ← SKU 123456 = Template ID

Input Folder:
  📁 30005160-3232/
     📸 image1.jpg
     📸 image2.jpg

Process:
  1. Find folder "30005160-3232"
  2. Look up Template ID (123456) in catalog
  3. Read all images from folder
  4. First image → Set as main product image
  5. Rest → Add to product media gallery
  6. Result: Odoo product has gallery with all images ✅
```

---

## Expected Results

### After Upload

**In Odoo:**
```
Product: Armed Angels Item 30005160 (Color 3232)
├─ Main Image: image1.jpg (featured)
├─ Gallery:
│  ├─ Image 2: image2.jpg
│  ├─ Image 3: image3.jpg
│  └─ Image 4: image4.jpg
└─ eCommerce storefront shows all images
```

**Success Page Shows:**
```
✅ Success: N products
❌ Failed: 0 products
📸 Total Images: 456
```

---

## Common Issues & Fixes

### "Folder not found"
```
❌ Error: Directory not found: /Users/bajoris/path/to/folder

Fix:
- Copy the FULL path: /Users/username/folder/name
- Not just: folder/name
- Use ~ for home directory: ~/Downloads/folder
```

### "No images found in folder"
```
❌ Error: No images found in folder: 30005160-3232

Causes:
- Images have wrong extension (.PNG instead of .jpg)
- Folder is empty
- Folder named incorrectly (should be reference-color)

Fix:
- Verify images are .jpg, .jpeg, or .png
- Check folder structure: ~/folder/30005160-3232/image.jpg
- Run the copy script again to organize images
```

### Template ID is 0 (not found)
```
❌ Template ID: 0 (means not in catalog)

Causes:
- Reference-color not in catalog CSV
- Color code doesn't match (e.g., "3232" vs "03232")
- Catalog file was wrong

Fix:
- Check catalog has row: 30005160;3232;123456
- Verify color codes match exactly
- Upload correct catalog file
```

---

## Step-by-Step Example

### Scenario
You have 3 product folders with images:
```
📁 ~/Downloads/AA_Images/
├─ 📁 30005160-3232/ (5 images)
├─ 📁 30005161-4545/ (3 images)
└─ 📁 30005162-6767/ (4 images)
```

And catalog:
```
Item Number;Color Code;SKU Number
30005160;3232;123456
30005161;4545;123457
30005162;6767;123458
```

### Process
```
1. Upload Catalog CSV
   ✅ Catalog loaded

2. Enter Path
   ~/Downloads/AA_Images

3. Click Upload
   Processing:
   • Found 3 folders
   • 30005160-3232 → Template ID 123456 ✅
   • 30005161-4545 → Template ID 123457 ✅
   • 30005162-6767 → Template ID 123458 ✅
   
   Uploading:
   • 30005160-3232: 5 images (1 main + 4 gallery) ✅
   • 30005161-4545: 3 images (1 main + 2 gallery) ✅
   • 30005162-6767: 4 images (1 main + 3 gallery) ✅

4. Results
   ✅ Success: 3 products
   ❌ Failed: 0 products
   📸 Total Images: 12
```

---

## Safety & Limits

```
⚙️  Upload Limits:
   • Max 5 images per product (1st is main, 4 in gallery)
   • File formats: .jpg, .jpeg, .png
   • File size: Up to 50MB total per request
   • Products: Unlimited (system will process all)

🔒 Security:
   • Reads from local filesystem
   • Only image files processed
   • Credentials from localStorage (HTTP-only)
   • Odoo API uses authenticated session
```

---

## Comparison: PlayUp vs Armed Angels

| Step | PlayUp | Armed Angels |
|------|--------|--------------|
| 1. Analyze Images | `/playup-debug` | `/armedangels-images-import` |
| 2. Match to Products | `/playup-image-matcher` | `/armedangels-image-matcher` |
| 3. Copy Locally | Copy script | Copy script |
| 4. Upload to Odoo | ❌ Manual (future) | ✅ `/armedangels-images-upload` 🆕 |

**Armed Angels now has full automation** - from PDF invoice to images in Odoo! 🎉

---

## Next Steps

### ✅ Just Completed
- Images uploaded to Odoo product galleries
- Products have main image + media gallery

### 🎯 Next
1. Go to Odoo admin
2. Check product galleries are populated
3. Verify images show on eCommerce site
4. Publish products to storefront

---

## Support

**Question?** Check the full guide: `ARMEDANGELS_COMPLETE_WORKFLOW.md`

**Still stuck?** Review the results table for error messages - they'll tell you exactly what went wrong!

---

**Version:** 1.0 - Complete Image Upload Feature  
**Date:** 2025-10-30



