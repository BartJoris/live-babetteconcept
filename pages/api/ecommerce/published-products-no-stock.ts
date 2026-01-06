import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

interface ProductNoStock {
  id: number;
  name: string;
  display_name: string;
  product_tmpl_id: [number, string];
  qty_available: number;
  list_price: number;
  website_published: boolean;
  total_variants: number;
  variants_with_stock: number;
  variants_with_unlimited: number; // Varianten met -1 voorraad (onbeperkt)
  has_unlimited_stock: boolean; // Heeft het product varianten met -1 voorraad?
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ProductNoStock[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Haal alle gepubliceerde product templates op
    const publishedTemplates = await odooClient.searchRead<{
      id: number;
      name: string;
      website_published: boolean;
      list_price: number;
    }>(
      user.uid,
      user.password,
      'product.template',
      [['website_published', '=', true]],
      ['id', 'name', 'website_published', 'list_price']
    );

    if (publishedTemplates.length === 0) {
      return res.status(200).json([]);
    }

    const templateIds = publishedTemplates.map((t) => t.id);

    // Haal alle varianten op voor deze templates met voorraad informatie
    const variants = await odooClient.searchRead<{
      id: number;
      name: string;
      display_name: string;
      product_tmpl_id: [number, string];
      qty_available: number;
    }>(
      user.uid,
      user.password,
      'product.product',
      [['product_tmpl_id', 'in', templateIds]],
      ['id', 'name', 'display_name', 'product_tmpl_id', 'qty_available']
    );

    // Groepeer varianten per template en tel voorraad
    const templateStats = new Map<
      number,
      {
        template: typeof publishedTemplates[0];
        variants: typeof variants;
        totalQty: number;
        variantsWithStock: number;
        variantsWithUnlimited: number;
      }
    >();

    // Initialize template stats
    publishedTemplates.forEach((template) => {
      templateStats.set(template.id, {
        template,
        variants: [],
        totalQty: 0,
        variantsWithStock: 0,
        variantsWithUnlimited: 0,
      });
    });

    // Voeg varianten toe aan templates
    variants.forEach((variant) => {
      // Check if product_tmpl_id exists and is an array
      if (!variant.product_tmpl_id || !Array.isArray(variant.product_tmpl_id)) {
        console.warn('Variant has invalid product_tmpl_id:', variant);
        return;
      }
      
      const templateId = variant.product_tmpl_id[0];
      if (!templateId) {
        console.warn('Variant has no template ID:', variant);
        return;
      }
      
      const stats = templateStats.get(templateId);
      if (stats) {
        stats.variants.push(variant);
        const qty = variant.qty_available ?? 0;
        
        // -1 betekent onbeperkt voorraad
        if (qty === -1) {
          stats.variantsWithUnlimited++;
        } else {
          stats.totalQty += qty;
          if (qty > 0) {
            stats.variantsWithStock++;
          }
        }
      }
    });

    // Filter templates zonder voorraad (geen varianten met qty > 0, maar wel rekening houden met -1)
    const templatesWithoutStock: ProductNoStock[] = [];

    templateStats.forEach((stats) => {
      // Alleen tonen als er geen voorraad is (qty = 0) en geen onbeperkte voorraad (-1)
      if (stats.totalQty === 0 && stats.variantsWithUnlimited === 0 && stats.variants.length > 0) {
        // Normale producten zonder voorraad
        templatesWithoutStock.push({
          id: stats.template.id,
          name: stats.template.name || '',
          display_name: stats.template.name || '',
          product_tmpl_id: [stats.template.id, stats.template.name || ''],
          qty_available: 0,
          list_price: typeof stats.template.list_price === 'number' ? stats.template.list_price : 0,
          website_published: Boolean(stats.template.website_published),
          total_variants: stats.variants.length,
          variants_with_stock: stats.variantsWithStock,
          variants_with_unlimited: stats.variantsWithUnlimited,
          has_unlimited_stock: false,
        });
      } else if (stats.variantsWithUnlimited > 0 && stats.totalQty === 0) {
        // Producten met alleen -1 voorraad (onbeperkt) maar geen normale voorraad
        // Deze moeten apart worden getoond omdat -1 een speciale status is
        templatesWithoutStock.push({
          id: stats.template.id,
          name: stats.template.name || '',
          display_name: stats.template.name || '',
          product_tmpl_id: [stats.template.id, stats.template.name || ''],
          qty_available: -1, // Speciale waarde om aan te geven dat er -1 voorraad is
          list_price: typeof stats.template.list_price === 'number' ? stats.template.list_price : 0,
          website_published: Boolean(stats.template.website_published),
          total_variants: stats.variants.length,
          variants_with_stock: stats.variantsWithStock,
          variants_with_unlimited: stats.variantsWithUnlimited,
          has_unlimited_stock: true,
        });
      }
    });

    return res.status(200).json(templatesWithoutStock);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching published products without stock:', error);
    return res.status(500).json({ error: message });
  }
}

export default withAuth(handler);

