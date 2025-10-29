// pages/sales-dashboard.tsx

import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';

type Sale = {
  id: number;
  total: number;
  timestamp: string;
  partner?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export default function SalesDashboard() {
  const router = useRouter();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [error, setError] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [orderLines, setOrderLines] = useState<Record<number, OrderLine[]>>({});
  const [loadingOrderLines, setLoadingOrderLines] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (storedUid && storedPass) {
        // setUid(Number(storedUid)); // This line is removed as per the new_code
        // setPassword(storedPass); // This line is removed as per the new_code
      } else {
        router.push('/');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSales = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pos-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // body: JSON.stringify({ uid, password }), // This line is removed as per the new_code
      });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Fout bij ophalen verkoopdata:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  const toggleOrder = async (orderId: number) => {
    if (!isLoggedIn) return;
    const isExpanded = expandedOrders[orderId];
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !isExpanded }));

    if (!isExpanded && !orderLines[orderId]) {
      setLoadingOrderLines((prev) => ({ ...prev, [orderId]: true }));
      try {
        const res = await fetch(`/api/order-lines?id=${orderId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // body: JSON.stringify({ uid, password }), // This line is removed as per the new_code
        });
        const json = await res.json();
        setOrderLines((prev) => ({ ...prev, [orderId]: json.lines || [] }));
      } catch (err) {
        console.error(`Fout bij laden orderlijnen van order ${orderId}:`, err);
      } finally {
        setLoadingOrderLines((prev) => ({ ...prev, [orderId]: false }));
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn && !authLoading) {
      fetchSales();
      const interval = setInterval(fetchSales, 60000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, authLoading, fetchSales]);

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
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">🧾 Kassa {getUniekeDatums()}</h1>
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
              <p className="text-gray-800">📦 Aantal verkopen: <strong>{data.orders.length}</strong></p>
              <p className="text-gray-800">💶 Totale omzet: <strong>€ {data.total.toFixed(2)}</strong></p>
            </div>

            {/* Desktop table view */}
            <table className="hidden sm:table w-full text-left border-t border-gray-200 mb-4">
              <thead className="text-gray-800 uppercase text-sm">
                <tr>
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
                      <td className="py-2">{order.partner || <span className="text-gray-400">–</span>}</td>
                      <td className="py-2 text-right font-medium">€ {order.total.toFixed(2)}</td>
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
                                      {toonQtyKolom && <th className="py-1">Aantal × Prijs</th>}
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

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {data.orders.map((order) => {
                const tijd = new Intl.DateTimeFormat('nl-BE', {
                  timeZone: 'Europe/Brussels',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }).format(new Date(order.timestamp + 'Z'));

                return (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-xl">
                    <div
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => toggleOrder(order.id)}
                    >
                      <div className="flex justify-between text-sm">
                        <span>{tijd}</span>
                        <span className="text-right font-bold text-blue-800">€ {order.total.toFixed(2)}</span>
                      </div>
                      <div className="text-gray-500 text-sm mt-1">
                        {order.partner || <span className="text-gray-300">Geen klant</span>}
                      </div>
                    </div>
                    {expandedOrders[order.id] && (
                      <div className="border-t border-gray-200 px-4 py-3 text-sm bg-gray-50 rounded-b-xl">
                        {loadingOrderLines[order.id] ? (
                          <p className="text-gray-500">Laden...</p>
                        ) : orderLines[order.id]?.length ? (
                          (() => {
                            const lijnen = orderLines[order.id];
                            const toonQtyKolom = lijnen.some((l) => l.qty > 1);

                            return (
                              <table className="w-full text-sm text-gray-700">
                                <thead>
                                  <tr className="border-b border-gray-300 text-left">
                                    <th className="py-1 font-semibold">Product</th>
                                    {toonQtyKolom && <th className="py-1">Aantal × Prijs</th>}
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
                          <p className="text-gray-500">Geen orderlijnen gevonden.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && data && data.orders?.length === 0 && (
          <p className="text-gray-500 mt-4">Er zijn nog geen verkopen geregistreerd in deze sessie.</p>
        )}

        {!loading && !data?.session_id && (
          <p className="text-red-500 mt-4">⚠️ Geen actieve POS-sessie gevonden.</p>
        )}
        </div>
      </div>
    </div>
  );
}
