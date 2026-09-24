import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '../../../lib/middleware/withAuth';
import { odooClient } from '../../../lib/odooClient';

type OdooPartner = {
  id: number;
  name: string;
  email: string | false;
  phone: string | false;
  street: string | false;
  city: string | false;
  zip: string | false;
  country_id: [number, string] | false;
  create_date: string;
  write_date: string;
  sale_order_count: number;
  pos_order_count: number;
  is_company: boolean;
  parent_id: [number, string] | false;
  property_product_pricelist: [number, string] | false;
  comment: string | false;
};

export type DuplicatePartner = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  createDate: string;
  writeDate: string;
  saleOrderCount: number;
  posOrderCount: number;
  isCompany: boolean;
  parentCompany: string | null;
  pricelist: string | null;
  comment: string | null;
};

export type DuplicateGroup = {
  key: string;
  reason: string;
  partners: DuplicatePartner[];
};

type ApiResponse = {
  groups: DuplicateGroup[];
  totalPartners: number;
  totalDuplicateGroups: number;
  totalDuplicatePartners: number;
} | { error: string };

function normalize(s: string | false | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizePhone(s: string | false | null | undefined): string {
  if (!s) return '';
  return s.replace(/[\s\-\.\(\)\/+]/g, '').replace(/^0032/, '0').replace(/^32/, '0');
}

function mapPartner(p: OdooPartner): DuplicatePartner {
  return {
    id: p.id,
    name: p.name,
    email: p.email || null,
    phone: p.phone || null,
    street: p.street || null,
    city: p.city || null,
    zip: p.zip || null,
    country: Array.isArray(p.country_id) ? p.country_id[1] : null,
    createDate: p.create_date,
    writeDate: p.write_date,
    saleOrderCount: p.sale_order_count ?? 0,
    posOrderCount: p.pos_order_count ?? 0,
    isCompany: p.is_company,
    parentCompany: Array.isArray(p.parent_id) ? p.parent_id[1] : null,
    pricelist: Array.isArray(p.property_product_pricelist) ? p.property_product_pricelist[1] : null,
    comment: p.comment || null,
  };
}

const FIELDS: (keyof OdooPartner)[] = [
  'id', 'name', 'email', 'phone', 'street', 'city', 'zip',
  'country_id', 'create_date', 'write_date', 'sale_order_count',
  'pos_order_count', 'is_company', 'parent_id', 'property_product_pricelist', 'comment',
];

const BATCH_SIZE = 500;

export default withAuth(async function handler(
  req: NextApiRequestWithSession,
  res: NextApiResponse<ApiResponse>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { user } = req.session;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const onlyCustomers = req.query.onlyCustomers === 'true';
    const domain: unknown[][] = [
      ['active', '=', true],
      ['is_company', '=', false],
    ];
    if (onlyCustomers) {
      domain.push(['customer_rank', '>', 0]);
    }

    // Fetch all partners in batches
    const allPartners: OdooPartner[] = [];
    let offset = 0;
    while (true) {
      const batch = await odooClient.searchRead<OdooPartner>(
        user.uid,
        user.password,
        'res.partner',
        domain,
        FIELDS as string[],
        BATCH_SIZE,
        offset,
        'name asc',
      );
      allPartners.push(...batch);
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    // Build duplicate indices
    const byName = new Map<string, OdooPartner[]>();
    const byEmail = new Map<string, OdooPartner[]>();
    const byPhone = new Map<string, OdooPartner[]>();

    for (const p of allPartners) {
      const normName = normalize(p.name);
      if (normName.length >= 3) {
        const arr = byName.get(normName) ?? [];
        arr.push(p);
        byName.set(normName, arr);
      }

      const normEmail = normalize(p.email);
      if (normEmail.length >= 3) {
        const arr = byEmail.get(normEmail) ?? [];
        arr.push(p);
        byEmail.set(normEmail, arr);
      }

      const normPhone = normalizePhone(p.phone);
      if (normPhone.length >= 6) {
        const arr = byPhone.get(normPhone) ?? [];
        arr.push(p);
        byPhone.set(normPhone, arr);
      }
    }

    // Collect groups, dedup by sorted ID set
    const seen = new Set<string>();
    const groups: DuplicateGroup[] = [];

    function addGroup(key: string, reason: string, partners: OdooPartner[]) {
      if (partners.length < 2) return;
      const ids = partners.map((p) => p.id).sort((a, b) => a - b);
      const groupKey = ids.join(',');
      if (seen.has(groupKey)) return;
      seen.add(groupKey);
      groups.push({
        key,
        reason,
        partners: partners.map(mapPartner),
      });
    }

    for (const [name, partners] of byName) {
      addGroup(name, 'Zelfde naam', partners);
    }
    for (const [email, partners] of byEmail) {
      addGroup(email, 'Zelfde e-mail', partners);
    }
    for (const [phone, partners] of byPhone) {
      addGroup(phone, 'Zelfde telefoon/GSM', partners);
    }

    // Sort: largest groups first, then by name
    groups.sort((a, b) => b.partners.length - a.partners.length || a.key.localeCompare(b.key));

    const totalDuplicatePartners = new Set(groups.flatMap((g) => g.partners.map((p) => p.id))).size;

    return res.status(200).json({
      groups,
      totalPartners: allPartners.length,
      totalDuplicateGroups: groups.length,
      totalDuplicatePartners,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('duplicate-partners error:', message);
    return res.status(500).json({ error: message });
  }
});
