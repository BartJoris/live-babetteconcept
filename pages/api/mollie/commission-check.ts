/**
 * GET: maandelijkse Mollie-commissiecontrole (gids stap 16). Puur read-only — vergelijkt de
 * `kosten`-rijen uit de Mollie settlement-data met de Mollie-leveranciersfacturen in Odoo per maand.
 */
import type { NextApiResponse } from 'next';
import { withAuth, type NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import { collectSettlementOdooRows } from '@/lib/mollieSettlementShared';
import { computeMollieCommissionCheck } from '@/lib/accounting/mollieCommissionCheck';
import { fetchMollieCommissionBills } from '@/lib/accounting/fetchMollieCommissionBills';

export default withAuth(async (req: NextApiRequestWithSession, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.MOLLIE_API_KEY;
  const accessToken = process.env.MOLLIE_ACCESS_TOKEN;
  if (!apiKey && !accessToken) {
    return res.status(500).json({ error: 'MOLLIE_API_KEY of MOLLIE_ACCESS_TOKEN niet geconfigureerd' });
  }

  const odooUser = process.env.ODOO_USERNAME;
  const odooPass = process.env.ODOO_API_KEY;
  if (!odooUser || !odooPass) {
    return res.status(500).json({ error: 'ODOO_USERNAME en ODOO_API_KEY zijn verplicht.' });
  }

  const { from: fromStr, to: toStr } = req.query;
  if (!fromStr || !toStr || typeof fromStr !== 'string' || typeof toStr !== 'string') {
    return res.status(400).json({ error: 'Parameters "from" en "to" zijn verplicht (YYYY-MM-DD)' });
  }

  const from = new Date(fromStr + 'T00:00:00.000Z');
  const to = new Date(toStr + 'T23:59:59.999Z');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return res.status(400).json({ error: 'Ongeldige datumnotatie.' });
  }

  try {
    const uid = await odooClient.authenticate(odooUser, odooPass);
    if (!uid) {
      return res.status(401).json({ error: 'Odoo-authenticatie mislukt (controleer ODOO_USERNAME / ODOO_API_KEY).' });
    }

    const [{ rows, approach, settlementError }, bills] = await Promise.all([
      collectSettlementOdooRows({ apiKey: apiKey ?? accessToken!, accessToken, from, to }),
      fetchMollieCommissionBills(uid, odooPass, fromStr, toStr),
    ]);

    const months = computeMollieCommissionCheck(rows, bills);

    return res.status(200).json({
      approach,
      settlementError: settlementError || undefined,
      warning:
        approach === 'payments'
          ? 'Settlements API niet beschikbaar: kostenregels (commissies) ontbreken in de bron-data, dus deze controle is niet betrouwbaar. Voeg MOLLIE_ACCESS_TOKEN toe.'
          : undefined,
      months,
    });
  } catch (error) {
    console.error('Mollie commission-check error:', error);
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(500).json({ error: message });
  }
});
