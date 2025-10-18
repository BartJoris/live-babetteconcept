# HVID Import Guide

## Overview

The HVID Import system intelligently processes supplier invoices (PDF or CSV) and automatically categorizes products into three actions:

1. **📦 Stock Updates** - Products that exist in Odoo (add stock to existing variants)
2. **➕ Variant Creation** - New colors/sizes for existing product lines (create new variants)
3. **🆕 Product Creation** - Completely new products (create from scratch)

## Quick Start

### Step 1: Upload Your Invoice

Choose one of three methods:
- **Upload PDF**: HVID invoices in Odoo/Factur-X format
- **Upload CSV**: Exported product list
- **Manual Input**: Paste barcodes directly

### Step 2: Analyze Products

Click **"Check for Duplicates in Odoo"**

The system will:
- ✅ Extract all barcodes and product information
- ✅ Check which products exist in your Odoo database
- ✅ Intelligently match similar products
- ✅ Categorize each product into the appropriate action

### Step 3: Review Categories

Three tables will appear showing:

#### 📦 Products to Update Stock
Products with barcodes that already exist in Odoo.
- Shows: Current stock, quantity to add, new stock total
- Action: Updates the variant's inventory

#### ➕ Products to Add as Variants
Products that match an existing product line but with a new size/color.
- Example: "Booties (9-15 months, Powder)" → Adds to "Hvid booties" product
- Shows: Base product, detected size, detected color, quantity
- **Editable**: You can modify size, color, and quantity before creation
- **Autocomplete**: Size and color fields show existing values from the base product
- **Voorraad 0 Button**: Set all quantities to 0 (useful for pre-orders)
- **Existing Values**: Listed below each field to help you match exactly

#### 🆕 New Products to Create
Products that don't match any existing products.
- Shows: Product name, size, color, prices
- **Editable**: You can modify all fields before creation
- Default category: "All / Hvid"
- Default brand: "Hvid"

### Step 4: Edit if Needed

All tables are editable:
- ✏️ **Product names** - Change how the product appears in Odoo
- ✏️ **Sizes and colors** - Correct auto-detected values
- ☑️ **Checkboxes** - Deselect products you don't want to process

### Step 5: Execute Operations

Click the action buttons:
- **Update Selected Stock** - For stock updates
- **Create Selected Variants** - For new variants
- **Create Selected Products** - For new products

A validation modal will show:
- Summary of what will be created/updated
- Confirm or Cancel

### Step 6: Review Results

After execution, see detailed results:
- ✅ Success messages with details
- ❌ Error messages if any failed
- Stock levels updated
- Product/variant IDs created

## Price Mapping

From your HVID CSV:
- **Price column** (€17.92) → **Cost Price** in Odoo (what you pay)
- **Total ÷ Quantity** (€35.84 ÷ 2 = €17.92) → **Sale Price** in Odoo (what customers pay)

## Examples

### Example 1: Stock Update
**CSV**: `5404027800813, "Booties (The Original Size - 0-9 months, Oat)", Qty: 1`
**Odoo**: Product "Hvid booties" with variant matching barcode already exists
**Action**: Add 1 to existing stock
**Result**: Stock goes from 35 → 36

### Example 2: Variant Creation
**CSV**: `5404027808567, "Booties (9-15 months, Powder)", Qty: 2`
**Odoo**: Product "Hvid booties" exists but no variant for "9-15 months, Powder"
**Action**: Create new variant with Size="9-15 months", Color="Powder"
**Result**: New variant added to existing product, stock set to 2

### Example 3: New Product
**CSV**: `5404027809113, "Vest Harvey BABY (6-12 months, Cotton candy)", Qty: 1`
**Odoo**: No matching product found
**Action**: Create new product "Vest Harvey BABY" with variant
**Result**: New product created with brand, size, color attributes, stock set to 1

## Product Name Parsing

The system automatically parses CSV names:

**Pattern**: `[SKU] ProductName (SizeDetails, Color)`

Examples:
- `[B036B_EAN 5404027808567] Booties (9-15 months, Powder)`
  - Base: "Booties"
  - Size: "9-15 months"
  - Color: "Powder"

