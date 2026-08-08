import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * ZZZ Test Homelab (DUMMY) supplier - auto-generated configuration.
 * Gegenereerd via "Slim uploaden" onboarding. Review de TODO's voordat je merget.
 */
export default createCSVSupplier({
  id: 'zzztesthomelab',
  displayName: 'ZZZ Test Homelab (DUMMY)',
  brandName: 'ZZZ Test Homelab',
  csv: {
    delimiter: ';',
    columns: {
      reference: 'Reference',
      name: 'Name',
      color: 'Color',
      size: 'Size',
      quantity: 'Quantity',
      ean: 'EAN',
      price: { column: 'Price', format: 'european' },
    },
  },
  nameTemplate: '{brand} {name}',
  sizeFormat: 'raw',
  groupBy: 'reference',
  imageUpload: {
    enabled: true,
    instructions: 'TODO: leg uit hoe je de afbeeldingen van deze leverancier moet aanleveren (map of losse bestanden).',
    exampleFilenames: ['TEST001-1.jpg', 'TEST001-2.jpg', 'TEST002-1.jpg'],
    filenameFilter: /\.(jpg|jpeg|png|webp)$/i,
    // TODO(agent): implementeer op basis van samples/image-filenames.txt + de sample-productreferenties.
    // Zie lib/suppliers/tangerine/index.ts of lib/suppliers/jellymallow/index.ts voor voorbeelden.
    extractReference: (_filename: string, _relativePath?: string) => null,
  },
});
