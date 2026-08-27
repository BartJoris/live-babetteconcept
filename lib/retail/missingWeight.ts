export type MissingWeightVariant = {
  id: number;
  name: string;
  display_name: string;
  product_tmpl_id?: [number, string];
  weight: number | null;
  barcode: string | null;
  default_code: string | null;
  qty_available?: number;
  list_price: number;
};

export type MissingWeightProductGroup = {
  templateId: number;
  name: string;
  variantIds: number[];
  variantCount: number;
  barcode: string | null;
  defaultCode: string | null;
  qtyAvailable: number;
  listPrice: number;
};

export function isMissingWeight(weight: number | null | undefined): boolean {
  return !weight || weight === 0;
}

export function groupVariantsByTemplate(
  variants: MissingWeightVariant[]
): MissingWeightProductGroup[] {
  const groups = new Map<number, MissingWeightProductGroup>();

  for (const variant of variants) {
    const templateId = Array.isArray(variant.product_tmpl_id)
      ? variant.product_tmpl_id[0]
      : variant.id;
    const name = Array.isArray(variant.product_tmpl_id)
      ? variant.product_tmpl_id[1]
      : variant.display_name || variant.name;
    const existing = groups.get(templateId);

    if (existing) {
      existing.variantIds.push(variant.id);
      existing.variantCount += 1;
      existing.qtyAvailable += variant.qty_available ?? 0;
      continue;
    }

    groups.set(templateId, {
      templateId,
      name,
      variantIds: [variant.id],
      variantCount: 1,
      barcode: variant.barcode,
      defaultCode: variant.default_code,
      qtyAvailable: variant.qty_available ?? 0,
      listPrice: variant.list_price,
    });
  }

  return Array.from(groups.values());
}
