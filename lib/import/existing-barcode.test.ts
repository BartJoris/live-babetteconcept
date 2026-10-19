import { describe, expect, it } from 'vitest';
import {
  isBarcodeAlreadyExistsError,
  planExistingBarcodeImport,
  type ExistingBarcodeHit,
} from './existing-barcode';

function hit(
  barcode: string,
  opts: Partial<ExistingBarcodeHit> = {},
): ExistingBarcodeHit {
  return {
    barcode,
    productId: opts.productId ?? 1,
    templateId: opts.templateId ?? 10,
    name: opts.name ?? `Product ${barcode}`,
    qtyAvailable: opts.qtyAvailable ?? 0,
  };
}

describe('planExistingBarcodeImport', () => {
  it('creates when no barcodes exist yet', () => {
    expect(planExistingBarcodeImport(['9781474993210'], new Map())).toEqual({
      action: 'create',
    });
  });

  it('updates when all barcodes map to one template', () => {
    const found = new Map([
      ['9781474993210', hit('9781474993210', { productId: 55, templateId: 9, name: 'Usborne De kust' })],
    ]);
    const plan = planExistingBarcodeImport(['9781474993210'], found);
    expect(plan.action).toBe('update');
    if (plan.action === 'update') {
      expect(plan.templateId).toBe(9);
      expect(plan.productIdsByBarcode.get('9781474993210')).toBe(55);
      expect(plan.existingName).toBe('Usborne De kust');
    }
  });

  it('conflicts when only some barcodes already exist', () => {
    const found = new Map([['AAA', hit('AAA', { templateId: 1 })]]);
    const plan = planExistingBarcodeImport(['AAA', 'BBB'], found);
    expect(plan.action).toBe('conflict');
    if (plan.action === 'conflict') {
      expect(plan.message).toContain('BBB');
    }
  });

  it('conflicts when barcodes span multiple templates', () => {
    const found = new Map([
      ['AAA', hit('AAA', { templateId: 1, name: 'One' })],
      ['BBB', hit('BBB', { templateId: 2, name: 'Two' })],
    ]);
    const plan = planExistingBarcodeImport(['AAA', 'BBB'], found);
    expect(plan.action).toBe('conflict');
  });
});

describe('isBarcodeAlreadyExistsError', () => {
  it('matches Odoo unique barcode errors', () => {
    expect(
      isBarcodeAlreadyExistsError(
        "The operation cannot be completed: The value for 'barcode' (Barcode) already exists.\n\nDetail: Key (barcode)=(9781474993210) already exists.\n",
      ),
    ).toBe(true);
    expect(isBarcodeAlreadyExistsError('random failure')).toBe(false);
  });
});
