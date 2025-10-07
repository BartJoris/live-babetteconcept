import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Navigation from '../components/Navigation';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

type BrandInventoryMetrics = {
  brandId: number;
  brandName: string;
  currentStock: number;
  openingStock: number;
  stockIn: number;
  stockInPurchases: number;
  stockInAdjustments: number;
  stockOut: number;
  stockOutSales: number;
  stockOutAdjustments: number;
  soldRegular: number;
  soldSales: number;
  totalSold: number;
  sellThroughRate: number;
  stockValue: number;
  calculatedClosing: number;
  stockDiscrepancy: number;
  status: 'hit' | 'good' | 'slow' | 'dead';
  productCount: number;
};

type SeasonData = {
  winter: Record<number, BrandInventoryMetrics>;
  summer: Record<number, BrandInventoryMetrics>;
};

type BrandInventoryData = {
  year: number;
  seasons: SeasonData;
  brandList: Array<{ id: number; name: string }>;
  totalStockValue: number;
  avgSellThrough: number;
};

const formatBE = (amount: number) => amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CONFIG = {
  hit: { label: '🔥 Hit', color: 'text-green-700', bg: 'bg-green-100', threshold: '≥80%' },
  good: { label: '✅ Goed', color: 'text-blue-700', bg: 'bg-blue-100', threshold: '60-80%' },
  slow: { label: '⚠️ Traag', color: 'text-orange-700', bg: 'bg-orange-100', threshold: '40-60%' },
  dead: { label: '🛑 Dood', color: 'text-red-700', bg: 'bg-red-100', threshold: '<40%' },
};

