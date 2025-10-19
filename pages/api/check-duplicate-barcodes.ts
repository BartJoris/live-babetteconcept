import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function callOdoo(uid: number, password: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
  const executeArgs: unknown[] = [ODOO_DB, uid, password, model, method, args];
  if (kwargs) executeArgs.push(kwargs);

  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: { service: 'object', method: 'execute_kw', args: executeArgs },
    id: Date.now(),
  };

  const response = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}


interface ProductMatch {
  barcode: string;
  products: Array<{
    id: number;
    name: string;
    default_code: string;
    type: string;
    list_price: number;
    categ_id: [number, string];
    qty_available?: number;
  }>;
  variants: Array<{
    id: number;
    name: string;
    default_code: string;
    product_tmpl_id: [number, string];
    list_price: number;
    qty_available?: number;
  }>;
}

interface CategorizedProduct {
  barcode: string;
  csvName: string;
  sku: string;
  quantity: number;
  costPrice: number;
  action: 'update_stock' | 'create_variant' | 'create_product';
  
  // For stock updates
  variantId?: number;
  templateId?: number;
  odooProductName?: string;
  currentStock?: number;
  
  // For variant creation
  baseProductId?: number;
  baseProductName?: string;
  detectedSize?: string;
  detectedColor?: string;
  attributes?: Array<{
    name: string;
    attributeId: number;
    values: string[];
    selectedValue?: string;
  }>;
  
  // For new products
  parsedProductName?: string;
  category?: { id: number; name: string };
  brand?: { id: number; name: string };
}

// Helper: Parse product info from CSV name
function parseProductInfo(csvName: string): { base: string; size: string | null; color: string | null } {
  // Pattern: "[SKU] ProductName (size/details, color)" or "[SKU] ProductName (details)"
  // Examples:
  // "[B036B_EAN ...] Booties (9-15 months, Powder)"
  // "[EAN ...] Beanie Fonzie ADULT (Artichoke)"
  
  // Remove SKU part
  const cleanName = csvName.replace(/\[.*?\]\s*/, '');
  
  let base = cleanName;
  let size: string | null = null;
  let color: string | null = null;
  
  // Extract content in parentheses
  const parensMatch = cleanName.match(/^([^(]+)\(([^)]+)\)/);
  if (parensMatch) {
    base = parensMatch[1].trim();
    const details = parensMatch[2];
    
    // Split by comma to get size and color
    const parts = details.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      size = parts[0];
      color = parts[1];
    } else if (parts.length === 1) {
      // Could be just color (e.g., "Artichoke") or just size
      // If it contains "months" or "years" or size indicators, it's a size
      if (parts[0].match(/months|years|y\b|m\b|M\b|L\b|XL\b|Size/i)) {
        size = parts[0];
      } else {
        color = parts[0];
      }
    }
  }
  
  return { base, size, color };
}

