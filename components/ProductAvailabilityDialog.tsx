
interface Product {
  id: number;
  name: string;
  product_id: [number, string];
  product_uom_qty: number;
  qty_available: number;
  isAvailable: boolean;
  shortage: number;
}

interface ProductAvailabilityDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  orderName: string;
  products: Product[];
  allAvailable: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ProductAvailabilityDialog: React.FC<ProductAvailabilityDialogProps> = ({
  isOpen,
  isLoading,
  orderName,
  products,
  allAvailable,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 sticky top-0 shadow-md">
          <h2 className="text-xl font-bold text-white">📦 Controleer Productbeschikbaarheid</h2>
          <p className="text-blue-100 text-sm mt-1">Order {orderName}</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
              <p className="text-gray-600 mt-4">Controleren beschikbaarheid...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <h3 className="text-red-800 font-semibold">❌ Fout</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Geen producten in deze order</p>
            </div>
          ) : (
            <>
              {/* Status Summary */}
              <div className={`mb-6 p-4 rounded-lg border-2 ${
                allAvailable 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-yellow-50 border-yellow-300'
              }`}>
                <p className={`font-semibold text-lg ${
                  allAvailable ? 'text-green-800' : 'text-yellow-800'
                }`}>
                  {allAvailable 
                    ? '✅ Alle producten zijn beschikbaar' 
                    : '⚠️ Sommige producten hebben onvoldoende voorraad'}
                </p>
              </div>

              {/* Products Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-semibold text-gray-700">Product</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-right">Benodigd</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-right">Voorraad</th>
                      <th className="px-4 py-3 font-semibold text-gray-700 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product, idx) => (
                      <tr 
                        key={product.id}
                        className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      >
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {product.name}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {product.product_uom_qty.toLocaleString('nl-BE')}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {product.qty_available.toLocaleString('nl-BE')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {product.isAvailable ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                              ✅ OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
                              ❌ Te weinig (-{product.shortage.toLocaleString('nl-BE')})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Warning Message if Not All Available */}
              {!allAvailable && (
                <div className="mt-6 bg-orange-50 border-l-4 border-orange-500 p-4">
                  <h3 className="text-orange-800 font-semibold mb-2">⚠️ Let op</h3>
                  <p className="text-orange-700 text-sm">
                    Sommige producten hebben onvoldoende voorraad. U kunt nog steeds de order bevestigen,
                    maar de verzending zal vertraagd kunnen worden totdat alle producten beschikbaar zijn.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex gap-3 justify-end sticky bottom-0">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✕ Annuleren
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || (error !== undefined && error !== '')}
            className={`px-6 py-2 rounded-lg font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              allAvailable || products.length === 0
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {allAvailable || products.length === 0
              ? '✅ Bevestig Order'
              : '⚠️ Bevestig Toch'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductAvailabilityDialog;