export default function BrandInventoryPage() {
  const router = useRouter();
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSeason, setSelectedSeason] = useState<'winter' | 'summer' | 'both'>('both');
  const [data, setData] = useState<BrandInventoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'sellThrough' | 'stockValue' | 'totalSold'>('sellThrough');
  const [expandedBrand, setExpandedBrand] = useState<number | null>(null);

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

  const fetchData = useCallback(async () => {
    if (!uid || !password) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/brand-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, password, year: selectedYear, season: selectedSeason }),
      });
      
      const json: BrandInventoryData = await res.json();
      setData(json);
    } catch (error) {
      console.error('Error fetching brand inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [uid, password, selectedYear, selectedSeason]);

  useEffect(() => {
    if (uid && password) {
      fetchData();
    }
  }, [uid, password, selectedYear, selectedSeason, fetchData]);

  // Aggregate data across selected seasons
  const aggregatedBrands = useMemo(() => {
    if (!data) return [];

    const brands: BrandInventoryMetrics[] = [];
    
    if (selectedSeason === 'both') {
      // Merge winter and summer data
      const allBrandIds = new Set([
        ...Object.keys(data.seasons.winter).map(Number),
        ...Object.keys(data.seasons.summer).map(Number),
      ]);

      allBrandIds.forEach(brandId => {
        const winter = data.seasons.winter[brandId];
        const summer = data.seasons.summer[brandId];
        
        if (winter || summer) {
          const combined: BrandInventoryMetrics = {
            brandId,
            brandName: winter?.brandName || summer?.brandName || 'Unknown',
            currentStock: (winter?.currentStock || 0) + (summer?.currentStock || 0),
            openingStock: (winter?.openingStock || 0) + (summer?.openingStock || 0),
            stockIn: (winter?.stockIn || 0) + (summer?.stockIn || 0),
            stockInPurchases: (winter?.stockInPurchases || 0) + (summer?.stockInPurchases || 0),
            stockInAdjustments: (winter?.stockInAdjustments || 0) + (summer?.stockInAdjustments || 0),
            stockOut: (winter?.stockOut || 0) + (summer?.stockOut || 0),
            stockOutSales: (winter?.stockOutSales || 0) + (summer?.stockOutSales || 0),
            stockOutAdjustments: (winter?.stockOutAdjustments || 0) + (summer?.stockOutAdjustments || 0),
            soldRegular: (winter?.soldRegular || 0) + (summer?.soldRegular || 0),
            soldSales: (winter?.soldSales || 0) + (summer?.soldSales || 0),
            totalSold: (winter?.totalSold || 0) + (summer?.totalSold || 0),
            sellThroughRate: 0,
            stockValue: (winter?.stockValue || 0) + (summer?.stockValue || 0),
            calculatedClosing: (winter?.calculatedClosing || 0) + (summer?.calculatedClosing || 0),
            stockDiscrepancy: (winter?.stockDiscrepancy || 0) + (summer?.stockDiscrepancy || 0),
            status: 'dead',
            productCount: Math.max(winter?.productCount || 0, summer?.productCount || 0),
          };
          
          const availableStock = combined.openingStock + combined.stockIn;
          combined.sellThroughRate = availableStock > 0 
            ? (combined.totalSold / availableStock) * 100 
            : 0;

          if (combined.sellThroughRate >= 80) combined.status = 'hit';
          else if (combined.sellThroughRate >= 60) combined.status = 'good';
          else if (combined.sellThroughRate >= 40) combined.status = 'slow';
          else combined.status = 'dead';

          brands.push(combined);
        }
      });
    } else {
      // Single season
      const seasonData = data.seasons[selectedSeason];
      Object.values(seasonData).forEach(metrics => brands.push(metrics));
    }

    // Sort
    brands.sort((a, b) => {
      switch (sortBy) {
        case 'sellThrough':
          return b.sellThroughRate - a.sellThroughRate;
        case 'stockValue':
          return b.stockValue - a.stockValue;
        case 'totalSold':
          return b.totalSold - a.totalSold;
        default:
          return 0;
      }
    });

    return brands;
  }, [data, selectedSeason, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    if (!aggregatedBrands.length) return null;

    const totalStockValue = aggregatedBrands.reduce((sum, b) => sum + b.stockValue, 0);
    const avgSellThrough = aggregatedBrands.reduce((sum, b) => sum + b.sellThroughRate, 0) / aggregatedBrands.length;
    const bestBrand = [...aggregatedBrands].sort((a, b) => b.sellThroughRate - a.sellThroughRate)[0];
    const worstBrand = [...aggregatedBrands].sort((a, b) => a.sellThroughRate - b.sellThroughRate)[0];

    const statusCounts = {
      hit: aggregatedBrands.filter(b => b.status === 'hit').length,
      good: aggregatedBrands.filter(b => b.status === 'good').length,
      slow: aggregatedBrands.filter(b => b.status === 'slow').length,
      dead: aggregatedBrands.filter(b => b.status === 'dead').length,
    };

    return { totalStockValue, avgSellThrough, bestBrand, worstBrand, statusCounts };
  }, [aggregatedBrands]);

  // Charts
  const sellThroughChartData = useMemo(() => {
    const top10 = aggregatedBrands.slice(0, 10);
    return {
      labels: top10.map(b => b.brandName),
      datasets: [{
        label: 'Sell-through %',
        data: top10.map(b => b.sellThroughRate),
        backgroundColor: top10.map(b => {
          if (b.status === 'hit') return 'rgba(34, 197, 94, 0.7)';
          if (b.status === 'good') return 'rgba(59, 130, 246, 0.7)';
          if (b.status === 'slow') return 'rgba(251, 146, 60, 0.7)';
          return 'rgba(239, 68, 68, 0.7)';
        }),
      }],
    };
  }, [aggregatedBrands]);

  const statusDistributionData = useMemo(() => {
    if (!stats) return null;
    return {
      labels: ['🔥 Hit', '✅ Goed', '⚠️ Traag', '🛑 Dood'],
      datasets: [{
        data: [stats.statusCounts.hit, stats.statusCounts.good, stats.statusCounts.slow, stats.statusCounts.dead],
        backgroundColor: ['#22c55e', '#3b82f6', '#fb923c', '#ef4444'],
      }],
    };
  }, [stats]);

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Navigation />
      <div className="p-4">
        <div className="max-w-7xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">📦 Voorraad Analyse</h1>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2">
                <span className="font-medium">Jaar:</span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="border rounded px-3 py-2"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="font-medium">Seizoen:</span>
                  <select
                    value={selectedSeason}
                    onChange={e => setSelectedSeason(e.target.value as 'winter' | 'summer' | 'both')}
                    className="border rounded px-3 py-2"
                  >
                  <option value="both">Beide</option>
                  <option value="winter">❄️ Winter</option>
                  <option value="summer">☀️ Zomer</option>
                </select>
              </label>
            </div>
          </div>

          {loading ? (
            <p className="text-center py-12">⏳ Gegevens laden...</p>
          ) : data && stats ? (
            <>
              {/* Legend */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3">📊 Uitleg & Berekeningsmethode</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <div key={key} className={`${config.bg} p-3 rounded border`}>
                      <p className={`font-semibold ${config.color}`}>{config.label}</p>
                      <p className="text-sm text-gray-700">Verkocht: {config.threshold}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200 space-y-2 text-xs text-gray-700">
                  <p>
                    <strong>📦 Voorraadberekening:</strong> Gebruikt <code className="bg-blue-100 px-1 rounded">stock.move</code> records uit Odoo voor accurate historische tracking.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                    <div className="bg-white p-2 rounded">
                      <strong>Opening:</strong> Voorraad aan start periode
                    </div>
                    <div className="bg-white p-2 rounded">
                      <strong>Inkoop:</strong> Aankopen + Aanpassingen in
                    </div>
                    <div className="bg-white p-2 rounded">
                      <strong>Verkocht:</strong> POS Verkopen + Aanpassingen uit
                    </div>
                  </div>
                  <p className="mt-2">
                    <strong>Sell-through formule:</strong> (Totaal Verkocht / (Opening + Inkoop)) × 100%
                  </p>
                  <p>
                    <strong>⚠️ Voorraadverschil:</strong> Verschil tussen berekend (Opening + Inkoop - Verkocht) en werkelijk slot. 
                    Kan wijzen op handmatige aanpassingen, verlies, of retouren.
                  </p>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                  <p className="text-purple-600 text-sm font-medium mb-1">💰 Voorraadwaarde</p>
                  <p className="text-2xl font-bold text-purple-900">€{formatBE(stats.totalStockValue)}</p>
                  <p className="text-sm text-purple-700">Gebonden kapitaal</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-600 text-sm font-medium mb-1">📈 Gem. Sell-through</p>
                  <p className="text-2xl font-bold text-blue-900">{stats.avgSellThrough.toFixed(1)}%</p>
                  <p className="text-sm text-blue-700">Over alle merken</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                  <p className="text-green-600 text-sm font-medium mb-1">🏆 Beste Merk</p>
                  <p className="text-lg font-bold text-green-900">{stats.bestBrand.brandName}</p>
                  <p className="text-sm text-green-700">{stats.bestBrand.sellThroughRate.toFixed(1)}% verkocht</p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
                  <p className="text-red-600 text-sm font-medium mb-1">⚠️ Slechtste Merk</p>
                  <p className="text-lg font-bold text-red-900">{stats.worstBrand.brandName}</p>
                  <p className="text-sm text-red-700">{stats.worstBrand.sellThroughRate.toFixed(1)}% verkocht</p>
                </div>
              </div>

              {/* Charts */}
              <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h3 className="font-semibold mb-3">Sell-through per Merk (Top 10)</h3>
                  <Bar
                    data={sellThroughChartData}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { 
                          beginAtZero: true, 
                          max: 100,
                          title: { display: true, text: 'Sell-through %' } 
                        },
                      },
                    }}
                  />
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h3 className="font-semibold mb-3">Status Verdeling</h3>
                  {statusDistributionData && (
                    <Doughnut
                      data={statusDistributionData}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: { position: 'right' as const },
                        },
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="mb-4 flex gap-4 items-center">
                <label className="flex items-center gap-2">
                  <span className="font-medium">Sorteer op:</span>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'sellThrough' | 'stockValue' | 'totalSold')}
                    className="border rounded px-3 py-2"
                  >
                    <option value="sellThrough">Sell-through %</option>
                    <option value="stockValue">Voorraadwaarde</option>
                    <option value="totalSold">Totaal Verkocht</option>
                  </select>
                </label>
                <span className="text-gray-600">
                  {aggregatedBrands.length} merken
                </span>
              </div>

              {/* Main Table */}
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left border-b" rowSpan={2}>Merk</th>
                      <th className="px-3 py-2 text-center border-b" rowSpan={2}>Status</th>
                      <th className="px-3 py-2 text-center border-b bg-blue-50" colSpan={3}>Voorraadbeweging</th>
                      <th className="px-3 py-2 text-center border-b bg-green-50" colSpan={2}>Verkoop</th>
                      <th className="px-3 py-2 text-right border-b" rowSpan={2}>Huidige Voorraad</th>
                      <th className="px-3 py-2 text-right border-b" rowSpan={2}>Sell-through %</th>
                      <th className="px-3 py-2 text-right border-b" rowSpan={2}>Voorraadwaarde</th>
                    </tr>
                    <tr className="bg-gray-100 text-xs">
                      <th className="px-2 py-1 text-right border-b bg-blue-50">Opening</th>
                      <th className="px-2 py-1 text-right border-b bg-blue-50">Inkoop</th>
                      <th className="px-2 py-1 text-right border-b bg-blue-50">Verkocht</th>
                      <th className="px-2 py-1 text-right border-b bg-green-50">Regular</th>
                      <th className="px-2 py-1 text-right border-b bg-green-50">Solden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregatedBrands.map((brand, idx) => {
                      const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      const statusConfig = STATUS_CONFIG[brand.status];
                      const hasDiscrepancy = Math.abs(brand.stockDiscrepancy) > 0.1;
                      
                      return (
                        <React.Fragment key={brand.brandId}>
                          <tr 
                            className={`${rowBg} hover:bg-blue-50 cursor-pointer`}
                            onClick={() => setExpandedBrand(expandedBrand === brand.brandId ? null : brand.brandId)}
                          >
                            <td className="px-3 py-2 font-medium border-b">
                              {idx + 1}. {brand.brandName}
                              <span className="text-xs text-gray-500 ml-2">({brand.productCount} prod.)</span>
                              {hasDiscrepancy && (
                                <span className="ml-2 text-xs text-red-600" title="Voorraadverschil gedetecteerd">
                                  ⚠️
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center border-b">
                              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${statusConfig.bg} ${statusConfig.color}`}>
                                {statusConfig.label}
                              </span>
                            </td>
                            {/* Stock Movement */}
                            <td className="px-2 py-2 text-right border-b bg-blue-50">{brand.openingStock}</td>
                            <td className="px-2 py-2 text-right border-b bg-blue-50 text-green-700">
                              +{brand.stockIn}
                            </td>
                            <td className="px-2 py-2 text-right border-b bg-blue-50 text-red-700">
                              -{brand.stockOut}
                            </td>
                            {/* Sales */}
                            <td className="px-2 py-2 text-right border-b bg-green-50">{brand.soldRegular}</td>
                            <td className="px-2 py-2 text-right border-b bg-green-50 text-orange-700">{brand.soldSales}</td>
                            {/* Current Stock */}
                            <td className="px-3 py-2 text-right border-b font-semibold">
                              <span className={brand.currentStock > (brand.openingStock + brand.stockIn) * 0.3 ? 'text-red-700' : ''}>
                                {brand.currentStock}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right border-b">
                              <span className={`font-semibold ${statusConfig.color}`}>
                                {brand.sellThroughRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right border-b">
                              €{formatBE(brand.stockValue)}
                            </td>
                          </tr>
                          {expandedBrand === brand.brandId && (
                            <tr className="bg-blue-50">
                              <td colSpan={10} className="px-6 py-4 border-b">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="bg-white p-4 rounded border">
                                    <h4 className="font-semibold text-blue-900 mb-3">📥 Inkomende Voorraad</h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Opening voorraad:</span>
                                        <span className="font-semibold">{brand.openingStock}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Aankopen:</span>
                                        <span className="text-green-700 font-semibold">+{brand.stockInPurchases}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Aanpassingen in:</span>
                                        <span className="text-blue-700">+{brand.stockInAdjustments}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2 font-semibold">
                                        <span>Totaal beschikbaar:</span>
                                        <span>{brand.openingStock + brand.stockIn}</span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="bg-white p-4 rounded border">
                                    <h4 className="font-semibold text-red-900 mb-3">📤 Uitgaande Voorraad</h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">POS Verkopen:</span>
                                        <span className="text-red-700 font-semibold">-{brand.stockOutSales}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">└─ Regular:</span>
                                        <span className="text-gray-700">{brand.soldRegular}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">└─ Solden:</span>
                                        <span className="text-orange-700">{brand.soldSales}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Aanpassingen uit:</span>
                                        <span className="text-red-700">-{brand.stockOutAdjustments}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2 font-semibold">
                                        <span>Totaal uitgaand:</span>
                                        <span className="text-red-700">-{brand.stockOut}</span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="bg-white p-4 rounded border">
                                    <h4 className="font-semibold text-purple-900 mb-3">📊 Voorraad Validatie</h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Berekend slot:</span>
                                        <span className="font-semibold">{brand.calculatedClosing}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Werkelijk slot:</span>
                                        <span className="font-semibold">{brand.currentStock}</span>
                                      </div>
                                      <div className="flex justify-between border-t pt-2">
                                        <span className="text-gray-600">Verschil:</span>
                                        <span className={`font-bold ${hasDiscrepancy ? 'text-red-700' : 'text-green-700'}`}>
                                          {brand.stockDiscrepancy > 0 ? '+' : ''}{brand.stockDiscrepancy.toFixed(1)}
                                          {hasDiscrepancy && ' ⚠️'}
                                        </span>
                                      </div>
                                      <div className="mt-3 pt-3 border-t">
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Voorraadwaarde:</span>
                                          <span className="font-semibold">€{formatBE(brand.stockValue)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600">Sell-through:</span>
                                          <span className={`font-semibold ${statusConfig.color}`}>
                                            {brand.sellThroughRate.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {hasDiscrepancy && (
                                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                    <p className="text-sm text-yellow-800">
                                      <strong>⚠️ Voorraadverschil:</strong> Er is een verschil tussen de berekende en werkelijke voorraad. 
                                      Dit kan komen door handmatige aanpassingen, retouren, of verlies die niet in het systeem zijn vastgelegd.
                                    </p>
                                  </div>
                                )}
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

