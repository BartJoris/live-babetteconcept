import fs from 'fs';

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;
const ODOO_USERNAME = process.env.ODOO_USERNAME!;
const ODOO_API_KEY = process.env.ODOO_API_KEY!;

async function rpc(service: string, method: string, args: unknown[]) {
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function execute(
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
) {
  return rpc('object', 'execute_kw', [
    ODOO_DB,
    uid,
    ODOO_API_KEY,
    model,
    method,
    args,
    kwargs,
  ]);
}

async function main() {
  const log = JSON.parse(
    fs.readFileSync(
      '/Users/bajoris/Downloads/import-log-playup-2026-08-13-12-25-03.json',
      'utf8',
    ),
  );
  const products = (log.results || []).filter((r: { templateId?: number }) => r.templateId);
  const templateIds = products.map((p: { templateId: number }) => p.templateId);

  const uid = await rpc('common', 'authenticate', [
    ODOO_DB,
    ODOO_USERNAME,
    ODOO_API_KEY,
    {},
  ]);
  console.log('uid', uid, 'templates', templateIds.length);

  const templates = await execute(
    uid,
    'product.template',
    'search_read',
    [[['id', 'in', templateIds]]],
    { fields: ['id', 'name', 'description'], limit: 200 },
  );

  const withMainIds: number[] = await execute(
    uid,
    'product.template',
    'search',
    [[['id', 'in', templateIds], ['image_1920', '!=', false]]],
    { limit: 200 },
  );

  const hasMain = new Set(withMainIds);
  const names = new Map<number, string>();
  for (const t of templates as Array<{ id: number; name: string }>) {
    names.set(t.id, t.name);
  }

  const gallery = (await execute(
    uid,
    'product.image',
    'search_read',
    [[['product_tmpl_id', 'in', templateIds]]],
    {
      fields: ['id', 'name', 'product_tmpl_id', 'sequence'],
      limit: 2000,
      order: 'product_tmpl_id, sequence',
    },
  )) as Array<{
    id: number;
    name: string;
    product_tmpl_id: [number, string] | number;
    sequence: number;
  }>;

  const galleryByTmpl = new Map<number, typeof gallery>();
  for (const g of gallery) {
    const tid = Array.isArray(g.product_tmpl_id)
      ? g.product_tmpl_id[0]
      : g.product_tmpl_id;
    if (!galleryByTmpl.has(tid)) galleryByTmpl.set(tid, []);
    galleryByTmpl.get(tid)!.push(g);
  }

  const photoDirs = [
    "/Users/bajoris/Library/Mobile Documents/com~apple~CloudDocs/Babette Bart/Winter 26-27/Foto's play Up",
    '/Users/bajoris/Library/Mobile Documents/com~apple~CloudDocs/Babette Bart/Winter 26-27/Fotos play Up',
  ];
  const localByRef = new Map<string, string[]>();
  for (const d of photoDirs) {
    if (!fs.existsSync(d)) continue;
    const files = fs.readdirSync(d).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    for (const f of files) {
      const m = f.match(/^([0-9A-Za-z]+_[0-9A-Za-z]+)/);
      if (!m) continue;
      if (!localByRef.has(m[1])) localByRef.set(m[1], []);
      localByRef.get(m[1])!.push(f);
    }
    console.log('local folder', d, 'files', files.length, 'refs', localByRef.size);
    break;
  }

  type Row = {
    reference: string;
    templateId: number;
    name: string;
    main: boolean;
    gallery: number;
    expected: number;
    status: 'volledig' | 'deels' | 'geen';
  };

  const rows: Row[] = [];
  for (const p of products as Array<{ reference: string; templateId: number; name: string }>) {
    const g = galleryByTmpl.get(p.templateId) || [];
    const expected = localByRef.get(p.reference)?.length || 0;
    const main = hasMain.has(p.templateId);
    let status: Row['status'] = 'geen';
    if (main && g.length > 0) {
      status = expected > 0 && g.length >= expected ? 'volledig' : 'deels';
    } else if (main || g.length > 0) {
      status = 'deels';
    }
    rows.push({
      reference: p.reference,
      templateId: p.templateId,
      name: names.get(p.templateId) || p.name,
      main,
      gallery: g.length,
      expected,
      status,
    });
  }

  const fully = rows.filter((r) => r.status === 'volledig');
  const partial = rows.filter((r) => r.status === 'deels');
  const none = rows.filter((r) => r.status === 'geen');
  const withAny = rows.filter((r) => r.main || r.gallery > 0);

  console.log('\n=== SAMENVATTING ===');
  console.log('producten in import-log:', rows.length);
  console.log('met minstens 1 afbeelding:', withAny.length);
  console.log('volledig (main + gallery >= lokale files):', fully.length);
  console.log('deels:', partial.length);
  console.log('geen:', none.length);
  console.log('totaal gallery records:', gallery.length);
  console.log('totaal main images:', rows.filter((r) => r.main).length);

  console.log('\n=== GEEN AFBEELDINGEN ===');
  for (const r of none) {
    console.log(`${r.reference}\t${r.templateId}\texpected=${r.expected}\t${r.name}`);
  }

  console.log('\n=== DEELS ===');
  for (const r of partial) {
    console.log(
      `${r.reference}\t${r.templateId}\tgallery=${r.gallery} expected=${r.expected} main=${r.main}\t${r.name}`,
    );
  }

  console.log('\n=== VOLLEDIG ===');
  for (const r of fully) {
    console.log(`${r.reference}\tgallery=${r.gallery}/${r.expected}\t${r.name}`);
  }

  fs.writeFileSync(
    '/tmp/playup-image-status.json',
    JSON.stringify(
      {
        summary: {
          total: rows.length,
          withAny: withAny.length,
          fully: fully.length,
          partial: partial.length,
          none: none.length,
          galleryRecords: gallery.length,
        },
        rows: rows.sort(
          (a, b) =>
            a.status.localeCompare(b.status) ||
            a.reference.localeCompare(b.reference),
        ),
      },
      null,
      2,
    ),
  );
  console.log('\nWrote /tmp/playup-image-status.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
