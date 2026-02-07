import { z } from 'zod';

export const productVariantSchema = z.object({
  size: z.string().min(1),
  quantity: z.number().min(0),
  ean: z.string().optional(),
  sku: z.string().optional(),
  price: z.number().min(0),
  rrp: z.number().min(0),
});

export const productSchema = z.object({
  reference: z.string().min(1),
  name: z.string().min(1),
  material: z.string().optional().default(''),
  color: z.string().optional().default(''),
  ecommerceDescription: z.string().optional(),
  variants: z.array(productVariantSchema).min(1, 'At least one variant is required'),
  selectedBrand: z.object({
    id: z.number(),
    name: z.string(),
  }).optional(),
  category: z.object({
    id: z.number(),
    name: z.string(),
  }).optional(),
  publicCategories: z.array(z.object({
    id: z.number(),
    name: z.string(),
  })).default([]),
  productTags: z.array(z.object({
    id: z.number(),
    name: z.string(),
  })).default([]),
  originalName: z.string().optional(),
  productName: z.string().optional(), // Product name from CSV (e.g., "26s063" for 1+ - used in image filenames)
  isFavorite: z.boolean(),
  isPublished: z.boolean(),
  sizeAttribute: z.string().optional(),
  images: z.array(z.string()).optional(),
});

export const importProductsSchema = z.object({
  products: z.array(productSchema).min(1, 'At least one product is required'),
  testMode: z.boolean().default(false),
});

export const odooCallSchema = z.object({
  model: z.string().min(1),
  method: z.string().min(1),
  args: z.array(z.unknown()),
  kwargs: z.record(z.string(), z.unknown()).optional(),
});

export type ProductVariant = z.infer<typeof productVariantSchema>;
export type Product = z.infer<typeof productSchema>;
export type ImportProductsInput = z.infer<typeof importProductsSchema>;
export type OdooCallInput = z.infer<typeof odooCallSchema>;

