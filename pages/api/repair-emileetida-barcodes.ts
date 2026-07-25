import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import {
  normalizeMatchToken,
  parseEmileetidaRepairRows,
  variantMatchesRepairRow,
  type EmileetidaBarcodeRepairRow,
} from '@/lib/suppliers/emileetida/repair-barcodes';
import { buildEmileetidaPriceLookup, lookupEmileetidaRrp } from '@/lib/suppliers/emileetida/prices';

const DEFAULT_STOCK_LOCATION_ID = 8;

type RepairResult = {
  ean: string;
  productRef: string;
  colorName: string;
  sizeOdoo: string;
  status: 'fixed' | 'already_ok' | 'not_found' | 'error';
  productId?: number;
  productName?: string;
  error?: string;
};

async function findVariantForRow(
  uid: number,
  password: string,
  row: EmileetidaBarcodeRepairRow,
): Promise<{ id: number; name: string; barcode: string | false | null } | null> {
  // Interne Notitie: IDA-EDGAR_FARINE|IDA-EDGAR
  const uniqueRef = row.colorName
    ? `${row.productRef}_${row.colorName.toUpperCase().replace(/\s+/g, '')}`
    : row.productRef;

  let templateIds = await odooClient.search(
    uid,
    password,
    'product.template',
    [['description', 'ilike', uniqueRef]],
    20,
  );

  if (!templateIds?.length) {
    templateIds = await odooClient.search(
      uid,
      password,
      'product.template',
      [
        '&',
        ['name', 'ilike', 'Emile'],
        ['description', 'ilike', row.productRef],
      ],
      20,
    );
  }

  type VariantCandidate = {
    id: number;
    name: string;
    display_name?: string;
    barcode: string | false | null;
    product_tmpl_id?: number | [number, string];
  };

  const withDisplayName = (rows: VariantCandidate[]) =>
    rows.map((r) => ({
      ...r,
      name: r.display_name || r.name,
    }));

  let candidates: VariantCandidate[] = [];

  if (templateIds?.length) {
    // display_name includes size; plain name does not
    candidates = withDisplayName(
      await odooClient.searchRead<VariantCandidate>(
        uid,
        password,
        'product.product',
        [['product_tmpl_id', 'in', templateIds]],
        ['id', 'name', 'display_name', 'barcode'],
        80,
      ),
    );
  }

  if (!candidates.length) {
    const colorToken =
      row.colorName.split(/\s+/).filter(Boolean)[0] || row.colorName;
    const domain: unknown[] = [
      '&',
      '&',
      ['name', 'ilike', 'Emile'],
      ['name', 'ilike', row.productName || row.productRef],
      ['name', 'ilike', colorToken || row.productRef],
    ];
    const siblings = withDisplayName(
      await odooClient.searchRead<VariantCandidate>(
        uid,
        password,
        'product.product',
        domain,
        ['id', 'name', 'display_name', 'barcode', 'product_tmpl_id'],
        40,
      ),
    );
    const templateFromSiblings = [
      ...new Set(
        siblings
          .filter((s) =>
            normalizeMatchToken(s.name).includes(
              normalizeMatchToken(row.colorName),
            ),
          )
          .map((s) =>
            Array.isArray(s.product_tmpl_id)
              ? s.product_tmpl_id[0]
              : s.product_tmpl_id,
          )
          .filter(Boolean),
      ),
    ] as number[];
    if (templateFromSiblings.length) {
      candidates = withDisplayName(
        await odooClient.searchRead<VariantCandidate>(
          uid,
          password,
          'product.product',
          [['product_tmpl_id', 'in', templateFromSiblings]],
          ['id', 'name', 'display_name', 'barcode'],
          80,
        ),
      );
    } else {
      candidates = siblings;
    }
  }

  const matches = candidates.filter((c) => variantMatchesRepairRow(c.name, row));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const empty = matches.find((m) => !m.barcode);
    return empty || matches[0];
  }
  return null;
}

async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uid, password } = req.session.user!;
    const csvText =
      typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    const dryRun = Boolean(req.body?.dryRun);
    const tarifText =
      typeof req.body?.tarifText === 'string' ? req.body.tarifText : '';

    if (!csvText.trim()) {
      return res.status(400).json({
        error: 'csvText required (Emile & Ida order CSV)',
      });
    }

    const rows = parseEmileetidaRepairRows(csvText);
    if (rows.length === 0) {
      return res.status(400).json({
        error: 'No repairable rows found (need Product reference, Size name, EAN13)',
      });
    }

    const priceLookup = buildEmileetidaPriceLookup(tarifText);
    const results: RepairResult[] = [];
    let fixed = 0;
    let alreadyOk = 0;
    let notFound = 0;

    for (const row of rows) {
      const rrp = lookupEmileetidaRrp(
        priceLookup,
        row.ean,
        row.productRef,
        row.colorName,
        row.price,
      );

      try {
        // Skip if EAN already exists on some product
        const existingWithEan = await odooClient.searchRead<{
          id: number;
          name: string;
        }>(
          uid,
          password,
          'product.product',
          [['barcode', '=', row.ean]],
          ['id', 'name'],
          1,
        );
        if (existingWithEan?.length) {
          alreadyOk += 1;
          results.push({
            ean: row.ean,
            productRef: row.productRef,
            colorName: row.colorName,
            sizeOdoo: row.sizeOdoo,
            status: 'already_ok',
            productId: existingWithEan[0].id,
            productName: existingWithEan[0].name,
          });
          continue;
        }

        const variant = await findVariantForRow(uid, password, row);
        if (!variant) {
          notFound += 1;
          results.push({
            ean: row.ean,
            productRef: row.productRef,
            colorName: row.colorName,
            sizeOdoo: row.sizeOdoo,
            status: 'not_found',
          });
          continue;
        }

        if (variant.barcode) {
          alreadyOk += 1;
          results.push({
            ean: row.ean,
            productRef: row.productRef,
            colorName: row.colorName,
            sizeOdoo: row.sizeOdoo,
            status: 'already_ok',
            productId: variant.id,
            productName: variant.name,
          });
          continue;
        }

        if (!dryRun) {
          await odooClient.write(
            uid,
            password,
            'product.product',
            [variant.id],
            {
              barcode: row.ean,
              standard_price: row.price || 0,
              list_price: rrp || row.price || 0,
            },
          );

          if (row.quantity > 0) {
            try {
              await odooClient.create(uid, password, 'stock.quant', {
                product_id: variant.id,
                location_id: DEFAULT_STOCK_LOCATION_ID,
                quantity: row.quantity,
              });
            } catch {
              // stock may already exist
            }
          }
        }

        fixed += 1;
        results.push({
          ean: row.ean,
          productRef: row.productRef,
          colorName: row.colorName,
          sizeOdoo: row.sizeOdoo,
          status: 'fixed',
          productId: variant.id,
          productName: variant.name,
        });
      } catch (err) {
        results.push({
          ean: row.ean,
          productRef: row.productRef,
          colorName: row.colorName,
          sizeOdoo: row.sizeOdoo,
          status: 'error',
          error: (err as Error).message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      totalRows: rows.length,
      fixed,
      alreadyOk,
      notFound,
      results,
    });
  } catch (error) {
    console.error('repair-emileetida-barcodes error:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Repair failed',
    });
  }
}

export default withAuth(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};
