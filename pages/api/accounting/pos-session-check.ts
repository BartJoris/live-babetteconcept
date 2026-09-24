/**
 * GET: POS-sessies afletteren op rekening 550001 (gids stap 17-19). Puur read-only — signaleert
 * per kassasessie of debet en credit gelijk zijn, afletteren zelf blijft een handmatige Odoo-stap.
 */
import type { NextApiResponse } from 'next';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import { fetchOutstandingReceipts } from '@/lib/accounting/fetchOutstandingReceipts';
import { groupOutstandingReceiptsByPosSession } from '@/lib/accounting/posSessionReconciliation';

export default withAuth(async (req: NextApiRequestWithSession, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const odooUser = process.env.ODOO_USERNAME;
  const odooPass = process.env.ODOO_API_KEY;
  if (!odooUser || !odooPass) {
    return res.status(500).json({ error: 'ODOO_USERNAME en ODOO_API_KEY zijn verplicht.' });
  }

  const { from: fromStr, to: toStr } = req.query;
  const from = typeof fromStr === 'string' && fromStr ? fromStr : undefined;
  const to = typeof toStr === 'string' && toStr ? toStr : undefined;
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return res.status(400).json({ error: 'Ongeldige datumnotatie (YYYY-MM-DD verwacht).' });
  }

  try {
    const uid = await odooClient.authenticate(odooUser, odooPass);
    if (!uid) {
      return res.status(401).json({ error: 'Odoo-authenticatie mislukt (controleer ODOO_USERNAME / ODOO_API_KEY).' });
    }

    const lines = await fetchOutstandingReceipts(uid, odooPass, from, to);
    const groups = groupOutstandingReceiptsByPosSession(lines);

    return res.status(200).json({ lineCount: lines.length, groups });
  } catch (error) {
    console.error('pos-session-check error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: message });
  }
});
