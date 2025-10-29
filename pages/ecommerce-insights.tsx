import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

type MonthData = {
  revenue: number;
  orders: number;
  items: number;
  avgOrderValue: number;
};

type YearlyData = {
  [month: string]: MonthData;
};

type EcommerceData = {
  [year: string]: YearlyData;
};

type TopProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

type CustomerInsight = {
  total_customers: number;
  new_customers: number;
  returning_customers: number;
  avg_orders_per_customer: number;
};

type PaymentMethod = {
  name: string;
  count: number;
  total: number;
};

type Website = {
  id: number;
  name: string;
};

type CancelledOrder = {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  partner_name: string | null;
  products: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
};

type ReturnInsight = {
  total_cancelled: number;
  total_cancelled_revenue: number;
  return_rate: number;
  monthly_returns: Record<string, { count: number; revenue: number }>;
  cancelled_orders: CancelledOrder[];
  top_returned_products: Array<{ name: string; count: number; total_quantity: number }>;
};

type InsightsData = {
  compareData: EcommerceData;
  topProducts: TopProduct[];
  customerInsights: CustomerInsight;
  paymentMethods: PaymentMethod[];
  yearlyGrowth: Record<string, number>;
  websites: Website[];
  returnInsights: ReturnInsight;
};

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

const formatNumber = (num: number) =>
  num.toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function EcommerceInsightsPage() {
  // @ts-expect-error - router will be used for future navigation features
  const router = useRouter();
  // @ts-expect-error - auth data for future features
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [allYears, setAllYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'overview' | 'comparison' | 'products' | 'customers' | 'returns'>('overview');
  const [selectedWebsite, setSelectedWebsite] = useState<string>('all');
  const [expandedCancelledOrders, setExpandedCancelledOrders] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
      years.push(y);
    }
    setAllYears(years);
    setSelectedYears([now.getFullYear(), now.getFullYear() - 1]);
  }, []);

  const fetchInsights = useCallback(async () => {
    if (!selectedYears.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ecommerce-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          years: selectedYears,
          websiteId: selectedWebsite,
        }),
      });
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching ecommerce insights:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYears, selectedWebsite]);

  useEffect(() => {
    if (isLoggedIn && selectedYears.length) {
      fetchInsights();
    }
  }, [isLoggedIn, selectedYears, selectedWebsite, fetchInsights]);

  // Set default website to "Babette." when data is loaded
  useEffect(() => {
    if (data?.websites && selectedWebsite === 'all') {
      const babetteWebsite = data.websites.find(w => w.name === 'Babette.');
      if (babetteWebsite) {
        setSelectedWebsite(babetteWebsite.id.toString());
      }
    }
  }, [data?.websites, selectedWebsite]);

  // Calculate totals for each year
  const getYearTotals = (year: number) => {
    if (!data?.compareData[year]) return { revenue: 0, orders: 0, items: 0, avgOrderValue: 0 };
    
    const yearData = data.compareData[year];
    let revenue = 0;
    let orders = 0;
    let items = 0;

    MONTHS.forEach(month => {
      if (yearData[month]) {
        revenue += yearData[month].revenue;
        orders += yearData[month].orders;
        items += yearData[month].items;
      }
    });

    return {
      revenue,
      orders,
      items,
      avgOrderValue: orders > 0 ? revenue / orders : 0,
    };
  };

  // Revenue comparison chart
  const revenueChartData = {
    labels: MONTH_LABELS,
    datasets: selectedYears.map((year, idx) => ({
      label: `Omzet ${year}`,
      data: MONTHS.map(m => data?.compareData[year]?.[m]?.revenue || 0),
      borderColor: `hsl(${idx * 80}, 70%, 50%)`,
      backgroundColor: `hsl(${idx * 80}, 70%, 80%)`,
      tension: 0.3,
    })),
  };

  // Orders comparison chart
  const ordersChartData = {
    labels: MONTH_LABELS,
    datasets: selectedYears.map((year, idx) => ({
      label: `Orders ${year}`,
      data: MONTHS.map(m => data?.compareData[year]?.[m]?.orders || 0),
      borderColor: `hsl(${idx * 80 + 40}, 70%, 50%)`,
      backgroundColor: `hsl(${idx * 80 + 40}, 70%, 70%)`,
    })),
  };

  // Average order value chart
  const avgOrderValueChartData = {
    labels: MONTH_LABELS,
    datasets: selectedYears.map((year, idx) => ({
      label: `Gemiddelde Order ${year}`,
      data: MONTHS.map(m => data?.compareData[year]?.[m]?.avgOrderValue || 0),
      borderColor: `hsl(${idx * 80 + 120}, 70%, 50%)`,
      backgroundColor: `hsl(${idx * 80 + 120}, 70%, 80%)`,
      tension: 0.3,
    })),
  };

  // Top products chart
  const topProductsChartData = data?.topProducts ? {
    labels: data.topProducts.slice(0, 10).map(p => p.name.length > 30 ? p.name.substring(0, 30) + '...' : p.name),
    datasets: [{
      label: 'Omzet',
      data: data.topProducts.slice(0, 10).map(p => p.revenue),
      backgroundColor: [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(199, 199, 199, 0.8)',
        'rgba(83, 102, 255, 0.8)',
        'rgba(255, 99, 255, 0.8)',
        'rgba(99, 255, 132, 0.8)',
      ],
    }],
  } : null;

  // Payment methods chart
  const paymentMethodsChartData = data?.paymentMethods ? {
    labels: data.paymentMethods.map(pm => pm.name || 'Onbekend'),
    datasets: [{
      label: 'Aantal Orders',
      data: data.paymentMethods.map(pm => pm.count),
      backgroundColor: [
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)',
      ],
    }],
  } : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                🛍️ E-commerce Inzichten
              </h1>
              <button
                onClick={fetchInsights}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow disabled:opacity-50"
              >
                {loading ? '⏳ Laden...' : '🔄 Vernieuwen'}
              </button>
            </div>

            {/* Year and Website Selection */}
            <div className="space-y-3 mb-4">
              <div className="flex flex-wrap gap-2 items-center">
                <label className="font-medium text-gray-700">Jaren vergelijken:</label>
                {allYears.map(y => (
                  <label key={y} className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(y)}
                      onChange={e => {
                        setSelectedYears(val =>
                          e.target.checked ? [...val, y].sort((a, b) => b - a) : val.filter(v => v !== y)
                        );
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-700 font-medium">{y}</span>
                  </label>
                ))}
              </div>

              {/* Website Filter */}
              {data?.websites && data.websites.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="font-medium text-gray-700">Website:</label>
                  <select
                    value={selectedWebsite}
                    onChange={e => setSelectedWebsite(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {/* Show Babette first, then others, then "All" at the end */}
                    {data.websites
                      .sort((a, b) => {
                        if (a.name === 'Babette.') return -1;
                        if (b.name === 'Babette.') return 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map(website => (
                        <option key={website.id} value={website.id}>
                          {website.name}
                        </option>
                      ))}
                    <option value="all">── Alle websites ──</option>
                  </select>
                </div>
              )}
            </div>

            {/* View Mode Tabs */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'overview', label: '📊 Overzicht', icon: '📊' },
                { key: 'comparison', label: '📈 Vergelijking', icon: '📈' },
                { key: 'products', label: '🏆 Top Producten', icon: '🏆' },
                { key: 'customers', label: '👥 Klanten', icon: '👥' },
                { key: 'returns', label: '↩️ Retourzendingen', icon: '↩️' },
              ].map(mode => (
                <button
                  key={mode.key}
                  onClick={() => setViewMode(mode.key as any)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    viewMode === mode.key
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="bg-white shadow-xl rounded-2xl p-12 text-center">
              <p className="text-xl text-gray-600">⏳ Gegevens laden...</p>
            </div>
          ) : data ? (
            <>
              {/* Overview Mode */}
              {viewMode === 'overview' && (
                <div className="space-y-6">
                  {/* Key Metrics Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {selectedYears.map(year => {
                      const totals = getYearTotals(year);
                      const prevYear = year - 1;
                      const prevTotals = selectedYears.includes(prevYear) ? getYearTotals(prevYear) : null;
                      const growth = prevTotals ? ((totals.revenue - prevTotals.revenue) / prevTotals.revenue) * 100 : null;

                      return (
                        <div key={year} className="bg-white shadow-lg rounded-xl p-6">
                          <h3 className="text-lg font-bold text-gray-900 mb-4">{year}</h3>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-600">Totale Omzet</p>
                              <p className="text-2xl font-bold text-blue-600">{formatEuro(totals.revenue)}</p>
                              {growth !== null && (
                                <p className={`text-sm ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {growth >= 0 ? '↗' : '↘'} {growth.toFixed(1)}% vs {prevYear}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Aantal Orders</p>
                              <p className="text-xl font-bold text-indigo-600">{formatNumber(totals.orders)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Gemiddelde Order</p>
                              <p className="text-xl font-bold text-purple-600">{formatEuro(totals.avgOrderValue)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Totaal Items</p>
                              <p className="text-xl font-bold text-pink-600">{formatNumber(totals.items)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Revenue Chart */}
                  <div className="bg-white shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">📈 Omzet per Maand</h2>
                    <Line
                      data={revenueChartData}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: { position: 'top' as const },
                          tooltip: {
                            callbacks: {
                              label: (context) => `${context.dataset.label}: ${formatEuro(context.parsed.y ?? 0)}`,
                            },
                          },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            ticks: {
                              callback: (value) => formatEuro(value as number),
                            },
                          },
                        },
                      }}
                    />
                  </div>

                  {/* Orders & AOV Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white shadow-xl rounded-2xl p-6">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">📦 Aantal Orders per Maand</h2>
                      <Bar
                        data={ordersChartData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'top' as const },
                          },
                          scales: {
                            y: { beginAtZero: true },
                          },
                        }}
                      />
                    </div>

                    <div className="bg-white shadow-xl rounded-2xl p-6">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">💰 Gemiddelde Orderwaarde</h2>
                      <Line
                        data={avgOrderValueChartData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'top' as const },
                            tooltip: {
                              callbacks: {
                                label: (context) => `${context.dataset.label}: ${formatEuro(context.parsed.y ?? 0)}`,
                              },
                            },
                          },
                          scales: {
                            y: {
                              beginAtZero: true,
                              ticks: {
                                callback: (value) => formatEuro(value as number),
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Comparison Mode */}
              {viewMode === 'comparison' && (
                <div className="bg-white shadow-xl rounded-2xl p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">📊 Maandelijkse Vergelijking</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-gray-900 font-semibold">Maand</th>
                          {selectedYears.map(y => (
                            <React.Fragment key={y}>
                              <th className="px-4 py-3 text-right text-gray-900 font-semibold">Omzet {y}</th>
                              <th className="px-4 py-3 text-right text-gray-900 font-semibold">Orders {y}</th>
                              <th className="px-4 py-3 text-right text-gray-900 font-semibold">Gem. {y}</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MONTHS.map((m, idx) => (
                          <tr key={m} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-3 font-medium text-gray-900">{MONTH_LABELS[idx]}</td>
                            {selectedYears.map(y => {
                              const monthData = data?.compareData[y]?.[m];
                              return (
                                <React.Fragment key={y}>
                                  <td className="px-4 py-3 text-right text-gray-800">
                                    {monthData ? formatEuro(monthData.revenue) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right text-gray-800">
                                    {monthData ? formatNumber(monthData.orders) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right text-gray-800">
                                    {monthData ? formatEuro(monthData.avgOrderValue) : '-'}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Totals Row */}
                        <tr className="bg-blue-100 font-bold border-t-2 border-gray-300">
                          <td className="px-4 py-3 text-gray-900">Totaal</td>
                          {selectedYears.map(y => {
                            const totals = getYearTotals(y);
                            return (
                              <React.Fragment key={y}>
                                <td className="px-4 py-3 text-right text-gray-900">
                                  {formatEuro(totals.revenue)}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-900">
                                  {formatNumber(totals.orders)}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-900">
                                  {formatEuro(totals.avgOrderValue)}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Products Mode */}
              {viewMode === 'products' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Products Chart */}
                    {topProductsChartData && (
                      <div className="bg-white shadow-xl rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">🏆 Top 10 Producten (Omzet)</h2>
                        <Bar
                          data={topProductsChartData}
                          options={{
                            responsive: true,
                            indexAxis: 'y' as const,
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (context) => formatEuro(context.parsed.x ?? 0),
                                },
                              },
                            },
                            scales: {
                              x: {
                                ticks: {
                                  callback: (value) => formatEuro(value as number),
                                },
                              },
                            },
                          }}
                        />
                      </div>
                    )}

                    {/* Top Products Table */}
                    <div className="bg-white shadow-xl rounded-2xl p-6">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">📊 Top Producten Details</h2>
                      <div className="overflow-y-auto max-h-96">
                        <table className="w-full">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">#</th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">Product</th>
                              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900">Aantal</th>
                              <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900">Omzet</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.topProducts.slice(0, 20).map((product, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-4 py-2 text-sm text-gray-600">{idx + 1}</td>
                                <td className="px-4 py-2 text-sm text-gray-900 font-medium">{product.name}</td>
                                <td className="px-4 py-2 text-sm text-right text-gray-800">{formatNumber(product.quantity)}</td>
                                <td className="px-4 py-2 text-sm text-right text-blue-600 font-semibold">
                                  {formatEuro(product.revenue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Customers Mode */}
              {viewMode === 'customers' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Customer Insights */}
                    <div className="bg-white shadow-xl rounded-2xl p-6">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">👥 Klant Inzichten</h2>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                          <span className="text-gray-700 font-medium">Totaal Klanten</span>
                          <span className="text-2xl font-bold text-blue-600">
                            {formatNumber(data.customerInsights.total_customers)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
                          <span className="text-gray-700 font-medium">Nieuwe Klanten</span>
                          <span className="text-2xl font-bold text-green-600">
                            {formatNumber(data.customerInsights.new_customers)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-purple-50 rounded-lg">
                          <span className="text-gray-700 font-medium">Terugkerende Klanten</span>
                          <span className="text-2xl font-bold text-purple-600">
                            {formatNumber(data.customerInsights.returning_customers)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-orange-50 rounded-lg">
                          <span className="text-gray-700 font-medium">Gem. Orders per Klant</span>
                          <span className="text-2xl font-bold text-orange-600">
                            {data.customerInsights.avg_orders_per_customer.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    {paymentMethodsChartData && (
                      <div className="bg-white shadow-xl rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">💳 Betaalmethodes</h2>
                        <Doughnut
                          data={paymentMethodsChartData}
                          options={{
                            responsive: true,
                            plugins: {
                              legend: { position: 'bottom' as const },
                            },
                          }}
                        />
                        <div className="mt-4 space-y-2">
                          {data.paymentMethods.map((pm, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                              <span className="text-sm font-medium text-gray-700">{pm.name || 'Onbekend'}</span>
                              <div className="text-right">
                                <span className="text-sm text-gray-600">{formatNumber(pm.count)} orders</span>
                                <span className="text-sm text-gray-900 font-semibold ml-3">
                                  {formatEuro(pm.total)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Returns Mode */}
              {viewMode === 'returns' && (
                <div className="space-y-6">
                  {/* Return Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white shadow-lg rounded-xl p-6">
                      <h3 className="text-sm text-gray-600 mb-2">Geannuleerde Orders</h3>
                      <p className="text-3xl font-bold text-red-600">
                        {formatNumber(data.returnInsights.total_cancelled)}
                      </p>
                    </div>
                    <div className="bg-white shadow-lg rounded-xl p-6">
                      <h3 className="text-sm text-gray-600 mb-2">Geannuleerde Omzet</h3>
                      <p className="text-3xl font-bold text-orange-600">
                        {formatEuro(data.returnInsights.total_cancelled_revenue)}
                      </p>
                    </div>
                    <div className="bg-white shadow-lg rounded-xl p-6">
                      <h3 className="text-sm text-gray-600 mb-2">Annuleringspercentage</h3>
                      <p className="text-3xl font-bold text-purple-600">
                        {data.returnInsights.return_rate.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        van totaal aantal orders
                      </p>
                    </div>
                  </div>

                  {/* Top Returned Products */}
                  {data.returnInsights.top_returned_products.length > 0 && (
                    <div className="bg-white shadow-xl rounded-2xl p-6">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">🔄 Meest Geretourneerde Producten</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full border border-gray-200 rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-gray-900 font-semibold">#</th>
                              <th className="px-4 py-3 text-left text-gray-900 font-semibold">Product</th>
                              <th className="px-4 py-3 text-right text-gray-900 font-semibold">Keer Geretourneerd</th>
                              <th className="px-4 py-3 text-right text-gray-900 font-semibold">Totaal Aantal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.returnInsights.top_returned_products.slice(0, 10).map((product, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-4 py-3 text-gray-600 text-sm">{idx + 1}</td>
                                <td className="px-4 py-3 text-gray-900 font-medium">{product.name}</td>
                                <td className="px-4 py-3 text-right text-orange-600 font-semibold">
                                  {formatNumber(product.count)}
                                </td>
                                <td className="px-4 py-3 text-right text-red-600 font-semibold">
                                  {formatNumber(product.total_quantity)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Cancelled Orders List */}
                  {data.returnInsights.cancelled_orders.length > 0 && (
                    <div className="bg-white shadow-xl rounded-2xl p-6">
                      <h2 className="text-xl font-bold text-gray-900 mb-4">
                        📋 Geannuleerde Orders ({data.returnInsights.cancelled_orders.length})
                      </h2>
                      <div className="space-y-2">
                        {data.returnInsights.cancelled_orders.map((order) => (
                          <div key={order.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div
                              className="px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                              onClick={() => setExpandedCancelledOrders(prev => ({
                                ...prev,
                                [order.id]: !prev[order.id]
                              }))}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-gray-900">{order.name}</span>
                                  <span className="text-sm text-gray-600">
                                    {new Date(order.date_order).toLocaleDateString('nl-BE', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                  {order.partner_name && (
                                    <span className="text-sm text-gray-500">• {order.partner_name}</span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 mt-1">
                                  {order.products.length} {order.products.length === 1 ? 'product' : 'producten'}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-lg font-bold text-red-600">
                                  {formatEuro(order.amount_total)}
                                </span>
                                <svg
                                  className={`w-5 h-5 text-gray-400 transform transition-transform ${
                                    expandedCancelledOrders[order.id] ? 'rotate-180' : ''
                                  }`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </div>
                            
                            {expandedCancelledOrders[order.id] && (
                              <div className="px-4 py-3 bg-white border-t border-gray-200">
                                <table className="w-full text-sm">
                                  <thead className="border-b border-gray-200">
                                    <tr className="text-left text-gray-600">
                                      <th className="py-2 font-semibold">Product</th>
                                      <th className="py-2 text-right font-semibold">Aantal</th>
                                      <th className="py-2 text-right font-semibold">Bedrag</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {order.products.map((product, idx) => (
                                      <tr key={idx} className="border-t border-gray-100">
                                        <td className="py-2 text-gray-900">{product.name}</td>
                                        <td className="py-2 text-right text-gray-700">
                                          {formatNumber(product.quantity)}
                                        </td>
                                        <td className="py-2 text-right text-gray-900 font-medium">
                                          {formatEuro(product.price)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly Returns Table */}
                  <div className="bg-white shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">↩️ Maandelijkse Annuleringen</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full border border-gray-200 rounded-lg">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-gray-900 font-semibold">Periode</th>
                            <th className="px-4 py-3 text-right text-gray-900 font-semibold">Aantal</th>
                            <th className="px-4 py-3 text-right text-gray-900 font-semibold">Bedrag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(data.returnInsights.monthly_returns)
                            .sort((a, b) => b[0].localeCompare(a[0]))
                            .map(([yearMonth, returnData], idx) => {
                              const [year, month] = yearMonth.split('-');
                              const monthLabel = MONTH_LABELS[parseInt(month) - 1];
                              return (
                                <tr key={yearMonth} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-4 py-3 font-medium text-gray-900">
                                    {monthLabel} {year}
                                  </td>
                                  <td className="px-4 py-3 text-right text-red-600 font-semibold">
                                    {formatNumber(returnData.count)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-red-600 font-semibold">
                                    {formatEuro(returnData.revenue)}
                                  </td>
                                </tr>
                              );
                            })}
                          {Object.keys(data.returnInsights.monthly_returns).length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                ✅ Geen geannuleerde orders in de geselecteerde periode
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Returns Information Panel */}
                  <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-6">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">Over Geannuleerde Orders</h3>
                        <div className="mt-2 text-sm text-blue-700 space-y-1">
                          <p>• <strong>Geannuleerde orders</strong> zijn orders met de status &quot;cancel&quot; in Odoo</p>
                          <p>• Deze orders worden <strong>niet meegeteld</strong> in de omzet- en orderstatistieken</p>
                          <p>• Het annuleringspercentage toont de verhouding tussen geannuleerde en bevestigde orders</p>
                          <p>• Een laag annuleringspercentage (&lt;5%) is normaal voor e-commerce</p>
                          <p>• Klik op een order om de producten te zien die geretourneerd zijn</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white shadow-xl rounded-2xl p-12 text-center">
              <p className="text-gray-600">Selecteer jaren om te vergelijken</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

