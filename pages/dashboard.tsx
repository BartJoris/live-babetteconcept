import React, { useEffect, useState } from 'react';

type Session = { id: number; name: string; total: number };
type Order = { id: number; total: number; timestamp: string; partner?: string | null };
type OrderLine = { product_name: string; qty: number; price_unit: number };

export default function DashboardPage() {
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [orderLines, setOrderLines] = useState<Record<number, OrderLine[]>>({});
  const [loadingLines, setLoadingLines] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem('odoo_uid');
    const p = localStorage.getItem('odoo_pass');
    if (u && p) {
      setUid(Number(u));
      setPassword(p);
    }
  }, []);

  useEffect(() => {
    if (uid && password && !selectedSession) {
      fetch('/api/pos-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      })
        .then((r) => r.json())
        .then((json) => {
          setSessions(json.sessions ?? []);
          setLoading(false);
        });
    }
  }, [uid, password, selectedSession]);

  const fetchDetails = async (s: Session) => {
    setLoading(true);
    const res = await fetch('/api/pos-sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, password, sessionId: s.id }),
    });
    const json = await res.json();
    setSelectedSession({ id: json.session_id, name: json.session_name, total: json.total });
    setOrders(json.orders ?? []);
    setLoading(false);
  };

  const toggleOrder = async (orderId: number) => {
    const isOpen = expandedOrders[orderId];
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !isOpen }));

    if (!isOpen && !orderLines[orderId]) {
      setLoadingLines((prev) => ({ ...prev, [orderId]: true }));
      const res = await fetch(`/api/order-lines?id=${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password }),
      });
      const json = await res.json();
      setOrderLines((prev) => ({ ...prev, [orderId]: json.lines || [] }));
      setLoadingLines((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  if (loading) return <div className="p-4">⏳ Laden...</div>;

  if (!selectedSession) {
    const totalAll = sessions.reduce((sum, s) => sum + s.total, 0);
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-2">🧾 Actieve Kassa Sessies</h1>
        <p className="mb-4">Totale omzet: <strong>€ {totalAll.toFixed(2)}</strong></p>
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id} className="border rounded px-4 py-2 bg-white shadow flex justify-between items-center">
              <span>{s.name}</span>
              <span className="text-blue-800 font-bold">€ {s.total.toFixed(2)}</span>
              <button
                className="ml-4 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                onClick={() => fetchDetails(s)}
              >
                📂 Open
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">🧾 Kassa {selectedSession.name}</h1>
      <p className="mb-4">Totale omzet: <strong>€ {selectedSession.total.toFixed(2)}</strong></p>
      <button className="mb-4 px-3 py-1 bg-gray-300 rounded" onClick={() => setSelectedSession(null)}>← Terug</button>
      <ul className="space-y-2">
        {orders.map((order) => (
          <li key={order.id} className="bg-white rounded shadow px-4 py-2">
            <button
              onClick={() => toggleOrder(order.id)}
              className="w-full flex justify-between items-center"
            >
              <span>{new Date(order.timestamp + 'Z').toLocaleTimeString('nl-BE', { timeZone: 'Europe/Brussels' })}</span>
              <span className="text-sm text-gray-600">{order.partner || '-'}</span>
              <span className="font-bold text-blue-800">€ {order.total.toFixed(2)}</span>
            </button>

            {expandedOrders[order.id] && (
              <div className="mt-2">
                {loadingLines[order.id] ? (
                  <p className="text-sm text-gray-500">⏳ Lijnen laden...</p>
                ) : (
                  <table className="w-full text-sm mt-1">
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
    </div>
  );
}