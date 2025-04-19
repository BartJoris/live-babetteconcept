import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

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

export default function DashboardPage() {
  const router = useRouter();
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [orderLines, setOrderLines] = useState<Record<number, OrderLine[]>>({});
  const [loadingOrderLines, setLoadingOrderLines] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (storedUid && storedPass) {
        setUid(Number(storedUid));
        setPassword(storedPass);
      } else {
        router.push('/');
      }
    }
  }, [router]);

  const fetchFromOdoo = useCallback(async <T,>(params: {
    model: string;
    method: string;
    args: unknown[];
  }): Promise<T> => {
    const res = await fetch('/api/odoo-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        uid,
        password,
      }),
    });
    const json = await res.json();
    return json.result as T;
  }, [uid, password]);

  const fetchSales = useCallback(async () => {
    if (!uid || !password) return;
    setLoading(true);
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
        setData({ session_id: 0, session_name: '', total: 0, orders: [] });
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
  }, [uid, password, fetchFromOdoo]);

  const toggleOrder = async (orderId: number) => {
    const isExpanded = expandedOrders[orderId];
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !isExpanded }));

    if (!isExpanded && !orderLines[orderId]) {
      setLoadingOrderLines((prev) => ({ ...prev, [orderId]: true }));
      try {
        const res = await fetch(`/api/order-lines?id=${orderId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, password }),
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
    if (uid && password) {
      fetchSales();
    }
  }, [uid, password, fetchSales]);

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">🧾 POS Verkoopoverzicht</h1>
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
            <p className="mb-2 text-gray-700">
              Sessienaam: <strong>{data.session_name}</strong>
            </p>
            <p className="mb-4 text-gray-700">
              Totale omzet: <strong>€ {data.total.toFixed(2)}</strong>
            </p>
            <ul className="space-y-2">
              {data.orders.map((order) => (
                <li key={order.id} className="border border-gray-200 bg-white rounded-xl shadow-sm">
                  <button
                    onClick={() => toggleOrder(order.id)}
                    className="w-full px-4 py-2 flex justify-between items-center"
                  >
                    <span>{new Date(order.timestamp + 'Z').toLocaleTimeString('nl-BE', { timeZone: 'Europe/Brussels' })}</span>
                    <span className="text-sm text-gray-600">{order.partner || '-'}</span>
                    <span className="font-bold text-blue-800">€ {order.total.toFixed(2)}</span>
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
                                  <td className="text-right text-gray-600 whitespace-nowrap px-2">
                                    {line.qty} × € {line.price_unit.toFixed(2)}
                                  </td>
                                )}
                                <td className="text-right font-bold text-blue-800 whitespace-nowrap pl-2">
                                  € {(line.qty * line.price_unit).toFixed(2)}
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
        ) : (
          <p>Geen gegevens beschikbaar.</p>
        )}
      </div>
    </div>
  );
}