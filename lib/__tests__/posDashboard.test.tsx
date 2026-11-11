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

function sessionIdFromDomain(args: unknown[]): number | null {
  const domain = args[0];
  if (!Array.isArray(domain)) return null;
  for (const clause of domain) {
    if (Array.isArray(clause) && clause[0] === 'session_id') return Number(clause[2]);
  }
  return null;
}

function stubOdoo(
  orders: unknown[],
  payments: unknown[],
  closed?: {
    session: { id: number; name: string; stop_at: string };
    orders: unknown[];
  },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as OdooCallBody;
      if (body.model === 'pos.session') {
        const domain = JSON.stringify(body.args[0] ?? []);
        if (domain.includes('"closed"')) {
          return jsonResponse(closed ? [closed.session] : []);
        }
        return jsonResponse([
          {
            id: 99,
            name: 'POS/01414',
            employee_id: [12, 'Lisa'],
            user_id: [5, 'admin@babetteconcept.be'],
            start_at: '2026-08-29 08:05:00',
          },
        ]);
      }
      if (body.model === 'pos.order') {
        const sessionId = sessionIdFromDomain(body.args);
        if (closed && sessionId === closed.session.id) {
          return jsonResponse(closed.orders);
        }
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
      expect(screen.getByText(/Geopend door/)).toHaveTextContent('Lisa');
      expect(screen.getByText(/Geopend door/)).toHaveTextContent(/10[:.]05/);
      expect(screen.queryByText('admin@babetteconcept.be')).not.toBeInTheDocument();
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
        {
          session: {
            id: 88,
            name: 'POS/01413',
            stop_at: '2026-11-08 19:00:00',
          },
          orders: [
            {
              id: 20,
              amount_total: 50,
              date_order: '2026-11-08 15:00:00',
              partner_id: [2, 'Gisterenklant'],
            },
          ],
        },
      );
    });

    it('hides yesterday once today has an order', async () => {
      render(<DashboardPage />);

      expect(await screen.findByText('Hanne')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Vandaag' })).toBeInTheDocument();
      expect(screen.getByText('Aantal orders:')).toHaveTextContent('Aantal orders: 1');
      expect(screen.getByText('Totale omzet:')).toHaveTextContent('72,95');
      expect(screen.queryByText('Gisterenklant')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Gisteren/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Eergisteren/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Bekijk laatste sessie/ })).not.toBeInTheDocument();
    });
  });

  describe('previous closed session', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-10T09:00:00.000Z'));
      stubOdoo(
        [],
        [{ pos_order_id: [20, 'B'], payment_method_id: [2, 'Cash'] }],
        {
          session: {
            id: 88,
            name: 'POS/01413',
            stop_at: '2026-11-09 19:00:00',
            employee_id: [4, 'Margot'],
            start_at: '2026-11-09 07:30:00',
          },
          orders: [
            {
              id: 20,
              amount_total: 50,
              date_order: '2026-11-09 15:00:00',
              partner_id: [2, 'Gisterenklant'],
            },
          ],
        },
      );
    });

    it('shows a button to open the last closed session when today is empty', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<DashboardPage />);

      expect(await screen.findByText('Nog geen verkopen vandaag.')).toBeInTheDocument();
      expect(screen.getByText('POS/01414')).toBeInTheDocument();
      expect(await screen.findByText('POS/01413')).toBeInTheDocument();
      expect(screen.getByText('Lisa')).toBeInTheDocument();
      expect(screen.getByText(/Geopend door Margot/)).toBeInTheDocument();
      expect(screen.queryByText('Gisterenklant')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Bekijk laatste sessie/ }));
      expect(await screen.findByText(/Bekijkt laatste gesloten sessie/)).toBeInTheDocument();
      expect(await screen.findByText('Gisterenklant')).toBeInTheDocument();
    });
  });
});
