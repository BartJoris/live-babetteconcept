import { useEffect, useState, useCallback, memo } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import ProductAvailabilityDialog from '@/components/ProductAvailabilityDialog';
import DeliveryConfirmationDialog from '@/components/DeliveryConfirmationDialog';

type PendingOrderItem = {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  partner_id: [number, string] | false;
  partner_name: string;
  partner_email: string | null;
  partner_phone: string | null;
  partner_street: string | null;
  partner_city: string | null;
  partner_zip: string | null;
  partner_country: string | null;
  state: string;
  website_id: [number, string] | false;
  picking_state: string | null;
  order_line: Array<{
    product_id: [number, string];
    product_uom_qty: number;
    price_unit: number;
    price_total: number;
  }>;
};

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

const formatNumber = (num: number) =>
  num.toLocaleString('nl-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ImageModal component for enlarged image view
interface ImageModalProps {
  image: string;
  productName: string;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ image, productName, onClose }) => (
  <div 
    className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    onClick={onClose}
  >
    <div 
      className="relative bg-white rounded-lg shadow-2xl max-w-2xl max-h-96"
      onClick={(e) => e.stopPropagation()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src={`data:image/png;base64,${image}`} 
        alt={productName}
        className="max-w-full max-h-96 object-contain rounded-lg"
      />
      <div className="p-4 text-center">
        <p className="text-sm font-medium text-gray-700">{productName}</p>
      </div>
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-lg transition-colors"
      >
        ✕
      </button>
    </div>
  </div>
);

// Memoized OrderCard component for better performance
interface OrderCardProps {
  order: PendingOrderItem;
  isExpanded: boolean;
  isProcessing: boolean;
  onToggleExpand: () => void;
  onConfirm: (orderId: number) => Promise<void>;
  onDownloadInvoice: (orderId: number, orderName: string) => Promise<void>;
  onDownloadShippingLabel: (orderId: number, orderName: string) => Promise<void>;
  onConfirmDelivery: (orderId: number) => Promise<void>;
  productImages: Record<number, string | null>;
  onImageClick: (image: string, productName: string) => void;
}

const OrderCard = memo(({ 
  order, 
  isExpanded, 
  isProcessing, 
  onToggleExpand,
  onConfirm,
  onDownloadInvoice,
  onDownloadShippingLabel,
  onConfirmDelivery,
  productImages,
  onImageClick,
}: OrderCardProps) => (
  <div className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
    <div
      className="px-4 py-3 cursor-pointer flex justify-between items-center bg-white hover:bg-gray-50 transition-colors"
      onClick={onToggleExpand}
    >
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900 text-lg">{order.name}</span>
          <span className={`text-xs px-2 py-1 rounded font-medium ${
            order.state === 'draft' ? 'bg-yellow-100 text-yellow-800' : 
            order.state === 'sent' ? 'bg-blue-100 text-blue-800' :
            order.state === 'sale' && order.picking_state !== 'done' ? 'bg-orange-100 text-orange-800' :
            order.state === 'sale' && order.picking_state === 'done' ? 'bg-green-100 text-green-800' :
            order.state === 'done' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
          }`}>
            {order.state === 'draft' ? 'Te bevestigen' : 
             order.state === 'sent' ? 'Verzonden' :
             order.state === 'sale' && order.picking_state !== 'done' ? 'Levering te bevestigen' :
             order.state === 'sale' && order.picking_state === 'done' ? 'Gereed' :
             order.state === 'done' ? 'Voltooid' : order.state}
          </span>
          <span className="text-sm text-gray-600">
            {new Date(order.date_order).toLocaleDateString('nl-BE', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
        <div className="text-sm text-gray-700 mt-1">
          👤 {order.partner_name} • {order.order_line.length} {order.order_line.length === 1 ? 'product' : 'producten'}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold text-green-600">
          {formatEuro(order.amount_total)}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
    
    {isExpanded && (
      <div className="px-4 py-4 bg-gray-50 border-t border-gray-200">
        {/* Customer and Address */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">👤 Klantgegevens</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Naam:</strong> {order.partner_name}</p>
              {order.partner_email && <p><strong>Email:</strong> {order.partner_email}</p>}
              {order.partner_phone && <p><strong>Telefoon:</strong> {order.partner_phone}</p>}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">📍 Verzendadres</h4>
            <div className="text-sm text-gray-600 space-y-1">
              {order.partner_street && <p>{order.partner_street}</p>}
              {(order.partner_zip || order.partner_city) && (
                <p>{order.partner_zip} {order.partner_city}</p>
              )}
              {order.partner_country && <p>{order.partner_country}</p>}
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="mb-4 bg-white p-4 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">📦 Producten</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-gray-300 bg-gray-50">
                <tr className="text-left text-gray-700">
                  <th className="py-2 px-3 font-semibold">Afbeelding</th>
                  <th className="py-2 px-3 font-semibold">Product</th>
                  <th className="py-2 px-3 text-right font-semibold">Aantal</th>
                  <th className="py-2 px-3 text-right font-semibold">Prijs</th>
                  <th className="py-2 px-3 text-right font-semibold">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {order.order_line.map((line, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-2 px-3">
                       {line.product_id && typeof line.product_id !== 'boolean' && productImages[line.product_id[0]] ? (
                         // eslint-disable-next-line @next/next/no-img-element
                         <img 
                           src={`data:image/png;base64,${productImages[line.product_id[0]]}`} 
                           alt={line.product_id[1]}
                           className="h-12 w-12 object-cover rounded-lg shadow-sm cursor-pointer hover:shadow-md hover:scale-110 transition-all"
                           onClick={() => {
                             const img = productImages[line.product_id[0]];
                             const name = line.product_id[1];
                             if (img && name) {
                               onImageClick(img, name);
                             }
                           }}
                         />
                       ) : (
                         <div className="h-12 w-12 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                           <span className="text-sm">📦</span>
                         </div>
                       )}
                      </td>
                    <td className="py-2 px-3 text-gray-900">
                      {line.product_id && typeof line.product_id !== 'boolean' ? line.product_id[1] : 'Product'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {formatNumber(line.product_uom_qty)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-700">
                      {formatEuro(line.price_unit)}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-900 font-semibold">
                      {formatEuro(line.price_total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-green-50 font-bold">
                  <td colSpan={3} className="py-2 px-3 text-right text-gray-900">
                    Totaal:
                  </td>
                  <td className="py-2 px-3 text-right text-green-700 text-lg">
                    {formatEuro(order.amount_total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 bg-white p-4 rounded-lg">
          {(order.state === 'draft' || order.state === 'sent') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirm(order.id);
              }}
              disabled={isProcessing}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
            >
              ✅ Bevestig Order
            </button>
          )}

          {order.state === 'sale' && order.picking_state && order.picking_state !== 'done' && order.picking_state !== 'cancel' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirmDelivery(order.id);
              }}
              disabled={isProcessing}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
            >
              📦 Bevestig Levering
            </button>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownloadInvoice(order.id, order.name);
            }}
            disabled={isProcessing}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
          >
            📄 Download Factuur
          </button>

          {order.picking_state === 'done' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadShippingLabel(order.id, order.name);
              }}
              disabled={isProcessing}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
            >
              📦 Download Verzendlabel
            </button>
          )}
        </div>
      </div>
    )}
  </div>
));

OrderCard.displayName = 'OrderCard';

export default function WebshopordersBeheren() {
  const { isLoggedIn } = useAuth();
  const [pendingOrders, setPendingOrders] = useState<PendingOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [processingOrders, setProcessingOrders] = useState<Record<number, boolean>>({});
  const [displayedOrderCount, setDisplayedOrderCount] = useState(3);
  const [productImages, setProductImages] = useState<Record<number, Record<number, string | null>>>({});
  const [selectedImage, setSelectedImage] = useState<{ image: string; productName: string } | null>(null);
  
  // New state for availability dialog
  const [availabilityDialog, setAvailabilityDialog] = useState<{
    isOpen: boolean;
    orderId: number | null;
    orderName: string;
    isLoading: boolean;
    products: any[];
    allAvailable: boolean;
    error?: string;
  }>({
    isOpen: false,
    orderId: null,
    orderName: '',
    isLoading: false,
    products: [],
    allAvailable: false,
  });
  const [pendingOrderConfirmation, setPendingOrderConfirmation] = useState<number | null>(null);

  // New state for delivery confirmation dialog
  const [deliveryDialog, setDeliveryDialog] = useState<{
    isOpen: boolean;
    orderId: number | null;
    orderName: string;
    isLoading: boolean;
    pickings: any[];
    error?: string;
  }>({
    isOpen: false,
    orderId: null,
    orderName: '',
    isLoading: false,
    pickings: [],
  });
  const [pendingDeliveryConfirmation, setPendingDeliveryConfirmation] = useState<number | null>(null);

  const fetchPendingOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pending-orders');
      const json = await res.json();
      if (json.orders) {
        setPendingOrders(json.orders);
        setDisplayedOrderCount(3);
      }
    } catch (err) {
      console.error('Error fetching pending orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchPendingOrders();
    }
  }, [isLoggedIn, fetchPendingOrders]);

  const handleConfirmOrder = async (orderId: number) => {
    // First, check product availability
    const orderToConfirm = pendingOrders.find(o => o.id === orderId);
    if (!orderToConfirm) return;

    setAvailabilityDialog(prev => ({
      ...prev,
      isOpen: true,
      orderId,
      orderName: orderToConfirm.name,
      isLoading: true,
      products: [],
      allAvailable: false,
    }));

    try {
      const res = await fetch('/api/check-product-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setAvailabilityDialog(prev => ({
          ...prev,
          isLoading: false,
          products: json.products || [],
          allAvailable: json.allAvailable || false,
        }));
        setPendingOrderConfirmation(orderId);
      } else {
        setAvailabilityDialog(prev => ({
          ...prev,
          isLoading: false,
          error: json.error || 'Kon beschikbaarheid niet controleren',
        }));
      }
    } catch (err) {
      console.error('Error checking availability:', err);
      setAvailabilityDialog(prev => ({
        ...prev,
        isLoading: false,
        error: 'Fout bij controleren beschikbaarheid',
      }));
    }
  };

  const handleConfirmOrderAfterAvailabilityCheck = async () => {
    if (!pendingOrderConfirmation) return;

    setProcessingOrders(prev => ({ ...prev, [pendingOrderConfirmation]: true }));
    setAvailabilityDialog(prev => ({ ...prev, isOpen: false }));

    try {
      const res = await fetch('/api/confirm-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: pendingOrderConfirmation }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Order bevestigd! ✅');
        await fetchPendingOrders();
      } else {
        alert(`Error: ${json.error || 'Failed to confirm order'}`);
      }
    } catch (err) {
      console.error('Error confirming order:', err);
      alert('Failed to confirm order');
    } finally {
      setProcessingOrders(prev => ({ ...prev, [pendingOrderConfirmation]: false }));
      setPendingOrderConfirmation(null);
    }
  };

  const handleCancelAvailabilityDialog = () => {
    setAvailabilityDialog(prev => ({
      ...prev,
      isOpen: false,
      orderId: null,
      orderName: '',
      isLoading: false,
      products: [],
      allAvailable: false,
      error: undefined,
    }));
    setPendingOrderConfirmation(null);
  };

  const handleDownloadInvoice = async (orderId: number, orderName: string) => {
    setProcessingOrders(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch('/api/download-order-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Order_${orderName}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const json = await res.json();
        alert(`Factuur: ${json.error || 'Kon niet downloaden'}`);
      }
    } catch (err) {
      console.error('Error downloading invoice:', err);
      alert('Fout bij downloaden van factuur');
    } finally {
      setProcessingOrders(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleDownloadShippingLabel = async (orderId: number, orderName: string) => {
    setProcessingOrders(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch('/api/download-shipping-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ShippingLabel_${orderName}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const json = await res.json();
        let errorMsg = json.error || 'Kon niet downloaden';
        if (json.availableAttachments && json.availableAttachments.length > 0) {
          errorMsg += '\n\nGevonden bestanden:\n' + json.availableAttachments.join('\n');
        }
        alert(`Verzendlabel: ${errorMsg}`);
      }
    } catch (err) {
      console.error('Error downloading shipping label:', err);
      alert('Fout bij downloaden van verzendlabel');
    } finally {
      setProcessingOrders(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleConfirmDelivery = async (orderId: number) => {
    console.log('🚚 handleConfirmDelivery called with orderId:', orderId);
    const orderToConfirm = pendingOrders.find(o => o.id === orderId);
    if (!orderToConfirm) return;

    setDeliveryDialog(prev => ({
      ...prev,
      isOpen: true,
      orderId,
      orderName: orderToConfirm.name,
      isLoading: true,
      pickings: [],
    }));

    try {
      console.log('📤 Fetching picking details from /api/get-picking-details');
      const res = await fetch('/api/get-picking-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const json = await res.json();
      console.log('📥 Response:', json);

      if (res.ok && json.success) {
        setDeliveryDialog(prev => ({
          ...prev,
          isLoading: false,
          pickings: json.pickings || [],
        }));
        setPendingDeliveryConfirmation(orderId);
      } else {
        setDeliveryDialog(prev => ({
          ...prev,
          isLoading: false,
          error: json.error || 'Kon leveringsgegevens niet ophalen',
        }));
      }
    } catch (err) {
      console.error('❌ Error fetching picking details:', err);
      setDeliveryDialog(prev => ({
        ...prev,
        isLoading: false,
        error: 'Fout bij ophalen leveringsgegevens',
      }));
    }
  };

  const handleConfirmDeliveryFromDialog = async () => {
    if (!pendingDeliveryConfirmation) return;

    setDeliveryDialog(prev => ({ ...prev, isLoading: true }));
    setProcessingOrders(prev => ({ ...prev, [pendingDeliveryConfirmation]: true }));

    try {
      console.log('📤 Confirming delivery with /api/confirm-delivery');
      const res = await fetch('/api/confirm-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: pendingDeliveryConfirmation }),
      });

      const json = await res.json();
      console.log('📥 Confirm Response:', json);

      if (res.ok && json.success) {
        console.log('✅ Delivery confirmed successfully');
        alert('Levering bevestigd! ✅\n\nVerzonden naar Sendcloud - verzendlabel wordt aangemaakt.');
        setDeliveryDialog(prev => ({
          ...prev,
          isOpen: false,
          orderId: null,
          orderName: '',
          isLoading: false,
          pickings: [],
        }));
        setPendingDeliveryConfirmation(null);
        await fetchPendingOrders();
      } else {
        console.log('❌ API returned error:', json.error);
        const errorMsg = json.error || 'Kon levering niet bevestigen';
        const details = json.details ? '\n' + json.details.join('\n') : '';
        setDeliveryDialog(prev => ({
          ...prev,
          isLoading: false,
          error: `${errorMsg}${details}`,
        }));
      }
    } catch (err) {
      console.error('❌ Error confirming delivery:', err);
      setDeliveryDialog(prev => ({
        ...prev,
        isLoading: false,
        error: 'Fout bij bevestigen levering',
      }));
    } finally {
      setProcessingOrders(prev => ({ ...prev, [pendingDeliveryConfirmation]: false }));
    }
  };

  const handleCancelDeliveryDialog = () => {
    setDeliveryDialog(prev => ({
      ...prev,
      isOpen: false,
      orderId: null,
      orderName: '',
      isLoading: false,
      pickings: [],
      error: undefined,
    }));
    setPendingDeliveryConfirmation(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 font-sans">
      
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  📦 Webshoporders Beheren
                </h1>
                <p className="text-gray-600 mt-2">
                  Bevestig orders en download documenten
                </p>
              </div>
              <button
                onClick={fetchPendingOrders}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow disabled:opacity-50"
              >
                {loading ? '⏳ Laden...' : '🔄 Vernieuwen'}
              </button>
            </div>
          </div>

          {/* Orders Section */}
          <div className="bg-white shadow-xl rounded-2xl p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Recente E-commerce Orders ({pendingOrders.length})
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Toont {Math.min(displayedOrderCount, pendingOrders.length)} van {pendingOrders.length} orders
            </p>
            
            {loading ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-600">⏳ Orders laden...</p>
              </div>
            ) : pendingOrders.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-600">✅ Geen recente e-commerce orders gevonden</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {pendingOrders.slice(0, displayedOrderCount).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      isExpanded={expandedOrders[order.id]}
                      isProcessing={processingOrders[order.id]}
                      onToggleExpand={async () => {
                        const newExpandedState = !expandedOrders[order.id];
                        setExpandedOrders(prev => ({
                          ...prev,
                          [order.id]: newExpandedState
                        }));
                        
                        // Fetch images when expanding
                        if (newExpandedState && !productImages[order.id]) {
                          try {
                            const productIds = order.order_line.map(line => line.product_id[0]);
                            const res = await fetch('/api/product-images', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ productIds }),
                            });
                            const json = await res.json();
                            if (json.images) {
                              setProductImages(prev => ({
                                ...prev,
                                [order.id]: json.images
                              }));
                            }
                          } catch (err) {
                            console.error('Error fetching images:', err);
                          }
                        }
                      }}
                      onConfirm={handleConfirmOrder}
                      onDownloadInvoice={handleDownloadInvoice}
                      onDownloadShippingLabel={handleDownloadShippingLabel}
                      onConfirmDelivery={handleConfirmDelivery}
                      productImages={productImages[order.id] || {}}
                      onImageClick={(image, name) => setSelectedImage({ image, productName: name })}
                    />
                  ))}
                </div>
                
                {/* Load More Button */}
                {displayedOrderCount < pendingOrders.length && (
                  <div className="text-center mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setDisplayedOrderCount(prev => Math.min(prev + 5, pendingOrders.length))}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
                    >
                      📥 Laad meer ({Math.min(5, pendingOrders.length - displayedOrderCount)} orders)
                    </button>
                  </div>
                )}
                
                {/* Show Less Button */}
                {pendingOrders.length > 3 && displayedOrderCount >= pendingOrders.length && (
                  <div className="text-center mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setDisplayedOrderCount(3)}
                      className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all"
                    >
                      ⬆️ Toon minder
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {selectedImage && (
        <ImageModal
          image={selectedImage.image}
          productName={selectedImage.productName}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {availabilityDialog.isOpen && (
        <ProductAvailabilityDialog
          isOpen={availabilityDialog.isOpen}
          orderName={availabilityDialog.orderName}
          products={availabilityDialog.products}
          allAvailable={availabilityDialog.allAvailable}
          isLoading={availabilityDialog.isLoading}
          error={availabilityDialog.error}
          onCancel={handleCancelAvailabilityDialog}
          onConfirm={handleConfirmOrderAfterAvailabilityCheck}
        />
      )}

      {deliveryDialog.isOpen && (
        <DeliveryConfirmationDialog
          isOpen={deliveryDialog.isOpen}
          orderName={deliveryDialog.orderName}
          pickings={deliveryDialog.pickings}
          isLoading={deliveryDialog.isLoading}
          error={deliveryDialog.error}
          onCancel={handleCancelDeliveryDialog}
          onConfirm={handleConfirmDeliveryFromDialog}
        />
      )}
    </div>
  );
}

