# Barcode Duplicate Checker

## Overview

The Barcode Duplicate Checker is a comprehensive tool to help identify and manage duplicate barcodes in your Odoo product database. It supports multiple input methods and provides an intuitive interface for resolving conflicts.

## Features

### 1. Multiple Input Methods

#### PDF Upload (Factur-X/Odoo Format)
- Upload PDF invoices from suppliers using Odoo
- Automatically extracts EAN barcodes, SKUs, and product information
- Parses embedded Factur-X XML data
- Generates downloadable CSV for record-keeping

#### CSV Upload
- Upload CSV files with product barcodes
- Expected format: `Barcode, SKU, Product Name, Quantity, Price, Total`
- Header row is optional and automatically detected

#### Manual Input
- Paste or type barcodes directly
- One barcode per line
- Quick and simple for small batches

### 2. Duplicate Detection

The tool checks for duplicates in two ways:

1. **Input Duplicates**: Identifies barcodes that appear multiple times in your uploaded file
2. **Odoo Duplicates**: Searches both `product.template` (main products) and `product.product` (variants) for matching barcodes

### 3. Results Dashboard

The results page provides:
- Summary statistics (total barcodes, unique barcodes, duplicates found)
- Visual indicators for duplicate severity
- Detailed breakdown of all barcode lookups
- Status indicators (Not Found, Unique, Duplicate)

### 4. Duplicate Management

For each duplicate barcode, you can:
- **View Details**: See all products using the same barcode
- **Edit Barcode**: Change the barcode to a new unique value
- **Clear Barcode**: Remove the barcode from a product
- **Compare Products**: Side-by-side view of conflicting products

## How to Use

### Step 1: Access the Tool
Navigate to **Importeren producten** → **Barcode Duplicaten** in the main menu.

### Step 2: Choose Input Method
Select one of three tabs:
- **Upload PDF**: For Odoo/Factur-X formatted invoices
- **Upload CSV**: For CSV files with barcode data
- **Manual Input**: For quick barcode checking

### Step 3: Upload/Enter Data
- For PDF/CSV: Click the file input and select your file
- For Manual: Paste barcodes (one per line) and click "Add Barcodes"

### Step 4: Review Parsed Data
After upload, review the parsed products in the table. You can download a CSV copy if needed.

### Step 5: Check for Duplicates
Click **"Check for Duplicates in Odoo"** to scan your database.

### Step 6: Review Results
The tool will show:
- ✅ **Green**: Unique barcodes (no conflicts)
- ⚠️ **Yellow**: Duplicate barcodes in your input file
- 🔴 **Red**: Duplicate barcodes found in Odoo

### Step 7: Resolve Duplicates
For each duplicate:
1. Review the products using the same barcode
2. Decide which product should keep the barcode
3. For others, either:
   - Click **Edit Barcode** to assign a new unique barcode
   - Click **Clear** to remove the barcode entirely

### Step 8: Verify
After making changes, click **"Check for Duplicates in Odoo"** again to verify all duplicates are resolved.

## PDF Format Requirements

The PDF parser supports **Factur-X** format (also known as ZUGFeRD), which is the standard electronic invoice format used by Odoo. The PDF must contain embedded XML data with product information.

### Example PDF Structure
```xml
<ram:SpecifiedTradeProduct>
  <ram:GlobalID schemeID="0160">5404027808536</ram:GlobalID>
  <ram:SellerAssignedID>B005A_EAN 5404027808536</ram:SellerAssignedID>
  <ram:Name>[B005A_EAN 5404027808536] Booties (Size 0-9 months, Blue/Grass)</ram:Name>
</ram:SpecifiedTradeProduct>
```

## CSV Format

### Expected Columns
```
Barcode, SKU, Product Name, Quantity, Price, Total
5404027808536, B005A_EAN, Booties Blue/Grass, 2.0, 17.92, 35.84
5404027808512, B011A_EAN, Booties Cream/Grass, 2.0, 17.92, 35.84
```

### Notes
- First row can be a header (will be auto-detected)
- Only Barcode column is required for duplicate checking
- Other columns are optional but helpful for context

## API Endpoints

### Parse HVID Invoice
- **Endpoint**: `/api/parse-hvid-invoice`
- **Method**: POST
- **Input**: PDF file (multipart/form-data)
- **Output**: JSON with parsed products and CSV content

### Check Duplicate Barcodes
- **Endpoint**: `/api/check-duplicate-barcodes`
- **Method**: POST
- **Input**: JSON array of barcodes
- **Output**: JSON with duplicate analysis

### Update Product Barcode
- **Endpoint**: `/api/update-product-barcode`
- **Method**: POST
- **Input**: Product ID, model, new barcode
- **Output**: JSON with updated product details

## Troubleshooting

### PDF Upload Fails
- Ensure the PDF is in Factur-X/ZUGFeRD format
- Check that the PDF contains embedded XML data
- Try opening the PDF in a text editor to verify XML presence

### No Duplicates Found (But Expected)
- Verify barcodes are entered correctly (no spaces, correct format)
- Check if products exist in Odoo
- Try searching individual barcodes in Odoo to confirm

### Barcode Update Fails
- Ensure you have write permissions in Odoo
- Check that the new barcode is unique
- Verify Odoo connection is active

## Best Practices

1. **Regular Checks**: Run duplicate checks before importing new products
2. **Backup First**: Take a database backup before mass barcode updates
3. **Document Changes**: Use the CSV download feature to keep records
4. **Verify Updates**: Always re-check after making changes
5. **Plan Resolution**: For multiple duplicates, plan which products keep their barcodes before making changes

## Technical Details

- Built with Next.js, React, and TypeScript
- Uses xml2js for PDF parsing
- Connects to Odoo via XML-RPC
- Supports both product templates and product variants
- Real-time duplicate detection
- Client-side CSV generation and download

## Support

For issues or questions, refer to the main project documentation or contact your system administrator.

