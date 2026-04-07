import { useEffect, useState, useCallback } from 'react';
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
  const { isLoggedIn } = useAuth();
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

  const fetchMonthlySales = useCallback(async () => {
    if (!isLoggedIn || !selectedMonth) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sales-insights-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error('sales-insights-data:', json);
        setInsights(null);
        return;
      }
      if (json.fieldError) {
        alert(`Let op: ${json.fieldError}`);
      }
      setInsights(json.insights as MonthlyInsights);
      setMarginAvailable(Boolean(json.marginAvailable));
    } catch (err) {
      console.error('Fout bij ophalen maandelijkse verkoopdata:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, selectedMonth]);

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