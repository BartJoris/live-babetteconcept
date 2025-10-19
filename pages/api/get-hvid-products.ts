import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get credentials from session
    const { uid, password } = req.session.user!;

    // Get Hvid brand value ID
    const hvidBrandValues = await odooClient.searchRead(
      uid,
      password,
      'product.attribute.value',
      [['name', '=', 'Hvid']],
      ['id', 'attribute_id']
    );

    // Get all HVID products (products with Hvid brand)
    const hvidProducts = await odooClient.searchRead<{
      id: number;
      name: string;
      categ_id: [number, string];
      attribute_line_ids: number[];
    }>(
      uid,
      password,
      'product.template',
      [['categ_id', 'ilike', 'Hvid']],
      ['id', 'name', 'categ_id', 'attribute_line_ids']
    );

    // Get attribute information for each product
    const productsWithAttrs = await Promise.all(
      hvidProducts.map(async (product) => {
        const attrLines = await odooClient.read<{
          attribute_id: [number, string];
          value_ids: number[];
        }>(
          uid,
          password,
          'product.template.attribute.line',
          product.attribute_line_ids,
          ['attribute_id', 'value_ids']
        );

        const attributes: Record<string, string[]> = {};
        for (const line of attrLines) {
          const attrName = line.attribute_id[1];
          
          // Get attribute values
          if (line.value_ids && line.value_ids.length > 0) {
            const values = await odooClient.read<{ name: string }>(
              uid,
              password,
              'product.attribute.value',
              line.value_ids,
              ['name']
            );
            attributes[attrName] = values.map((v) => v.name);
          }
        }

        return {
          ...product,
          attributes,
        };
      })
    );

    // Get default category
    const hvidCategory = await odooClient.searchRead<{
      id: number;
      name: string;
      complete_name: string;
    }>(
      uid,
      password,
      'product.category',
      [['complete_name', 'ilike', 'Hvid']],
      ['id', 'name', 'complete_name']
    );

    res.status(200).json({
      success: true,
      products: productsWithAttrs,
      hvidBrand: hvidBrandValues[0] || null,
      hvidCategory: hvidCategory[0] || null,
    });

  } catch (error) {
    console.error('Error fetching HVID products:', error);
    const err = error as { message?: string };
    res.status(500).json({ 
      error: 'Failed to fetch HVID products', 
      details: err.message 
    });
  }
}

export default withAuth(handler);

