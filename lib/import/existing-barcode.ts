/**
 * Decide whether an import row should create a new product or update an
 * existing one when some/all EANs already exist in Odoo.
 */

export type ExistingBarcodeHit = {
  barcode: string;
  productId: number;
  templateId: number;
  name: string;
  qtyAvailable: number;
};

export type ExistingBarcodePlan =
  | { action: 'create' }
  | {
      action: 'update';
      templateId: number;
      /** barcode → Odoo product.product id */
      productIdsByBarcode: Map<string, number>;
      existingName: string;
    }
  | {
      action: 'conflict';
      message: string;
      hits: ExistingBarcodeHit[];
    };

export function planExistingBarcodeImport(
  variantEans: string[],
  foundByBarcode: Map<string, ExistingBarcodeHit>,
): ExistingBarcodePlan {
  const eans = [
    ...new Set(
      variantEans.map((e) => e?.trim()).filter((e): e is string => Boolean(e)),
    ),
  ];

  if (eans.length === 0) return { action: 'create' };

  const hits = eans
    .map((ean) => foundByBarcode.get(ean))
    .filter((h): h is ExistingBarcodeHit => Boolean(h));

  if (hits.length === 0) return { action: 'create' };

  if (hits.length < eans.length) {
    const missing = eans.filter((e) => !foundByBarcode.has(e));
    return {
      action: 'conflict',
      message:
        `Barcode(s) deels al in Odoo (${hits.map((h) => h.barcode).join(', ')} → ` +
        `${hits[0].name}), maar nog niet: ${missing.join(', ')}. ` +
        `Importeer niet opnieuw — werk het bestaande product bij of pas de barcodes aan.`,
      hits,
    };
  }

  const templateIds = [...new Set(hits.map((h) => h.templateId))];
  if (templateIds.length > 1) {
    return {
      action: 'conflict',
      message:
        `Barcodes horen bij meerdere bestaande producten in Odoo: ` +
        hits.map((h) => `${h.barcode}→${h.name}`).join('; ') +
        `. Los dit eerst op via Barcode Duplicaten.`,
      hits,
    };
  }

  const productIdsByBarcode = new Map(
    hits.map((h) => [h.barcode, h.productId] as const),
  );

  return {
    action: 'update',
    templateId: templateIds[0],
    productIdsByBarcode,
    existingName: hits[0].name,
  };
}

/** Detect Odoo unique-constraint errors on barcode. */
export function isBarcodeAlreadyExistsError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes('barcode') && msg.includes('already exists');
}
