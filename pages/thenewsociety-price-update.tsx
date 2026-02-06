import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';

interface OrderCSVProduct {
  productReference: string;
  productName: string;
  colorName: string;
  sizeName: string;
  ean13: string;
  unitPrice: number;
}

interface MatchedProduct {
  orderProduct: OrderCSVProduct;
  odooVariantId: number | null;
  odooVariantName: string | null;
  currentPrice: number | null;
  srpPrice: number | null;
  newPrice: number | null;
  foundInOdoo: boolean;
}

interface UpdateResult {
  variantId: number;
  success: boolean;
  error?: string;
}

export default function TheNewSocietyPriceUpdate() {
  const { isLoggedIn } = useAuth();
  const [, setOrderCsvFile] = useState<File | null>(null);
  const [, setConfirmationCsvFile] = useState<File | null>(null);
  const [orderProducts, setOrderProducts] = useState<OrderCSVProduct[]>([]);
  const [srpPrices, setSrpPrices] = useState<Map<string, number>>(new Map()); // Key: "reference|variant"
  const [matchedProducts, setMatchedProducts] = useState<MatchedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [updateResults, setUpdateResults] = useState<UpdateResult[]>([]);
  const [currentStep, setCurrentStep] = useState(1);

  const getCredentials = () => {
    const uid = localStorage.getItem('odoo_uid');
    const password = localStorage.getItem('odoo_pass');
    return { uid, password };
  };

  // Parse Order CSV (order-*.csv)
  const parseOrderCSV = async (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV bestand is leeg of ongeldig');
    }

    const headers = lines[0].split(';').map(h => h.trim());
    const productReferenceIdx = headers.findIndex(h => h.toLowerCase() === 'product reference');
    const productNameIdx = headers.findIndex(h => h.toLowerCase() === 'product name');
    const colorNameIdx = headers.findIndex(h => h.toLowerCase() === 'color name');
    const sizeNameIdx = headers.findIndex(h => h.toLowerCase() === 'size name');
    const eanIdx = headers.findIndex(h => h.toLowerCase() === 'ean13');
    const unitPriceIdx = headers.findIndex(h => h.toLowerCase() === 'unit price');

    if (productReferenceIdx === -1 || productNameIdx === -1 || colorNameIdx === -1 || 
        sizeNameIdx === -1 || eanIdx === -1 || unitPriceIdx === -1) {
      throw new Error('CSV mist verplichte kolommen: Product reference, Product name, Color name, Size name, EAN13, Unit price');
    }

    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    const products: OrderCSVProduct[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';').map(v => v.trim());
      if (values.length < headers.length) continue;

      const productReference = values[productReferenceIdx] || '';
      const productName = values[productNameIdx] || '';
      const colorName = values[colorNameIdx] || '';
      const sizeName = values[sizeNameIdx] || '';
      const ean13 = values[eanIdx] || '';
      const unitPrice = parsePrice(values[unitPriceIdx] || '0');

      if (productReference && productName && colorName && sizeName && ean13) {
        products.push({
          productReference,
          productName,
          colorName,
          sizeName,
          ean13,
          unitPrice,
        });
      }
    }

    return products;
  };

  // Parse Order Confirmation CSV (Babette - Jove BV..csv)
  // Supports both English (STYLE, REFERENCE, VARIANT, SRP) and Spanish (ESTILO, REFERENCIA, VARIANTE, SRP) headers
  const parseOrderConfirmationCSV = async (text: string) => {
    const lines = text.trim().split('\n');
    
    // Find header row - support both English and Spanish headers
    let headerLineIdx = -1;
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i].trim();
      if (line && line.includes(';')) {
        const lineUpper = line.toUpperCase();
        // Check for English headers
        if (lineUpper.includes('STYLE') && lineUpper.includes('REFERENCE') && 
            lineUpper.includes('VARIANT') && lineUpper.includes('SRP')) {
          headerLineIdx = i;
          break;
        }
        // Check for Spanish headers
        if (lineUpper.includes('ESTILO') && lineUpper.includes('REFERENCIA') && 
            lineUpper.includes('VARIANTE') && lineUpper.includes('SRP')) {
          headerLineIdx = i;
          break;
        }
      }
    }

    if (headerLineIdx === -1) {
      throw new Error('Kan de header regel niet vinden in Order Confirmation CSV (zoek naar STYLE/ESTILO, REFERENCE/REFERENCIA, VARIANT/VARIANTE, SRP)');
    }

    const headers = lines[headerLineIdx].split(';').map(h => h.trim());
    // Support both English and Spanish headers
    const styleIdx = headers.findIndex(h => {
      const hUpper = h.toUpperCase();
      return hUpper === 'STYLE' || hUpper === 'ESTILO';
    });
    const referenceIdx = headers.findIndex(h => {
      const hUpper = h.toUpperCase();
      return hUpper === 'REFERENCE' || hUpper === 'REFERENCIA';
    });
    const variantIdx = headers.findIndex(h => {
      const hUpper = h.toUpperCase();
      return hUpper === 'VARIANT' || hUpper === 'VARIANTE';
    });
    const srpIdx = headers.findIndex(h => h.toUpperCase() === 'SRP');

    if (referenceIdx === -1 || variantIdx === -1 || srpIdx === -1) {
      throw new Error('CSV mist verplichte kolommen: REFERENCE/REFERENCIA, VARIANT/VARIANTE, SRP');
    }

    const parsePrice = (str: string) => {
      if (!str) return 0;
      return parseFloat(str.replace(',', '.'));
    };

    const srpMap = new Map<string, number>(); // Key: "reference|variant"

    // Parse data rows
    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith(';') && line.split(';').filter(c => c.trim()).length <= 1) {
        continue;
      }

      const values = line.split(';').map(v => v.trim());
      const styleValue = styleIdx >= 0 ? values[styleIdx] || '' : '';
      const referenceValue = referenceIdx >= 0 ? values[referenceIdx] || '' : '';
      const variantValue = variantIdx >= 0 ? values[variantIdx] || '' : '';
      const srpValue = srpIdx >= 0 ? values[srpIdx] || '' : '';

      // Check if this is a product name row (has STYLE/ESTILO but no REFERENCE/REFERENCIA)
      if (styleValue && !referenceValue) {
        // Skip product name rows
        continue;
      }

      // Check if this is a data row (has REFERENCE/REFERENCIA)
      if (referenceValue && variantValue && srpValue) {
        const srp = parsePrice(srpValue);
        if (srp > 0) {
          const key = `${referenceValue}|${variantValue}`.toLowerCase();
          srpMap.set(key, srp);
        }
      }
    }

    return srpMap;
  };

  const handleOrderCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const products = await parseOrderCSV(text);
      setOrderProducts(products);
      setOrderCsvFile(file);
      console.log(`✅ Parsed ${products.length} products from Order CSV`);
      alert(`✅ ${products.length} producten geparsed uit Order CSV`);
    } catch (error: any) {
      console.error('Error parsing Order CSV:', error);
      alert(`❌ Fout bij parsen Order CSV: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmationCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const srpMap = await parseOrderConfirmationCSV(text);
      setSrpPrices(srpMap);
      setConfirmationCsvFile(file);
      console.log(`✅ Parsed ${srpMap.size} SRP prices from Order Confirmation CSV`);
      alert(`✅ ${srpMap.size} SRP prijzen geparsed uit Order Confirmation CSV`);
    } catch (error: any) {
      console.error('Error parsing Order Confirmation CSV:', error);
      alert(`❌ Fout bij parsen Order Confirmation CSV: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const matchProductsWithOdoo = async () => {
    if (orderProducts.length === 0) {
      alert('Upload eerst het Order CSV bestand');
      return;
    }

    if (!isLoggedIn) {
      alert('Log eerst in bij Odoo');
      return;
    }

    setLoading(true);
    try {
      const { uid, password } = getCredentials();
      if (!uid || !password) {
        alert('Odoo credentials niet gevonden. Log opnieuw in.');
        return;
      }

      // Collect all EAN13s
      const ean13s = orderProducts.map(p => p.ean13).filter(Boolean);
      console.log(`🔍 Looking up ${ean13s.length} products in Odoo by EAN13...`);

      // Batch lookup products by EAN13
      const response = await fetch('/api/odoo/analyse-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcodes: ean13s,
          mode: 'activeAndArchived',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to lookup products: ${response.status}`);
      }

      const odooProducts = await response.json();
      const odooMap = new Map<string, any>();
      
      // The API returns an array of { barcode, active: OdooMatch | null, archived: OdooMatch | null }
      odooProducts.forEach((item: any) => {
        // Prefer active product, fallback to archived
        const product = item.active || item.archived;
        if (product && item.barcode) {
          odooMap.set(item.barcode, product);
        }
      });

      console.log(`✅ Found ${odooMap.size} products in Odoo`);

      // Match Order CSV products with Odoo products and SRP prices
      const matched: MatchedProduct[] = [];
      for (const orderProduct of orderProducts) {
        const odooProduct = odooMap.get(orderProduct.ean13);
        const srpKey = `${orderProduct.productReference}|${orderProduct.colorName}`.toLowerCase();
        const srpPrice = srpPrices.get(srpKey) || null;

        if (odooProduct) {
          matched.push({
            orderProduct,
            odooVariantId: odooProduct.id,
            odooVariantName: odooProduct.name,
            currentPrice: odooProduct.listPrice || null,
            srpPrice,
            newPrice: srpPrice || odooProduct.listPrice || null,
            foundInOdoo: true,
          });
        }
      }

      // Only show products found in Odoo (as per requirement)
      setMatchedProducts(matched);
      setCurrentStep(2);

      const foundCount = matched.length;
      const notFoundCount = orderProducts.length - foundCount;
      
      alert(`✅ Matching voltooid!\n\n✅ Gevonden in Odoo: ${foundCount}\n❌ Niet gevonden: ${notFoundCount}\n\nAlleen gevonden producten worden getoond.`);
    } catch (error: any) {
      console.error('Error matching products:', error);
      alert(`❌ Fout bij matchen producten: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updatePrice = (index: number, newPrice: number | null) => {
    setMatchedProducts(prev => {
      const updated = [...prev];
      updated[index].newPrice = newPrice;
      return updated;
    });
  };

  const updatePricesInOdoo = async () => {
    if (!isLoggedIn) {
      alert('Log eerst in bij Odoo');
      return;
    }

    const { uid, password } = getCredentials();
    if (!uid || !password) {
      alert('Odoo credentials niet gevonden. Log opnieuw in.');
      return;
    }

    const updates = matchedProducts
      .filter(p => p.odooVariantId && p.newPrice !== null && p.newPrice !== p.currentPrice)
      .map(p => ({
        variantId: p.odooVariantId!,
        listPrice: p.newPrice!,
      }));

    if (updates.length === 0) {
      alert('Geen prijzen om te updaten. Controleer of er verschillen zijn tussen huidige prijzen en nieuwe prijzen.');
      return;
    }

    if (!confirm(`Weet je zeker dat je ${updates.length} prijzen wilt updaten in Odoo?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/update-product-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates,
          uid,
          password,
        }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Server returned non-JSON response (${response.status}): ${text.substring(0, 200)}`);
      }

      if (!response.ok) {
        try {
          const error = await response.json();
          throw new Error(error.error || error.details || `Failed to update: ${response.status}`);
        } catch (parseError) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
      }

      const results = await response.json();
      setUpdateResults(results.results || []);

      const successCount = results.results?.filter((r: UpdateResult) => r.success).length || 0;
      const failCount = updates.length - successCount;

      alert(`✅ Update voltooid!\n\n✅ Succesvol: ${successCount}\n❌ Mislukt: ${failCount}`);

      // Refresh prices from Odoo
      await matchProductsWithOdoo();
    } catch (error: any) {
      console.error('Error updating prices:', error);
      alert(`❌ Fout bij updaten prijzen: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>The New Society - Prijs Update</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/product-import" className="text-blue-600 hover:text-blue-800 dark:text-blue-400">
              ← Terug naar Product Import
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            The New Society - Prijs Update
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Upload beide CSV bestanden om verkoopprijzen te vergelijken en te updaten in Odoo
          </p>

          {currentStep === 1 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Stap 1: Upload CSV Bestanden</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Order CSV Upload */}
                <div className={`border-2 ${orderProducts.length > 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'} rounded-lg p-6`}>
                  <div className="text-4xl mb-3">📄</div>
                  <h3 className="font-bold text-lg mb-2">
                    1️⃣ Order CSV <span className="text-red-500">*</span>
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Met EAN13, Product reference, Size name, Unit price
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                    Voorbeeld: "order-3116895-20260204.csv"
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleOrderCsvUpload}
                    className="hidden"
                    id="order-csv-upload"
                    disabled={loading}
                  />
                  <label
                    htmlFor="order-csv-upload"
                    className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                      orderProducts.length > 0
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-orange-600 text-white hover:bg-orange-700'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {orderProducts.length > 0 ? `✅ Geladen (${orderProducts.length} producten)` : '📄 Upload Order CSV'}
                  </label>
                </div>

                {/* Order Confirmation CSV Upload */}
                <div className={`border-2 ${srpPrices.size > 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'} rounded-lg p-6`}>
                  <div className="text-4xl mb-3">📋</div>
                  <h3 className="font-bold text-lg mb-2">
                    2️⃣ Order Confirmation CSV <span className="text-red-500">*</span>
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Met REFERENCE/REFERENCIA, VARIANT/VARIANTE, SRP kolommen
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-3 font-medium">
                    Voorbeeld: "Babette - Jove BV..csv"
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleConfirmationCsvUpload}
                    className="hidden"
                    id="confirmation-csv-upload"
                    disabled={loading}
                  />
                  <label
                    htmlFor="confirmation-csv-upload"
                    className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                      srpPrices.size > 0
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {srpPrices.size > 0 ? `✅ Geladen (${srpPrices.size} SRP prijzen)` : '📋 Upload Order Confirmation CSV'}
                  </label>
                </div>
              </div>

              {orderProducts.length > 0 && (
                <div className="mt-6">
                  <button
                    onClick={matchProductsWithOdoo}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    {loading ? '⏳ Bezig...' : '🔍 Match Producten met Odoo'}
                  </button>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && matchedProducts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mt-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  Stap 2: Prijs Vergelijking en Update ({matchedProducts.length} producten)
                </h2>
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  ← Terug naar Stap 1
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Instructies:</strong> Vergelijk de huidige prijzen uit Odoo met de SRP prijzen uit de Order Confirmation CSV. 
                  Pas indien nodig de nieuwe prijs aan en klik op "Update Prijzen in Odoo" om de wijzigingen op te slaan.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Reference
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Color
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        EAN13
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Huidige Prijs (Odoo)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        SRP Prijs (CSV)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Nieuwe Prijs
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {matchedProducts.map((product, index) => {
                      const priceDiff = product.srpPrice && product.currentPrice 
                        ? product.srpPrice - product.currentPrice 
                        : null;
                      const hasChange = product.newPrice !== null && product.newPrice !== product.currentPrice;

                      return (
                        <tr 
                          key={index} 
                          className={hasChange ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {product.odooVariantName || product.orderProduct.productName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {product.orderProduct.productReference}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {product.orderProduct.colorName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {product.orderProduct.sizeName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {product.orderProduct.ean13}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            <span className={`font-medium ${
                              priceDiff && priceDiff !== 0 
                                ? priceDiff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}>
                              {product.currentPrice !== null ? `€ ${product.currentPrice.toFixed(2)}` : 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            <span className={`font-medium ${
                              priceDiff && priceDiff !== 0 
                                ? 'text-blue-600 dark:text-blue-400' 
                                : 'text-gray-900 dark:text-gray-100'
                            }`}>
                              {product.srpPrice !== null ? `€ ${product.srpPrice.toFixed(2)}` : 'N/A'}
                            </span>
                            {priceDiff && priceDiff !== 0 && (
                              <span className={`ml-2 text-xs ${
                                priceDiff > 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                ({priceDiff > 0 ? '+' : ''}{priceDiff.toFixed(2)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-gray-500">€</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={product.newPrice !== null ? product.newPrice : ''}
                                onChange={(e) => updatePrice(index, e.target.value ? parseFloat(e.target.value) : null)}
                                className={`w-24 border rounded px-2 py-1 text-right text-sm ${
                                  hasChange 
                                    ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30' 
                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                                } text-gray-900 dark:text-gray-100`}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={updatePricesInOdoo}
                  disabled={loading || matchedProducts.filter(p => p.newPrice !== null && p.newPrice !== p.currentPrice).length === 0}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {loading ? '⏳ Bezig...' : `💾 Update Prijzen in Odoo (${matchedProducts.filter(p => p.newPrice !== null && p.newPrice !== p.currentPrice).length} wijzigingen)`}
                </button>
              </div>

              {updateResults.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h3 className="font-semibold mb-2">Update Resultaten:</h3>
                  <div className="text-sm">
                    <div className="text-green-600 dark:text-green-400">
                      ✅ Succesvol: {updateResults.filter(r => r.success).length}
                    </div>
                    <div className="text-red-600 dark:text-red-400">
                      ❌ Mislukt: {updateResults.filter(r => !r.success).length}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-900 dark:text-white">Bezig met verwerken...</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
