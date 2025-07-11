import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

// Voor eenvoudige grafiek (optioneel):
// npm install chart.js react-chartjs-2
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

type MonthData = {
  omzet: number;
  marge?: number;
};

type YearlyData = {
  [month: string]: MonthData;
};

type CompareData = {
  [year: string]: YearlyData;
};

const MONTHS = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12',
];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
];

// Helper voor bedragnotatie
const formatBE = (amount: number) => amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SalesComparePage() {
  const router = useRouter();
  const [uid, setUid] = useState<number | null>(null);
  const [password, setPassword] = useState<string>('');
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [compareData, setCompareData] = useState<CompareData>({});
  const [loading, setLoading] = useState(false);
  const [marginAvailable, setMarginAvailable] = useState(false);
  const [allYears, setAllYears] = useState<number[]>([]);

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

  // Bepaal alle jaren met data (optioneel: hardcoded 2022-2025)
  useEffect(() => {
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
      years.push(y);
    }
    setAllYears(years);
    setSelectedYears([now.getFullYear()]);
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

  const fetchCompareData = useCallback(async () => {
    if (!uid || !password || !selectedYears.length) return;
    setLoading(true);
    let marginFound = false;
    const data: CompareData = {};
    for (const year of selectedYears) {
      // Haal alle regels van het jaar op
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
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
      // Verzamel order_ids
      const orderIds = Array.from(new Set(lines.map(line => line.order_id?.[0]).filter(Boolean)));
      if (orderIds.length === 0) continue;
      // Haal orders op voor datum
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
      // Groepeer per maand
      const monthly: YearlyData = {};
      lines.forEach((line) => {
        const orderId = line.order_id?.[0];
        const dateStr = orderIdToDate[orderId];
        if (!dateStr) return;
        const month = dateStr.slice(5, 7); // 'YYYY-MM-DD' -> MM
        if (!monthly[month]) {
          monthly[month] = { omzet: 0, marge: 0 };
        }
        monthly[month].omzet += line.price_subtotal_incl || 0;
        if (typeof line.margin === 'number') {
          marginFound = true;
          monthly[month].marge = (monthly[month].marge || 0) + line.margin;
        }
      });
      data[year] = monthly;
    }
    setCompareData(data);
    setMarginAvailable(marginFound);
    setLoading(false);
  }, [uid, password, selectedYears, fetchFromOdoo]);

  useEffect(() => {
    if (uid && password && selectedYears.length) {
      fetchCompareData();
    }
  }, [uid, password, selectedYears, fetchCompareData]);

  // Data voor grafiek
  const chartData = {
    labels: MONTH_LABELS,
    datasets: selectedYears.map((year, idx) => ({
      label: `Omzet ${year}`,
      data: MONTHS.map(m => compareData[year]?.[m]?.omzet || 0),
      borderColor: `hsl(${idx * 60}, 70%, 50%)`,
      backgroundColor: `hsl(${idx * 60}, 70%, 80%)`,
      yAxisID: 'y',
    })).concat(
      marginAvailable
        ? selectedYears.map((year, idx) => ({
            label: `Marge ${year}`,
            data: MONTHS.map(m => compareData[year]?.[m]?.marge || 0),
            borderColor: `hsl(${idx * 60 + 30}, 70%, 40%)`,
            backgroundColor: `hsl(${idx * 60 + 30}, 70%, 90%)`,
            borderDash: [5, 5],
            yAxisID: 'y1',
            hidden: true,
          }))
        : []
    ),
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Navigation />
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">📈 Verkoop Vergelijken</h1>
          <div className="flex gap-2 items-center">
            <label className="mr-2 font-medium">Jaren:</label>
            {allYears.map(y => (
              <label key={y} className="mr-2">
                <input
                  type="checkbox"
                  checked={selectedYears.includes(y)}
                  onChange={e => {
                    setSelectedYears(val =>
                      e.target.checked ? [...val, y] : val.filter(v => v !== y)
                    );
                  }}
                  className="mr-1"
                />
                {y}
              </label>
            ))}
          </div>
        </div>
        {loading ? (
          <p>⏳ Gegevens laden...</p>
        ) : (
          <>
            {/* Grafiek */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-2">Omzet &amp; Marge per maand</h2>
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
                    <th className="px-4 py-2 text-left">Maand</th>
                    {selectedYears.map(y => (
                      <th key={y + '-omzet'} className="px-4 py-2 text-left">Omzet {y}</th>
                    ))}
                    {marginAvailable && selectedYears.map(y => (
                      <th key={y + '-marge'} className="px-4 py-2 text-left">Marge {y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((m, idx) => (
                    <tr key={m} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 font-medium">{MONTH_LABELS[idx]}</td>
                      {selectedYears.map(y => (
                        <td key={y + '-omzet-' + m} className="px-4 py-2">{formatBE(compareData[y]?.[m]?.omzet || 0)}</td>
                      ))}
                      {marginAvailable && selectedYears.map(y => (
                        <td key={y + '-marge-' + m} className="px-4 py-2 text-green-800">{typeof compareData[y]?.[m]?.marge === 'number' ? formatBE(compareData[y][m].marge!) : '-'}</td>
                      ))}
                    </tr>
                  ))}
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