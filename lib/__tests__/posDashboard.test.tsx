import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/pages/dashboard';

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: true, isLoading: false }),
}));

type OdooCallBody = {
  model: string;
  method: string;
  args: unknown[];
};

function jsonResponse(result: unknown) {
  return {
    ok: true,
    json: async () => ({ success: true, result }),
  };
}

describe('POS dashboard payment marks', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as OdooCallBody;
        if (body.model === 'pos.session') {
          return jsonResponse([{ id: 99, name: 'POS/01365' }]);
        }
        if (body.model === 'pos.order') {
          return jsonResponse([
            {
              id: 10,
              amount_total: 83.25,
              date_order: '2026-08-29 12:00:00',
              partner_id: [1, 'Anna'],
            },
            {
              id: 11,
              amount_total: 50,
              date_order: '2026-08-29 12:05:00',
              partner_id: false,
            },
            {
              id: 12,
              amount_total: 120,
              date_order: '2026-08-29 12:10:00',
              partner_id: [2, 'Bert'],
            },
          ]);
        }
        if (body.model === 'pos.payment') {
          return jsonResponse([
            { pos_order_id: [10, 'A'], payment_method_id: [2, 'Cash'] },
            { pos_order_id: [11, 'B'], payment_method_id: [13, 'Mollie'] },
            { pos_order_id: [12, 'C'], payment_method_id: [3, 'Overschrijving'] },
          ]);
        }
        throw new Error(`Unexpected odoo call: ${body.model}`);
      }),
    );
  });

  it('marks cash and bank transfer, and leaves Mollie unmarked', async () => {
    render(<DashboardPage />);

    expect(await screen.findByLabelText('Niet via Mollie: Cash')).toBeInTheDocument();
    expect(await screen.findByLabelText('Niet via Mollie: Overschrijving')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Niet via Mollie: Mollie/)).not.toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Bert')).toBeInTheDocument();
  });
});
