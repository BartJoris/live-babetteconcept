# Play Up Enhanced Import - Implementation Guide

## Overview

This document outlines the changes needed to implement dual-CSV Play Up import with full EAN data enrichment.

## Changes Required in `pages/product-import.tsx`

### 1. Add State for EAN Data (around line 177)

```typescript
const [eanProducts, setEANProducts] = useState<EANProduct[]>([]);

interface EANProduct {
  reference: string;
  description: string;
  size: string;
  colourCode: string;
  colourDescription: string;
  price: string;
  retailPrice: string;
  eanCode: string;
}
```

### 2. Add EAN CSV Upload Handler (after line 350)

```typescript
const handleEANFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    parseEANCSV(text);
  };
  reader.readAsText(file);
};

const parseEANCSV = (text: string) => {
  const lines = text.trim().split('\n');
  const products: EANProduct[] = [];
  
  // Skip first 2 lines ("Table 1" and headers)
  for (let i = 2; i < lines.length; i++) {
    const parts = lines[i].split(';').map(p => p.trim());
    
    if (parts.length >= 8 && parts[0] && parts[7]) {
      products.push({
        reference: parts[0],      // PA01/1AR11002
        description: parts[1],    // RIB LS T-SHIRT
        size: parts[2],           // 3M
        colourCode: parts[3],     // P6179
        colourDescription: parts[4], // WATERCOLOR
        price: parts[5],          // 12,39 €
        retailPrice: parts[6],    // 32,50 €
        eanCode: parts[7],        // 5608838575018
      });
    }
  }
  
  setEANProducts(products);
  console.log(`Loaded ${products.length} EAN products`);
};
```

### 3. Add Size Formatting Function (before parsePlayUpCSV)

```typescript
const formatSizeForOdoo = (eanSize: string): string => {
  // "3M" → "3 maand"
  if (eanSize.endsWith('M')) {
    const num = eanSize.slice(0, -1);
    return `${num} maand`;
  }
  
  // "3Y" → "3 jaar"
  if (eanSize.endsWith('Y')) {
    const num = eanSize.slice(0, -1);
    return `${num} jaar`;
  }
  
  // Adult sizes: "XS" → "XS - 34"
  const adultSizes: { [key: string]: string } = {
    'XS': 'XS - 34',
    'S': 'S - 36',
    'M': 'M - 38',
    'L': 'L - 40',
  };
  
  return adultSizes[eanSize] || eanSize;
};

const parsePrice = (priceStr: string): number => {
  // "12,39 €" → 12.39
  return parseFloat(priceStr.replace(/[€\s]/g, '').replace(',', '.')) || 0;
};
```

### 4. Update `parsePlayUpCSV()` Function (around line 669)

Find the section where variants are created (around line 752) and change:

```typescript
// OLD CODE (around line 752-759):
products[reference].variants.push({
  size: size,
  quantity: quantity,
  ean: '',
  sku: `${article}-${color}-${size}`,
  price: costPrice,
  rrp: price * 2.4,
});

// NEW CODE:
// Find all EAN matches for this article+color combination
const eanMatches = eanProducts.filter(ean => {
  const eanArticle = ean.reference.split('/')[1];
  return eanArticle === article && ean.colourCode === color;
});

// Find specific EAN for this size
const eanForSize = eanMatches.find(ean => ean.size === size);

products[reference].variants.push({
  size: formatSizeForOdoo(size),  // Convert "3M" → "3 maand"
  quantity: quantity,
  ean: eanForSize?.eanCode || '',  // EAN from retail list
  sku: eanForSize?.reference || `${article}-${color}-${size}`,  // PA01/1AR11002
  price: eanForSize ? parsePrice(eanForSize.price) : (websitePrice || price),
  rrp: eanForSize ? parsePrice(eanForSize.retailPrice) : (price * 2.4),
});

// Also update product color with description from first EAN match
if (eanMatches.length > 0 && !products[reference].color) {
  products[reference].color = eanMatches[0].colourDescription;  // "WATERCOLOR"
}
```

### 5. Add UI for EAN CSV Upload (around line 1819)

After the main CSV upload, add:

```tsx
{/* EAN Retail List Upload (Play UP only) */}
{selectedVendor === 'playup' && parsedProducts.length === 0 && (
  <div className="mt-4 border-t pt-4">
    <h3 className="text-lg font-semibold text-gray-900 mb-2">
      Optional: EAN Retail List
    </h3>
    <p className="text-sm text-gray-600 mb-3">
      Upload the full EAN retail list to auto-populate barcodes, SKUs, and accurate prices
    </p>
    <input
      type="file"
      accept=".csv"
      onChange={handleEANFileUpload}
      className="hidden"
      id="ean-csv-upload"
    />
    <label
      htmlFor="ean-csv-upload"
      className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
    >
      📊 Upload EAN Retail CSV
    </label>
    {eanProducts.length > 0 && (
      <p className="text-sm text-green-600 mt-2">
        ✅ Loaded {eanProducts.length} EAN entries
      </p>
    )}
  </div>
)}
```

### 6. Update Size Display in Variants Table

No changes needed - variants will automatically show "3 maand" instead of "3M" now.

## Testing Checklist

- [ ] Upload delivery CSV
- [ ] Upload EAN CSV
- [ ] Verify products have EAN codes populated
- [ ] Verify SKU is PA01/... format
- [ ] Verify prices from retail list
- [ ] Verify size shows "3 maand" not "3M"
- [ ] Verify adult sizes show "XS - 34" format
- [ ] Verify color shows "WATERCOLOR" not "P6179"
- [ ] Import to Odoo and verify all fields correct

## Example Data Flow

**Input (Delivery CSV):**
```
1AR11002,P6179,"RIB LS T-SHIRT",3 maand,1,12.39
```

**Matched (EAN CSV):**
```
PA01/1AR11002;RIB LS T-SHIRT;3M;P6179;WATERCOLOR;12,39€;32,50€;5608838575018
```

**Result:**
- Size: "3 maand" (formatted from "3M")
- EAN: "5608838575018"
- SKU: "PA01/1AR11002"
- Cost: €12.39
- Sell: €32.50
- Color: "WATERCOLOR"
- Maat: "MAAT Baby's"

## Location Guide

| Change | File | Approx Line | Section |
|--------|------|-------------|---------|
| Add EAN state | product-import.tsx | 177 | State declarations |
| Add EAN handler | product-import.tsx | 350 | File handlers |
| Add formatSizeForOdoo | product-import.tsx | 650 | Helper functions |
| Update parsePlayUpCSV | product-import.tsx | 752 | Variant creation |
| Add EAN upload UI | product-import.tsx | 1819 | Step 1 UI |

## Implementation Priority

Since this is a large file with many changes, I recommend:

1. **Test in small batches** - Implement one section at a time
2. **Keep backup** - Save current version before changes
3. **Test each step** - Verify EAN parsing before matching, etc.

---

**Ready to implement?** Switch to agent mode and I'll make all these changes automatically!

