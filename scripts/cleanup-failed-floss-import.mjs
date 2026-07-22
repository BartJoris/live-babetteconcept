#!/usr/bin/env node

/**
 * Clean up partial Flöss products from the failed 2026-07-22 import.
 *
 * From Vercel logs:
 *   Template 9783 Iris raincoat  — variants updated (likely complete)
 *   Template 9784 Flora blouse   — variants updated (likely complete)
 *   Template 9785 Line cardigan  — timed out mid-import (incomplete)
 *
 * Usage:
 *   node scripts/cleanup-failed-floss-import.mjs              # dry-run Line only
 *   node scripts/cleanup-failed-floss-import.mjs --execute    # archive Line only
 *   node scripts/cleanup-failed-floss-import.mjs --all --execute  # archive all 3
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

const DRY_RUN = !process.argv.includes('--execute');
const ARCHIVE_ALL = process.argv.includes('--all');

const TEMPLATES = [
  { id: 9783, name: 'Flöss - Iris raincoat (Berry gingham)', complete: true },
  { id: 9784, name: 'Flöss - Flora pointelle blouse (Gentle cream)', complete: true },
  { id: 9785, name: 'Flöss - Line cardigan (Blossom pink berry)', complete: false },
];

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
    throw new Error(JSON.stringify(data.error));
  }
  return data.result;
}

async function authenticate() {
  if (!ODOO_USERNAME || !ODOO_PASSWORD) {
    throw new Error('Missing ODOO_USERNAME / ODOO_API_KEY (or ODOO_PASSWORD) in .env.local');
  }
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: {
        service: 'common',
        method: 'authenticate',
        args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
      },
    }),
  });
  const data = await res.json();
  if (!data.result) {
    throw new Error('Odoo authentication failed');
  }
  return data.result;
}

async function archiveTemplate(uid, password, templateId) {
  const variants = await rpc(
    uid,
    password,
    'product.product',
    'search_read',
    [[['product_tmpl_id', '=', templateId]]],
    { fields: ['id', 'name', 'barcode'] },
  );

  console.log(`  Found ${variants.length} variants`);

  for (const variant of variants) {
    if (variant.barcode) {
      console.log(`  Clearing barcode ${variant.barcode} on variant ${variant.id}`);
      if (!DRY_RUN) {
        await rpc(uid, password, 'product.product', 'write', [
          [variant.id],
          { barcode: null },
        ]);
      }
    }
  }

  const attributeLines = await rpc(
    uid,
    password,
    'product.template.attribute.line',
    'search',
    [[['product_tmpl_id', '=', templateId]]],
  );
  console.log(`  Found ${attributeLines.length} attribute lines`);
  if (attributeLines.length > 0 && !DRY_RUN) {
    await rpc(uid, password, 'product.template.attribute.line', 'unlink', [
      attributeLines,
    ]);
  }

  if (!DRY_RUN) {
    await rpc(uid, password, 'product.template', 'write', [
      [templateId],
      {
        sale_ok: false,
        available_in_pos: false,
        website_published: false,
        active: false,
      },
    ]);
  }

  console.log(
    DRY_RUN
      ? `  [dry-run] Would archive template ${templateId}`
      : `  Archived template ${templateId}`,
  );
}

async function main() {
  const targets = ARCHIVE_ALL
    ? TEMPLATES
    : TEMPLATES.filter((t) => !t.complete);

  console.log(DRY_RUN ? 'DRY RUN (pass --execute to apply)\n' : 'EXECUTE MODE\n');
  console.log(
    ARCHIVE_ALL
      ? 'Archiving ALL 3 partial/complete templates from the failed batch'
      : 'Archiving only incomplete Line cardigan (9785). Pass --all to include Iris+Flora.\n',
  );

  const uid = await authenticate();
  console.log(`Authenticated as uid=${uid}\n`);

  for (const template of targets) {
    console.log(`\n📦 ${template.name} (template ${template.id})`);
    const exists = await rpc(
      uid,
      ODOO_PASSWORD,
      'product.template',
      'search_read',
      [[['id', '=', template.id]]],
      { fields: ['id', 'name', 'active'], context: { active_test: false } },
    );
    if (!exists.length) {
      console.log('  Not found — skipping');
      continue;
    }
    console.log(`  Odoo: ${exists[0].name} (active=${exists[0].active})`);
    await archiveTemplate(uid, ODOO_PASSWORD, template.id);
  }

  console.log('\nDone.');
  if (DRY_RUN) {
    console.log('Re-run with --execute to apply.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