- `[EAN 5404027803784] Beanie Fonzie ADULT (Artichoke)`
  - Base: "Beanie Fonzie ADULT"
  - Size: null
  - Color: "Artichoke"

## Base Product Matching

When looking for variants to create, the system matches:

**CSV Name** → **Odoo Product**
- "Booties" → "Hvid booties" ✅
- "Beanie Fonzie" → "Hvid beanie Fonzie" ✅
- "Cardigan Inga" → "Hvid cardigan Inga" ✅

The matching is fuzzy and case-insensitive.

## Attributes System

Products are created with three attributes:

### 1. MERK (Brand)
- Value: "Hvid"
- Required: Yes

### 2. Maat (Size)
- Examples: "0-9M", "9-15M", "2y", "4y", "S/M", "L/XL"
- Auto-created if doesn't exist

### 3. Kleur (Color)
- Examples: "Powder", "Lilac", "Cream", "Blue", "Red"
- Auto-created if doesn't exist

## Tips & Best Practices

### ✅ Do's
- Review the categorization before executing
- Edit product names for clarity
- Verify sizes and colors are correct
- Use checkboxes to skip problematic products
- Check operation results for any errors

### ❌ Don'ts
- Don't process the same invoice twice (stock will double)
- Don't change prices without verifying they're correct
- Don't skip reviewing the validation modal

## Troubleshooting

### Problem: Products categorized incorrectly
**Solution**: The system might not find a match. You can:
- Manually edit which table a product appears in (by editing data)
- Create the product manually in Odoo first
- Adjust the product name in the CSV

### Problem: Size/color not detected
**Solution**: Edit the fields in the table before creating

### Problem: Wrong base product matched
**Solution**: Currently auto-detected. If wrong, you may need to create manually

### Problem: Operation fails
**Solution**: Check operation results for specific error message
- Missing brand? Check Hvid brand exists in Odoo
- Missing category? Verify "All / Hvid" category exists
- Permission error? Check your Odoo user permissions

## Technical Details

### CSV Format
```
Barcode, SKU, Product Name, Quantity, Price, Total
5404027808536, "B005A_EAN...", "[B005A_EAN...] Booties (...)", 2, 17.92, 35.84
```

### API Endpoints

1. `/api/check-duplicate-barcodes` - Analyzes and categorizes products
2. `/api/update-stock` - Adds quantity to existing variants
3. `/api/create-product-variant` - Creates new variant for existing product
4. `/api/create-hvid-product` - Creates completely new product
5. `/api/get-hvid-products` - Fetches all HVID products for matching

### Stock Management

Stock is updated via `stock.quant` records:
- Location: "Stock" (internal)
- Method: Add to existing quantity (not replace)
- Scope: Variant level only (not template)

### Product Structure

Created products have:
- Type: Consumable (consu)
- Tracking: None
- Weight: 0.2kg (default)
- POS: Enabled
- Website: Published
- Purchase: Disabled

## Workflow Diagram

```
PDF/CSV Upload
     ↓
Parse Products
     ↓
Check Barcodes in Odoo
     ↓
Categorize into 3 Groups
     ↓
┌────────────┬──────────────┬──────────────┐
│ Stock      │ Variants     │ New          │
│ Update     │ Creation     │ Products     │
└────────────┴──────────────┴──────────────┘
     ↓              ↓              ↓
Edit Tables    Edit Tables    Edit Tables
     ↓              ↓              ↓
Select Items   Select Items   Select Items
     ↓              ↓              ↓
Validation     Validation     Validation
Modal          Modal          Modal
     ↓              ↓              ↓
Execute        Execute        Execute
     ↓              ↓              ↓
┌────────────────────────────────────┐
│      Operation Results             │
│  ✅ Success  ❌ Errors             │
└────────────────────────────────────┘
```

## Support

For issues, check:
1. Browser console (F12) for error messages
2. Operation results section for specific failures
3. Odoo logs if operations seem to hang

Contact your system administrator if problems persist.

