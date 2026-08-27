import { describe, expect, it } from 'vitest';
import {
  groupVariantsByTemplate,
  isMissingWeight,
  type MissingWeightVariant,
} from '@/lib/retail/missingWeight';

describe('isMissingWeight', () => {
  it('treats 0, null and undefined as missing', () => {
    expect(isMissingWeight(0)).toBe(true);
    expect(isMissingWeight(null)).toBe(true);
    expect(isMissingWeight(undefined)).toBe(true);
  });

  it('treats a positive weight as present', () => {
    expect(isMissingWeight(0.2)).toBe(false);
  });
});

describe('groupVariantsByTemplate', () => {
  const variant = (
    overrides: Partial<MissingWeightVariant> & { id: number }
  ): MissingWeightVariant => ({
    name: 'Variant',
    display_name: 'Variant',
    weight: 0,
    barcode: null,
    default_code: null,
    qty_available: 0,
    list_price: 0,
    ...overrides,
  });

  it('groups size variants of the same template into one product', () => {
    const groups = groupVariantsByTemplate([
      variant({
        id: 11,
        product_tmpl_id: [1, 'Rode trui'],
        qty_available: 2,
        list_price: 40,
        default_code: 'TRUI-S',
      }),
      variant({
        id: 12,
        product_tmpl_id: [1, 'Rode trui'],
        qty_available: 1,
        list_price: 40,
        default_code: 'TRUI-M',
      }),
      variant({
        id: 21,
        product_tmpl_id: [2, 'Blauwe broek'],
        qty_available: 4,
        list_price: 55,
        barcode: '123',
      }),
    ]);

    expect(groups).toEqual([
      {
        templateId: 1,
        name: 'Rode trui',
        variantIds: [11, 12],
        variantCount: 2,
        barcode: null,
        defaultCode: 'TRUI-S',
        qtyAvailable: 3,
        listPrice: 40,
      },
      {
        templateId: 2,
        name: 'Blauwe broek',
        variantIds: [21],
        variantCount: 1,
        barcode: '123',
        defaultCode: null,
        qtyAvailable: 4,
        listPrice: 55,
      },
    ]);
  });
});
