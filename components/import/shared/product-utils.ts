import type { ParsedProduct, ProductVariant } from '@/lib/suppliers/types';
import { isUnitSize, mapSizeToOdooFormat } from '@/lib/import/shared';

export const isUnitOnlyProduct = (product: ParsedProduct) =>
  product.variants.length > 0 &&
  product.variants.every((variant) => isUnitSize(variant.size));

export function transformProductForUpload(
  product: ParsedProduct,
): ParsedProduct {
  const isUnit =
    product.variants.length > 0 &&
    product.variants.every((variant) => isUnitSize(variant.size));

  if (isUnit) {
    const combinedVariant = product.variants.reduce<ProductVariant>(
      (acc, variant) => ({
        ...acc,
        quantity: acc.quantity + (variant.quantity || 0),
        ean: acc.ean || variant.ean,
        sku: acc.sku || variant.sku,
        price: acc.price || variant.price,
        rrp: acc.rrp || variant.rrp,
      }),
      {
        size: 'UNIT',
        quantity: 0,
        ean: '',
        price: 0,
        rrp: 0,
      },
    );

    return {
      ...product,
      variants: [combinedVariant],
    };
  }

  if (product.sizeAttribute === 'MAAT Volwassenen') {
    return {
      ...product,
      variants: product.variants.map((v) => ({
        ...v,
        size: mapSizeToOdooFormat(v.size),
      })),
    };
  }
  return product;
}
