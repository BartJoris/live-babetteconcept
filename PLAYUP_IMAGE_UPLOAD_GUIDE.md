# 🖼️ Play UP Image Upload - Simple Guide

## ✨ Super Simple Workflow

**No website scraping • No manual matching • Just 3 clicks!**

---

## 📋 Complete Process

### **Step 1: Import Products**

1. Go to **📦 Import**
2. Select **Play UP**
3. Upload your CSV (`playup-products-CFTI22502214 (1).csv`)
4. Complete import process
5. ✅ You'll see: "Created template 7898, 7899, 7900..." etc.
6. Click **"🖼️ Upload Play UP Afbeeldingen"** button

---

### **Step 2: Upload Images (Automatic!)**

1. You're now on the **🖼️ Play UP Images Upload** page
2. You'll see: "✅ 24 producten geïmporteerd en klaar voor afbeeldingen"

3. **Select Images:**
   - Click **"📁 Select Images"**
   - Navigate to `~/Downloads/Play_Up_Matched_Images/`
   - Press `Cmd+A` to select all
   - Click **Open**

4. **Upload CSV:**
   - Click **"📄 Upload CSV"**
   - Select the **same CSV** you used for import
   - App automatically matches products!

5. **Done!**
   - Click **"🚀 Upload XX Images to YY Products"**
   - Wait for progress bar to complete
   - ✅ See results!

---

## 🎯 What Happens Automatically

The app automatically:

1. ✅ **Extracts Template IDs** from your import session
2. ✅ **Matches images by filename**:
   - `1AR11003_R324G_1.jpg` → Product `1AR11003`, Color `R324G`
3. ✅ **Sets first image as main** product image
4. ✅ **Uploads remaining images** to gallery
5. ✅ **Shows detailed results** for each product

---

## 📸 Image Filename Format

```
ArticleCode_ColorCode_Number.jpg

Examples:
✅ 1AR11003_R324G_1.jpg
✅ 1AR11003_R324G_2.jpg
✅ 3AR11353_R331N_1.jpg
❌ random-image.jpg (won't match)
```

---

## 📂 File Locations

```
Original Images:
~/Downloads/Play_Up_AW25_Images/   (842 images)

Matched Images:
~/Downloads/Play_Up_Matched_Images/   (200 images)

CSV:
example-import/Playup/playup-products-CFTI22502214 (1).csv
```

---

## ⚡ Quick Example

```
Import: 24 products → Template IDs: 7900-7923 ✅

Upload:
  - Select: 150 images from matched folder
  - Upload: Same CSV
  - Result: Automatic matching and upload!

Time: ~2 minutes total
```

---

## 🔍 How Matching Works

```
CSV Row:
Article=1AR11003, Color=R324G → Import → Template ID=7898

Images:
1AR11003_R324G_1.jpg  ✅ Matched!
1AR11003_R324G_2.jpg  ✅ Matched!
   ↓
Upload to Template 7898
```

---

## ✅ Success Checklist

After upload, you should see:

- [ ] "✅ Image import complete!"
- [ ] Green checkmarks for successful products
- [ ] Total images uploaded count
- [ ] Products now have images in Odoo

---

## 🐛 Troubleshooting

### "No products matched!"
- Make sure you imported products first
- Use the exact same CSV for both import and image upload
- Check that template IDs were created

### "No matching images found"
- Verify image filenames follow pattern: `ArticleCode_ColorCode_Number.jpg`
- Check article codes in CSV match image filenames
- Make sure images are in the selected folder

### "0 total images uploaded"
- This means no images were matched with products
- Check image filenames and CSV article codes
- Run the Image Matcher first to verify

---

## 🚀 Pro Tips

1. **Use Image Matcher first** to verify which images will match
2. **Download copy script** to only copy relevant images
3. **Same CSV for everything** - import, prices, images
4. **First image is always main** - so name them in order (1, 2, 3...)

---

**That's it! Simple, fast, automatic!** 🎉

