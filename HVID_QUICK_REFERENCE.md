# HVID Import - Quick Reference

## 🚀 Quick Steps

1. **Upload** → PDF or CSV
2. **Click** → "Check for Duplicates in Odoo"
3. **Review** → Three action tables appear
4. **Edit** → Modify any fields as needed
5. **Select** → Check/uncheck products
6. **Execute** → Click action button → Confirm → Done!

## 📊 Three Actions Explained

| Action | Icon | What It Does | When Used |
|--------|------|--------------|-----------|
| **Update Stock** | 📦 | Adds quantity to existing variant | Barcode exists in Odoo |
| **Create Variant** | ➕ | Adds new size/color to existing product | Base product exists (e.g., "Booties") but new variant needed |
| **Create Product** | 🆕 | Creates brand new product with variant | Product doesn't exist in Odoo |

## 💰 Price Mapping

From CSV → To Odoo:
- **Price** (€17.92) → **Cost Price** (standard_price)
- **Total ÷ Quantity** (€35.84 ÷ 2) → **Sale Price** (list_price)

## ✏️ Editable Fields

### Stock Update Table
- ☑️ Select/deselect products
- 👁️ View current stock, added quantity, new stock

### Create Variant Table
- ☑️ Select/deselect products
- ✏️ **Size** - Shows existing sizes from base product (autocomplete)
- ✏️ **Color** - Shows existing colors from base product (autocomplete)
- ✏️ **Quantity** - Editable number input
- 🔘 **Voorraad 0** - Sets all quantities to 0 (for pre-orders)

### Create Product Table
- ☑️ Select/deselect products
- ✏️ **Product Name** (how it appears in Odoo)
- ✏️ **Size** (optional)
- ✏️ **Color** (optional)

## 🎯 Auto-Detection

The system automatically:
- ✅ Parses product names from CSV
- ✅ Detects sizes (looks for "months", "years", "y", "M", "L", "XL")
- ✅ Detects colors (everything else in parentheses)
- ✅ Matches base products (fuzzy matching)
- ✅ Sets default category: "All / Hvid"
- ✅ Sets default brand: "Hvid"

## 📋 Validation Modal

Before execution, you'll see:
- Total number of products to process
- List of products with their actions
- Confirm or Cancel buttons

## ✅ Operation Results

After execution:
- ✅ Green = Success
- ❌ Red = Failed
- Details for each product
- Stock levels updated
- Product IDs created

## 🔧 Common Edits

### Fix Auto-Detected Size
```
Detected: "The Original Size - 0-9 months"
Change to: "0-9M"
```

### Fix Auto-Detected Color
```
Detected: "Blue/Grass"
Keep as: "Blue/Grass" (or split into two products)
```

### Fix Product Name
```
Auto: "Booties"
Change to: "Hvid Booties"
```

## ⚡ Bulk Operations

- **Select All**: Check the header checkbox
- **Deselect All**: Uncheck the header checkbox
- **Select Individual**: Check row checkboxes
- **Process**: Only selected products are processed

## 🚨 Important Notes

1. **Don't process twice**: Same invoice = duplicate stock
2. **Review before confirming**: Check the validation modal
3. **Edit if needed**: All fields are editable
4. **Check results**: Review operation results for errors
5. **Brand required**: New products need brand (auto-set to Hvid)

## 📞 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| No products showing | Scroll down to "Import Summary" |
| Wrong category | System uses "All / Hvid" by default |
| Size/color wrong | Edit in the table before creating |
| Operation fails | Check results section for specific error |
| Can't find base product | Product will be in "New Products" instead |

## 🎨 Color Codes

- **Blue** = Update (existing products)
- **Green** = Create Variant (extend existing product)
- **Yellow** = Create New (brand new product)
- **Red** = Duplicate/Error

## 📝 Example Workflow

**Invoice has 36 products:**
- 15 products exist → 📦 Update Stock (15)
- 12 products match base → ➕ Create Variants (12)
- 9 products are new → 🆕 Create Products (9)

**Process:**
1. Review all three tables
2. Edit sizes/colors if needed
3. Deselect any you don't want
4. Click "Update Selected Stock (15)" → Confirm
5. Click "Create Selected Variants (12)" → Confirm
6. Click "Create Selected Products (9)" → Confirm
7. Done! ✅

---

**Need help?** Check `HVID_IMPORT_GUIDE.md` for detailed documentation.

