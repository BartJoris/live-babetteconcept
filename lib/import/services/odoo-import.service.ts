import { odooClient } from '@/lib/odooClient';
import { determineSizeAttribute } from '@/lib/import/shared/size-utils';
import type { SizeAttribute } from '@/lib/import/shared/size-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportProductData {
  name: string;
  reference: string;
  categoryId: number;
  listPrice: number;
  standardPrice: number;
  isPublished: boolean;
  isFavorite: boolean;
  ecommerceDescription?: string;
  publicCategoryIds?: number[];
  productTagIds?: number[];
  /** Optional extra reference stored alongside the main reference (e.g. productName for image matching). */
  productName?: string;
}

export interface ImportVariantData {
  size: string;
  ean?: string;
  sku?: string;
  price: number;
  rrp: number;
  quantity: number;
}

export interface VariantUpdateResult {
  updated: number;
  total: number;
}

export interface SizeAttributeResult {
  attributeId: number;
  valueIds: number[];
  /** Size labels parallel to `valueIds` (avoids extra Odoo reads later). */
  sizeNames: string[];
}

export class OdooImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'OdooImportError';
  }
}

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHT = 0.2;
const DEFAULT_WEBSITE_ID = 1;
const DEFAULT_STOCK_LOCATION_ID = 8;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OdooImportService {
  constructor(
    private uid: number,
    private password: string,
  ) {}

  // -----------------------------------------------------------------------
  // Product template
  // -----------------------------------------------------------------------

  async createProductTemplate(data: ImportProductData): Promise<number> {
    const templateData: Record<string, unknown> = {
      name: data.name,
      categ_id: data.categoryId,
      list_price: data.listPrice,
      standard_price: data.standardPrice,
      type: 'consu',
      is_storable: true,
      weight: DEFAULT_WEIGHT,
      tracking: 'none',
      available_in_pos: true,
      website_id: DEFAULT_WEBSITE_ID,
      // Explicit boolean — Odoo may ignore omitted/undefined publish flags.
      website_published: data.isPublished === true,
      purchase_ok: false,
      out_of_stock_message: '<p>Verkocht!</p><p><br></p>',
      is_favorite: data.isFavorite,
    };

    if (data.reference) {
      templateData.description = data.productName
        ? `${data.reference}|${data.productName}`
        : data.reference;
    }

    if (data.ecommerceDescription) {
      templateData.description_ecommerce = data.ecommerceDescription;
    }

    if (data.publicCategoryIds && data.publicCategoryIds.length > 0) {
      templateData.public_categ_ids = [[6, 0, data.publicCategoryIds]];
    }

    if (data.productTagIds && data.productTagIds.length > 0) {
      templateData.product_tag_ids = [[6, 0, data.productTagIds]];
    }

    try {
      const templateId = await odooClient.create(
        this.uid,
        this.password,
        'product.template',
        templateData,
      );

      // Assigning website_id can auto-publish in some Odoo versions — re-assert.
      if (data.isPublished !== true) {
        await odooClient.write(
          this.uid,
          this.password,
          'product.template',
          [templateId],
          { website_published: false },
        );
        console.log(
          `🌐 Forced website_published=false on template ${templateId}`,
        );
      }

      return templateId;
    } catch (err) {
      throw new OdooImportError(
        `Failed to create product template "${data.name}": ${(err as Error).message}`,
        'TEMPLATE_CREATE_FAILED',
        { templateData },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Brand (MERK) attribute
  // -----------------------------------------------------------------------

  async addBrandAttribute(templateId: number, brandName: string): Promise<void> {
    const merkAttrs = await odooClient.searchRead<{ id: number; name: string }>(
      this.uid,
      this.password,
      'product.attribute',
      [['name', 'in', ['MERK', 'Merk 1']]],
      ['id', 'name'],
    );

    if (!merkAttrs || merkAttrs.length === 0) {
      throw new OdooImportError(
        'MERK attribute not found in Odoo',
        'MERK_ATTRIBUTE_MISSING',
      );
    }

    const merkAttributeId = merkAttrs[0].id;

    const existingBrand = await odooClient.searchRead<{ id: number }>(
      this.uid,
      this.password,
      'product.attribute.value',
      [['attribute_id', '=', merkAttributeId], ['name', '=', brandName]],
      ['id'],
    );

    let brandValueId: number;
    if (existingBrand && existingBrand.length > 0) {
      brandValueId = existingBrand[0].id;
    } else {
      brandValueId = await odooClient.create(
        this.uid,
        this.password,
        'product.attribute.value',
        { attribute_id: merkAttributeId, name: brandName },
      );
    }

    await odooClient.create(
      this.uid,
      this.password,
      'product.template.attribute.line',
      {
        product_tmpl_id: templateId,
        attribute_id: merkAttributeId,
        value_ids: [[6, 0, [brandValueId]]],
      },
    );
  }

  // -----------------------------------------------------------------------
  // Size (MAAT) attribute
  // -----------------------------------------------------------------------

  /**
   * Add a size attribute line to the template. Returns the attribute id and
   * value ids in the order they were provided.
   *
   * @param sizeAttributeName  Explicit attribute name to use. When `null` the
   *                           attribute is auto-detected from the size strings.
   */
  async addSizeAttribute(
    templateId: number,
    sizeAttributeName: string | null,
    sizes: string[],
  ): Promise<SizeAttributeResult> {
    const resolvedName: SizeAttribute | string =
      sizeAttributeName ?? determineSizeAttribute(sizes[0]);

    let maatAttr = await odooClient.searchRead<{ id: number }>(
      this.uid,
      this.password,
      'product.attribute',
      [['name', '=', resolvedName]],
      ['id'],
    );

    let attributeId: number;
    if (!maatAttr || maatAttr.length === 0) {
      attributeId = await odooClient.create(
        this.uid,
        this.password,
        'product.attribute',
        { name: resolvedName, display_type: 'radio' },
      );
    } else {
      attributeId = maatAttr[0].id;
    }

    // One lookup for all existing values on this attribute (instead of N searches).
    const existingValues = await odooClient.searchRead<{
      id: number;
      name: string;
    }>(
      this.uid,
      this.password,
      'product.attribute.value',
      [['attribute_id', '=', attributeId]],
      ['id', 'name'],
      2000,
    );
    const byName = new Map(
      (existingValues || []).map((v) => [v.name, v.id] as const),
    );

    const valueIds: number[] = [];
    const sizeNames: string[] = [];
    for (const size of sizes) {
      sizeNames.push(size);
      const existingId = byName.get(size);
      if (existingId) {
        valueIds.push(existingId);
        continue;
      }
      const id = await odooClient.create(
        this.uid,
        this.password,
        'product.attribute.value',
        { attribute_id: attributeId, name: size },
      );
      byName.set(size, id);
      valueIds.push(id);
    }

    await odooClient.create(
      this.uid,
      this.password,
      'product.template.attribute.line',
      {
        product_tmpl_id: templateId,
        attribute_id: attributeId,
        value_ids: [[6, 0, valueIds]],
      },
    );

    return { attributeId, valueIds, sizeNames };
  }

  /**
   * Poll until Odoo has generated the expected number of variants
   * (replaces a fixed 1s sleep).
   */
  async waitForVariants(
    templateId: number,
    expectedCount: number,
    maxWaitMs = 4000,
  ): Promise<
    Array<{ id: number; product_template_variant_value_ids: number[] }>
  > {
    const started = Date.now();
    let latest: Array<{
      id: number;
      product_template_variant_value_ids: number[];
    }> = [];

    while (Date.now() - started < maxWaitMs) {
      latest = await odooClient.searchRead<{
        id: number;
        product_template_variant_value_ids: number[];
      }>(
        this.uid,
        this.password,
        'product.product',
        [['product_tmpl_id', '=', templateId]],
        ['id', 'product_template_variant_value_ids'],
      );

      if (latest.length >= expectedCount) {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return latest;
  }

  // -----------------------------------------------------------------------
  // Variant updates
  // -----------------------------------------------------------------------

  /**
   * Fetch generated variants for a template, match them to the supplied
   * variant data by size value id, and write prices / barcodes / SKUs.
   *
   * When `sizeValueIds` is empty the product is treated as single-variant
   * (all variant data is merged into the first Odoo variant).
   */
  async updateVariants(
    templateId: number,
    variants: ImportVariantData[],
    sizeValueIds: number[],
    sizeNames: string[] = [],
    prefetchedVariants?: Array<{
      id: number;
      product_template_variant_value_ids: number[];
    }>,
  ): Promise<VariantUpdateResult> {
    const odooVariants =
      prefetchedVariants ??
      (await odooClient.searchRead<{
        id: number;
        product_template_variant_value_ids: number[];
      }>(
        this.uid,
        this.password,
        'product.product',
        [['product_tmpl_id', '=', templateId]],
        ['id', 'product_template_variant_value_ids'],
      ));

    const total = odooVariants.length;
    let updated = 0;

    const isSingleVariant = sizeValueIds.length === 0;

    if (isSingleVariant) {
      updated = await this.updateSingleVariant(odooVariants[0]?.id, variants);
    } else {
      const sizeValueIdToName = new Map<number, string>();
      sizeValueIds.forEach((id, index) => {
        if (sizeNames[index]) sizeValueIdToName.set(id, sizeNames[index]);
      });
      updated = await this.updateMultipleVariants(
        odooVariants,
        variants,
        sizeValueIds,
        sizeValueIdToName,
      );
    }

    return { updated, total };
  }

  // -----------------------------------------------------------------------
  // Stock
  // -----------------------------------------------------------------------

  async createStock(
    productId: number,
    quantity: number,
    locationId: number = DEFAULT_STOCK_LOCATION_ID,
  ): Promise<void> {
    if (quantity <= 0) return;
    try {
      await odooClient.create(this.uid, this.password, 'stock.quant', {
        product_id: productId,
        location_id: locationId,
        quantity,
      });
    } catch (err) {
      console.warn(
        `Stock creation failed for product ${productId}: ${(err as Error).message}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async updateSingleVariant(
    odooVariantId: number | undefined,
    variants: ImportVariantData[],
  ): Promise<number> {
    if (!odooVariantId) return 0;

    const combined = variants.reduce<ImportVariantData>(
      (acc, v) => ({
        ...acc,
        quantity: acc.quantity + (v.quantity || 0),
        ean: acc.ean || v.ean,
        sku: acc.sku || v.sku,
        price: acc.price || v.price,
        rrp: acc.rrp || v.rrp,
      }),
      { size: variants[0]?.size ?? '', quantity: 0, price: 0, rrp: 0 },
    );

    const updateData: Record<string, unknown> = {
      standard_price: combined.price || combined.rrp || 0,
      list_price: combined.rrp || combined.price || 0,
      weight: DEFAULT_WEIGHT,
    };

    if (combined.ean?.trim()) {
      updateData.barcode = combined.ean;
    }

    await odooClient.write(this.uid, this.password, 'product.product', [odooVariantId], updateData);
    await this.createStock(odooVariantId, combined.quantity);

    return 1;
  }

  private async updateMultipleVariants(
    odooVariants: Array<{ id: number; product_template_variant_value_ids: number[] }>,
    variants: ImportVariantData[],
    sizeValueIds: number[],
    sizeValueIdToName: Map<number, string>,
  ): Promise<number> {
    const allPtavIds = Array.from(
      new Set(
        odooVariants.flatMap((v) => v.product_template_variant_value_ids || []),
      ),
    );

    // One batched PTAV read for the whole template (was 1 call per variant).
    const ptavRows =
      allPtavIds.length > 0
        ? await odooClient.searchRead<{
            id: number;
            product_attribute_value_id: [number, string];
          }>(
            this.uid,
            this.password,
            'product.template.attribute.value',
            [['id', 'in', allPtavIds]],
            ['id', 'product_attribute_value_id'],
          )
        : [];

    const ptavToAttrValueId = new Map(
      ptavRows.map(
        (row) => [row.id, row.product_attribute_value_id[0]] as const,
      ),
    );

    // Fill any missing size names in one read (fallback if caller omitted them).
    const missingSizeIds = sizeValueIds.filter((id) => !sizeValueIdToName.has(id));
    if (missingSizeIds.length > 0) {
      const names = await odooClient.read<{ id: number; name: string }>(
        this.uid,
        this.password,
        'product.attribute.value',
        missingSizeIds,
        ['id', 'name'],
      );
      for (const row of names || []) {
        sizeValueIdToName.set(row.id, row.name);
      }
    }

    const csvBySize = new Map(variants.map((v) => [v.size, v] as const));

    const jobs = odooVariants.map((odooVariant) => async (): Promise<boolean> => {
      try {
        const variantValueIds =
          odooVariant.product_template_variant_value_ids || [];
        if (variantValueIds.length === 0) return false;

        let sizeValueId: number | null = null;
        for (const ptavId of variantValueIds) {
          const valueId = ptavToAttrValueId.get(ptavId);
          if (valueId != null && sizeValueIds.includes(valueId)) {
            sizeValueId = valueId;
            break;
          }
        }
        if (!sizeValueId) return false;

        const sizeName = sizeValueIdToName.get(sizeValueId);
        if (!sizeName) return false;

        const csvVariant = csvBySize.get(sizeName);
        if (!csvVariant) return false;

        const updateData: Record<string, unknown> = {
          standard_price: csvVariant.price,
          list_price: csvVariant.rrp || csvVariant.price || 0,
          weight: DEFAULT_WEIGHT,
        };

        if (csvVariant.ean?.trim()) {
          updateData.barcode = csvVariant.ean;
        }

        try {
          await odooClient.write(
            this.uid,
            this.password,
            'product.product',
            [odooVariant.id],
            updateData,
          );
        } catch (writeError) {
          const msg = (writeError as Error).message || '';
          if (
            msg.includes('barcode') &&
            msg.includes('already exists') &&
            updateData.barcode
          ) {
            delete updateData.barcode;
            await odooClient.write(
              this.uid,
              this.password,
              'product.product',
              [odooVariant.id],
              updateData,
            );
          } else {
            throw writeError;
          }
        }

        await this.createStock(odooVariant.id, csvVariant.quantity);
        return true;
      } catch (variantError) {
        console.error(
          `Error updating variant ${odooVariant.id}:`,
          variantError,
        );
        return false;
      }
    });

    // Limited parallelism: faster than fully sequential, safer than unbounded.
    const concurrency = 4;
    let updated = 0;
    for (let i = 0; i < jobs.length; i += concurrency) {
      const chunk = await Promise.all(
        jobs.slice(i, i + concurrency).map((job) => job()),
      );
      updated += chunk.filter(Boolean).length;
    }

    return updated;
  }
}
