import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * Tiny Big Sister supplier - auto-generated configuration.
 * Gegenereerd via "Slim uploaden" onboarding. Review de TODO's voordat je merget.
 */
export default createCSVSupplier({
  id: 'tinybigsister',
  displayName: 'Tiny Big Sister',
  brandName: 'Tiny Big Sister',
  csv: {
    delimiter: ';',
    columns: {
      name: 'Brand name',
      category: 'Category',
      reference: 'Product reference',
      color: 'Color name',
      material: 'Composition',
      size: 'Size name',
      ean: 'EAN13',
      quantity: 'Quantity',
      price: { column: 'Unit price', format: 'european' },
    },
  },
  nameTemplate: '{brandName} - {productName} - {colorName}',
  nameCasing: {"name":"sentence","color":"sentence"},
  sizeFormat: 'eu',
  groupBy: 'reference',
  rrpMultiplier: 1.2,
});
