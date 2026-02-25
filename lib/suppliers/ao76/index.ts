import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * Ao76 supplier - declarative CSV configuration.
 * Semicolon-separated CSV with standard column headers.
 */
export default createCSVSupplier({
  id: 'ao76',
  displayName: 'Ao76',
  brandName: 'Ao76',
  csv: {
    delimiter: ';',
    columns: {
      reference: 'Reference',
      name: 'Description',
      material: 'Quality',
      color: 'Colour',
      size: 'Size',
      quantity: 'Quantity',
      ean: 'EAN barcode',
      price: { column: 'Price', format: 'european' },
      rrp: { column: 'RRP', format: 'european' },
    },
  },
  nameTemplate: '{brand} - {name}',
  nameCasing: { name: 'title' },
  sizeFormat: 'raw',
});
