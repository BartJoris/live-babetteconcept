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

interface BatchSearchRequest {
  references: string[]; // Array of references to search for
  uid: string;
  password: string;
  includeDescription?: boolean;
}

interface ProductSearchResult {
  reference: string;
  templateId: number | null;
  found: boolean;
  matchedField: string | null;
  description: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { references, uid, password, includeDescription } = req.body as BatchSearchRequest;

    if (!references || !Array.isArray(references) || references.length === 0) {
      return res.status(400).json({ error: 'Missing or empty references array' });
    }

    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing required fields: uid, password' });
    }

    console.log(`🔍 Batch searching for ${references.length} products...`);

    const fields = includeDescription 
      ? ['id', 'name', 'default_code', 'description']
      : ['id', 'name', 'default_code'];

    // Initialize results map
    const results: Record<string, ProductSearchResult> = {};
    references.forEach(ref => {
      results[ref] = {
        reference: ref,
        templateId: null,
        found: false,
        matchedField: null,
        description: null,
      };
    });

    try {
      // Strategy 1: Batch search by default_code (exact match)
      // Search for all references at once using 'in' operator
      const defaultCodeResults = await callOdoo(
        parseInt(uid),
        password,
        'product.template',
        'search_read',
        [[['default_code', 'in', references]]],
        { fields }
      );

      // Map results by default_code
      const foundByDefaultCode = new Map<number, any>();
      defaultCodeResults.forEach((product: any) => {
        if (product.default_code && results[product.default_code]) {
          results[product.default_code].templateId = product.id;
          results[product.default_code].found = true;
          results[product.default_code].matchedField = 'default_code';
          results[product.default_code].description = product.description || null;
          foundByDefaultCode.set(product.id, product);
          console.log(`  ✅ Matched ${product.default_code} via default_code: Template ID ${product.id}`);
        } else if (product.default_code) {
          console.log(`  ⚠️ Found product with default_code ${product.default_code} but not in search list`);
        }
      });

      // Find references that weren't found by default_code
      const notFoundByDefaultCode = references.filter(ref => !results[ref].found);

      if (notFoundByDefaultCode.length > 0) {
        // Strategy 2: Batch search by description (exact match)
        const descriptionResults = await callOdoo(
          parseInt(uid),
          password,
          'product.template',
          'search_read',
          [[['description', 'in', notFoundByDefaultCode]]],
          { fields }
        );

        descriptionResults.forEach((product: any) => {
          const desc = product.description || '';
          // Check which reference(s) match this description
          notFoundByDefaultCode.forEach(ref => {
            if (desc === ref || desc.startsWith(ref + '|')) {
              if (!results[ref].found) {
                results[ref].templateId = product.id;
                results[ref].found = true;
                results[ref].matchedField = 'description';
                results[ref].description = desc;
                console.log(`  ✅ Matched ${ref} via description (exact): Template ID ${product.id}`);
              }
            }
          });
        });

        // Find references still not found
        const stillNotFound = notFoundByDefaultCode.filter(ref => !results[ref].found);

        if (stillNotFound.length > 0) {
          // Strategy 3: Batch search by description (partial match using ilike)
          // Search in parallel batches for better performance
          const BATCH_SIZE = 10; // Process 10 searches in parallel
          const partialSearchBatches: string[][] = [];
          for (let i = 0; i < stillNotFound.length; i += BATCH_SIZE) {
            partialSearchBatches.push(stillNotFound.slice(i, i + BATCH_SIZE));
          }

          for (const batch of partialSearchBatches) {
            const partialSearchPromises = batch.map(async (ref) => {
              try {
                const result = await callOdoo(
                  parseInt(uid),
                  password,
                  'product.template',
                  'search_read',
                  [[['description', 'ilike', `%${ref}%`]]],
                  { fields, limit: 1 }
                );

                if (result && result.length > 0) {
                  const desc = result[0].description || '';
                  const name = result[0].name || '';
                  // Check if reference is in description OR name (for Wynken products stored as "Wynken - {style} - {colour}")
                  if (desc.includes(ref) || name.includes(ref)) {
                    console.log(`  ✅ Matched ${ref} via description/name (partial): Template ID ${result[0].id}, name: ${name}`);
                    return {
                      reference: ref,
                      templateId: result[0].id,
                      matchedField: desc.includes(ref) ? 'description (partial)' : 'name (partial)',
                      description: desc,
                    };
                  }
                }
              } catch (error) {
                console.error(`Error searching for ${ref}:`, error);
              }
              return null;
            });

            const partialResults = await Promise.all(partialSearchPromises);
            partialResults.forEach(result => {
              if (result && !results[result.reference].found) {
                results[result.reference].templateId = result.templateId;
                results[result.reference].found = true;
                results[result.reference].matchedField = result.matchedField;
                results[result.reference].description = result.description;
              }
            });
          }

          // Find references still not found
          const finalNotFound = stillNotFound.filter(ref => !results[ref].found);

          if (finalNotFound.length > 0) {
            // Strategy 4: Batch search by name (contains)
            // Also process in parallel batches
            const nameSearchBatches: string[][] = [];
            for (let i = 0; i < finalNotFound.length; i += BATCH_SIZE) {
              nameSearchBatches.push(finalNotFound.slice(i, i + BATCH_SIZE));
            }

            for (const batch of nameSearchBatches) {
              const nameSearchPromises = batch.map(async (ref) => {
                try {
                  // Search in name field - this is important for Wynken products
                  // which are stored as "Wynken - {style} - {colour}"
                  const result = await callOdoo(
                    parseInt(uid),
                    password,
                    'product.template',
                    'search_read',
                    [[['name', 'ilike', `%${ref}%`]]],
                    { fields, limit: 1 }
                  );

                  if (result && result.length > 0) {
                    // Verify the match is relevant (name contains the reference)
                    // For "Wynken - {style}" searches, check if name starts with it or contains it
                    const name = result[0].name || '';
                    const nameLower = name.toLowerCase();
                    const refLower = ref.toLowerCase();
                    
                    // Check if name contains reference (case-insensitive)
                    // Also handle cases where ref is "Wynken - STYLE" and name is "Wynken - STYLE - COLOUR"
                    if (nameLower.includes(refLower) || nameLower.startsWith(refLower)) {
                      console.log(`  ✅ Matched ${ref} via name: Template ID ${result[0].id}, name: ${name}`);
                      return {
                        reference: ref,
                        templateId: result[0].id,
                        matchedField: 'name',
                        description: result[0].description || null,
                      };
                    } else {
                      console.log(`  ⚠️ Name search found product but name doesn't contain ref: ${name} (looking for: ${ref})`);
                    }
                  }
                } catch (error) {
                  console.error(`Error searching for ${ref} by name:`, error);
                }
                return null;
              });

              const nameResults = await Promise.all(nameSearchPromises);
              nameResults.forEach(result => {
                if (result && !results[result.reference].found) {
                  results[result.reference].templateId = result.templateId;
                  results[result.reference].found = true;
                  results[result.reference].matchedField = result.matchedField;
                  results[result.reference].description = result.description;
                }
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error batch searching for products:', error);
      return res.status(500).json({ error: String(error) });
    }

    const foundCount = Object.values(results).filter(r => r.found).length;
    console.log(`✅ Batch search complete: ${foundCount}/${references.length} products found`);

    return res.status(200).json({
      success: true,
      results: Object.values(results),
      foundCount,
      totalCount: references.length,
    });

  } catch (error) {
    console.error('Batch search product error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to batch search products',
    });
  }
}
