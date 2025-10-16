# How to Import Flöss Products

## Step-by-Step Guide

### 1. **Go to Product Import**
   - Navigate to the product import page
   - Select **Flöss** vendor (🌸 button)

### 2. **Upload CSV File**
   - Upload: `6109_revised 2.csv` (the complete vendor file)
   - The system will parse:
     - ✅ 14 unique products
     - ✅ 90 product variants (different sizes)
   - Wait for parsing to complete

### 3. **Review Parsed Products** (Step 2)
   - The product table shows all parsed items
   - Each row = one product variant
   - Check that all data is correctly extracted:
     - Product names in format: "Flöss - Style Name - Color"
     - Sizes (e.g., 68/6M, 74/9M)
     - Prices in EUR
     - Barcodes (EAN)

### 4. **Set Product Names & Stock** (Step 3)
   - Edit product names if needed
   - Set stock quantities (default: 1 from CSV)
   - Use "📦 Voorraad 0" button to set all to 0
   - Or import with default quantities

### 5. **Assign Categories** (Step 4)
   - Select primary category for each product
   - Use batch selection to assign to multiple products at once
   - Example categories:
     - Clothing > Cardigans
     - Clothing > Jackets
     - Accessories > Socks

### 6. **Review & Import** (Step 5-7)
   - Review the preview of products to import
   - Click "Import Products" to send to Odoo
   - Monitor the progress
   - Check results for any errors

### 7. **Upload Images** (Optional)
   - Prepare images folder: `Order-6109-Images`
   - Images are processed automatically:
     - Named like: `F10625-Main.jpg`, `F10625-Extra 0.jpg`
     - Images with "Main" become the product image
     - Extra images become gallery images
   - Upload in batches (max 2 at a time)

## File Format Reference

### Required CSV Structure
```
Table 1
Style No;Style Name;Brand;...;Qty;Barcode;...;Wholesale Price EUR;Recommended Retail Price EUR;...;Description;...
F10625;Apple Knit Cardigan;Flöss Aps;...;1;5715777018640;...;22,00;55,00;...;Description text;...
```

### Key Fields
| Field | Example | Notes |
|-------|---------|-------|
| Style No | F10625 | Product ID (must start with F) |
| Style Name | Apple Knit Cardigan | Product name |
| Size | 68/6M | Product variant size |
| Qty | 1 | Stock quantity |
| Barcode | 5715777018640 | Product EAN |
| Wholesale Price EUR | 22,00 | Cost price (comma decimal) |
| Recommended Retail Price EUR | 55,00 | Selling price (comma decimal) |

## Troubleshooting

### ❌ "All products have Verkoopprijs 0"
- **Cause**: CSV parser not reading prices correctly
- **Fix**: Ensure prices use comma (22,00 not 22.00)

### ❌ "Products with 2 variants not working"
- **Cause**: Variant matching issue
- **Fix**: Check that all variants have a size value

### ❌ "Images not uploading"
- **Cause**: Payload too large or connection issue
- **Fix**: Upload images in smaller batches (2-3 at a time)

### ✅ "Everything looks good"
- Great! You're ready to import
- Proceed with confidence!

