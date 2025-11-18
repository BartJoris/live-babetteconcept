import React from 'react';

interface MoveLine {
  id: number;
  product_id: [number, string];
  product_name: string;
  product_uom_qty: number;
  qty_done: number;
  quantity_done: number;
  reserved_availability: number;
}

interface Picking {
  id: number;
  name: string;
  state: string;
  picking_type_id: [number, string];
  move_lines: MoveLine[];
}

interface DeliveryConfirmationDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  orderName: string;
  pickings: Picking[];
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeliveryConfirmationDialog: React.FC<DeliveryConfirmationDialogProps> = ({
  isOpen,
  isLoading,
  orderName,
  pickings,
  error,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const totalPickings = pickings.length;
  const totalLines = pickings.reduce((sum, p) => sum + p.move_lines.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4 sticky top-0 shadow-md">
          <h2 className="text-xl font-bold text-white">✅ Bevestig Levering</h2>
          <p className="text-teal-100 text-sm mt-1">Order {orderName}</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
              </div>
              <p className="text-gray-600 mt-4">Leveringsgegevens laden...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <h3 className="text-red-800 font-semibold">❌ Fout</h3>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          ) : pickings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Geen leveringsorders gevonden</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-6 p-4 rounded-lg bg-teal-50 border-2 border-teal-300">
                <p className="text-teal-800 font-semibold">
                  📦 {totalPickings} leveringsorder{totalPickings !== 1 ? 's' : ''} 
                  {totalLines > 0 && ` met ${totalLines} product${totalLines !== 1 ? 'en' : ''}`}
                </p>
              </div>

              {/* Pickings List */}
              <div className="space-y-6">
                {pickings.map((picking) => (
                  <div key={picking.id} className="border border-gray-300 rounded-lg p-4">
                    {/* Picking Header */}
                    <div className="mb-4 pb-3 border-b border-gray-200">
                      <h3 className="font-bold text-gray-900 text-lg">{picking.name}</h3>
                      <p className="text-sm text-gray-600 mt-2">
                        Status: <span className="font-semibold inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded">{picking.state}</span>
                      </p>
                    </div>

                    {/* Move Lines Table or Message */}
                    {picking.move_lines.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-yellow-800 text-sm">
                        <p>📦 Productdetails laden...</p>
                        <p className="mt-2 text-xs text-gray-600">U kunt deze levering nu bevestigen. De producten zullen verwerkt worden.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 border-b border-gray-300">
                            <tr className="text-left">
                              <th className="px-3 py-2 font-semibold text-gray-700">Product</th>
                              <th className="px-3 py-2 font-semibold text-gray-700 text-right">Benodigd</th>
                              <th className="px-3 py-2 font-semibold text-gray-700 text-right">Gereserveerd</th>
                              <th className="px-3 py-2 font-semibold text-gray-700 text-right">Klaar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {picking.move_lines.map((line, idx) => (
                              <tr 
                                key={line.id}
                                className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                              >
                                <td className="px-3 py-3 text-gray-900 font-medium">
                                  {line.product_name}
                                </td>
                                <td className="px-3 py-3 text-right text-gray-700">
                                  {line.product_uom_qty.toLocaleString('nl-BE')}
                                </td>
                                <td className="px-3 py-3 text-right text-gray-700">
                                  {line.reserved_availability.toLocaleString('nl-BE')}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                                    line.qty_done >= line.product_uom_qty || line.quantity_done >= line.product_uom_qty
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {(line.qty_done || line.quantity_done).toLocaleString('nl-BE')}
                                  </span>
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

              {/* Info Box */}
              <div className="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4">
                <h3 className="text-blue-800 font-semibold mb-2">ℹ️ Informatief</h3>
                <p className="text-blue-700 text-sm">
                  Het bevestigen van deze levering zal de status naar &quot;Done&quot; (Voltooid) veranderen in Odoo.
                  Sendcloud zal het verzendlabel aanmaken.
                </p>
              </div>
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
            disabled={isLoading || (error !== undefined && error !== '') || pickings.length === 0}
            className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ✅ Bevestig Levering
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeliveryConfirmationDialog;
