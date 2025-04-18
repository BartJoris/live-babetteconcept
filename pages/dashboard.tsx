// pages/dashboard.tsx

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { odooCall } from '../lib/odoo';

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

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [orderLines, setOrderLines] = useState<Record<number, OrderLine[]>>({});
  const [loadingOrderLines, setLoadingOrderLines] = useState<Record<number, boolean>>({});

  const uid = typeof window !== 'undefined' ? localStorage.getItem('odoo_uid') : null;
  const username = typeof window !== 'undefined' ? localStorage.getItem('odoo_user') : null;
  const password = typeof window !== 'undefined' ? localStorage.getItem('odoo_pass') : null;

  const fetchSales = async () => {
    if (!uid || !username || !password) return;
    setLoading(true);
    try {
      const sessions = await odooCall({
        model: 'pos.session',
        method: 'search_read',
        args: [[['state', '=', 'opened']], ['id', 'name'], 0, 1, 'id desc'],
        uid: parseInt(uid),
        username,
        password,
      });

      if (!sessions.length) {
        setData({ session_id: 0, session_name: '', total: 0, orders: [] });
        return;
      }

      const session = sessions[0];

      const orders = await odooCall({
        model: 'pos.order',
        method: 'search_read',
        args: [
          [['session_id', '=', session.id]],
          ['id', 'amount_total', 'date_order', 'partner_id'],
        ],
        uid: parseInt(uid),
        username,
        password,
      });

      const mappedOrders = orders.map((order: any) => ({
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
      console.error('Fout bij ophalen verkoopdata:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrder = async (orderId: number) => {
    const isExpanded = expandedOrders[orderId];
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !isExpanded }));

    if (!isExpanded && !orderLines[orderId] && uid && username && password) {
      setLoadingOrderLines((prev) => ({ ...prev, [orderId]: true }));
      try {
        const lines = await odooCall({
          model: 'pos.order.line',
          method: 'search_read',
          args: [
            [['order_id', '=', orderId]],
            ['product_id', 'qty', 'price_unit'],
          ],
          uid: parseInt(uid),
          username,
          password,
        });

        setOrderLines((prev) => ({
          ...prev,
          [orderId]: lines.map((line: any) => ({
            product_name: line.product_id?.[1] || '',
            qty: line.qty,
            price_unit: line.price_unit,
          })),
        }));
      } catch (err) {
        console.error(`Fout bij laden orderlijnen van order ${orderId}:`, err);
      } finally {
        setLoadingOrderLines((prev) => ({ ...prev, [orderId]: false }));
      }
    }
  };

  useEffect(() => {
    if (!uid || !username || !password) {
      router.push('/');
      return;
    }
    fetchSales();
    const interval = setInterval(fetchSales, 60000);
    return () => clearInterval(interval);
  }, [uid, username, password]);

  const getUniekeDatums = (): string => {
    if (!data?.orders?.length) return '';

    const formatter = new Intl.DateTimeFormat('nl-BE');
    const datums = Array.from(
      new Set(
        data.orders.map((order) =>
          formatter.format(new Date(order.timestamp + 'Z'))
        )
      )
    ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return datums.length === 1
      ? datums[0]
      : `${datums[0]} – ${datums[datums.length - 1]}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">🧾 Kassa {getUniekeDatums()}</h1>
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
            <div className="mb-6 space-y-1">
              <p className="text-gray-600">📦 Aantal verkopen: <strong>{data.orders.length}</strong></p>
              <p className="text-gray-600">💶 Totale omzet: <strong>€ {data.total.toFixed(2)}</strong></p>
            </div>

            <table className="w-full text-left border-t border-gray-200">
              <thead>
                <tr className="text-gray-600 uppercase text-sm">
                  <th className="py-2">Tijd</th>
                  <th className="py-2">Klant</th>
                  <th className="py-2 text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <React.Fragment key={order.id}>
                    <tr
                      onClick={() => toggleOrder(order.id)}
                      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2">
                        {new Intl.DateTimeFormat('nl-BE', {
                          timeZone: 'Europe/Brussels',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        }).format(new Date(order.timestamp + 'Z'))}
                      </td>
                      <td className="py-2">
                        {order.partner ? order.partner : <span className="text-gray-400">–</span>}
                      </td>
                      <td className="py-2 text-right font-medium">
                        € {order.total.toFixed(2)}
                      </td>
                    </tr>

                    {expandedOrders[order.id] && (
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="p-4">
                          {loadingOrderLines[order.id] ? (
                            <p className="text-sm text-gray-500">Laden...</p>
                          ) : orderLines[order.id]?.length ? (
                            (() => {
                              const lijnen = orderLines[order.id];
                              const toonQtyKolom = lijnen.some((l) => l.qty > 1);

                              return (
                                <table className="w-full text-sm text-gray-700">
                                  <thead>
                                    <tr className="border-b border-gray-300 text-left">
                                      <th className="py-1 font-semibold">Product</th>
                                      {toonQtyKolom && (
                                        <th className="py-1">Aantal × Prijs</th>
                                      )}
                                      <th className="py-1 text-right font-semibold">Totaal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lijnen.map((line, index) => (
                                      <tr key={index} className="border-t border-gray-200">
                                        <td className="py-1 font-semibold">{line.product_name}</td>
                                        {toonQtyKolom && (
                                          <td className="py-1">
                                            {line.qty > 1
                                              ? `${line.qty} × € ${line.price_unit.toFixed(2)}`
                                              : `€ ${line.price_unit.toFixed(2)}`}
                                          </td>
                                        )}
                                        <td className="py-1 text-right font-bold">
                                          € {(line.qty * line.price_unit).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              );
                            })()
                          ) : (
                            <p className="text-sm text-gray-500">Geen orderlijnen gevonden.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!loading && data && data.orders?.length === 0 && (
          <p className="text-gray-500">Er zijn nog geen verkopen geregistreerd in deze sessie.</p>
        )}

        {!loading && !data?.session_id && (
          <p className="text-red-500">⚠️ Geen actieve POS-sessie gevonden.</p>
        )}
      </div>
    </div>
  );
}
