import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  try {
    // Get credentials from session
    const { uid, password } = req.session.user!;

    console.log('🏷️ Fetching brands from MERK attribute...');

    // Step 1: Get MERK and Merk 1 attributes
    const merkAttributes = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.attribute',
      [['name', 'in', ['MERK', 'Merk 1']]],
      ['id', 'name'],
      10
    );

    if (!merkAttributes || merkAttributes.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'MERK or Merk 1 attributes not found' 
      });
    }

    console.log(`✅ Found ${merkAttributes.length} MERK attributes`);

    const merkAttributeIds = merkAttributes.map((attr) => attr.id);
    const attributeIdToName: Record<number, string> = {};
    merkAttributes.forEach((attr) => {
      attributeIdToName[attr.id] = attr.name;
    });

    // Step 2: Get all brand values for these attributes
    const brandValues = await odooClient.searchRead<{
      id: number;
      name: string;
      attribute_id: [number, string];
    }>(
      uid,
      password,
      'product.attribute.value',
      [['attribute_id', 'in', merkAttributeIds]],
      ['id', 'name', 'attribute_id'],
      500
    );

    console.log(`✅ Found ${brandValues.length} brand values`);

    // Format the brands with source information
    const brands = brandValues.map((brand) => ({
      id: brand.id,
      name: brand.name,
      source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
    })).sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      brands,
      summary: {
        total: brands.length,
        attributes: merkAttributes.map((a) => ({ id: a.id, name: a.name })),
      },
    });

  } catch (error) {
    console.error('Fetch brands error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch brands',
    });
  }
}

export default withAuth(handler);

