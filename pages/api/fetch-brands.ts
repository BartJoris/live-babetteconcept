import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse
) {
  try {
    const { uid, password } = req.session.user!;

    // Clothing uses MERK (+ legacy Merk 1). Books use Uitgeverij.
    const body = (req.body || {}) as { attributes?: string[] };
    const requested = Array.isArray(body.attributes)
      ? body.attributes.map((a) => String(a).trim()).filter(Boolean)
      : [];
    const attributeNames =
      requested.length > 0 ? requested : ['MERK', 'Merk 1'];

    console.log(`🏷️ Fetching brands from attributes: ${attributeNames.join(', ')}`);

    const merkAttributes = await odooClient.searchRead<{ id: number; name: string }>(
      uid,
      password,
      'product.attribute',
      [['name', 'in', attributeNames]],
      ['id', 'name'],
      10
    );

    if (!merkAttributes || merkAttributes.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Attribute(s) not found: ${attributeNames.join(', ')}`,
      });
    }

    console.log(`✅ Found ${merkAttributes.length} brand attributes`);

    const merkAttributeIds = merkAttributes.map((attr) => attr.id);
    const attributeIdToName: Record<number, string> = {};
    merkAttributes.forEach((attr) => {
      attributeIdToName[attr.id] = attr.name;
    });

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
      2000
    );

    console.log(`✅ Found ${brandValues.length} brand values`);

    const brands = brandValues
      .map((brand) => ({
        id: brand.id,
        name: brand.name,
        source: attributeIdToName[brand.attribute_id[0]] || 'Unknown',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

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
