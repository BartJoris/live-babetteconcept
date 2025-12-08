import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const formatBE = (amount: number) => amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTH_LABELS = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

const WEEKDAY_LABELS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

// Helper voor alle dagen van een maand
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// Helper voor weekdag van een specifieke datum
function getWeekday(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  return WEEKDAY_LABELS[date.getDay()];
}

// Helper om te checken of een datum een weekend is
function isWeekend(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Zondag || Zaterdag
}

// Belgische feestdagen
function isBelgianHoliday(year: number, month: number, day: number) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const holidays: Record<string, string> = {
    [`${year}-01-01`]: 'Nieuwjaar',
    [`${year}-05-01`]: 'Dag van de Arbeid',
    [`${year}-07-21`]: 'Nationale feestdag',
    [`${year}-08-15`]: 'O.L.V. Hemelvaart',
    [`${year}-11-01`]: 'Allerheiligen',
    [`${year}-11-11`]: 'Wapenstilstand',
    [`${year}-12-25`]: 'Kerstmis',
  };
  return holidays[dateStr] || null;
}

export default function DailyComparePage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [selectedPeriods, setSelectedPeriods] = useState<{ year: number; month: number }[]>([
    { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
  ]);
  const [compareData, setCompareData] = useState<Record<string, { omzet: number[]; marge?: number[]; days: number }>>({});
  const [loading, setLoading] = useState(false);
  const [marginAvailable, setMarginAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'cumulative'>('cumulative');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (storedUid && storedPass) {
        // This part is now handled by useAuth, so we can remove it.
        // setUid(Number(storedUid));
        // setPassword(storedPass);
      } else {
        router.push('/');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const fetchCompareData = useCallback(async () => {
    if (!isLoggedIn || !selectedPeriods.length) return;
    setLoading(true);
    let marginFound = false;
    const data: Record<string, { omzet: number[]; marge?: number[]; days: number }> = {};
    for (const { year, month } of selectedPeriods) {
      const days = getDaysInMonth(year, month);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
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
      const orderIds = Array.from(new Set(lines.map(line => line.order_id?.[0]).filter(Boolean)));
      if (orderIds.length === 0) {
        data[`${year}-${month}`] = { omzet: Array(days).fill(0), marge: Array(days).fill(0), days };
        continue;
      }
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
      const omzet = Array(days).fill(0);
      const marge = Array(days).fill(0);
      lines.forEach((line) => {
        const orderId = line.order_id?.[0];
        const dateStr = orderIdToDate[orderId];
        if (!dateStr) return;
        const day = parseInt(dateStr.slice(8, 10), 10) - 1;
        if (day < 0 || day >= days) return;
        omzet[day] += line.price_subtotal_incl || 0;
        if (typeof line.margin === 'number') {
          marginFound = true;
          marge[day] += line.margin;
        }
      });
      data[`${year}-${month}`] = { omzet, marge: marginFound ? marge : undefined, days };
    }
    setCompareData(data);
    setMarginAvailable(marginFound);
    setLoading(false);
  }, [isLoggedIn, selectedPeriods, fetchFromOdoo]);

  useEffect(() => {
    if (isLoggedIn && selectedPeriods.length) {
      fetchCompareData();
    }
  }, [isLoggedIn, selectedPeriods, fetchCompareData]);

  // Helper functie voor cumulatieve data
  const calculateCumulativeData = () => {
    const cumulativeData: Record<string, { omzet: number[]; marge?: number[] }> = {};
    
    selectedPeriods.forEach(p => {
      const key = `${p.year}-${p.month}`;
      const data = compareData[key];
      if (data) {
        const cumulativeOmzet: number[] = [];
        const cumulativeMarge: number[] = [];
        let runningOmzet = 0;
        let runningMarge = 0;
        
        for (let i = 0; i < data.days; i++) {
          runningOmzet += data.omzet[i] || 0;
          runningMarge += data.marge?.[i] || 0;
          cumulativeOmzet.push(runningOmzet);
          cumulativeMarge.push(runningMarge);
        }
        
        cumulativeData[key] = {
          omzet: cumulativeOmzet,
          ...(marginAvailable ? { marge: cumulativeMarge } : {})
        };
      }
    });
    
    return cumulativeData;
  };

  // Helper: Bepaal huidige dag voor vergelijking
  const getCurrentComparisonDay = () => {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    // Check of een van de geselecteerde periodes de huidige maand is
    const hasCurrentPeriod = selectedPeriods.some(p => 
      p.year === currentYear && p.month === currentMonth
    );
    
    return hasCurrentPeriod ? currentDay : null;
  };

  // Performance indicators berekenen (Smart Comparison)
  const calculatePerformanceIndicators = () => {
    if (selectedPeriods.length < 2) return null;
    
    const cumulativeData = calculateCumulativeData();
    const period1 = selectedPeriods[0];
    const period2 = selectedPeriods[1];
    const key1 = `${period1.year}-${period1.month}`;
    const key2 = `${period2.year}-${period2.month}`;
    
    const data1 = cumulativeData[key1];
    const data2 = cumulativeData[key2];
    
    if (!data1 || !data2) return null;
    
    // Bepaal vergelijkingsdag: gebruik huidige dag als beschikbaar, anders laatste dag met data
    const comparisonDay = getCurrentComparisonDay();
    const effectiveDay = comparisonDay 
      ? Math.min(comparisonDay - 1, Math.min(data1.omzet.length, data2.omzet.length) - 1)
      : Math.min(data1.omzet.length, data2.omzet.length) - 1;
    
    const currentOmzet1 = data1.omzet[effectiveDay] || 0;
    const currentOmzet2 = data2.omzet[effectiveDay] || 0;
    
    const difference = currentOmzet1 - currentOmzet2;
    const percentage = currentOmzet2 > 0 ? ((difference / currentOmzet2) * 100) : 0;
    
    // Daggemiddelden berekenen
    const avgDaily1 = currentOmzet1 / (effectiveDay + 1);
    const avgDaily2 = currentOmzet2 / (effectiveDay + 1);
    const avgDifference = avgDaily1 - avgDaily2;
    const avgPercentage = avgDaily2 > 0 ? ((avgDifference / avgDaily2) * 100) : 0;
    
    // Projectie naar maandeinde (als trend doorzet)
    const daysInMonth = compareData[key1]?.days || 31;
    const projectedTotal1 = avgDaily1 * daysInMonth;
    const projectedTotal2 = avgDaily2 * daysInMonth;
    const projectedDifference = projectedTotal1 - projectedTotal2;
    
    return {
      comparisonDay: effectiveDay + 1,
      currentDay: comparisonDay,
      difference,
      percentage,
      avgDaily1,
      avgDaily2,
      avgDifference,
      avgPercentage,
      projectedTotal1,
      projectedTotal2,
      projectedDifference,
      period1Label: `${MONTH_LABELS[period1.month - 1]} ${period1.year}`,
      period2Label: `${MONTH_LABELS[period2.month - 1]} ${period2.year}`,
    };
  };

  // Data voor dagelijkse grafiek
  const dailyChartData = {
    labels: compareData[selectedPeriods[0]?.year + '-' + selectedPeriods[0]?.month]?.omzet.map((_, i) => (i + 1).toString()),
    datasets: selectedPeriods.map((p, idx) => ({
      label: `Omzet ${MONTH_LABELS[p.month - 1]} ${p.year}`,
      data: compareData[`${p.year}-${p.month}`]?.omzet || [],
      borderColor: `hsl(${idx * 60}, 70%, 50%)`,
      backgroundColor: `hsl(${idx * 60}, 70%, 80%)`,
      yAxisID: 'y',
    })).concat(
      marginAvailable
        ? selectedPeriods.map((p, idx) => ({
            label: `Marge ${MONTH_LABELS[p.month - 1]} ${p.year}`,
            data: compareData[`${p.year}-${p.month}`]?.marge || [],
            borderColor: `hsl(${idx * 60 + 30}, 70%, 40%)`,
            backgroundColor: `hsl(${idx * 60 + 30}, 70%, 90%)`,
            borderDash: [5, 5],
            yAxisID: 'y1',
            hidden: true,
          }))
        : []
    ),
  };

  // Data voor cumulatieve grafiek
  const cumulativeData = calculateCumulativeData();
  const maxDays = Math.max(...selectedPeriods.map(p => compareData[`${p.year}-${p.month}`]?.days || 0), 1);
  const currentComparisonDay = getCurrentComparisonDay();
  
  // Veiligheidscontrole voor currentComparisonDay
  const safeCurrentDay = (currentComparisonDay && currentComparisonDay > 0 && currentComparisonDay <= maxDays) 
    ? currentComparisonDay 
    : null;
  
  const cumulativeChartData = {
    labels: Array.from({ length: maxDays }, (_, i) => (i + 1).toString()),
    datasets: [
      // Cumulatieve omzet lijnen
      ...selectedPeriods.map((p, idx) => ({
        label: `Cumulatief ${MONTH_LABELS[p.month - 1]} ${p.year}`,
        data: cumulativeData[`${p.year}-${p.month}`]?.omzet || [],
        borderColor: `hsl(${idx * 60}, 70%, 50%)`,
        backgroundColor: 'transparent',
        tension: 0.1,
        pointRadius: 3,
        pointHoverRadius: 6,
        order: 1,
      })),
      // Vandaag marker (alleen als we een huidige periode hebben)
      ...(safeCurrentDay ? [{
        label: `Vandaag (${safeCurrentDay} juli)`,
        data: Array.from({ length: maxDays }, (_, i) => {
          if (i === safeCurrentDay - 1) {
            return Math.max(...selectedPeriods.map(p => {
              const periodData = cumulativeData[`${p.year}-${p.month}`]?.omzet || [];
              return periodData[safeCurrentDay - 1] || 0;
            })) || 0;
          }
          return null;
        }),
        borderColor: 'rgba(239, 68, 68, 0.9)',
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 0,
        pointRadius: 8,
        pointHoverRadius: 10,
        pointBorderWidth: 3,
        pointBorderColor: 'rgba(239, 68, 68, 1)',
        tension: 0,
        order: 0,
        fill: false,
        showLine: false, // Alleen de punt tonen, geen lijn
      }] : [])
    ]
  };

  // Performance indicators
  const performanceStats = calculatePerformanceIndicators();

  // UI helpers
  const addPeriod = () => {
    setSelectedPeriods(periods => [
      ...periods,
      { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    ]);
  };
  const updatePeriod = (idx: number, year: number, month: number) => {
    setSelectedPeriods(periods => periods.map((p, i) => i === idx ? { year, month } : p));
  };
  const removePeriod = (idx: number) => {
    setSelectedPeriods(periods => periods.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">📅 Dagelijkse Vergelijking</h1>
          <div className="flex flex-wrap gap-4 items-center mb-2">
            {selectedPeriods.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-gray-50 px-3 py-2 rounded-lg border">
                <select value={p.year} onChange={e => updatePeriod(idx, Number(e.target.value), p.month)} className="border border-gray-300 rounded px-2 py-1 text-gray-900 font-medium bg-white">
                  {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select value={p.month} onChange={e => updatePeriod(idx, p.year, Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-gray-900 font-medium bg-white">
                  {MONTH_LABELS.map((m, midx) => (
                    <option key={midx + 1} value={midx + 1}>{m}</option>
                  ))}
                </select>
                {selectedPeriods.length > 1 && (
                  <button onClick={() => removePeriod(idx)} className="ml-1 text-red-600 hover:underline">✕</button>
                )}
              </div>
            ))}
            <button onClick={addPeriod} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow font-semibold">+ Voeg maand toe</button>
          </div>
        </div>
        {loading ? (
          <p>⏳ Gegevens laden...</p>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="mb-6">
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('cumulative')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'cumulative'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-800 hover:text-blue-600'
                  }`}
                >
                  📈 Cumulatief
                </button>
                <button
                  onClick={() => setActiveTab('daily')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'daily'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-800 hover:text-blue-600'
                  }`}
                >
                  📊 Dagelijks
                </button>
              </div>
            </div>

            {/* Performance Indicators (alleen voor cumulatieve view) */}
            {activeTab === 'cumulative' && performanceStats && (
              <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-blue-600 text-sm font-medium">
                    Stand na {performanceStats.comparisonDay} dagen
                    {performanceStats.currentDay && <span className="text-xs"> (vandaag)</span>}
                  </p>
                  <p className={`text-2xl font-bold ${performanceStats.difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {performanceStats.difference >= 0 ? '+' : ''}€{formatBE(Math.abs(performanceStats.difference))} 
                  </p>
                  <p className="text-sm text-gray-900 font-medium">
                    {performanceStats.difference >= 0 ? 'voorsprong' : 'achterstand'} vs {performanceStats.period2Label}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-green-600 text-sm font-medium">Daggemiddelde</p>
                  <p className="text-lg font-bold text-green-800">
                    €{formatBE(performanceStats.avgDaily1)}
                  </p>
                  <p className="text-sm text-gray-900 font-medium">
                    vs €{formatBE(performanceStats.avgDaily2)} 
                    <span className={`ml-1 ${performanceStats.avgPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({performanceStats.avgPercentage >= 0 ? '+' : ''}{performanceStats.avgPercentage.toFixed(1)}%)
                    </span>
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <p className="text-purple-600 text-sm font-medium">Bij huidige tempo</p>
                  <p className="text-lg font-bold text-purple-800">
                    €{formatBE(performanceStats.projectedTotal1)}
                  </p>
                  <p className="text-sm text-gray-900 font-medium">
                    vs €{formatBE(performanceStats.projectedTotal2)} maandeinde
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="text-orange-600 text-sm font-medium">Geprojecteerd verschil</p>
                  <p className={`text-2xl font-bold ${performanceStats.projectedDifference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {performanceStats.projectedDifference >= 0 ? '+' : ''}€{formatBE(Math.abs(performanceStats.projectedDifference))}
                  </p>
                  <p className="text-sm text-gray-900 font-medium">als trend doorzet</p>
                </div>
              </div>
            )}

            {/* Grafiek */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {activeTab === 'daily' ? 'Omzet & Marge per dag' : 'Cumulatieve Omzet'}
              </h2>
              <Line
                data={activeTab === 'daily' ? dailyChartData : cumulativeChartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'top' as const },
                    title: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          if (activeTab === 'cumulative' && performanceStats && context.datasetIndex === 1) {
                            const difference = (cumulativeData[`${selectedPeriods[0].year}-${selectedPeriods[0].month}`]?.omzet[context.dataIndex] || 0) - 
                                             (cumulativeData[`${selectedPeriods[1].year}-${selectedPeriods[1].month}`]?.omzet[context.dataIndex] || 0);
                            return [
                              `${context.dataset.label}: €${formatBE(context.parsed.y ?? 0)}`,
                              `Verschil: ${difference >= 0 ? '+' : ''}€${formatBE(Math.abs(difference))}`
                            ];
                          }
                          return `${context.dataset.label}: €${formatBE(context.parsed.y ?? 0)}`;
                        }
                      }
                    }
                  },
                  scales: activeTab === 'daily' ? {
                    y: { title: { display: true, text: 'Omzet (€)' } },
                    y1: {
                      position: 'right',
                      title: { display: true, text: 'Marge (€)' },
                      grid: { drawOnChartArea: false },
                    },
                  } : {
                    y: { 
                      title: { display: true, text: 'Cumulatieve Omzet (€)' },
                      beginAtZero: true 
                    },
                    x: { title: { display: true, text: 'Dag van de maand' } }
                  },
                }}
              />
            </div>
            {/* Tabel */}
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-900 font-semibold">Dag</th>
                    {selectedPeriods.map((p, idx) => (
                      <th key={idx + '-omzet'} className="px-4 py-2 text-left text-gray-900 font-semibold">Omzet {MONTH_LABELS[p.month - 1]} {p.year}</th>
                    ))}
                    {marginAvailable && selectedPeriods.map((p, idx) => (
                      <th key={idx + '-marge'} className="px-4 py-2 text-left text-gray-900 font-semibold">Marge {MONTH_LABELS[p.month - 1]} {p.year}</th>
                    ))}
                  </tr>
                </thead>
                                  <tbody>
                    {(() => {
                      // Bepaal max aantal dagen van alle periodes
                      const maxDays = Math.max(...selectedPeriods.map(p => compareData[`${p.year}-${p.month}`]?.days || 0));
                      return Array.from({ length: maxDays }, (_, dayIdx) => {
                        const dayNumber = dayIdx + 1;
                        
                        // Bepaal hoogste omzet en marge voor deze dag
                        const omzetValues = selectedPeriods.map(p => compareData[`${p.year}-${p.month}`]?.omzet[dayIdx] || 0);
                        const maxOmzet = Math.max(...omzetValues);
                        const margeValues = marginAvailable 
                          ? selectedPeriods.map(p => compareData[`${p.year}-${p.month}`]?.marge?.[dayIdx] || 0)
                          : [];
                        const maxMarge = marginAvailable ? Math.max(...margeValues) : 0;
                        
                        // Standaard rij kleur (afwisselend wit/grijs)
                        const baseRowClassName = dayIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                        
                                                  return (
                            <tr key={dayIdx} className={baseRowClassName}>
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {dayNumber}
                              {selectedPeriods.map((p, idx) => (
                                <div key={idx} className="text-xs text-gray-700 font-normal">
                                  {getWeekday(p.year, p.month, dayNumber)} {p.year}
                                </div>
                              ))}
                            </td>
                            {selectedPeriods.map((p, idx) => {
                              const omzetValue = compareData[`${p.year}-${p.month}`]?.omzet[dayIdx] || 0;
                              const isMaxOmzet = omzetValue === maxOmzet && maxOmzet > 0;
                              
                              // Bepaal cel kleur op basis van dit specifieke jaar
                              const isWeekendDay = isWeekend(p.year, p.month, dayNumber);
                              const isHoliday = isBelgianHoliday(p.year, p.month, dayNumber);
                              let cellClassName = 'px-4 py-2 text-gray-800';
                              
                              if (isHoliday) {
                                cellClassName += ' bg-red-100'; // Feestdag
                              } else if (isWeekendDay) {
                                cellClassName += ' bg-yellow-100'; // Weekend
                              }
                              
                              if (isMaxOmzet) {
                                cellClassName += ' font-bold underline text-gray-900';
                              }
                              
                              return (
                                <td key={idx + '-omzet-' + dayIdx} className={cellClassName}>
                                  {formatBE(omzetValue)}
                                </td>
                              );
                            })}
                            {marginAvailable && selectedPeriods.map((p, idx) => {
                              const margeValue = compareData[`${p.year}-${p.month}`]?.marge?.[dayIdx] || 0;
                              const isMaxMarge = margeValue === maxMarge && maxMarge > 0;
                              
                              // Bepaal cel kleur op basis van dit specifieke jaar
                              const isWeekendDay = isWeekend(p.year, p.month, dayNumber);
                              const isHoliday = isBelgianHoliday(p.year, p.month, dayNumber);
                              let cellClassName = 'px-4 py-2 text-green-800 font-medium';
                              
                              if (isHoliday) {
                                cellClassName += ' bg-red-100'; // Feestdag
                              } else if (isWeekendDay) {
                                cellClassName += ' bg-yellow-100'; // Weekend
                              }
                              
                              if (isMaxMarge) {
                                cellClassName += ' font-bold underline';
                              }
                              
                              return (
                                <td key={idx + '-marge-' + dayIdx} className={cellClassName}>
                                  {typeof compareData[`${p.year}-${p.month}`]?.marge?.[dayIdx] === 'number' ? formatBE(margeValue) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    })()}
                    {/* Total Row */}
                    <tr className="bg-blue-100 font-bold border-t-2 border-gray-300">
                      <td className="px-4 py-2 text-gray-900">Totaal</td>
                      {selectedPeriods.map((p, idx) => {
                        const periodData = compareData[`${p.year}-${p.month}`];
                        const periodOmzetTotal = periodData?.omzet.reduce((sum, val) => sum + val, 0) || 0;
                        return (
                          <td key={idx + '-omzet-total'} className="px-4 py-2 text-gray-900">{formatBE(periodOmzetTotal)}</td>
                        );
                      })}
                      {marginAvailable && selectedPeriods.map((p, idx) => {
                        const periodData = compareData[`${p.year}-${p.month}`];
                        const periodMargeTotal = periodData?.marge?.reduce((sum, val) => sum + val, 0) || 0;
                        return (
                          <td key={idx + '-marge-total'} className="px-4 py-2 text-green-800">{formatBE(periodMargeTotal)}</td>
                        );
                      })}
                    </tr>
                  </tbody>
              </table>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
} 