# 🚀 Play UP - Quick Start Guide

**Super simple 3-step process!**

---

## Step 1: Import Products ✅ (Already Done!)

You've imported 24 products with template IDs 7900-7923.  
Import results are automatically saved for image upload.

---

## Step 2: Upload Images (< 2 minutes)

1. **Click the purple button:** "🖼️ Upload Play UP Afbeeldingen"

2. **Select Images:**
   - Click "📁 Select Images"
   - Navigate to: `~/Downloads/Play_Up_Matched_Images/`
   - Press `Cmd+A` to select all
   - Click **Open**
   - You'll see: "48 selected" (or similar)

3. **Upload CSV:**
   - Click "📄 Upload CSV"
   - Select: `playup-products-CFTI22502214 (2).csv` (the SAME one you used for import!)
   - App will automatically:
     - Parse CSV products
     - Match with import results (using template IDs from Step 1)
     - Match images by filename pattern
     - **Start uploading immediately!**

4. **Wait for completion:**
   - Progress bar shows upload status
   - You'll see: "✅ Image import complete! 24/24 products, XX total images uploaded"

---

## 🎯 What Happens Automatically

```
CSV: Article=1AR11003, Color=R324G
  ↓
Import Result: Reference=1AR11003-R324G, TemplateID=7898
  ↓
Images: 1AR11003_R324G_1.jpg, 1AR11003_R324G_2.jpg
  ↓
Upload to Odoo Template 7898
  - First image → Main product image
  - Other images → Gallery
```

---

## ✅ Your Files

```bash
# Check matched images
ls ~/Downloads/Play_Up_Matched_Images/
# Should show: 1AR11003_R324G_1.jpg, etc.

# Your CSV
example-import/Playup/playup-products-CFTI22502214 (2).csv
```

---

## 🐛 If Something Goes Wrong

**Check terminal/console for:**
- "📦 Import results available: 24" ← Should match your imported products
- "✅ Matched: 1AR11003-R324G → Template 7898" ← Shows successful matching
- "🔍 Looking for images with key: 1AR11003_R324G, found: 2" ← Shows image matching

**If no import results:**
- Refresh the page after importing
- Or manually go back to import page and import again

---

**Ready to test! Should take < 2 minutes total.** 🚀

