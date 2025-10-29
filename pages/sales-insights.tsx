import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';

type DailySales = {
  date: string;
  total_amount: number;
  order_count: number;
  margin?: number;
  morning_amount: number;  // 9:00-13:00
  afternoon_amount: number; // 13:00-19:00
  morning_orders: number;
  afternoon_orders: number;
  morning_margin?: number;
  afternoon_margin?: number;
};

type MonthlyInsights = {
  total_revenue: number;
  total_orders: number;
  average_daily_revenue: number;
  average_order_value: number;
  daily_sales: DailySales[];
  total_morning_revenue: number;
  total_afternoon_revenue: number;
  total_morning_orders: number;
  total_afternoon_orders: number;
};

export default function SalesInsightsPage() {
  // @ts-expect-error
  const router = useRouter();
  // @ts-expect-error
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [insights, setInsights] = useState<MonthlyInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [marginAvailable, setMarginAvailable] = useState(false);

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
      body: JSON.stringify(params),
    });
    const json = await res.json();
    return json.result as T;
  }, []);

  const fetchMonthlySales = useCallback(async () => {
    if (!isLoggedIn || !selectedMonth) return;
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
          total_morning_revenue: 0,
          total_afternoon_revenue: 0,
          total_morning_orders: 0,
          total_afternoon_orders: 0,
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
          total_morning_revenue: 0,
          total_afternoon_revenue: 0,
          total_morning_orders: 0,
          total_afternoon_orders: 0,
        });
        setLoading(false);
        return;
      }
      
      // 3. Fetch all pos.order for those IDs, get date_order with time
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
      
      const orderIdToDateTime: Record<number, string> = {};
      orders.forEach(order => {
        orderIdToDateTime[order.id] = order.date_order;
      });

      // Helper function to determine if a time is in the morning (9:00-13:00) or afternoon (13:00-19:00)
      const getTimeSlot = (dateTimeStr: string): 'morning' | 'afternoon' | 'other' => {
        const timeStr = dateTimeStr.includes(' ') ? dateTimeStr.split(' ')[1] : '12:00:00';
        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        
        const morningStart = 9 * 60; // 9:00
        const morningEnd = 13 * 60; // 13:00
        const afternoonEnd = 19 * 60; // 19:00
        
        if (totalMinutes >= morningStart && totalMinutes < morningEnd) {
          return 'morning';
        } else if (totalMinutes >= morningEnd && totalMinutes < afternoonEnd) {
          return 'afternoon';
        }
        return 'other';
      };

      // Debug: Track time distribution
      const debugTimeSlots = { morning: 0, afternoon: 0, other: 0 };

      // 4. Group by day and time slot using order's date_order
      const dailyData: Record<string, {
        total: number;
        orderIds: Set<number>;
        margin?: number;
        morning: { total: number; orderIds: Set<number>; margin?: number };
        afternoon: { total: number; orderIds: Set<number>; margin?: number };
      }> = {};
      
      let marginAvailable = false;
      
      lines.forEach((line) => {
        const orderId = line.order_id?.[0];
        const dateTimeStr = orderIdToDateTime[orderId];
        if (!dateTimeStr) return;
        
        let datePart = '';
        if (dateTimeStr.includes('T')) {
          datePart = dateTimeStr.split('T')[0];
        } else if (dateTimeStr.includes(' ')) {
          datePart = dateTimeStr.split(' ')[0];
        } else {
          datePart = dateTimeStr;
        }
        
        if (!dailyData[datePart]) {
          dailyData[datePart] = {
            total: 0,
            orderIds: new Set(),
            margin: 0,
            morning: { total: 0, orderIds: new Set(), margin: 0 },
            afternoon: { total: 0, orderIds: new Set(), margin: 0 },
          };
        }
        
        const amount = line.price_subtotal_incl || 0;
        const margin = line.margin || 0;
        
        // Add to daily totals
        dailyData[datePart].total += amount;
        dailyData[datePart].orderIds.add(orderId);
        
        if (typeof line.margin === 'number') {
          marginAvailable = true;
          dailyData[datePart].margin = (dailyData[datePart].margin || 0) + margin;
        }
        
        // Determine time slot and add to appropriate slot
        const timeSlot = getTimeSlot(dateTimeStr);
        debugTimeSlots[timeSlot]++;
        
        if (timeSlot === 'morning') {
          dailyData[datePart].morning.total += amount;
          dailyData[datePart].morning.orderIds.add(orderId);
          if (typeof line.margin === 'number') {
            dailyData[datePart].morning.margin = (dailyData[datePart].morning.margin || 0) + margin;
          }
        } else if (timeSlot === 'afternoon') {
          dailyData[datePart].afternoon.total += amount;
          dailyData[datePart].afternoon.orderIds.add(orderId);
          if (typeof line.margin === 'number') {
            dailyData[datePart].afternoon.margin = (dailyData[datePart].afternoon.margin || 0) + margin;
          }
        } else {
          // Add 'other' time sales to morning (fallback for early/late sales)
          dailyData[datePart].morning.total += amount;
          dailyData[datePart].morning.orderIds.add(orderId);
          if (typeof line.margin === 'number') {
            dailyData[datePart].morning.margin = (dailyData[datePart].morning.margin || 0) + margin;
          }
        }
      });

      // Convert to array and sort by date
      const dailySales: DailySales[] = Object.entries(dailyData)
        .map(([date, data]) => ({
          date,
          total_amount: data.total,
          order_count: data.orderIds.size,
          morning_amount: data.morning.total,
          afternoon_amount: data.afternoon.total,
          morning_orders: data.morning.orderIds.size,
          afternoon_orders: data.afternoon.orderIds.size,
          ...(marginAvailable && typeof data.margin === 'number' ? { margin: data.margin } : {}),
          ...(marginAvailable && typeof data.morning.margin === 'number' ? { morning_margin: data.morning.margin } : {}),
          ...(marginAvailable && typeof data.afternoon.margin === 'number' ? { afternoon_margin: data.afternoon.margin } : {}),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate insights
      const totalRevenue = dailySales.reduce((sum, day) => sum + day.total_amount, 0);
      const totalOrders = dailySales.reduce((sum, day) => sum + day.order_count, 0);
      const totalMorningRevenue = dailySales.reduce((sum, day) => sum + day.morning_amount, 0);
      const totalAfternoonRevenue = dailySales.reduce((sum, day) => sum + day.afternoon_amount, 0);
      const totalMorningOrders = dailySales.reduce((sum, day) => sum + day.morning_orders, 0);
      const totalAfternoonOrders = dailySales.reduce((sum, day) => sum + day.afternoon_orders, 0);
      const averageDailyRevenue = dailySales.length > 0 ? totalRevenue / dailySales.length : 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Debug logging
      console.log('🕐 Time distribution:', debugTimeSlots);
      console.log('💰 Revenue check:', {
        total: totalRevenue,
        morning: totalMorningRevenue,
        afternoon: totalAfternoonRevenue,
        sum: totalMorningRevenue + totalAfternoonRevenue,
        difference: totalRevenue - (totalMorningRevenue + totalAfternoonRevenue)
      });

      setInsights({
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        average_daily_revenue: averageDailyRevenue,
        average_order_value: averageOrderValue,
        daily_sales: dailySales,
        total_morning_revenue: totalMorningRevenue,
        total_afternoon_revenue: totalAfternoonRevenue,
        total_morning_orders: totalMorningOrders,
        total_afternoon_orders: totalAfternoonOrders,
      });
      setMarginAvailable(marginAvailable);
    } catch (err) {
      console.error('Fout bij ophalen maandelijkse verkoopdata:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, selectedMonth, fetchFromOdoo]);

  useEffect(() => {
    if (isLoggedIn && selectedMonth) {
      fetchMonthlySales();
    }
  }, [isLoggedIn, selectedMonth, fetchMonthlySales]);

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
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📊 Verkoop Inzichten</h1>
          <div className="flex gap-2 items-center">
            <select
              value={selectedMonth.split('-')[0]}
              onChange={(e) => {
                const year = e.target.value;
                const month = selectedMonth.split('-')[1];
                setSelectedMonth(`${year}-${month}`);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-medium bg-white"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={selectedMonth.split('-')[1]}
              onChange={(e) => {
                const year = selectedMonth.split('-')[0];
                const month = e.target.value;
                setSelectedMonth(`${year}-${month}`);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-medium bg-white"
            >
              {[
                { value: '01', label: 'Januari' },
                { value: '02', label: 'Februari' },
                { value: '03', label: 'Maart' },
                { value: '04', label: 'April' },
                { value: '05', label: 'Mei' },
                { value: '06', label: 'Juni' },
                { value: '07', label: 'Juli' },
                { value: '08', label: 'Augustus' },
                { value: '09', label: 'September' },
                { value: '10', label: 'Oktober' },
                { value: '11', label: 'November' },
                { value: '12', label: 'December' }
              ].map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
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
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Overzicht {formatMonth(selectedMonth)}
              </h2>
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-600 text-sm font-medium">Totale Omzet</p>
                  <p className="text-2xl font-bold text-blue-800">€ {insights.total_revenue.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-green-600 text-sm font-medium">Totaal Orders</p>
                  <p className="text-2xl font-bold text-green-800">{insights.total_orders}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <p className="text-purple-600 text-sm font-medium">Gem. Dagelijkse Omzet</p>
                  <p className="text-2xl font-bold text-purple-800">€ {insights.average_daily_revenue.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="text-orange-600 text-sm font-medium">Gem. Orderwaarde</p>
                  <p className="text-2xl font-bold text-orange-800">€ {insights.average_order_value.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                  <p className="text-amber-600 text-sm font-medium">Ochtend Omzet</p>
                  <p className="text-2xl font-bold text-amber-800">€ {insights.total_morning_revenue.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <p className="text-indigo-600 text-sm font-medium">Middag Omzet</p>
                  <p className="text-2xl font-bold text-indigo-800">€ {insights.total_afternoon_revenue.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                {marginAvailable && (
                  <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                    <p className="text-green-700 text-sm font-medium">Totale Marge</p>
                    <p className="text-2xl font-bold text-green-900">
                      € {insights.daily_sales.reduce((sum, day) => sum + (day.margin || 0), 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>

              {/* Daily Sales Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Dagelijkse Verkoop</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                                      <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Datum
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Totale Omzet
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Aantal Orders
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Ochtend
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Middag
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Gem. Orderwaarde
                      </th>
                      {marginAvailable && (
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
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
                              € {day.total_amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {day.order_count}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-amber-700">
                              € {day.morning_amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="text-xs text-gray-500 block">({day.morning_orders} orders)</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-700">
                              € {day.afternoon_amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="text-xs text-gray-500 block">({day.afternoon_orders} orders)</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                              € {(day.total_amount / day.order_count).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {marginAvailable && (
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-800 font-semibold">
                                € {day.margin?.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-'}
                              </td>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={marginAvailable ? 7 : 6} className="px-6 py-4 text-center text-gray-500">
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