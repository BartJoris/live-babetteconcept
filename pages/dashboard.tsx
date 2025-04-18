import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

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

type OrderLine = {
  product_name: string;
  qty: number;
  price_unit: number;
};

type OdooOrder = {
  id: number;
  amount_total: number;
  date_order: string;
  partner_id?: [number, string];
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

  const fetchFromOdoo = async <T,>(params: {
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
  };

  const fetchSales = useCallback(async () => {
    if (!uid || !password) return;
    setLoading(true);
    try {
      const sessions = await fetchFromOdoo<{ id: number; name: string }[]>({
        model: 'pos.session',
        method: 'search_read',
        args: [
          [['state', '=', 'opened']],
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

      const orders = await fetchFromOdoo<OdooOrder[]>({
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
  }, [uid, password]);

  useEffect(() => {
    if (uid && password) {
      fetchSales();
      const interval = setInterval(fetchSales, 60000);
      return () => clearInterval(interval);
    }
  }, [uid, password, fetchSales]);

  const toggleOrder = async (orderId: number) => {
    const isExpanded = expandedOrders[orderId];
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !isExpanded }));

    if (!isExpanded && !orderLines[orderId]) {
      setLoadingOrderLines((prev) => ({ ...prev, [orderId]: true }));
      try {
        const res = await fetch(`/api/order-lines?id=${orderId}`);
        const json: { lines: OrderLine[] } = await res.json();
        setOrderLines((prev) => ({ ...prev, [orderId]: json.lines || [] }));
      } catch (err) {
        console.error(`Fout bij laden orderlijnen van order ${orderId}:`, err);
      } finally {
        setLoadingOrderLines((prev) => ({ ...prev, [orderId]: false }));
      }
    }
  };

  const getUniekeDatums = (): string => {
    if (!data?.orders?.length) return '';
    const formatter = new Intl.DateTimeFormat('nl-BE');
    const datums = Array.from(
      new Set(data.orders.map((o) => formatter.format(new Date(o.timestamp + 'Z'))))
    );
    return datums.length === 1 ? datums[0] : `${datums[0]} – ${datums[datums.length - 1]}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">🧾 Kassa {getUniekeDatums()}</h1>
          <button
            onClick={fetchSales}
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow"
          >
            🔄 Refresh
          </button>
        </div>

        {loading && <p>⏳ Gegevens laden...</p>}

        {!loading && data && (
          <>
            <div className="mb-6 space-y-1 text-sm sm:text-base">
              <p className="text-gray-600">📦 Aantal verkopen: <strong>{data.orders.length}</strong></p>
              <p className="text-gray-600">💶 Totale omzet: <strong>€ {data.total.toFixed(2)}</strong></p>
            </div>

            <div className="space-y-2">
              {data.orders.map((order) => {
                const tijd = new Intl.DateTimeFormat('nl-BE', {
                  timeZone: 'Europe/Brussels',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }).format(new Date(order.timestamp + 'Z'));

                return (
                  <div key={order.id}>
                    <div
                      onClick={() => toggleOrder(order.id)}
                      className="border border-gray-200 w-full bg-white rounded-xl shadow-sm cursor-pointer hover:bg-gray-50 px-4 py-3 flex justify-between items-center"
                    >
                      <span className="font-medium">{tijd}</span>
                      <span className="text-gray-700">{order.partner || <span className="text-gray-400">–</span>}</span>
                      <span className="text-right font-bold text-blue-800">€ {order.total.toFixed(2)}</span>
                    </div>

                    {expandedOrders[order.id] && (
                      <div className="bg-gray-50 border border-t-0 border-gray-200 rounded-b-xl px-4 py-3">
                        {loadingOrderLines[order.id] ? (
                          <p className="text-sm text-gray-500">Laden...</p>
                        ) : orderLines[order.id]?.length ? (
                          <table className="w-full text-sm text-gray-700">
                            <thead>
                              <tr className="border-b border-gray-300 text-left">
                                <th className="py-1 font-semibold">Product</th>
                                <th className="py-1">Aantal × Prijs</th>
                                <th className="py-1 text-right font-semibold">Totaal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderLines[order.id].map((line, index) => (
                                <tr key={index} className="border-t border-gray-200">
                                  <td className="py-1 font-semibold">{line.product_name}</td>
                                  <td className="py-1">
                                    {line.qty > 1 ? `${line.qty} × €${line.price_unit.toFixed(2)}` : ''}
                                  </td>
                                  <td className="py-1 text-right font-bold">
                                    € {(line.qty * line.price_unit).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-sm text-gray-500">Geen orderlijnen gevonden.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
