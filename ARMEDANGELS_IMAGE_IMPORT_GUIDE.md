# Armed Angels Image Import System

Complete guide for analyzing and uploading Armed Angels product images to Odoo.

## Overview

The Armed Angels Image Import system allows you to:
1. **Analyze** local image files from `~/Downloads/WOMEN/`
2. **Extract** product reference and color codes from filenames
3. **Generate CSV** inventory of all images with their product mappings
4. **Upload** matched images directly to Odoo product templates

## File Format

Images must follow this naming convention:

```
ITEM_NUMBER-COLOR_CODE (VARIANT).jpg
```

**Examples:**
- `30005160-3232.jpg` - Main image for item 30005160, color 3232
- `30005160-3232 (1).jpg` - Variant 1 of the same product-color
- `30005160-3232 (2).jpg` - Variant 2
- `30006632-3379 (5).jpg` - Variant 5 of item 30006632, color 3379

**Pattern Breakdown:**
- `ITEM_NUMBER`: 8-digit product ID (e.g., 30005160)
- `COLOR_CODE`: 4-digit color code (e.g., 3232 for "tinted navy")
- `VARIANT`: Image sequence number (optional, 1-based)

## How to Use

### Step 1: Organize Images

Place all Armed Angels product images in:
```
~/Downloads/WOMEN/
```

Ensure filenames follow the format above.

### Step 2: Access Image Analyzer

1. Log in to your dashboard
2. Go to **Importeren producten** → **Armedangels Images**
3. Click **🔍 Analyze Images**

The system will scan `~/Downloads/WOMEN/` and:
- ✅ Parse all JPG filenames
- ✅ Group images by product-color combinations
- ✅ Count images per product variant
- ✅ Generate inventory CSV

### Step 3: Review Results

The results page shows:
- **Total Images**: Number of JPG files scanned
- **Product-Color Combinations**: Number of unique products found
- **Average Images per Product**: Total images ÷ Unique products

### Step 4: Download Inventory CSV

Click **📥 Download Image Inventory CSV** to get a file like:

```csv
Item Number,Color Code,Image Count,Image Files,Local Path
30005160,3232,9,"30005160-3232.jpg | 30005160-3232 (1).jpg | 30005160-3232 (2).jpg | 30005160-3232 (3).jpg | 30005160-3232 (4).jpg | 30005160-3232 (5).jpg | 30005160-3232 (6).jpg | 30005160-3232 (7).jpg | 30005160-3232 (8).jpg","~/Downloads/WOMEN/"
30006632,3379,9,"30006632-3379.jpg | 30006632-3379 (1).jpg | 30006632-3379 (2).jpg | 30006632-3379 (3).jpg | 30006632-3379 (4).jpg | 30006632-3379 (5).jpg | 30006632-3379 (6).jpg | 30006632-3379 (7).jpg | 30006632-3379 (8).jpg","~/Downloads/WOMEN/"
```

### Step 5: Verify Products in Odoo

Use the CSV to verify that product item numbers and colors exist in your Odoo system:

1. Go to **Inventory** → **Products** in Odoo
2. Search for each item number (e.g., 30005160)
3. Check that the color variant exists
4. Note down the **Product Template ID**

### Step 6: Upload Images to Odoo

For each product that has images:

1. Go to **Importeren producten** → **Import**
2. Find your product in the list
3. Select it for import
4. Images will be uploaded to Odoo:
   - **Image 1** (main image): Set as product template image
   - **Images 2-3** (if available): Added to product media gallery

## API Endpoints

### Analyze Images

**Endpoint:** `POST /api/analyze-armedangels-images`

**Response:**
```json
{
  "success": true,
  "totalImages": 1234,
  "uniqueProducts": 142,
  "groups": [
    {
      "reference": "30005160",
      "color": "3232",
      "count": 9,
      "images": ["30005160-3232.jpg", "30005160-3232 (1).jpg", ...]
    }
  ],
  "csv": "Item Number,Color Code,..."
}
```

### Upload Images

**Endpoint:** `POST /api/upload-armedangels-images`

**Request:**
```json
{
  "products": [
    {
      "reference": "30005160",
      "color": "3232",
      "templateId": 7794
    }
  ],
  "uid": "123",
  "password": "..."
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "reference": "30005160",
      "color": "3232",
      "templateId": 7794,
      "imagesUploaded": 3,
      "status": "success",
      "message": "Uploaded 3 images"
    }
  ]
}
```

## Image Upload Strategy

When uploading images to Odoo:

### Main Image (Image 1)
- Set as the product template's main image
- Visible on product detail page
- Larger dimensions (~1920x1920px)

### Additional Images (Images 2-3)
- Added to `product.image` model
- Appears in media gallery
- Sequence automatically set
- Linked to product template

### Maximum Images
- **3 images per product** (1 main + 2 gallery)
- If more than 3 images exist, only the first 3 are used
- Ordered by filename (alphanumeric)

## Troubleshooting

### "Folder not found"

**Problem:** System can't find the image folder
**Solution:** Verify images are in `~/Downloads/WOMEN/` and check folder permissions

```bash
ls -la ~/Downloads/WOMEN/ | head -10
```

### "No images found"

**Problem:** System scanned folder but found no JPG files
**Causes:**
- Filenames don't match the pattern
- Files are in a subfolder (not directly in WOMEN/)
- Files are not JPG format

**Solution:** Check filename format:
```bash
ls ~/Downloads/WOMEN/*.jpg | head -10
# Should show: 30005160-3232.jpg, 30005160-3232 (1).jpg, etc.
```

### Images not uploading to Odoo

**Problem:** Upload shows success but images don't appear in Odoo
**Causes:**
- Product template ID incorrect
- Network timeout during upload
- Product not accessible by user

**Solution:**
1. Verify product exists in Odoo
2. Check user permissions
3. Review Odoo error logs
4. Try with smaller number of products

### Incorrect file matching

**Problem:** System groups images incorrectly
**Causes:**
- Typos in filename patterns
- Spaces or special characters in names
- Color codes don't match

**Solution:** Standardize filenames:
```bash
# Example: Rename files to match pattern
mv "30005160 - 3232 (1).jpg" "30005160-3232 (1).jpg"
```

## Best Practices

### 1. File Organization
- Keep all images in single folder (`~/Downloads/WOMEN/`)
- Use consistent naming: `ITEMNUM-COLORCODE (VAR).jpg`
- Avoid spaces in item/color codes

### 2. Image Quality
- Minimum resolution: 600x600px
- Recommended: 1920x1920px or larger
- Format: JPG (no PNG, WEBP, etc.)
- File size: <5MB per image

### 3. Before Uploading
- Verify all products exist in Odoo
- Check product template IDs
- Test with 5-10 products first
- Review CSV output for errors

### 4. Upload Strategy
- Upload during off-peak hours
- Monitor upload progress
- Review results in Odoo immediately
- Keep local copies as backup

## Integration with Product Import

The image system works alongside the product import workflow:

1. **Product Import** (`/product-import`)
   - Import product data (CSV from PDF)
   - Set prices, categories, brands
   - Create product templates in Odoo

2. **Image Analysis** (`/armedangels-images-import`)
   - Scan local image files
   - Generate inventory CSV
   - Review image availability

3. **Image Upload** (via Product Import)
   - Match images to imported products
   - Upload main image + gallery images
   - Complete product setup in Odoo

## Next Steps

1. ✅ Analyze images: `/armedangels-images-import`
2. ✅ Import products: `/product-import`
3. ✅ Upload images: Integrated in import process
4. ✅ Verify in Odoo: Check product pages for images

---

**Need help?** Check the product import guide or contact support.
