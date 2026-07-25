#!/usr/bin/env node

/**
 * Backfill missing Emile & Ida variant barcodes/prices/stock from the order CSV.
 *
 * Root cause: import wrote barcodes before Odoo finished generating all MAAT
 * variants, so one size per multi-size product often stayed empty.
 *
 * Usage:
 *   node scripts/repair-emileetida-barcodes.mjs "/path/to/Emile & Ida AW26.csv"
 *   node scripts/repair-emileetida-barcodes.mjs "/path/to/file.csv" --execute
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_API_KEY || process.env.ODOO_PASSWORD;
const STOCK_LOCATION_ID = 8;
const DRY_RUN = !process.argv.includes('--execute');

const ADULT_SIZE_MAP = {
  XXS: 'XXS - 32',
  XS: 'XS - 34',
  S: 'S - 36',
  M: 'M - 38',
  L: 'L - 40',
  XL: 'XL - 42',
  XXL: 'XXL - 44',
};

function convertEmileSize(size) {
  if (!size) return '';
  const upper = size.toUpperCase().trim();
  if (upper === 'TU') return 'U';
  const monthRange = upper.match(/^(\d+)-(\d+)M$/);
  if (monthRange) {
    return `${parseInt(monthRange[1], 10)} - ${parseInt(monthRange[2], 10)} maand`;
  }
  const yearRange = upper.match(/^(\d+)A-(\d+)A$/);
  if (yearRange) {
    return `${parseInt(yearRange[1], 10)} - ${parseInt(yearRange[2], 10)} jaar`;
  }
  const singleYear = upper.match(/^(\d+)A$/);
  if (singleYear) return `${parseInt(singleYear[1], 10)} jaar`;
  const singleMonth = upper.match(/^(\d+)M$/);
  if (singleMonth) return `${parseInt(singleMonth[1], 10)} maand`;
  return size;
}

function mapSizeToOdoo(size) {
  const display = convertEmileSize(size);
  const key = display.toUpperCase().trim();
  return ADULT_SIZE_MAP[key] || display;
}

function parseEuro(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(/\s/g, '').replace(',', '.')) || 0;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(';').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(';'));
  return { headers, rows };
}

function findHeader(headers, name) {
  const needle = name.toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === needle);
}

function parseRows(text) {
  const { headers, rows } = parseCsv(text);
  const productNameIdx = findHeader(headers, 'product name');
  const productRefIdx = findHeader(headers, 'product reference');
  const colorNameIdx = findHeader(headers, 'color name');
  const sizeNameIdx = findHeader(headers, 'size name');
  const ean13Idx = findHeader(headers, 'ean13');
  const quantityIdx = findHeader(headers, 'quantity');
  const unitPriceIdx = findHeader(headers, 'unit price');
  if (productRefIdx === -1 || ean13Idx === -1 || sizeNameIdx === -1) {
    throw new Error('CSV missing Product reference / Size name / EAN13');
  }

  return rows
    .map((values) => {
      const productRef = values[productRefIdx]?.trim() || '';
      const ean = values[ean13Idx]?.trim() || '';
      const sizeRaw = values[sizeNameIdx]?.trim() || '';
      if (!productRef || !ean || !sizeRaw) return null;
      const colorName = colorNameIdx !== -1 ? values[colorNameIdx]?.trim() || '' : '';
      const productName =
        productNameIdx !== -1 ? values[productNameIdx]?.trim() || '' : '';
      return {
        productRef,
        colorName,
        productName,
        sizeRaw,
        sizeOdoo: mapSizeToOdoo(sizeRaw),
        ean,
        quantity:
          quantityIdx !== -1
            ? parseInt(values[quantityIdx]?.trim() || '0', 10) || 0
            : 0,
        price:
          unitPriceIdx !== -1
            ? parseEuro(values[unitPriceIdx]?.trim() || '0')
            : 0,
        uniqueRef: colorName
          ? `${productRef}_${colorName.toUpperCase().replace(/\s+/g, '')}`
          : productRef,
      };
    })
    .filter(Boolean);
}

function matchesVariant(name, row) {
  const nameNorm = normalize(name);
  const colorNorm = normalize(row.colorName);
  const productNorm = normalize(row.productName);
  const sizeNorm = normalize(row.sizeOdoo);
  const sizeRawNorm = normalize(row.sizeRaw);
  const refNorm = normalize(row.productRef);

  const hasIdentity =
    nameNorm.includes(refNorm) ||
    (productNorm && nameNorm.includes(productNorm)) ||
    (colorNorm && nameNorm.includes(colorNorm));
  if (!hasIdentity) return false;
  if (colorNorm && !nameNorm.includes(colorNorm)) return false;

  if (sizeRawNorm === 'tu' || sizeRawNorm === 'u') {
    return true;
  }
  // Prefer full Odoo label (s36). Never match bare letter "s" (hits XS / words).
  if (sizeNorm && nameNorm.includes(sizeNorm)) return true;
  if (
    sizeRawNorm.length > 1 &&
    sizeRawNorm !== sizeNorm &&
    nameNorm.includes(sizeRawNorm)
  ) {
    return true;
  }
  return false;
}

async function rpc(uid, password, model, method, args, kwargs = {}) {
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [ODOO_DB, uid, password, model, method, args, kwargs],
      },
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(
      data.error.data?.message || JSON.stringify(data.error),
    );
  }
  return data.result;
}

async function authenticate() {
  if (!ODOO_USERNAME || !ODOO_PASSWORD) {
    throw new Error(
      'Missing ODOO_USERNAME / ODOO_API_KEY (or ODOO_PASSWORD) in .env.local',
    );
  }
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
      },
    }),
  });
  const data = await res.json();
  if (!data.result) throw new Error('Odoo authentication failed');
  return data.result;
}

async function loadVariantsByTemplates(uid, password, templateIds) {
  if (!templateIds?.length) return [];
  // Use display_name — plain `name` omits the size suffix in Odoo.
  const rows = await rpc(
    uid,
    password,
    'product.product',
    'search_read',
    [
      [['product_tmpl_id', 'in', templateIds]],
      ['id', 'name', 'display_name', 'barcode', 'product_tmpl_id'],
    ],
    { limit: 80 },
  );
  return (rows || []).map((r) => ({
    ...r,
    name: r.display_name || r.name,
  }));
}

async function findVariant(uid, password, row) {
  let templateIds = await rpc(
    uid,
    password,
    'product.template',
    'search',
    [[['description', 'ilike', row.uniqueRef]]],
    { limit: 20 },
  );

  if (!templateIds?.length) {
    templateIds = await rpc(
      uid,
      password,
      'product.template',
      'search',
      [
        [
          '&',
          ['name', 'ilike', 'Emile'],
          ['description', 'ilike', row.productRef],
        ],
      ],
      { limit: 20 },
    );
  }

  let candidates = await loadVariantsByTemplates(uid, password, templateIds);

  // Fallback via display name: find sibling, reuse its template
  if (!candidates.length) {
    const colorToken = (row.colorName || '').split(/\s+/).filter(Boolean)[0];
    const domain = [
      '&',
      '&',
      ['name', 'ilike', 'Emile'],
      ['name', 'ilike', row.productName || row.productRef],
      ['name', 'ilike', colorToken || row.colorName || row.productRef],
    ];
    const siblingsRaw = await rpc(
      uid,
      password,
      'product.product',
      'search_read',
      [domain, ['id', 'name', 'display_name', 'barcode', 'product_tmpl_id']],
      { limit: 40 },
    );
    const siblings = (siblingsRaw || []).map((s) => ({
      ...s,
      name: s.display_name || s.name,
    }));
    const colored = siblings.filter((s) =>
      normalize(s.name).includes(normalize(row.colorName)),
    );
    templateIds = [
      ...new Set(colored.map((s) => s.product_tmpl_id).filter(Boolean)),
    ];
    candidates = await loadVariantsByTemplates(uid, password, templateIds);
    if (!candidates.length) candidates = siblings || [];
  }

  const matches = candidates.filter((c) => matchesVariant(c.name, row));
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  return matches.find((m) => !m.barcode) || matches[0];
}

async function main() {
  const csvPath = process.argv
    .slice(2)
    .find((a) => !a.startsWith('--'));
  if (!csvPath) {
    console.error(
      'Usage: node scripts/repair-emileetida-barcodes.mjs <order.csv> [--execute]',
    );
    process.exit(1);
  }

  const rows = parseRows(readFileSync(resolve(csvPath), 'utf8'));
  console.log(
    `Parsed ${rows.length} CSV rows. Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`,
  );

  const uid = await authenticate();
  const summary = { fixed: 0, alreadyOk: 0, notFound: 0, error: 0 };
  const missing = [];

  for (const row of rows) {
    try {
      const existing = await rpc(
        uid,
        ODOO_PASSWORD,
        'product.product',
        'search_read',
        [[['barcode', '=', row.ean]], ['id', 'name']],
        { limit: 1 },
      );
      // Respect manual fixes: CSV EAN already present anywhere → skip
      if (existing?.length) {
        summary.alreadyOk += 1;
        continue;
      }

      const variant = await findVariant(uid, ODOO_PASSWORD, row);
      if (!variant) {
        summary.notFound += 1;
        missing.push(row);
        console.log(
          `NOT FOUND  ${row.ean}  ${row.uniqueRef}  ${row.sizeOdoo}`,
        );
        continue;
      }

      // Respect manual fixes: never overwrite a barcode that is already set
      if (variant.barcode) {
        summary.alreadyOk += 1;
        console.log(
          `SKIP (variant has barcode ${variant.barcode})  ${row.ean}  #${variant.id} ${variant.name}`,
        );
        continue;
      }

      console.log(
        `${DRY_RUN ? 'WOULD FIX' : 'FIXING'}  ${row.ean}  → #${variant.id} ${variant.name}`,
      );

      if (!DRY_RUN) {
        await rpc(
          uid,
          ODOO_PASSWORD,
          'product.product',
          'write',
          [
            [variant.id],
            {
              barcode: row.ean,
              standard_price: row.price || 0,
            },
          ],
        );
        if (row.quantity > 0) {
          try {
            await rpc(uid, ODOO_PASSWORD, 'stock.quant', 'create', [
              {
                product_id: variant.id,
                location_id: STOCK_LOCATION_ID,
                quantity: row.quantity,
              },
            ]);
          } catch {
            // ignore stock conflicts
          }
        }
      }
      summary.fixed += 1;
    } catch (err) {
      summary.error += 1;
      console.error(`ERROR ${row.ean}: ${err.message}`);
    }
  }

  console.log('\nSummary:', summary);
  if (missing.length) {
    console.log(
      'Still missing:',
      missing.map((m) => `${m.uniqueRef} ${m.sizeOdoo} ${m.ean}`).join(' | '),
    );
  }
  if (DRY_RUN && summary.fixed > 0) {
    console.log('\nRe-run with --execute to apply fixes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
