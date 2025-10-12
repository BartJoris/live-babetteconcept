import type { NextApiRequest, NextApiResponse } from 'next';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

type ProductWithIssue = {
  productId: number;
  templateId: number;
  productName: string;
  templateName: string;
  variantName: string;
  currentStock: number;
  costPrice: number;
  sellPrice: number;
  orphanedBrandId?: number;
  hasBrand: boolean;
  brandName?: string;
  attributeSource?: string;
  suggestedBrandName?: string; // Extracted from product name
  suggestedBrandId?: number; // Matched brand ID from existing brands
  suggestedBrandSource?: string; // MERK or Merk 1
  matchConfidence?: 'exact' | 'fuzzy' | 'none';
};

type BrandSuggestionGroup = {
  suggestedBrandName: string;
  matchedBrandId: number | null;
  matchedBrandName: string | null;
  matchedBrandSource: string | null;
  matchConfidence: 'exact' | 'fuzzy' | 'none';
  products: ProductWithIssue[];
  totalStock: number;
};

type BrandDiagnosticsResponse = {
  productsWithoutBrand: ProductWithIssue[];
  productsWithOrphanedBrand: ProductWithIssue[];
  brandSuggestions: BrandSuggestionGroup[];
  duplicateBrandNames: Array<{
    canonicalName: string;
    variants: Array<{ id: number; name: string; source: string }>;
    totalProducts: number;
  }>;
  validBrands: Array<{ id: number; name: string; source: string; productCount: number }>;
  attributeIds: Record<number, string>; // 18 -> 'MERK', 7 -> 'Merk 1'
  summary: {
    totalProducts: number;
    productsWithBrand: number;
    productsWithoutBrand: number;
    productsWithOrphanedBrand: number;
    totalBrands: number;
    duplicateBrandGroups: number;
    productsWithSuggestions: number;
    productsWithExactMatch: number;
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, password } = req.body;

  if (!uid || !password) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    console.log('🔍 Running brand diagnostics...');

    // STEP 1: Get MERK and Merk 1 attributes
    const merkAttributePayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.attribute',
          'search_read',
          [[['name', 'in', ['MERK', 'Merk 1']]]],
          { fields: ['id', 'name'], limit: 10 },
        ],
      },
      id: Date.now(),
    };
    const merkAttrRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merkAttributePayload),
    });
    const merkAttrJson = await merkAttrRes.json();
    const merkAttributes = merkAttrJson.result || [];
    
    if (!merkAttributes.length) {
      return res.status(404).json({ error: 'MERK or Merk 1 attributes not found' });
    }
    
    const merkAttributeIds = merkAttributes.map((attr: { id: number; name: string }) => attr.id);
    const attributeIdToName: Record<number, string> = {};
    merkAttributes.forEach((attr: { id: number; name: string }) => {
      attributeIdToName[attr.id] = attr.name;
    });

    // STEP 2: Get all brand values
    const brandValuesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.attribute.value',
          'search_read',
          [[['attribute_id', 'in', merkAttributeIds]]],
          { fields: ['id', 'name', 'attribute_id'], limit: 500 },
        ],
      },
      id: Date.now(),
    };
    const brandValuesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brandValuesPayload),
    });
    const brandValuesJson = await brandValuesRes.json();
    const allBrands = brandValuesJson.result || [];

    const brandMap: Record<number, { name: string; source: string }> = {};
    const validBrandIds = new Set<number>();
    
    allBrands.forEach((brand: { id: number; name: string; attribute_id: [number, string] }) => {
      brandMap[brand.id] = {
        name: brand.name,
        source: attributeIdToName[brand.attribute_id[0]] || 'Unknown Source',
      };
      validBrandIds.add(brand.id);
    });

    // Detect duplicates (case-insensitive)
    const brandNameGroups: Record<string, Array<{ id: number; name: string; source: string }>> = {};
    allBrands.forEach((brand: { id: number; name: string; attribute_id: [number, string] }) => {
      const normalizedName = brand.name.trim().toLowerCase();
      if (!brandNameGroups[normalizedName]) {
        brandNameGroups[normalizedName] = [];
      }
      brandNameGroups[normalizedName].push({
        id: brand.id,
        name: brand.name,
        source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
      });
    });

    const duplicateBrandNames = Object.entries(brandNameGroups)
      .filter(([, variants]) => variants.length > 1)
      .map(([, variants]) => ({
        canonicalName: variants[0].name,
        variants,
        totalProducts: 0, // Will be filled later
      }));

    // STEP 3: Get all product templates
    const productTemplatesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.template',
          'search_read',
          [[]],
          { fields: ['id', 'name', 'attribute_line_ids'], limit: 10000 },
        ],
      },
      id: Date.now(),
    };
    const productTemplatesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productTemplatesPayload),
    });
    const productTemplatesJson = await productTemplatesRes.json();
    const productTemplates = productTemplatesJson.result || [];

    const allAttributeLineIds: number[] = [];
    productTemplates.forEach((tmpl: { id: number; attribute_line_ids?: number[] }) => {
      if (tmpl.attribute_line_ids && Array.isArray(tmpl.attribute_line_ids)) {
        allAttributeLineIds.push(...tmpl.attribute_line_ids);
      }
    });

    // STEP 4: Get attribute lines
    const attributeLinesPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.template.attribute.line',
          'search_read',
          [[['id', 'in', allAttributeLineIds], ['attribute_id', 'in', merkAttributeIds]]],
          { fields: ['id', 'attribute_id', 'value_ids', 'product_tmpl_id'], limit: 20000 },
        ],
      },
      id: Date.now(),
    };
    const attributeLinesRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attributeLinesPayload),
    });
    const attributeLinesJson = await attributeLinesRes.json();
    const attributeLines = attributeLinesJson.result || [];

    const templateToBrand: Record<number, { brandId: number; attributeId: number }> = {};
    attributeLines.forEach((line: { product_tmpl_id: [number, string]; value_ids?: number[]; attribute_id: [number, string] }) => {
      const tmplId = line.product_tmpl_id[0];
      if (line.value_ids && line.value_ids.length > 0) {
        templateToBrand[tmplId] = {
          brandId: line.value_ids[0],
          attributeId: line.attribute_id[0],
        };
      }
    });

    // STEP 5: Get all product variants
    const productVariantsPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          ODOO_DB,
          uid,
          password,
          'product.product',
          'search_read',
          [[]],
          { 
            fields: ['id', 'product_tmpl_id', 'name', 'display_name', 'standard_price', 'list_price', 'qty_available'], 
            limit: 20000 
          },
        ],
      },
      id: Date.now(),
    };
    const productVariantsRes = await fetch(ODOO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productVariantsPayload),
    });
    const productVariantsJson = await productVariantsRes.json();
    const productVariants = productVariantsJson.result || [];

    // Helper: Extract brand name from product name
    const extractBrandFromProductName = (productName: string): string | null => {
      // Pattern: "BrandName - Product Description"
      const parts = productName.split(' - ');
      if (parts.length > 1) {
        const extracted = parts[0].trim();
        // Filter out common non-brand prefixes
        if (extracted.length > 1 && !extracted.match(/^(the|a|an)$/i)) {
          return extracted;
        }
      }
      return null;
    };

    // Helper: Find matching brand (case-insensitive)
    const findMatchingBrand = (suggestedName: string): { 
      id: number; 
      name: string; 
      source: string;
      confidence: 'exact' | 'fuzzy';
    } | null => {
      const normalized = suggestedName.trim().toLowerCase();
      
      // Try exact match first
      for (const brand of allBrands as Array<{ id: number; name: string; attribute_id: [number, string] }>) {
        if (brand.name.trim().toLowerCase() === normalized) {
          return {
            id: brand.id,
            name: brand.name,
            source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
            confidence: 'exact',
          };
        }
      }
      
      // Try fuzzy match (contains or is contained)
      for (const brand of allBrands as Array<{ id: number; name: string; attribute_id: [number, string] }>) {
        const brandNorm = brand.name.trim().toLowerCase();
        if (brandNorm.includes(normalized) || normalized.includes(brandNorm)) {
          return {
            id: brand.id,
            name: brand.name,
            source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
            confidence: 'fuzzy',
          };
        }
      }
      
      return null;
    };

    // Analyze products
    const productsWithoutBrand: ProductWithIssue[] = [];
    const productsWithOrphanedBrand: ProductWithIssue[] = [];
    const brandProductCounts: Record<number, number> = {};

    productVariants.forEach((variant: { 
      id: number; 
      product_tmpl_id: [number, string]; 
      name: string; 
      display_name: string;
      standard_price?: number;
      list_price?: number;
      qty_available?: number;
    }) => {
      const tmplId = variant.product_tmpl_id[0];
      const tmplName = variant.product_tmpl_id[1];
      const brandInfo = templateToBrand[tmplId];

      const productIssue: ProductWithIssue = {
        productId: variant.id,
        templateId: tmplId,
        productName: variant.name,
        templateName: tmplName,
        variantName: variant.display_name,
        currentStock: variant.qty_available || 0,
        costPrice: variant.standard_price || 0,
        sellPrice: variant.list_price || 0,
        hasBrand: !!brandInfo,
      };

      if (!brandInfo) {
        // Product has no brand assigned - try to suggest one
        const suggestedBrand = extractBrandFromProductName(tmplName);
        if (suggestedBrand) {
          productIssue.suggestedBrandName = suggestedBrand;
          const match = findMatchingBrand(suggestedBrand);
          if (match) {
            productIssue.suggestedBrandId = match.id;
            productIssue.suggestedBrandSource = match.source;
            productIssue.matchConfidence = match.confidence;
          } else {
            productIssue.matchConfidence = 'none';
          }
        }
        productsWithoutBrand.push(productIssue);
      } else {
        const brandId = brandInfo.brandId;
        const brandData = brandMap[brandId];
        
        if (!brandData) {
          // Brand ID exists but is orphaned (deleted brand value)
          productIssue.orphanedBrandId = brandId;
          productIssue.hasBrand = false;
          productsWithOrphanedBrand.push(productIssue);
        } else {
          // Valid brand
          productIssue.brandName = brandData.name;
          productIssue.attributeSource = brandData.source;
          brandProductCounts[brandId] = (brandProductCounts[brandId] || 0) + 1;
        }
      }
    });

    // Count products per duplicate brand group
    duplicateBrandNames.forEach(group => {
      group.totalProducts = group.variants.reduce((sum, variant) => 
        sum + (brandProductCounts[variant.id] || 0), 0
      );
    });

    // Create valid brands list with product counts
    const validBrands = allBrands.map((brand: { id: number; name: string; attribute_id: [number, string] }) => ({
      id: brand.id,
      name: brand.name,
      source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
      productCount: brandProductCounts[brand.id] || 0,
    }));

    // Group products without brand by suggestion
    const brandSuggestionGroups: Record<string, BrandSuggestionGroup> = {};
    
    productsWithoutBrand.forEach(product => {
      const groupKey = product.suggestedBrandName || '_no_suggestion';
      
      if (!brandSuggestionGroups[groupKey]) {
        brandSuggestionGroups[groupKey] = {
          suggestedBrandName: product.suggestedBrandName || 'Geen suggestie',
          matchedBrandId: product.suggestedBrandId || null,
          matchedBrandName: product.suggestedBrandId 
            ? brandMap[product.suggestedBrandId]?.name || null 
            : null,
          matchedBrandSource: product.suggestedBrandSource || null,
          matchConfidence: product.matchConfidence || 'none',
          products: [],
          totalStock: 0,
        };
      }
      
      brandSuggestionGroups[groupKey].products.push(product);
      brandSuggestionGroups[groupKey].totalStock += product.currentStock;
    });

    const brandSuggestions = Object.values(brandSuggestionGroups)
      .sort((a, b) => b.products.length - a.products.length);
    
    const productsWithExactMatch = productsWithoutBrand.filter(p => p.matchConfidence === 'exact').length;

    const response: BrandDiagnosticsResponse = {
      productsWithoutBrand,
      productsWithOrphanedBrand,
      brandSuggestions,
      duplicateBrandNames,
      validBrands,
      attributeIds: attributeIdToName,
      summary: {
        totalProducts: productVariants.length,
        productsWithBrand: productVariants.length - productsWithoutBrand.length - productsWithOrphanedBrand.length,
        productsWithoutBrand: productsWithoutBrand.length,
        productsWithOrphanedBrand: productsWithOrphanedBrand.length,
        totalBrands: allBrands.length,
        duplicateBrandGroups: duplicateBrandNames.length,
        productsWithSuggestions: productsWithoutBrand.filter(p => p.suggestedBrandName).length,
        productsWithExactMatch: productsWithExactMatch,
      },
    };

    console.log('✅ Brand diagnostics completed!');
    console.log(`   Total products: ${response.summary.totalProducts}`);
    console.log(`   Without brand: ${response.summary.productsWithoutBrand}`);
    console.log(`   Orphaned brands: ${response.summary.productsWithOrphanedBrand}`);
    console.log(`   Duplicate brand groups: ${response.summary.duplicateBrandGroups}`);

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

