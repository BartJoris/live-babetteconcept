import { createCSVSupplier } from '@/lib/suppliers/create-csv-supplier';

/**
 * Inuwet supplier plugin.
 *
 * Webshop catalog CSV (; delimited, quoted multiline descriptions):
 *   EAN;Artikelcode;Productnaam;Merk;Prijs factuur HT (€);
 *   Verkoopprijs notitie;Advies/verkoopprijs TTC (€);Bron prijs TTC;
 *   Webshoptekst;Bron research
 *
 * Each row is one beauty product (no sizes). Quantity is omitted — this is a
 * catalog, not an order — so stock is not created until the user fills it in.
 */
export default createCSVSupplier({
  id: 'inuwet',
  displayName: 'Inuwet',
  brandName: 'Inuwet',
  csv: {
    delimiter: ';',
    columns: {
      reference: 'Artikelcode',
      name: 'Productnaam',
      description: 'Webshoptekst',
      ean: 'EAN',
      sku: 'Artikelcode',
      size: { column: 'Artikelcode', transform: () => 'U' },
      price: { column: 'Prijs factuur HT (€)', format: 'european' },
      rrp: { column: 'Advies/verkoopprijs TTC (€)', format: 'european' },
    },
  },
  nameTemplate: '{brand} - {name}',
  sizeFormat: 'raw',
});
