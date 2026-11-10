import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function stubOdoo(orders: unknown[], payments: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as OdooCallBody;
      if (body.model === 'pos.session') {
        return jsonResponse([{ id: 99, name: 'POS/01413' }]);
      }
      if (body.model === 'pos.order') {
        return jsonResponse(orders);
      }
      if (body.model === 'pos.payment') {
        return jsonResponse(payments);
      }
      throw new Error(`Unexpected odoo call: ${body.model}`);
    }),
  );
}

describe('POS dashboard', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('payment marks', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-29T18:00:00.000Z'));
      stubOdoo(
        [
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
        ],
        [
          { pos_order_id: [10, 'A'], payment_method_id: [2, 'Cash'] },
          { pos_order_id: [11, 'B'], payment_method_id: [13, 'Mollie'] },
          { pos_order_id: [12, 'C'], payment_method_id: [3, 'Overschrijving'] },
        ],
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

  describe('multi-day open session', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-09T18:00:00.000Z'));
      stubOdoo(
        [
          {
            id: 21,
            amount_total: 72.95,
            date_order: '2026-11-09 16:13:00',
            partner_id: [1, 'Hanne'],
          },
          {
            id: 20,
            amount_total: 50,
            date_order: '2026-11-08 15:00:00',
            partner_id: [2, 'Gisterenklant'],
          },
          {
            id: 19,
            amount_total: 30,
            date_order: '2026-11-07 14:00:00',
            partner_id: [3, 'Eergisterenklant'],
          },
        ],
        [
          { pos_order_id: [21, 'A'], payment_method_id: [13, 'Mollie'] },
          { pos_order_id: [20, 'B'], payment_method_id: [2, 'Cash'] },
        ],
      );
    });

    it('shows today totals and collapses earlier days', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<DashboardPage />);

      expect(await screen.findByText('Hanne')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Vandaag' })).toBeInTheDocument();
      expect(screen.getByText('Aantal orders:')).toHaveTextContent('Aantal orders: 1');
      expect(screen.getByText('Totale omzet:')).toHaveTextContent('72,95');
      expect(screen.queryByText('Gisterenklant')).not.toBeInTheDocument();
      expect(screen.queryByText('Eergisterenklant')).not.toBeInTheDocument();

      const yesterday = screen.getByRole('button', { name: /Gisteren/ });
      expect(yesterday).toHaveTextContent('50,00');
      await user.click(yesterday);
      expect(screen.getByText('Gisterenklant')).toBeInTheDocument();
      expect(screen.getByLabelText('Niet via Mollie: Cash')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /Eergisteren/ })).toHaveTextContent('30,00');
    });
  });
});