// Helper: Find matching base products
function findBaseProduct(baseName: string, hvidProducts: any[]): any | null {
  const baseLower = baseName.toLowerCase();
  
  // First try exact match or very close match
  for (const product of hvidProducts) {
    const productNameLower = product.name.toLowerCase();
    
    // Exact substring match (either direction)
    if (productNameLower.includes(baseLower) || baseLower.includes(productNameLower)) {
      console.log(`  ✓ Exact match: "${baseName}" → "${product.name}"`);
      return product;
    }
  }
  
  // Then try matching all significant words (must match ALL words, not just one)
  const baseWords = baseLower.split(' ').filter(w => w.length > 3);
  
  if (baseWords.length === 0) {
    return null; // No significant words to match
  }
  
  for (const product of hvidProducts) {
    const productNameLower = product.name.toLowerCase();
    
    // Check if ALL significant words from base name are in product name
    const allWordsMatch = baseWords.every(word => productNameLower.includes(word));
    
    if (allWordsMatch) {
      console.log(`  ✓ All-words match: "${baseName}" (${baseWords.join(', ')}) → "${product.name}"`);
      return product;
    }
  }
  
  console.log(`  ✗ No match found for "${baseName}"`);
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { barcodes, products, uid, password } = req.body as {
      barcodes: string[];
      products?: Array<{
        barcode: string;
        sku: string;
        name: string;
        quantity: number;
        price: number;
        total: number;
      }>;
      uid: string;
      password: string;
    };

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing Odoo credentials' });
    }

    if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of barcodes' });
    }

    const results: ProductMatch[] = [];
    const duplicates: { [barcode: string]: ProductMatch } = {};
    
    // Get all HVID products for matching
    const hvidProducts = await callOdoo(
      parseInt(uid),
      password,
      'product.template',
      'search_read',
      [
        [['categ_id', 'ilike', 'Hvid']],
        ['id', 'name']
      ]
    );

    // Get Hvid category and brand
    const hvidCategory = await callOdoo(
      parseInt(uid),
      password,
      'product.category',
      'search_read',
      [
        [['complete_name', 'ilike', 'Hvid']],
        ['id', 'name', 'complete_name']
      ]
    );

    const hvidBrandValues = await callOdoo(
      parseInt(uid),
      password,
      'product.attribute.value',
      'search_read',
      [
        [['name', '=', 'Hvid']],
        ['id']
      ]
    );

    const defaultCategory = hvidCategory && hvidCategory.length > 0 
      ? { id: hvidCategory[0].id, name: hvidCategory[0].complete_name }
      : { id: 103, name: 'All / Hvid' };

    const defaultBrand = hvidBrandValues && hvidBrandValues.length > 0
      ? { id: hvidBrandValues[0].id, name: 'Hvid' }
      : null;

    // Categorized results
    const categorizedProducts: CategorizedProduct[] = [];
    
    // Cache to avoid re-fetching attributes for the same base product
    const attributeCache: { [productId: number]: Array<{ name: string; attributeId: number; values: string[] }> } = {};

    // Check each barcode and categorize
    for (let i = 0; i < barcodes.length; i++) {
      try {
        const barcode = barcodes[i];
        if (!barcode || barcode.trim() === '') continue;

        const cleanBarcode = barcode.trim();
        const csvProduct = products?.find(p => p.barcode === cleanBarcode);
        
        if (!csvProduct) {
          console.log(`Skipping barcode ${cleanBarcode} - not found in products array`);
          continue;
        }

        console.log(`\nProcessing barcode ${cleanBarcode}: ${csvProduct.name}`);

        // Invoice only contains cost price (wholesale price)
        // Sale price should remain unchanged in Odoo
        const costPrice = csvProduct.price;

        // Search in product.template (main products)
        const productTemplates = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'search_read',
          [
            [['barcode', '=', cleanBarcode]],
            ['id', 'name', 'default_code', 'type', 'list_price', 'categ_id', 'qty_available']
          ]
        );

        // Search in product.product (variants)
        const productVariants = await callOdoo(
          parseInt(uid),
          password,
          'product.product',
          'search_read',
          [
            [['barcode', '=', cleanBarcode]],
            ['id', 'name', 'default_code', 'product_tmpl_id', 'list_price', 'qty_available']
          ]
        );

        const match: ProductMatch = {
          barcode: cleanBarcode,
          products: productTemplates || [],
          variants: productVariants || []
        };

        results.push(match);

        const totalMatches = (productTemplates?.length || 0) + (productVariants?.length || 0);
        
        if (totalMatches > 1) {
          duplicates[cleanBarcode] = match;
        }

        // Parse product info from CSV name
        const { base, size, color } = parseProductInfo(csvProduct.name);

        // Categorize the product
        if (productVariants && productVariants.length > 0) {
          // Product exists - UPDATE STOCK
          const variant = productVariants[0];
          categorizedProducts.push({
            barcode: cleanBarcode,
            csvName: csvProduct.name,
            sku: csvProduct.sku,
            quantity: csvProduct.quantity,
            costPrice,
            action: 'update_stock',
            variantId: variant.id,
            templateId: variant.product_tmpl_id[0],
            odooProductName: variant.name,
            currentStock: variant.qty_available || 0,
          });
        } else if (productTemplates && productTemplates.length > 0) {
          // Template exists but no variant with this barcode - UPDATE STOCK on template's first variant
          const template = productTemplates[0];
          
          // Get template's variants
          const templateVariants = await callOdoo(
            parseInt(uid),
            password,
            'product.product',
            'search_read',
            [
              [['product_tmpl_id', '=', template.id]],
              ['id', 'name', 'qty_available']
            ]
          );

          if (templateVariants && templateVariants.length > 0) {
            const variant = templateVariants[0];
            categorizedProducts.push({
              barcode: cleanBarcode,
              csvName: csvProduct.name,
              sku: csvProduct.sku,
              quantity: csvProduct.quantity,
              costPrice,
              action: 'update_stock',
              variantId: variant.id,
              templateId: template.id,
              odooProductName: template.name,
              currentStock: variant.qty_available || 0,
            });
          }
        } else {
          // No exact match - check for base product match
          const baseProduct = findBaseProduct(base, hvidProducts);

          if (baseProduct) {
            // Check cache first
            let attributes: Array<{ name: string; attributeId: number; values: string[] }>;
            
            if (attributeCache[baseProduct.id]) {
              console.log(`Using cached attributes for ${baseProduct.name}`);
              attributes = attributeCache[baseProduct.id];
            } else {
              // Get existing attribute values for this product
              console.log(`Fetching attributes for base product: ${baseProduct.name} (ID: ${baseProduct.id})`);
              
              const attributeLines = await callOdoo(
                parseInt(uid),
                password,
                'product.template.attribute.line',
                'search_read',
                [
                  [['product_tmpl_id', '=', baseProduct.id]],
                  ['attribute_id', 'value_ids']
                ]
              );

              console.log(`Found ${attributeLines.length} attribute lines for ${baseProduct.name}`);

              // Fetch ALL attributes and their values (simpler approach)
              attributes = [];

              for (const line of attributeLines) {
                const attrId = line.attribute_id[0];
                const attrName = (line.attribute_id[1] || '').trim();
                
                // Skip MERK attribute (we don't need to show brand selection)
                if (attrName.toLowerCase().includes('merk')) {
                  console.log(`  Skipping MERK attribute: ${attrName}`);
                  continue;
                }

                console.log(`  Attribute: "${attrName}" (ID ${attrId}), Values: ${line.value_ids?.length || 0}`);
                
                let attrValues: string[] = [];
                if (line.value_ids && line.value_ids.length > 0) {
                  const values = await callOdoo(
                    parseInt(uid),
                    password,
                    'product.attribute.value',
                    'read',
                    [line.value_ids, ['name']]
                  );
                  attrValues = values.map((v: any) => v.name);
                  console.log(`    → Values: ${attrValues.join(', ')}`);
                }

                attributes.push({
                  name: attrName,
                  attributeId: attrId,
                  values: attrValues
                });
              }

              // Cache the results
              attributeCache[baseProduct.id] = attributes;
              console.log(`Cached attributes for ${baseProduct.name}: ${attributes.length} attributes`);
            }

            // Auto-match detected size/color to attribute values
            const attributesWithSelection = attributes.map(attr => {
              const attrNameLower = attr.name.toLowerCase();
              let selectedValue = '';
              
              // Match size
              if ((attrNameLower.includes('maat') || attrNameLower.includes('size')) && size) {
                // Normalize size strings for better matching
                const normalizeSize = (s: string) => {
                  return s.toLowerCase()
                    .replace(/\s*months?\s*/gi, 'm')
                    .replace(/\s*years?\s*/gi, 'y')
                    .replace(/\s+/g, '')
                    .replace(/-/g, '-');
                };
                
                const normalizedSize = normalizeSize(size);
                
                // Try to find exact match or close match
                const sizeMatch = attr.values.find(v => {
                  const normalizedValue = normalizeSize(v);
                  return normalizedValue === normalizedSize ||
                         v.toLowerCase() === size.toLowerCase() ||
                         v.toLowerCase().includes(size.toLowerCase()) ||
                         size.toLowerCase().includes(v.toLowerCase());
                });
                
                if (sizeMatch) {
                  selectedValue = sizeMatch;
                  console.log(`  Auto-selected size: ${selectedValue} (matched from "${size}") for attribute ${attr.name}`);
                } else {
                  // Use detected size as-is (might create new value)
                  selectedValue = size;
                  console.log(`  Using new size value: ${selectedValue} for attribute ${attr.name}`);
                }
              }
              
              // Match color
              if ((attrNameLower.includes('kleur') || attrNameLower.includes('color') || attrNameLower.includes('colour')) && color) {
                // Try to find exact match or close match
                const colorMatch = attr.values.find(v => 
                  v.toLowerCase() === color.toLowerCase() ||
                  v.toLowerCase().includes(color.toLowerCase()) ||
                  color.toLowerCase().includes(v.toLowerCase())
                );
                if (colorMatch) {
                  selectedValue = colorMatch;
                  console.log(`  Auto-selected color: ${selectedValue} for attribute ${attr.name}`);
                } else {
                  // Use detected color as-is (might create new value)
                  selectedValue = color;
                  console.log(`  Using new color value: ${selectedValue} for attribute ${attr.name}`);
                }
              }
              
              return {
                ...attr,
                selectedValue
              };
            });

            // Base product exists - CREATE VARIANT
            categorizedProducts.push({
              barcode: cleanBarcode,
              csvName: csvProduct.name,
              sku: csvProduct.sku,
              quantity: csvProduct.quantity,
              costPrice,
              action: 'create_variant',
              baseProductId: baseProduct.id,
              baseProductName: baseProduct.name,
              detectedSize: size || '',
              detectedColor: color || '',
              attributes: attributesWithSelection,
            });
          } else {
            // No match - CREATE NEW PRODUCT
            console.log(`No base product match found for "${base}" - will create new product`);
            categorizedProducts.push({
              barcode: cleanBarcode,
              csvName: csvProduct.name,
              sku: csvProduct.sku,
              quantity: csvProduct.quantity,
              costPrice,
              action: 'create_product',
              parsedProductName: base,
              detectedSize: size || '',
              detectedColor: color || '',
              category: defaultCategory,
              brand: defaultBrand || undefined,
            });
          }
        }
      } catch (productError: any) {
        const errorBarcode = barcodes[i] || 'unknown';
        console.error(`Error processing barcode ${errorBarcode}:`, productError.message);
        console.error('Error stack:', productError.stack);
        // Continue with next product instead of failing entire batch
      }
    }

    // Find barcodes that exist multiple times in our input list
    const barcodeCounts: { [key: string]: number } = {};
    barcodes.forEach(b => {
      const clean = b.trim();
      if (clean) {
        barcodeCounts[clean] = (barcodeCounts[clean] || 0) + 1;
      }
    });

    const inputDuplicates = Object.entries(barcodeCounts)
      .filter(([, count]) => count > 1)
      .map(([barcode, count]) => ({ barcode, count }));

    // Separate categorized products by action
    const toUpdateStock = categorizedProducts.filter(p => p.action === 'update_stock');
    const toCreateVariant = categorizedProducts.filter(p => p.action === 'create_variant');
    const toCreateProduct = categorizedProducts.filter(p => p.action === 'create_product');

    const response = {
      success: true,
      totalBarcodes: barcodes.filter(b => b && b.trim()).length,
      uniqueBarcodes: Object.keys(barcodeCounts).length,
      results,
      duplicates: Object.values(duplicates),
      duplicateCount: Object.keys(duplicates).length,
      inputDuplicates,
      
      // Categorized products
      categorized: categorizedProducts,
      toUpdateStock,
      toCreateVariant,
      toCreateProduct,
      
      // Defaults for UI
      defaultCategory,
      defaultBrand: defaultBrand || null,
    };

    console.log(`Sending response with ${toUpdateStock.length} updates, ${toCreateVariant.length} variants, ${toCreateProduct.length} new products`);
    
    return res.status(200).json(response);

  } catch (error: any) {
    console.error('=== API ERROR ===');
    console.error('Error checking barcodes:', error);
    console.error('Error message:', error?.message || 'No message');
    console.error('Error stack:', error?.stack || 'No stack');
    console.error('=================');
    
    // Always return JSON, even on error
    return res.status(500).json({ 
      success: false,
      error: 'Failed to check barcodes', 
      details: error?.message || String(error) || 'Unknown error',
      errorType: error?.constructor?.name || 'Error'
    });
  }
}

