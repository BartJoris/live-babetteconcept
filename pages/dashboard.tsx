import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

type OrderLine = {
  product_name: string;
  qty: number;
  price_unit: number;
};

type Sale = {
  id: number;
  total: number;
  timestamp: string;
  partner?: string | null;
};

type SessionData = {
  session_id: number;
  session_name: string;
  total: number;
  orders: Sale[];
};

type LastSessionData = {
  session_id: number;
  session_name: string;
  end_date: string;
  order_count: number;
  total_amount: number;
};

export default function DashboardPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<SessionData | null>(null);
  const [lastSession, setLastSession] = useState<LastSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [orderLines, setOrderLines] = useState<Record<number, OrderLine[]>>({});
  const [loadingOrderLines, setLoadingOrderLines] = useState<Record<number, boolean>>({});
  const [showingLastSession, setShowingLastSession] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchFromOdoo = useCallback(async <T,>(params: {
    model: string;
    method: string;
    args: unknown[];
  }): Promise<T> => {
    const res = await fetch('/api/odoo-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Odoo call failed');
    }
    return json.result as T;
  }, []);

  const fetchLastSession = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const sessions = await fetchFromOdoo<{ id: number; name: string; stop_at: string }[]>({
        model: 'pos.session',
        method: 'search_read',
        args: [
          [['state', '=', 'closed']],
          ['id', 'name', 'stop_at'],
          0,
          1,
          'id desc',
        ],
      });

      if (sessions.length > 0) {
        const session = sessions[0];
        
        // Fetch orders for this session to get count and total
        const orders = await fetchFromOdoo<{
          id: number;
          amount_total: number;
        }[]>({
          model: 'pos.order',
          method: 'search_read',
          args: [
            [['session_id', '=', session.id]],
            ['id', 'amount_total'],
          ],
        });

        const total = orders.reduce((sum, order) => sum + order.amount_total, 0);
        
        setLastSession({
          session_id: session.id,
          session_name: session.name,
          end_date: session.stop_at,
          order_count: orders.length,
          total_amount: total,
        });
      }
    } catch (err) {
      console.error('Fout bij ophalen laatste sessie:', err);
    }
  }, [isLoggedIn, fetchFromOdoo]);

  const fetchSales = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setShowingLastSession(false);
    try {
      const sessions = await fetchFromOdoo<{ id: number; name: string }[]>({
        model: 'pos.session',
        method: 'search_read',
        args: [
          [['state', '=', 'opened']],
          // [['id', '=', "00908"]],
          ['id', 'name'],
          0,
          1,
          'id desc',
        ],
      });

      if (!sessions.length) {
        setData(null);
        // Fetch last session when no active session is found
        await fetchLastSession();
        return;
      }

      const session = sessions[0];

      const orders = await fetchFromOdoo<{
        id: number;
        amount_total: number;
        date_order: string;
        partner_id?: [number, string];
      }[]>({
        model: 'pos.order',
        method: 'search_read',
        args: [
          [['session_id', '=', session.id]],
          ['id', 'amount_total', 'date_order', 'partner_id'],
        ],
      });

      const mappedOrders: Sale[] = orders.map((order) => ({
        id: order.id,
        total: order.amount_total,
        timestamp: order.date_order,
        partner: order.partner_id?.[1] || null,
      }));

      const total = mappedOrders.reduce((sum, o) => sum + o.total, 0);

      setData({
        session_id: session.id,
        session_name: session.name,
        total,
        orders: mappedOrders,
      });
    } catch (err) {
      console.error('Fout bij ophalen POS-data:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, fetchFromOdoo, fetchLastSession]);

  const fetchLastSessionSales = useCallback(async () => {
    if (!isLoggedIn || !lastSession) return;
    setLoading(true);
    setShowingLastSession(true);
    try {
      const orders = await fetchFromOdoo<{
        id: number;
        amount_total: number;
        date_order: string;
        partner_id?: [number, string];
      }[]>({
        model: 'pos.order',
        method: 'search_read',
        args: [
          [['session_id', '=', lastSession.session_id]],
          ['id', 'amount_total', 'date_order', 'partner_id'],
        ],
      });

      const mappedOrders: Sale[] = orders.map((order) => ({
        id: order.id,
        total: order.amount_total,
        timestamp: order.date_order,
        partner: order.partner_id?.[1] || null,
      }));

      const total = mappedOrders.reduce((sum, o) => sum + o.total, 0);

      setData({
        session_id: lastSession.session_id,
        session_name: lastSession.session_name,
        total,
        orders: mappedOrders,
      });
    } catch (err) {
      console.error('Fout bij ophalen laatste sessie data:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, lastSession, fetchFromOdoo]);

  const toggleOrder = async (orderId: number) => {
    const isExpanded = expandedOrders[orderId];
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !isExpanded }));

    if (!isExpanded && !orderLines[orderId]) {
      setLoadingOrderLines((prev) => ({ ...prev, [orderId]: true }));
      try {
        const res = await fetch(`/api/order-lines?id=${orderId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const json: { lines: OrderLine[] } = await res.json();
        setOrderLines((prev) => ({ ...prev, [orderId]: json.lines || [] }));
      } catch (err) {
        console.error(`❌ Fout bij laden orderlijnen van order ${orderId}:`, err);
      } finally {
        setLoadingOrderLines((prev) => ({ ...prev, [orderId]: false }));
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn && !authLoading) {
      fetchSales();
    }
  }, [isLoggedIn, authLoading, fetchSales]);

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">⏳ Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">🧾 POS Verkoopoverzicht</h1>
            <button
              onClick={fetchSales}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow"
            >
              🔄 Refresh
            </button>
          </div>

        {loading ? (
          <p>⏳ Gegevens laden...</p>
        ) : data ? (
          <>
            {showingLastSession && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <p className="text-yellow-800">
                    📋 Bekijkt laatste gesloten sessie: <strong>{data.session_name}</strong>
                  </p>
                  <button
                    onClick={fetchSales}
                    className="text-sm px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
                  >
                    🔄 Terug naar actieve sessies
                  </button>
                </div>
              </div>
            )}
            <p className="mb-2 text-gray-700">
              Sessienaam: <strong>{data.session_name}</strong>
            </p>
            <div className="mb-4 flex gap-4">
              <p className="text-gray-700">
                Aantal orders: <strong>{data.orders.length}</strong>
              </p>
              <p className="text-gray-700">
                Totale omzet: <strong>€ {data.total.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </p>
            </div>
            <ul className="space-y-2">
              {data.orders.map((order) => (
                <li key={order.id} className="border border-gray-200 bg-white rounded-xl shadow-sm">
                  <button
                    onClick={() => toggleOrder(order.id)}
                    className="w-full px-4 py-2 flex justify-between items-center"
                  >
                    <span>{new Date(order.timestamp + 'Z').toLocaleTimeString('nl-BE', { timeZone: 'Europe/Brussels' })}</span>
                    <span className="text-sm text-gray-800">{order.partner || '-'}</span>
                    <span className="font-bold text-blue-800">€ {order.total.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </button>

                  {expandedOrders[order.id] && (
                    <div className="px-6 pb-4">
                      {loadingOrderLines[order.id] ? (
                        <p className="text-sm text-gray-500">Laden...</p>
                      ) : (
                        <table className="w-full mt-2 text-sm">
                          <tbody>
                            {orderLines[order.id]?.map((line, index) => (
                              <tr key={index} className="border-t border-gray-200">
                                <td className="font-semibold pr-2 py-1">{line.product_name}</td>
                                {line.qty > 1 && (
                                  <td className="text-right text-gray-800 whitespace-nowrap px-2">
                                    {line.qty} × € {line.price_unit.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                )}
                                <td className="text-right font-bold text-blue-800 whitespace-nowrap pl-2">
                                  € {(line.qty * line.price_unit).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : lastSession ? (
          <div className="text-center py-8">
            <p className="text-gray-800 mb-4">❌ Geen actieve POS-sessie gevonden</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 mb-3">
                Laatste gesloten sessie: <strong>{lastSession.session_name}</strong>
              </p>
              <div className="flex justify-center gap-6 mb-3 text-sm">
                <p className="text-blue-700">
                  Aantal orders: <strong>{lastSession.order_count}</strong>
                </p>
                <p className="text-blue-700">
                  Totale omzet: <strong>€ {lastSession.total_amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </p>
              </div>
              <p className="text-sm text-blue-600 mb-4">
                Gesloten op: {new Date(lastSession.end_date + 'Z').toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })}
              </p>
              <button
                onClick={fetchLastSessionSales}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg font-semibold"
              >
                📊 Bekijk laatste sessie
              </button>
            </div>
          </div>
        ) : (
          <p>Geen gegevens beschikbaar.</p>
        )}
        </div>
      </div>
    </div>
  );
}