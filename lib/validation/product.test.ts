import { describe, it, expect } from 'vitest';
import { importProductsSchema, productSchema, productVariantSchema } from './product';

describe('productVariantSchema', () => {
  it('validates a correct variant', () => {
    const result = productVariantSchema.safeParse({
      size: 'M',
      quantity: 5,
      price: 29.99,
      rrp: 49.99,
    });
    expect(result.success).toBe(true);
  });

  it('requires minimum size length of 1', () => {
    const result = productVariantSchema.safeParse({
      size: '',
      quantity: 5,
      price: 29.99,
      rrp: 49.99,
    });
    expect(result.success).toBe(false);
  });

  it('requires price >= 0', () => {
    const result = productVariantSchema.safeParse({
      size: 'M',
      quantity: 5,
      price: -1,
      rrp: 49.99,
    });
    expect(result.success).toBe(false);
  });

  it('requires rrp >= 0', () => {
    const result = productVariantSchema.safeParse({
      size: 'M',
      quantity: 5,
      price: 29.99,
      rrp: -5,
    });
    expect(result.success).toBe(false);
  });

  it('allows optional ean and sku', () => {
    const result = productVariantSchema.safeParse({
      size: 'M',
      quantity: 5,
      price: 29.99,
      rrp: 49.99,
      ean: '2001234567890',
      sku: 'ABC-123',
    });
    expect(result.success).toBe(true);
  });
});

describe('productSchema', () => {
  const validProduct = {
    reference: 'REF001',
    name: 'Test Product',
    variants: [{ size: 'M', quantity: 2, price: 25, rrp: 50 }],
    isFavorite: false,
    isPublished: true,
  };

  it('validates a minimal valid product', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('requires reference', () => {
    const result = productSchema.safeParse({ ...validProduct, reference: '' });
    expect(result.success).toBe(false);
  });

  it('requires name', () => {
    const result = productSchema.safeParse({ ...validProduct, name: '' });
    expect(result.success).toBe(false);
  });

  it('requires at least one variant', () => {
    const result = productSchema.safeParse({ ...validProduct, variants: [] });
    expect(result.success).toBe(false);
  });

  it('applies defaults for material and color', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.material).toBe('');
      expect(result.data.color).toBe('');
    }
  });

  it('applies default for publicCategories', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.publicCategories).toEqual([]);
    }
  });

  it('applies default for productTags', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.productTags).toEqual([]);
    }
  });
});

describe('importProductsSchema', () => {
  const validInput = {
    products: [{
      reference: 'REF001',
      name: 'Test Product',
      variants: [{ size: 'M', quantity: 2, price: 25, rrp: 50 }],
      isFavorite: false,
      isPublished: true,
    }],
  };

  it('validates valid import data', () => {
    const result = importProductsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('defaults testMode to false', () => {
    const result = importProductsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testMode).toBe(false);
    }
  });

  it('requires at least one product', () => {
    const result = importProductsSchema.safeParse({ products: [] });
    expect(result.success).toBe(false);
  });

  it('fails on missing products field', () => {
    const result = importProductsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('passes with testMode explicitly set', () => {
    const result = importProductsSchema.safeParse({ ...validInput, testMode: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testMode).toBe(true);
    }
  });

  it('rejects invalid product within array', () => {
    const result = importProductsSchema.safeParse({
      products: [{ reference: '', name: 'X', variants: [], isFavorite: false, isPublished: true }],
    });
    expect(result.success).toBe(false);
  });
});
