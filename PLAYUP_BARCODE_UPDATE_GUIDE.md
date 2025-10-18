# Play Up Barcode Update Guide

## Overview

The **Play Up Barcode Update Tool** helps you update EAN barcodes for products that were already imported into Odoo without barcodes.

## Problem

When you import products from a supplier delivery list, it often doesn't include EAN barcodes. Later, you receive the full retail EAN list from Play Up with all barcodes. This tool matches your delivery with the retail list and updates Odoo automatically.

## How It Works

### Step 1: Upload Two CSV Files

1. **Delivery CSV** - Your supplier delivery (products you received)
   - Format: `Article,Color,Description,Size,Quantity,Price`
   - Example: `playup-products-CFTI22502214 (2).csv`

2. **EAN Retail CSV** - Play Up's full product catalog with barcodes
   - Format: `Reference;Description;Size;Colour_Code;...;EAN Code`
   - Example: `EAN-Table 1.csv`

### Step 2: Automatic Matching

The tool automatically:
- ✅ Normalizes sizes (`3 maand` → `3M`, `6 jaar` → `6Y`)
- ✅ Extracts article codes from references (`PA01/1AR11002` → `1AR11002`)
- ✅ Matches by Article + Color + Size
- ✅ Finds corresponding EAN codes

### Step 3: Find in Odoo

The tool searches Odoo for:
- Product templates by name: `Play Up - Rib LS t-shirt (1AR11002)`
- Variants by size attribute: `3M`, `6M`, `9M`, etc.

### Step 4: Review & Update

- Review matched products in table
- Select which ones to update (all ready products selected by default)
- Click "Update Barcodes in Odoo"
- See results for each product

## Example Workflow

### Your Delivery CSV:
```csv
Article,Color,Description,Size,Quantity,Price
1AR11002,P6179,"RIB LS T-SHIRT",3 maand,1,12.39
1AR11002,P6179,"RIB LS T-SHIRT",6 maand,1,12.39
```

### EAN Retail CSV:
```csv
Reference;Description;Size;Colour_Code;...;EAN Code;...
PA01/1AR11002;RIB LS T-SHIRT;3M;P6179;...;5608838575018;...
PA01/1AR11002;RIB LS T-SHIRT;6M;P6179;...;5608838575025;...
```

### Matching Process:
1. Delivery: `1AR11002, P6179, 3 maand` → Normalized: `1AR11002, P6179, 3M`
2. EAN: `PA01/1AR11002` → Extract: `1AR11002, P6179, 3M`
3. **Match!** → EAN: `5608838575018`

### Odoo Search:
1. Product name: `Play Up - Rib LS t-shirt (1AR11002)`
2. Find variants with size `3M`
3. Update variant barcode to `5608838575018`

## Status Indicators

### ✅ Ready to Update (Green)
- EAN found in retail list
- Product found in Odoo
- Variant matched by size
- Can update barcode immediately

### ⚠️ EAN Found, Odoo Not Found (Orange)
- EAN found in retail list
- Product NOT found in Odoo
- Need to import product first

### ❌ No EAN (Red)
- No matching EAN in retail list
- Cannot update (no barcode available)
- Check if product exists in retail list

## Size Normalization

The tool automatically converts Dutch sizes to standard format:

| Delivery Format | Normalized | EAN Format |
|-----------------|------------|------------|
| 0 maand | 0M | 0M |
| 3 maand | 3M | 3M |
| 6 maand | 6M | 6M |
| 9 maand | 9M | 9M |
| 12 maand | 12M | 12M |
| 18 maand | 18M | 18M |
| 24 maand | 24M | 24M |
| 3 jaar | 3Y | 3Y |
| 4 jaar | 4Y | 4Y |
| XS | XS | XS |
| S | S | S |
| M | M | M |
| L | L | L |

## Tips & Best Practices

### ✅ Do's
- Upload both CSV files before matching
- Review the results before updating
- Check the "Ready" count matches expectations
- Use the checkboxes to deselect any you don't want to update

### ❌ Don'ts
- Don't update barcodes twice (check if already set)
- Don't skip reviewing the matches
- Don't update products that show "Odoo Not Found"

## Troubleshooting

### Problem: No EAN Matches Found

**Possible causes:**
- Article codes don't match between files
- Color codes don't match
- Size format is different

**Solution:**
- Check article codes are identical
- Verify color codes match exactly
- Check console for normalization issues

### Problem: Odoo Not Found

**Possible causes:**
- Product not imported yet
- Product name doesn't match format
- Product deleted from Odoo

**Solution:**
- Import products first
- Check product name format in Odoo
- Verify products exist

### Problem: Variant Not Matched

**Possible causes:**
- Size attribute doesn't match
- Variant doesn't exist for this size
- Multiple size attributes

**Solution:**
- Check size attribute value in Odoo
- Verify variant exists
- Check attribute configuration

## Performance

- Typical processing time: 30-60 seconds for 140 products
- API calls: ~400-500 for full delivery list
- Works best with <200 products at a time

## Integration

This tool works with:
- ✅ Products imported via Product Import
- ✅ Play Up products with new naming convention
- ✅ Products with Maat/Size attributes
- ✅ Both Baby's (maand) and Kids (jaar) products

## Navigation

**Access:** Importeren producten → Play Up Barcodes

## Support

For issues:
1. Check browser console for detailed logs
2. Verify CSV formats match expected structure
3. Test with small batch first (10-20 products)
4. Check Odoo credentials are valid

---

**Created for Babette POS System**

