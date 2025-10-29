import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';

type DailySalesProduct = {
  date: string;
  sales_products_count: number;
  total_products_count: number;
  sales_percentage: number;
  order_count: number;
  original_sales_value: number;
  received_sales_value: number;
  regular_value: number;
  total_discount: number;
};

type SalesProductData = {
  total_sales_products: number;
  total_regular_products: number;
  sales_percentage: number;
  average_sales_per_order: number;
  daily_sales_products: DailySalesProduct[];
  original_sales_value: number;
  received_sales_value: number;
  regular_value: number;
  total_discount: number;
};

type ProductDetail = {
  id: number;
  name: string;
  qty: number;
  price_unit: number;
  price_subtotal: number;
  is_sales: boolean;
  category: string;
  order_id: number;
  order_time: string;
  price_with_discount?: number;
};

export default function SalesProductsPage() {
  const router = useRouter();
  // @ts-expect-error
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<SalesProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<ProductDetail[]>([]);
  const [loadingDayDetails, setLoadingDayDetails] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (storedUid && storedPass) {
        // setUid(Number(storedUid)); // This line is removed as per the new_code
        // setPassword(storedPass); // This line is removed as per the new_code
      } else {
        router.push('/');
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set default month to current month
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
  }, []);

  const fetchSalesProducts = useCallback(async () => {
    if (!isLoggedIn || !selectedMonth) return;
    setLoading(true);
    try {
      const res = await fetch('/api/sales-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedMonth,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('Fout bij ophalen sales-producten data:', err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, selectedMonth]);

  const fetchDayDetails = useCallback(async (date: string) => {
    if (!isLoggedIn) return;
    setLoadingDayDetails(true);
    try {
      const res = await fetch('/api/sales-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await res.json();
      setDayDetails(result.products || []);
    } catch (err) {
      console.error('Fout bij ophalen dag details:', err);
    } finally {
      setLoadingDayDetails(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && selectedMonth) {
      fetchSalesProducts();
    }
  }, [isLoggedIn, selectedMonth, fetchSalesProducts]);

  const handleDayClick = (date: string) => {
    console.log('🔍 Day clicked:', date);
    setSelectedDate(date);
    fetchDayDetails(date);
  };

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

  const formatTime = (timeString: string) => {
    return new Date(timeString + 'Z').toLocaleTimeString('nl-BE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">🏷️ Sales Product Analytics</h1>
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
                onClick={fetchSalesProducts}
                className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <p>⏳ Gegevens laden...</p>
          ) : data ? (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Sales Product Overzicht {formatMonth(selectedMonth)}
                </h2>
                
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <p className="text-red-600 text-sm font-medium">Sales Producten</p>
                    <p className="text-2xl font-bold text-red-800">{data.total_sales_products}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <p className="text-blue-600 text-sm font-medium">Reguliere Producten</p>
                    <p className="text-2xl font-bold text-blue-800">{data.total_regular_products}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-green-600 text-sm font-medium">Sales Percentage</p>
                    <p className="text-2xl font-bold text-green-800">{data.sales_percentage.toFixed(1)}%</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <p className="text-purple-600 text-sm font-medium">Gem. Sales per Order</p>
                    <p className="text-2xl font-bold text-purple-800">{data.average_sales_per_order.toFixed(1)}</p>
                  </div>
                </div>

                {data && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <p className="text-yellow-600 text-sm font-medium">Originele waarde sales-producten</p>
                      <p className="text-2xl font-bold text-yellow-800">€ {data.original_sales_value?.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <p className="text-green-600 text-sm font-medium">Ontvangen waarde sales-producten</p>
                      <p className="text-2xl font-bold text-green-800">€ {data.received_sales_value?.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-blue-600 text-sm font-medium">Waarde reguliere producten</p>
                      <p className="text-2xl font-bold text-blue-800">€ {data.regular_value?.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                      <p className="text-red-600 text-sm font-medium">Totale korting</p>
                      <p className="text-2xl font-bold text-red-800">€ {data.total_discount?.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                )}

                {/* Daily Sales Products Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
                  <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">Dagelijkse Sales Producten</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Datum
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Sales Producten
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Totaal Producten
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Sales Percentage
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Aantal Orders
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Orig. waarde sales
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Ontv. waarde sales
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Reguliere waarde
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                            Korting
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.daily_sales_products.length > 0 ? (
                          data.daily_sales_products.map((day, index) => (
                            <tr key={day.date} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer hover:bg-blue-50" onClick={() => handleDayClick(day.date)}>
                                {formatDate(day.date)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-800">
                                {day.sales_products_count}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {day.total_products_count}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-800 font-semibold">
                                {day.sales_percentage.toFixed(1)}%
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                {day.order_count}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-800 font-semibold">
                                € {day.original_sales_value.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-800 font-semibold">
                                € {day.received_sales_value.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-800 font-semibold">
                                € {day.regular_value.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-800 font-semibold">
                                € {day.total_discount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                              Geen sales-producten data gevonden voor deze maand
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Day Details Modal */}
                {selectedDate && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-900">Producten verkocht op {formatDate(selectedDate)}</h2>
                        <button
                          onClick={() => setSelectedDate(null)}
                          className="text-gray-500 hover:text-gray-700 text-2xl"
                        >
                          ×
                        </button>
                      </div>

                      {/* Totals summary */}
                      {dayDetails.length > 0 && (
                        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                          <div className="bg-gray-50 rounded p-2">
                            <span className="font-semibold">Totaal producten:</span> {dayDetails.reduce((sum, p) => sum + p.qty, 0)}
                          </div>
                          <div className="bg-red-50 rounded p-2">
                            <span className="font-semibold text-red-700">Sales producten:</span> {dayDetails.filter(p => p.is_sales).reduce((sum, p) => sum + p.qty, 0)}
                          </div>
                          <div className="bg-blue-50 rounded p-2">
                            <span className="font-semibold text-blue-700">Reguliere producten:</span> {dayDetails.filter(p => !p.is_sales).reduce((sum, p) => sum + p.qty, 0)}
                          </div>
                          <div className="bg-green-50 rounded p-2">
                            <span className="font-semibold text-green-700">Omzet totaal:</span> € {dayDetails.reduce((sum, p) => sum + p.price_subtotal, 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="bg-red-100 rounded p-2">
                            <span className="font-semibold text-red-800">Omzet sales:</span> € {dayDetails.filter(p => p.is_sales).reduce((sum, p) => sum + p.price_subtotal, 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="bg-blue-100 rounded p-2">
                            <span className="font-semibold text-blue-800">Omzet regulier:</span> € {dayDetails.filter(p => !p.is_sales).reduce((sum, p) => sum + p.price_subtotal, 0).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      )}

                      {loadingDayDetails ? (
                        <p>⏳ Producten laden...</p>
                      ) : dayDetails.length > 0 ? (
                        <>
                          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-sm text-blue-800">
                              <strong>Let op:</strong> Niet alle producten in de &quot;Sales&quot; categorie hebben automatisch korting. 
                              Sommige producten worden tegen normale prijs verkocht maar staan wel in de sales collectie.
                            </p>
                          </div>
                          <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Tijd
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Product
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Categorie
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Type
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Aantal
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Prijs
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Prijs met korting
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Korting
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider">
                                  Totaal
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {dayDetails.map((product, index) => (
                                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">
                                    {formatTime(product.order_time)}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {product.name}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">
                                    {product.category}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      product.is_sales 
                                        ? 'bg-red-100 text-red-800' 
                                        : 'bg-blue-100 text-blue-800'
                                    }`}>
                                      {product.is_sales ? 'Sales' : 'Regulier'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                    {product.qty}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-800">
                                    € {product.price_unit.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold">
                                    {(() => {
                                      const discountedPrice = product.price_with_discount !== undefined
                                        ? product.price_with_discount
                                        : product.price_subtotal / product.qty;
                                      const hasDiscount = discountedPrice < product.price_unit;
                                      return (
                                        <span className={hasDiscount ? 'text-green-700' : 'text-gray-800'}>
                                          € {discountedPrice.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold">
                                    {(() => {
                                      const discountedPrice = product.price_with_discount !== undefined
                                        ? product.price_with_discount
                                        : product.price_subtotal / product.qty;
                                      const discountAmount = product.price_unit - discountedPrice;
                                      const hasDiscount = discountAmount > 0;
                                      return (
                                        <span className={hasDiscount ? 'text-red-700' : 'text-gray-400'}>
                                          € {discountAmount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold text-gray-900">
                                    € {product.price_subtotal.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </>
                      ) : (
                        <p className="text-gray-500">Geen producten gevonden voor deze dag.</p>
                      )}
                    </div>
                  </div>
                )}
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