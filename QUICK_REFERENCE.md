# 🎯 Armed Angels Image Upload - Quick Reference Card

## The Page
**URL:** `/armedangels-images-upload`

**Navigation:** Dashboard → Importeren producten → 🎯 Armedangels Image Upload

---

## What It Does
Uploads product images from your local folder to Odoo product galleries.

**Input:** Catalog CSV + Image folder path  
**Output:** Images in Odoo product galleries ✅

---

## 3-Step Process

### Step 1: Upload Catalog CSV
```
File format: Item Number;Color Code;SKU Number
Example row: 30005160;3232;123456
             (reference;color;templateId)
```
- Click file input
- Select your catalog CSV
- ✅ Shows "Catalog CSV loaded"

### Step 2: Enter Image Folder Path
```
Example: ~/Downloads/Armed_Angels_Matched_Images
Or:      /Users/username/Downloads/Armed_Angels_Matched_Images

Expected structure:
  📁 Folder/
  ├─ 📁 30005160-3232/
  │  ├─ image1.jpg
  │  ├─ image2.jpg
  │  └─ image3.jpg
  └─ 📁 30005161-4545/
     └─ image1.jpg
```
- Paste full path to your images folder
- Can use `~` or absolute path

### Step 3: Click "Start Upload"
System will:
1. Parse catalog CSV
2. List product folders
3. Upload images to Odoo
4. Show results

---

## Results Page

### Statistics
```
✅ Success: N products
❌ Failed: M products
📸 Total Images: X images
```

### Results Table
| Column | Meaning |
|--------|---------|
| Reference | Product reference code |
| Color | Product color code |
| Template ID | Odoo product template ID |
| Images | Number uploaded |
| Status | ✅ Success or ❌ Error |
| Message | Details or error message |

---

## Common Issues

### "Catalog CSV not found"
❌ Upload the catalog CSV file first!

### "Folder not found"
Check path:
- Use full path: `/Users/username/folder`
- Not just: `folder`
- Use `~` for home: `~/Downloads/folder`

### "No images found in folder"
Check structure:
- Folder must be: `reference-color` (e.g., `30005160-3232`)
- Images inside: `image1.jpg`, `image2.jpg`
- Format: `.jpg`, `.jpeg`, or `.png` only

### "Template ID: 0"
Catalog doesn't have this product:
- Check catalog has row: `30005160;3232;123456`
- Verify color code exact match
- Upload correct catalog file

---

## File Locations

After image matcher, your files should be:
```
📁 ~/Downloads/
├─ Armed_Angels_Matched_Images/  ← Image folder path
│  ├─ 30005160-3232/
│  ├─ 30005161-4545/
│  └─ ...
├─ armedangels-images-inventory.csv  ← From step 2 (optional)
├─ bSQUBgZvGNH7uBPJ.csv  ← Catalog (use this in upload)
└─ copy-matched-images.sh  ← Already ran
```

---

## Step-by-Step Example

**Scenario:** 2 products, 5 images total

**Step 1:** Upload `bSQUBgZvGNH7uBPJ.csv`
```
Item Number;Color Code;SKU Number
30005160;3232;123456
30005161;4545;123457
```
✅ Loaded

**Step 2:** Enter path
```
~/Downloads/Armed_Angels_Matched_Images
```

**Step 3:** Click Upload
```
Processing:
  • Found 2 product folders
  • 30005160-3232 → Template ID 123456 ✅
  • 30005161-4545 → Template ID 123457 ✅

Uploading:
  • 30005160-3232: 2 images (1 main + 1 gallery) ✅
  • 30005161-4545: 3 images (1 main + 2 gallery) ✅

Results:
  ✅ Success: 2
  ❌ Failed: 0
  📸 Total Images: 5
```

---

## What Gets Uploaded

**First Image** → Main product image
```
Odoo: product.template.write({image_1920: base64})
Result: Shows on storefront
```

**Images 2-5** → Media gallery
```
Odoo: product.image.create({
  product_tmpl_id: templateId,
  image_1920: base64,
  sequence: 2, 3, 4, 5
})
Result: Available in product gallery
```

---

## Performance

| Metric | Value |
|--------|-------|
| Max images per product | 5 |
| Max payload | 50MB |
| Typical time per image | 1-5 seconds |
| 10 images | ~30-60 seconds |
| 50 images | ~2-5 minutes |
| 100 images | ~5-10 minutes |

---

## Safety & Limits

✅ Safe
- Only reads image files
- Uploads to authenticated Odoo
- Error handling for all cases

⚠️  Limits
- Max 5 images per product (1st is main, 4 in gallery)
- File types: .jpg, .jpeg, .png only
- Payload: 50MB max
- No compression

---

## After Upload

1. **Go to Odoo**
   - Navigate to Products
   - Find your Armed Angels products
   - Check images are there

2. **Verify**
   - Main image shows (first image)
   - Media gallery has more images
   - Colors/descriptions correct

3. **Publish** (if needed)
   - Publish to eCommerce
   - Images now on website!

---

## Need Help?

### Full Guide
📖 `ARMEDANGELS_COMPLETE_WORKFLOW.md`

### Troubleshooting
🔧 `ARMEDANGELS_IMAGE_UPLOAD_QUICKSTART.md`

### Technical Details
⚙️ `IMPLEMENTATION_SUMMARY.md`

---

## Keyboard Shortcuts

- `Tab` - Navigate between fields
- `Enter` - Submit (same as click)
- `Escape` - Close (if popup)

---

## Browser Console (Developer Tools)

If something goes wrong:
1. Open DevTools: `F12` or `Cmd+Option+I`
2. Go to Console tab
3. Look for error messages
4. Screenshot and share with support

---

## Support Checklist

If reporting an issue, include:
- [ ] Error message from results table
- [ ] Catalog CSV filename
- [ ] Image folder path (obfuscate if needed)
- [ ] Number of products/images
- [ ] Browser console errors (if any)

---

**Version:** 1.0  
**Last Updated:** 2025-10-30  
**Status:** ✅ Production Ready
