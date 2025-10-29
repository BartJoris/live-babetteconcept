# 🛡️ Armed Angels Import System - Complete Guide

## Overview

The Armed Angels import system allows you to quickly import Armed Angels products from PDF invoices into Babette. The system handles the complete workflow from PDF parsing to product import.

## Features

✅ **Automated PDF Parsing**
- Extracts item numbers, descriptions, colors, sizes, quantities, and prices
- Handles multi-line PDF structures
- Removes certifications and unnecessary metadata
- Generates clean CSV output

✅ **Size Variant Support**
- Letter sizes: XS, S, M, L, XL, XXL
- Numeric sizes: 25/32, 26/32, 27/32, ..., 32/32
- Individual quantities per size

✅ **Color Handling**
- Color codes with descriptive names
- Example: "3232 tinted navy"
- Proper CSV escaping

✅ **Automatic Brand Detection**
- Auto-detects Armed Angels brand
- Can be manually overridden in import wizard

## Quick Start

### Step 1: Convert PDF to CSV

1. Go to `/armedangels-pdf-converter`
2. Upload an Armed Angels invoice PDF
3. System automatically parses the PDF
4. Preview the CSV output (first 20 lines shown)
5. Click "📥 Download CSV Bestand" to download

### Step 2: Import CSV

1. Go to `/product-import`
2. Select **"Armed Angels"** in the vendor selection
3. Upload the CSV file from Step 1
4. Continue through the import wizard:
   - **Mapping**: Review and adjust field mappings
   - **Stock**: Set inventory levels
   - **Categories**: Assign categories and tags
   - **Preview**: Review products before import
   - **Test**: Validate against existing products
   - **Import**: Complete the import

## CSV Formats

The Armed Angels import system supports **two CSV formats**:

### Format 1: Invoice Export (from PDF Converter)

Generate via `/armedangels-pdf-converter` or from Armed Angels invoice PDFs.

```
Item Number,Description,Color,Size,SKU,Quantity,Price (EUR)
30005160,"JOANIAAS","3232 tinted navy","XS","",1,88.16
30005160,"JOANIAAS","3232 tinted navy","S","",2,88.16
```

**Use when:** Importing ordered products from specific invoices

### Format 2: Catalog CSV (Complete Product Catalog)

Upload the Armed Angels catalog file (`bSQUBgZvGNH7uBPJ.csv` or similar).

```
Table 1
ID;Gender / Product line;...;Item Number;Item Description;Color Code;Color Description;Size Code;SKU Number;EAN;...;Price Whoesale (EUR);RPR (EUR);...
30001100105;Men;...;30001100;JAAMES;105;black;S;30001100000021;4251468341914;...;12,00 €;29,90 €;...
```

**Use when:** Importing the complete Armed Angels product catalog with all available items and sizes

## Auto-Detection

The system **automatically detects** which format you're uploading:
- **Catalog CSV**: Recognized by "Table 1" header or semicolon-separated structure
- **Invoice CSV**: Comma-separated with Item Number, Description, Color, Size columns

Just upload either format and the system handles it correctly!

## Column Details

### Invoice Export Format:
- **Item Number**: Armed Angels product ID
- **Description**: Product name (certifications removed)
- **Color**: Color code and name
- **Size**: Individual size variant
- **SKU**: Product SKU (often empty)
- **Quantity**: Per-size quantity
- **Price (EUR)**: Wholesale price per item

### Catalog Format:
- **Item Number**: Armed Angels product ID
- **Item Description**: Product name
- **Color Code**: Color code (e.g., "105")
- **Color Description**: Color name (e.g., "black")
- **Size Code**: Size code (e.g., "S", "M", "26/32")
- **SKU Number**: SKU identifier
- **EAN**: EAN/barcode number
- **Price Whoesale (EUR)**: Wholesale price
- **RPR (EUR)**: Recommended retail price

## Data Extraction Examples

### Example 1: Letter Sizes

Input PDF structure:
```
1 30005160 3232 tinted navy 6 Pcs. 88,16 EUR...
JOANIAAS
GOTS, organic, CU-1085700
XS
1
S
2
M
2
L
1
```

Generated CSV rows:
```
30005160,"JOANIAAS","3232 tinted navy","XS","",1,88.16
30005160,"JOANIAAS","3232 tinted navy","S","",2,88.16
30005160,"JOANIAAS","3232 tinted navy","M","",2,88.16
30005160,"JOANIAAS","3232 tinted navy","L","",1,88.16
```

### Example 2: Numeric Sizes (Pants)

Input PDF structure:
```
2 30007989 3393 barrea 8 Pcs. 53,66 EUR...
AALTHEA
GOTS, organic, CU-1085700
26/32
1
27/32
1
28/32
1
...
```

Generated CSV rows:
```
30007989,"AALTHEA","3393 barrea","26/32","",1,53.66
30007989,"AALTHEA","3393 barrea","27/32","",1,53.66
30007989,"AALTHEA","3393 barrea","28/32","",1,53.66
```

### Example 3: Multiple Colors (Variants)

Products with the same item number but different colors are grouped into separate product records with different color variants.

## Testing

Tested with multiple Armed Angels PDF invoices:

✅ **200-08510787.pdf**
- 7 unique products
- 24 total variants
- Mix of letter and numeric sizes

✅ **200-08485663.pdf**
- 10 unique products  
- 48 total variants
- Multiple color options per item

✅ **Customer invoice 200-08436586.pdf**
- 3 products
- 18 variants

All tests passed with clean output and correct parsing.

## Troubleshooting

### PDF Not Parsing
- Ensure the PDF is a valid Armed Angels invoice
- Check that the PDF contains the expected structure
- Look at the debug output for hints

### Missing Products
- Verify all products in CSV
- Check that item numbers are valid
- Ensure quantities are numeric

### Wrong Descriptions
- The system removes certification text (GOTS, RWS, etc.)
- Only the product name is kept (e.g., "JOANIAAS")
- Material names are excluded (e.g., "TWEED", "CORDUROY")

### Size Issues
- Both letter sizes (XS-XXL) and numeric sizes (25/32-32/32) are supported
- Each size gets its own row with individual quantity
- One Size products appear as single row

## Technical Details

### Parser Location
- **PDF Parser**: `/pages/api/parse-armedangels-pdf.ts`
- **CSV Parser**: `/pages/product-import.tsx` (parseArmedAngelsCSV function)

### Key Technologies
- `pdf-parse`: PDF text extraction
- `formidable`: Multipart form data handling
- CSV parsing with quoted field support

### Processing Steps
1. PDF upload via multipart form data
2. PDF to text conversion
3. Pattern matching for product rows
4. Multi-line size/quantity extraction
5. Metadata filtering (certifications, materials)
6. CSV generation with proper escaping

## Tips & Best Practices

✅ **Do:**
- Upload complete invoices with all items
- Check the CSV preview before downloading
- Use the import wizard fully (all steps)
- Review the mapping step carefully
- Test with smaller batches first

❌ **Don't:**
- Skip the preview step
- Manually edit generated CSVs (use converter)
- Upload incomplete or corrupted PDFs
- Import without testing first

## Support

For issues or questions:
1. Check the debug output in the converter
2. Review the CSV preview
3. Check the import wizard error messages
4. Consult the technical details section above

---

**Version**: 1.0  
**Last Updated**: October 28, 2025  
**Status**: ✅ Production Ready
