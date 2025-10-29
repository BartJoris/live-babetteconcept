import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useAuth } from '@/lib/hooks/useAuth';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

type BrandMetrics = {
  brandId: number;
  brandName: string;
  revenue: number;
  cost: number;
  margin: number;
  profitPercentage: number;
  quantitySold: number;
  avgSellingPrice: number;
  productCount: number;
};

type PeriodData = {
  winterSales: Record<number, BrandMetrics>;
  winterRegular: Record<number, BrandMetrics>;
  summerSales: Record<number, BrandMetrics>;
  summerRegular: Record<number, BrandMetrics>;
};

type BrandPerformanceData = {
  year: number;
  periods: PeriodData;
  brandList: Array<{ id: number; name: string }>;
  totalRevenue: number;
};

const formatBE = (amount: number) => amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PERIOD_LABELS = {
  winterSales: '❄️ Wintersolden',
  winterRegular: '❄️ Winter Regular',
  summerSales: '☀️ Zomersolden',
  summerRegular: '☀️ Zomer Regular',
};

export default function BrandPerformancePage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedSeason, setSelectedSeason] = useState<'winter' | 'summer' | 'both'>('both');
  const [data, setData] = useState<BrandPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'margin'>('revenue');
  const [minRevenue, setMinRevenue] = useState<number>(0);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await fetch('/api/brand-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, season: selectedSeason }),
      });
      
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Error fetching brand performance:', error);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, selectedYear, selectedSeason]);

  useEffect(() => {
    if (isLoggedIn && !authLoading) {
      fetchData();
    }
  }, [isLoggedIn, authLoading, selectedYear, selectedSeason, fetchData]);

  // Aggregate brand data across all periods (merge duplicates by name)
  const aggregatedBrands = useMemo(() => {
    if (!data) return [];

    const brandTotals: Record<string, {
      brandId: number;
      brandName: string;
      totalRevenue: number;
      totalCost: number;
      totalMargin: number;
      totalQuantity: number;
      winterRevenue: number;
      winterCost: number;
      winterMargin: number;
      winterQuantity: number;
      summerRevenue: number;
      summerCost: number;
      summerMargin: number;
      summerQuantity: number;
      winterSales: BrandMetrics | null;
      winterRegular: BrandMetrics | null;
      summerSales: BrandMetrics | null;
      summerRegular: BrandMetrics | null;
    }> = {};

    // Initialize with all brands that have sales (group by name to merge duplicates)
    const allBrandIds = new Set<number>();
    Object.values(data.periods).forEach(period => {
      Object.keys(period).forEach(brandId => allBrandIds.add(Number(brandId)));
    });


    // Aggregate totals (merge by brand name to handle duplicates)
    Object.entries(data.periods).forEach(([periodKey, period]) => {
      Object.entries(period).forEach(([brandIdStr, metrics]) => {
        const brandId = Number(brandIdStr);
        const brandName = data.brandList.find(b => b.id === brandId)?.name || 'Unknown';
        
        if (!brandTotals[brandName]) {
          // This shouldn't happen, but handle it just in case
          brandTotals[brandName] = {
            brandId,
            brandName,
            totalRevenue: 0,
            totalCost: 0,
            totalMargin: 0,
            totalQuantity: 0,
            winterRevenue: 0,
            winterCost: 0,
            winterMargin: 0,
            winterQuantity: 0,
            summerRevenue: 0,
            summerCost: 0,
            summerMargin: 0,
            summerQuantity: 0,
            winterSales: null,
            winterRegular: null,
            summerSales: null,
            summerRegular: null,
          };
        }
        
        brandTotals[brandName].totalRevenue += metrics.revenue;
        brandTotals[brandName].totalCost += metrics.cost;
        brandTotals[brandName].totalMargin += metrics.margin;
        brandTotals[brandName].totalQuantity += metrics.quantitySold;
        
        // Store period metrics (merge if duplicates exist)
        const periodMetricsKey = periodKey as 'winterSales' | 'winterRegular' | 'summerSales' | 'summerRegular';
        if (!brandTotals[brandName][periodMetricsKey]) {
          brandTotals[brandName][periodMetricsKey] = { ...metrics };
        } else {
          // Merge with existing period data
          const existing = brandTotals[brandName][periodMetricsKey]!;
          existing.revenue += metrics.revenue;
          existing.cost += metrics.cost;
          existing.margin += metrics.margin;
          existing.quantitySold += metrics.quantitySold;
          existing.productCount += metrics.productCount;
          if (metrics.profitPercentage > 0) {
            existing.profitPercentage = (existing.margin / existing.revenue) * 100;
          }
          if (metrics.avgSellingPrice > 0) {
            existing.avgSellingPrice = existing.revenue / existing.quantitySold;
          }
        }
        
        // Aggregate by season
        if (periodKey === 'winterSales' || periodKey === 'winterRegular') {
          brandTotals[brandName].winterRevenue += metrics.revenue;
          brandTotals[brandName].winterCost += metrics.cost;
          brandTotals[brandName].winterMargin += metrics.margin;
          brandTotals[brandName].winterQuantity += metrics.quantitySold;
        } else if (periodKey === 'summerSales' || periodKey === 'summerRegular') {
          brandTotals[brandName].summerRevenue += metrics.revenue;
          brandTotals[brandName].summerCost += metrics.cost;
          brandTotals[brandName].summerMargin += metrics.margin;
          brandTotals[brandName].summerQuantity += metrics.quantitySold;
        }
      });
    });

    // Filter by minimum revenue
    const filtered = Object.values(brandTotals).filter(b => b.totalRevenue >= minRevenue);

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'profit':
          return b.totalMargin - a.totalMargin;
        case 'revenue':
          return b.totalRevenue - a.totalRevenue;
        case 'margin':
          const marginA = a.totalRevenue > 0 ? (a.totalMargin / a.totalRevenue) * 100 : 0;
          const marginB = b.totalRevenue > 0 ? (b.totalMargin / b.totalRevenue) * 100 : 0;
          return marginB - marginA;
        case 'quantity':
          return b.totalQuantity - a.totalQuantity;
        default:
          return 0;
      }
    });

    return filtered;
  }, [data, sortBy, minRevenue]);

  // Top performers
  const topPerformers = useMemo(() => {
    if (!aggregatedBrands.length) return null;

    const topByRevenue = [...aggregatedBrands].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    const topByMargin = [...aggregatedBrands].sort((a, b) => b.totalMargin - a.totalMargin)[0];
    const topByQuantity = [...aggregatedBrands].sort((a, b) => b.totalQuantity - a.totalQuantity)[0];
    const topByMarginPercent = [...aggregatedBrands].sort((a, b) => {
      const marginA = a.totalRevenue > 0 ? (a.totalMargin / a.totalRevenue) * 100 : 0;
      const marginB = b.totalRevenue > 0 ? (b.totalMargin / b.totalRevenue) * 100 : 0;
      return marginB - marginA;
    })[0];

    return { topByRevenue, topByMargin, topByQuantity, topByMarginPercent };
  }, [aggregatedBrands]);

  // Charts data
  const revenueChartData = useMemo(() => {
    const top10 = aggregatedBrands.slice(0, 10);
    return {
      labels: top10.map(b => b.brandName),
      datasets: [
        {
          label: 'Wintersolden',
          data: top10.map(b => b.winterSales?.revenue || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
        },
        {
          label: 'Winter Regular',
          data: top10.map(b => b.winterRegular?.revenue || 0),
          backgroundColor: 'rgba(147, 197, 253, 0.7)',
        },
        {
          label: 'Zomersolden',
          data: top10.map(b => b.summerSales?.revenue || 0),
          backgroundColor: 'rgba(251, 146, 60, 0.7)',
        },
        {
          label: 'Zomer Regular',
          data: top10.map(b => b.summerRegular?.revenue || 0),
          backgroundColor: 'rgba(253, 186, 116, 0.7)',
        },
      ],
    };
  }, [aggregatedBrands]);

  const marketShareData = useMemo(() => {
    const top8 = aggregatedBrands.slice(0, 8);
    const othersRevenue = aggregatedBrands.slice(8).reduce((sum, b) => sum + b.totalRevenue, 0);
    
    return {
      labels: [...top8.map(b => b.brandName), othersRevenue > 0 ? 'Overige' : ''].filter(Boolean),
      datasets: [{
        data: [...top8.map(b => b.totalRevenue), othersRevenue].filter(v => v > 0),
        backgroundColor: [
          '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
          '#ec4899', '#14b8a6', '#f97316', '#9ca3af',
        ],
      }],
    };
  }, [aggregatedBrands]);

  const profitMarginChartData = useMemo(() => {
    const top10 = aggregatedBrands.slice(0, 10);
    return {
      labels: top10.map(b => b.brandName),
      datasets: [{
        label: 'Winstmarge %',
        data: top10.map(b => b.totalRevenue > 0 ? (b.totalMargin / b.totalRevenue) * 100 : 0),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        tension: 0.4,
      }],
    };
  }, [aggregatedBrands]);

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">🏷️ Merkprestaties</h1>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2">
                <span className="font-medium">Jaar:</span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium bg-white"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <p className="text-center py-12">⏳ Gegevens laden...</p>
          ) : data ? (
            <>
              {/* Legend */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3">📅 Periode Uitleg</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-white p-3 rounded border border-blue-100">
                    <p className="font-semibold text-blue-800">❄️ Wintersolden</p>
                    <p className="text-gray-700">
                      {selectedYear === new Date().getFullYear() && new Date(selectedYear, 0, 2).getDay() === 0 
                        ? `3 januari - 31 januari ${selectedYear}`
                        : `2 januari - 31 januari ${selectedYear}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Officiële winteruitverkoop periode in België</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-100">
                    <p className="font-semibold text-blue-800">❄️ Winter Regular</p>
                    <p className="text-gray-700">
                      1 februari - 30 juni {selectedYear}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Normale verkoopperiode winter/lente</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-orange-100">
                    <p className="font-semibold text-orange-800">☀️ Zomersolden</p>
                    <p className="text-gray-700">
                      {new Date(selectedYear, 5, 30).getDay() === 0
                        ? `30 juni - 31 juli ${selectedYear}`
                        : `1 juli - 31 juli ${selectedYear}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Officiële zomeruitverkoop periode in België</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-orange-100">
                    <p className="font-semibold text-orange-800">☀️ Zomer Regular</p>
                    <p className="text-gray-700">
                      1 augustus - 31 december {selectedYear}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Normale verkoopperiode zomer/najaar</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-gray-800">
                    <strong>Let op:</strong> Alle bedragen zijn exclusief 21% BTW. Kosten zijn gebaseerd op de Kostprijs in Odoo.
                  </p>
                </div>
              </div>

              {/* Top Performers */}
              {topPerformers && (
                <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                    <p className="text-blue-600 text-sm font-medium mb-1">💰 Hoogste Omzet</p>
                    <p className="text-xl font-bold text-blue-900">{topPerformers.topByRevenue.brandName}</p>
                    <p className="text-blue-700">€{formatBE(topPerformers.topByRevenue.totalRevenue)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                    <p className="text-green-600 text-sm font-medium mb-1">📈 Hoogste Winst</p>
                    <p className="text-xl font-bold text-green-900">{topPerformers.topByMargin.brandName}</p>
                    <p className="text-green-700">€{formatBE(topPerformers.topByMargin.totalMargin)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                    <p className="text-purple-600 text-sm font-medium mb-1">🔢 Meest Verkocht</p>
                    <p className="text-xl font-bold text-purple-900">{topPerformers.topByQuantity.brandName}</p>
                    <p className="text-purple-700">{topPerformers.topByQuantity.totalQuantity} stuks</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                    <p className="text-orange-600 text-sm font-medium mb-1">💎 Beste Marge %</p>
                    <p className="text-xl font-bold text-orange-900">{topPerformers.topByMarginPercent.brandName}</p>
                    <p className="text-orange-700">
                      {((topPerformers.topByMarginPercent.totalMargin / topPerformers.topByMarginPercent.totalRevenue) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}

              {/* Charts */}
              <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h3 className="font-semibold mb-3 text-gray-900">Omzet per Periode (Top 10)</h3>
                  <Bar
                    data={revenueChartData}
                    options={{
                      responsive: true,
                      plugins: { legend: { position: 'top' as const } },
                      scales: {
                        x: { stacked: true },
                        y: { stacked: true, title: { display: true, text: 'Omzet (€)' } },
                      },
                    }}
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h3 className="font-semibold mb-3 text-gray-900">Marktaandeel (Top 8)</h3>
                  <Pie
                    data={marketShareData}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: 'right' as const },
                        tooltip: {
                          callbacks: {
                            label: (context) => {
                              const label = context.label || '';
                              const value = context.parsed || 0;
                              const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                              const percentage = ((value / total) * 100).toFixed(1);
                              return `${label}: €${formatBE(value)} (${percentage}%)`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="mb-8">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h3 className="font-semibold mb-3 text-gray-900">Winstmarge % (Top 10)</h3>
                  <Line
                    data={profitMarginChartData}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { 
                          title: { display: true, text: 'Winstmarge (%)' },
                          beginAtZero: true,
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* Filters */}
              <div className="mb-4 flex gap-4 items-center flex-wrap">
                <label className="flex items-center gap-2">
                  <span className="font-medium">Sorteer op:</span>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'revenue' | 'quantity' | 'margin')}
                    className="border border-gray-300 rounded px-3 py-2 text-gray-900 font-medium bg-white"
                  >
                    <option value="revenue">Omzet</option>
                    <option value="quantity">Aantal Verkocht</option>
                    <option value="margin">Winstmarge %</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="font-medium">Min. Omzet:</span>
                  <input
                    type="number"
                    value={minRevenue}
                    onChange={e => setMinRevenue(Number(e.target.value))}
                    className="border rounded px-3 py-2 w-32"
                    placeholder="0"
                  />
                </label>
                <span className="text-gray-800">
                  {aggregatedBrands.length} merken weergegeven
                </span>
              </div>

              {/* Main Table */}
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left border-b font-semibold text-gray-900" rowSpan={2}>Merk</th>
                      <th className="px-3 py-2 text-center border-b font-semibold text-gray-900 bg-purple-50" colSpan={3}>
                        📊 Jaar Totaal
                      </th>
                      <th className="px-3 py-2 text-center border-b font-semibold text-gray-900 bg-blue-50" colSpan={2}>
                        ❄️ Winter Totaal
                      </th>
                      <th className="px-3 py-2 text-center border-b font-semibold text-gray-900 bg-orange-50" colSpan={2}>
                        ☀️ Zomer Totaal
                      </th>
                      <th className="px-3 py-2 text-center border-b font-semibold text-gray-900" colSpan={4}>
                        Detail Per Periode
                      </th>
                    </tr>
                    <tr className="bg-gray-100 text-xs">
                      <th className="px-2 py-1 text-right border-b bg-purple-50 text-gray-900">Omzet</th>
                      <th className="px-2 py-1 text-right border-b bg-purple-50 text-gray-900">Winst</th>
                      <th className="px-2 py-1 text-right border-b bg-purple-50 text-gray-900">Marge %</th>
                      <th className="px-2 py-1 text-right border-b bg-blue-50 text-gray-900">Omzet</th>
                      <th className="px-2 py-1 text-right border-b bg-blue-50 text-gray-900">Winst</th>
                      <th className="px-2 py-1 text-right border-b bg-orange-50 text-gray-900">Omzet</th>
                      <th className="px-2 py-1 text-right border-b bg-orange-50 text-gray-900">Winst</th>
                      <th className="px-2 py-1 text-center border-b text-gray-900">Wintersolden</th>
                      <th className="px-2 py-1 text-center border-b text-gray-900">Winter Reg.</th>
                      <th className="px-2 py-1 text-center border-b text-gray-900">Zomersolden</th>
                      <th className="px-2 py-1 text-center border-b text-gray-900">Zomer Reg.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedBrands.map((brand, idx) => {
                      const profitPercent = brand.totalRevenue > 0 ? (brand.totalMargin / brand.totalRevenue) * 100 : 0;
                      const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      
                      return (
                        <React.Fragment key={brand.brandName}>
                          <tr 
                            className={`${rowBg} hover:bg-blue-50 cursor-pointer`} 
                            onClick={() => setExpandedBrand(expandedBrand === brand.brandName ? null : brand.brandName)}
                            title="Klik om details te zien"
                          >
                            <td className="px-3 py-2 font-medium border-b">
                              {idx + 1}. {brand.brandName}
                            </td>
                            {/* Year Totals */}
                            <td className="px-2 py-2 text-right border-b bg-purple-50 font-semibold">€{formatBE(brand.totalRevenue)}</td>
                            <td className="px-2 py-2 text-right border-b bg-purple-50 text-green-700 font-semibold">
                              €{formatBE(brand.totalMargin)}
                            </td>
                            <td className="px-2 py-2 text-right border-b bg-purple-50">
                              <span className={profitPercent > 50 ? 'text-green-700 font-bold' : profitPercent > 30 ? 'text-blue-700 font-semibold' : 'text-gray-700'}>
                                {profitPercent.toFixed(1)}%
                              </span>
                            </td>
                            {/* Winter Totals */}
                            <td className="px-2 py-2 text-right border-b bg-blue-50">
                              {brand.winterRevenue > 0 ? `€${formatBE(brand.winterRevenue)}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right border-b bg-blue-50 text-green-700">
                              {brand.winterMargin > 0 ? `€${formatBE(brand.winterMargin)}` : '-'}
                            </td>
                            {/* Summer Totals */}
                            <td className="px-2 py-2 text-right border-b bg-orange-50">
                              {brand.summerRevenue > 0 ? `€${formatBE(brand.summerRevenue)}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right border-b bg-orange-50 text-green-700">
                              {brand.summerMargin > 0 ? `€${formatBE(brand.summerMargin)}` : '-'}
                            </td>
                            {/* Period Details */}
                            <td className="px-2 py-2 text-center border-b text-xs">
                              {brand.winterSales ? `€${formatBE(brand.winterSales.revenue)}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-center border-b text-xs">
                              {brand.winterRegular ? `€${formatBE(brand.winterRegular.revenue)}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-center border-b text-xs">
                              {brand.summerSales ? `€${formatBE(brand.summerSales.revenue)}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-center border-b text-xs">
                              {brand.summerRegular ? `€${formatBE(brand.summerRegular.revenue)}` : '-'}
                            </td>
                          </tr>
                          {expandedBrand === brand.brandName && (
                            <tr className="bg-blue-50">
                              <td colSpan={11} className="px-6 py-4 border-b">
                                <div className="grid grid-cols-4 gap-4">
                                  {(['winterSales', 'winterRegular', 'summerSales', 'summerRegular'] as const).map((period: 'winterSales' | 'winterRegular' | 'summerSales' | 'summerRegular') => {
                                    const metrics = brand[period];
                                    if (!metrics) return (
                                      <div key={period} className="text-gray-400 text-center py-4">
                                        {PERIOD_LABELS[period]}<br />Geen data
                                      </div>
                                    );
                                    return (
                                      <div key={period} className="bg-white p-3 rounded border">
                                        <p className="font-semibold text-sm mb-2">{PERIOD_LABELS[period]}</p>
                                        <div className="space-y-1 text-xs">
                                          <p><span className="text-gray-800">Omzet:</span> <span className="font-semibold">€{formatBE(metrics.revenue)}</span></p>
                                          <p><span className="text-gray-800">Kosten:</span> €{formatBE(metrics.cost)}</p>
                                          <p><span className="text-gray-800">Winst:</span> <span className="text-green-700 font-semibold">€{formatBE(metrics.margin)}</span></p>
                                          <p><span className="text-gray-800">Marge:</span> {metrics.profitPercentage.toFixed(1)}%</p>
                                          <p><span className="text-gray-800">Verkocht:</span> {metrics.quantitySold} stuks</p>
                                          <p><span className="text-gray-800">Producten:</span> {metrics.productCount}</p>
                                          <p><span className="text-gray-800">Gem. prijs:</span> €{formatBE(metrics.avgSellingPrice)}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-center py-12 text-gray-500">Geen data beschikbaar</p>
          )}
        </div>
      </div>
    </div>
  );
}

