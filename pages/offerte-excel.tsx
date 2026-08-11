import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import { downloadRowsAsXlsx } from '@/lib/excelIo';

type ExportLine = {
  brand: string;
  productName: string;
  barcode: string;
  defaultCode: string;
  quantity: number;
  uom: string;
  priceUnit: number;
  discount: number;
  subtotal: number;
};

type OrderMeta = {
  id: number;
  name: string;
  partner: string;
  state: string;
  amountUntaxed: number;
  amountTotal: number;
};

export default function OfferteExcelPage() {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();
  const [ref, setRef] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderMeta | null>(null);
  const [lineCount, setLineCount] = useState<number | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.ref ?? router.query.id;
    if (typeof q === 'string' && q.trim()) setRef(q.trim());
  }, [router.isReady, router.query.ref, router.query.id]);

  const exportExcel = async () => {
    setError(null);
    setOrder(null);
    setLineCount(null);
    if (!ref.trim()) {
      setError('Vul een offerte-URL, id of nummer in.');
      return;
    }

    setIsWorking(true);
    try {
      const res = await fetch('/api/odoo/quotation-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Export mislukt.');
        return;
      }

      const lines = data.lines as ExportLine[];
      const meta = data.order as OrderMeta;
      setOrder(meta);
      setLineCount(lines.length);

      const exportRows = lines.map((l) => ({
        Merk: l.brand,
        Product: l.productName,
        Barcode: l.barcode,
        Hoeveelheid: l.quantity,
        Maateenheid: l.uom,
        'Prijs (€)': l.priceUnit,
        'Korting (%)': l.discount,
        'Bedrag (€)': l.subtotal,
      }));

      const safeName = meta.name.replace(/[^\w.-]+/g, '_');
      await downloadRowsAsXlsx(
        exportRows,
        'Offerte',
        `offerte-${safeName}.xlsx`,
      );
    } catch {
      setError('Export mislukt.');
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Head><title>Offerte naar Excel</title></Head>
        <main style={{ padding: 16 }}>Laden...</main>
      </>
    );
  }

  if (!isLoggedIn) return null;

  return (
    <>
      <Head><title>Offerte naar Excel</title></Head>
      <main style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Offerte naar Excel
        </h1>
        <p style={{ marginBottom: 16, color: '#6b7280' }}>
          Exporteer een Odoo-offerte naar Excel, gesorteerd op merk en daarna alfabetisch op productnaam.
        </p>

        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          Offerte (URL, id of nummer)
        </label>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="https://www.babetteconcept.be/odoo/sales/3167 of S03167"
          style={{
            width: '100%',
            padding: 10,
            border: '1px solid #ccc',
            borderRadius: 4,
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void exportExcel();
          }}
        />

        <button
          type="button"
          onClick={() => void exportExcel()}
          disabled={isWorking}
          style={{
            padding: '10px 16px',
            borderRadius: 4,
            border: '1px solid #1d4ed8',
            background: isWorking ? '#93c5fd' : '#2563eb',
            color: '#fff',
            fontWeight: 600,
            cursor: isWorking ? 'wait' : 'pointer',
          }}
        >
          {isWorking ? 'Bezig…' : 'Excel downloaden'}
        </button>

        {error && (
          <div
            style={{
              marginTop: 16,
              background: '#fef2f2',
              color: '#991b1b',
              padding: 10,
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}

        {order && lineCount != null && !error && (
          <div
            style={{
              marginTop: 16,
              background: '#ecfdf5',
              color: '#065f46',
              padding: 10,
              borderRadius: 4,
            }}
          >
            {order.name} — {order.partner || 'zonder klant'} — {lineCount} producten
            (totaal €{order.amountTotal.toFixed(2).replace('.', ',')})
          </div>
        )}
      </main>
    </>
  );
}
