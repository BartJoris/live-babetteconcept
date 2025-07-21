import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Line } from 'react-chartjs-2';
import Navigation from '../components/Navigation';
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
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [selectedPeriods, setSelectedPeriods] = useState<{ year: number; month: number }[]>([
    { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
  ]);
  const [compareData, setCompareData] = useState<Record<string, { omzet: number[]; marge?: number[]; days: number }>>({});
  const [loading, setLoading] = useState(false);
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

  const fetchCompareData = useCallback(async () => {
    if (!uid || !password || !selectedPeriods.length) return;
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
  }, [uid, password, selectedPeriods, fetchFromOdoo]);

  useEffect(() => {
    if (uid && password && selectedPeriods.length) {
      fetchCompareData();
    }
  }, [uid, password, selectedPeriods, fetchCompareData]);

  // Data voor grafiek
  const chartData = {
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
      <Navigation />
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">📅 Dagelijkse Vergelijking</h1>
          <div className="flex flex-wrap gap-4 items-center mb-2">
            {selectedPeriods.map((p, idx) => (
              <div key={idx} className="flex gap-2 items-center bg-gray-50 px-3 py-2 rounded-lg border">
                <select value={p.year} onChange={e => updatePeriod(idx, Number(e.target.value), p.month)} className="border rounded px-2 py-1">
                  {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select value={p.month} onChange={e => updatePeriod(idx, p.year, Number(e.target.value))} className="border rounded px-2 py-1">
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
            {/* Grafiek */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-2">Omzet &amp; Marge per dag</h2>
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'top' as const },
                    title: { display: false },
                  },
                  scales: {
                    y: { title: { display: true, text: 'Omzet (€)' } },
                    y1: {
                      position: 'right',
                      title: { display: true, text: 'Marge (€)' },
                      grid: { drawOnChartArea: false },
                    },
                  },
                }}
              />
            </div>
            {/* Tabel */}
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Dag</th>
                    {selectedPeriods.map((p, idx) => (
                      <th key={idx + '-omzet'} className="px-4 py-2 text-left">Omzet {MONTH_LABELS[p.month - 1]} {p.year}</th>
                    ))}
                    {marginAvailable && selectedPeriods.map((p, idx) => (
                      <th key={idx + '-marge'} className="px-4 py-2 text-left">Marge {MONTH_LABELS[p.month - 1]} {p.year}</th>
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
                            <td className="px-4 py-2 font-medium">
                              {dayNumber}
                              {selectedPeriods.map((p, idx) => (
                                <div key={idx} className="text-xs text-gray-500">
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
                              let cellClassName = 'px-4 py-2';
                              
                              if (isHoliday) {
                                cellClassName += ' bg-red-100'; // Feestdag
                              } else if (isWeekendDay) {
                                cellClassName += ' bg-yellow-100'; // Weekend
                              }
                              
                              if (isMaxOmzet) {
                                cellClassName += ' font-bold underline';
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
                              let cellClassName = 'px-4 py-2 text-green-800';
                              
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