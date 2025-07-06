import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Navigation from '../components/Navigation';

type DailySales = {
  date: string;
  total_amount: number;
  order_count: number;
  margin?: number;
};

type MonthlyInsights = {
  total_revenue: number;
  total_orders: number;
  average_daily_revenue: number;
  average_order_value: number;
  daily_sales: DailySales[];
};

export default function SalesInsightsPage() {
  const router = useRouter();
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [insights, setInsights] = useState<MonthlyInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [marginAvailable, setMarginAvailable] = useState(false);

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

  // Set default month to current month
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

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

  const fetchMonthlySales = useCallback(async () => {
    if (!uid || !password || !selectedMonth) return;
    setLoading(true);
    try {
      // Parse the selected month
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

      // 1. Fetch all pos.order.line for the month (filter by order_id later)
      const lines = await fetchFromOdoo<{
        id: number;
        margin?: number;
        order_id: [number, string];
        price_subtotal_incl?: number;
      }[]>({
        model: 'pos.order.line',
        method: 'search_read',
        args: [
          [],
          ['id', 'margin', 'order_id', 'price_subtotal_incl'],
        ],
      });

      if (!lines.length || typeof lines[0].price_subtotal_incl !== 'number') {
        setInsights({
          total_revenue: 0,
          total_orders: 0,
          average_daily_revenue: 0,
          average_order_value: 0,
          daily_sales: [],
        });
        setLoading(false);
        alert('Let op: het veld price_subtotal_incl (inclusief btw) is niet beschikbaar op pos.order.line. Vraag je Odoo-beheerder om dit veld te activeren.');
        return;
      }

      // 2. Collect all unique order_ids
      const orderIds = Array.from(new Set(lines.map(line => line.order_id?.[0]).filter(Boolean)));
      if (orderIds.length === 0) {
        setInsights({
          total_revenue: 0,
          total_orders: 0,
          average_daily_revenue: 0,
          average_order_value: 0,
          daily_sales: [],
        });
        setLoading(false);
        return;
      }
      // 3. Fetch all pos.order for those IDs, get date_order
      const orders = await fetchFromOdoo<{
        id: number;
        date_order: string;
      }[]>({
        model: 'pos.order',
        method: 'search_read',
        args: [
          [['id', 'in', orderIds], ['date_order', '>=', startDate], ['date_order', '<=', endDate + ' 23:59:59']],
          ['id', 'date_order'],
        ],
      });
      const orderIdToDate: Record<number, string> = {};
      orders.forEach(order => {
        orderIdToDate[order.id] = order.date_order;
      });
      // 4. Group by day using order's date_order
      const dailyData: Record<string, { total: number; orderIds: Set<number>; margin?: number }> = {};
      let marginAvailable = false;
      lines.forEach((line) => {
        const orderId = line.order_id?.[0];
        const dateStr = orderIdToDate[orderId];
        if (!dateStr) return;
        let datePart = '';
        if (dateStr.includes('T')) {
          datePart = dateStr.split('T')[0];
        } else if (dateStr.includes(' ')) {
          datePart = dateStr.split(' ')[0];
        } else {
          datePart = dateStr;
        }
        if (!dailyData[datePart]) {
          dailyData[datePart] = { total: 0, orderIds: new Set(), margin: 0 };
        }
        dailyData[datePart].total += line.price_subtotal_incl || 0;
        dailyData[datePart].orderIds.add(orderId);
        if (typeof line.margin === 'number') {
          marginAvailable = true;
          dailyData[datePart].margin = (dailyData[datePart].margin || 0) + line.margin;
        }
      });
      // Convert to array and sort by date
      const dailySales: DailySales[] = Object.entries(dailyData)
        .map(([date, data]) => ({
          date,
          total_amount: data.total,
          order_count: data.orderIds.size,
          ...(marginAvailable && typeof data.margin === 'number' ? { margin: data.margin } : {}),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      // Calculate insights
      const totalRevenue = dailySales.reduce((sum, day) => sum + day.total_amount, 0);
      const totalOrders = dailySales.reduce((sum, day) => sum + day.order_count, 0);
      const averageDailyRevenue = dailySales.length > 0 ? totalRevenue / dailySales.length : 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      setInsights({
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        average_daily_revenue: averageDailyRevenue,
        average_order_value: averageOrderValue,
        daily_sales: dailySales,
      });
      setMarginAvailable(marginAvailable);
    } catch (err) {
      console.error('Fout bij ophalen maandelijkse verkoopdata:', err);
    } finally {
      setLoading(false);
    }
  }, [uid, password, selectedMonth, fetchFromOdoo]);

  useEffect(() => {
    if (uid && password && selectedMonth) {
      fetchMonthlySales();
    }
  }, [uid, password, selectedMonth, fetchMonthlySales]);

  const formatDate = (dateString: string) => {
    // Format as 'Mon 15 Jul' in Dutch
    return new Date(dateString + 'T00:00:00').toLocaleDateString('nl-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-').map(Number);
    return new Date(year, month - 1).toLocaleDateString('nl-BE', {
      year: 'numeric',
      month: 'long',
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Navigation />
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">📊 Verkoop Inzichten</h1>
          <div className="flex gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchMonthlySales}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p>⏳ Gegevens laden...</p>
        ) : insights ? (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-4">
                Overzicht {formatMonth(selectedMonth)}
              </h2>
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-600 text-sm font-medium">Totale Omzet</p>
                  <p className="text-2xl font-bold text-blue-800">€ {insights.total_revenue.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-green-600 text-sm font-medium">Totaal Orders</p>
                  <p className="text-2xl font-bold text-green-800">{insights.total_orders}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <p className="text-purple-600 text-sm font-medium">Gem. Dagelijkse Omzet</p>
                  <p className="text-2xl font-bold text-purple-800">€ {insights.average_daily_revenue.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="text-orange-600 text-sm font-medium">Gem. Orderwaarde</p>
                  <p className="text-2xl font-bold text-orange-800">€ {insights.average_order_value.toFixed(2)}</p>
                </div>
                {marginAvailable && (
                  <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                    <p className="text-green-700 text-sm font-medium">Totale Marge</p>
                    <p className="text-2xl font-bold text-green-900">
                      € {insights.daily_sales.reduce((sum, day) => sum + (day.margin || 0), 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              {/* Daily Sales Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Dagelijkse Verkoop</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Datum
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Totale Omzet
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Aantal Orders
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Gem. Orderwaarde
                        </th>
                        {marginAvailable && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Marge
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {insights.daily_sales.length > 0 ? (
                        insights.daily_sales.map((day, index) => (
                          <tr key={day.date} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {formatDate(day.date)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-800">
                              € {day.total_amount.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {day.order_count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              € {(day.total_amount / day.order_count).toFixed(2)}
                            </td>
                            {marginAvailable && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-800 font-semibold">
                                € {day.margin?.toFixed(2) ?? '-'}
                              </td>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={marginAvailable ? 5 : 4} className="px-6 py-4 text-center text-gray-500">
                            Geen verkoopdata gevonden voor deze maand
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p>Geen gegevens beschikbaar.</p>
        )}
        </div>
      </div>
    </div>
  );
} 