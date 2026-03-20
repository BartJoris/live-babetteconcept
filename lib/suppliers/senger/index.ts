import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * Senger-Naturwelt supplier plugin.
 * Parses Faire order export CSVs (Dutch headers, semicolon-separated).
 * Each row is a single product — no size grouping needed.
 */
export default createCSVSupplier({
  id: 'senger',
  displayName: 'Senger-Naturwelt',
  brandName: 'Senger-Naturwelt',
  csv: {
    delimiter: ';',
    columns: {
      reference: 'SKU',
      name: 'Productnaam',
      ean: 'GTIN',
      sku: 'SKU',
      quantity: 'Hoeveelheid',
      price: { column: 'Wholesaleprijs', format: 'european' },
      rrp: { column: 'Verkoopprijs', format: 'european' },
    },
  },
  nameTemplate: '{brand} - {name}',
  sizeFormat: 'raw',
});
