import { odooClient } from '@/lib/odooClient';
import { determineSizeAttribute } from '@/lib/import/shared/size-utils';
import { toEcommerceHtml } from '@/lib/import/shared/ecommerce-html';
import type { SizeAttribute } from '@/lib/import/shared/size-utils';
import type { ExistingBarcodeHit } from '@/lib/import/existing-barcode';
import { isBarcodeAlreadyExistsError } from '@/lib/import/existing-barcode';

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
  /** Override default weight (kg). */
  weight?: number;
  /**
   * VAT percentage for sale (+ purchase) taxes, e.g. 6 for books.
   * When set, looks up matching account.tax records and writes taxes_id /
   * supplier_taxes_id on the template.
   */
  taxRate?: number;
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

  /**
   * Resolve account.tax ids for a VAT percentage (sale and optionally purchase).
   * Prefers active taxes whose amount matches exactly (6 → books, 21 → clothing).
   */
  async resolveTaxIds(
    rate: number,
    typeTaxUse: 'sale' | 'purchase',
  ): Promise<number[]> {
    const taxes = await odooClient.searchRead<{ id: number; name: string; amount: number }>(
      this.uid,
      this.password,
      'account.tax',
      [
        ['amount', '=', rate],
        ['type_tax_use', '=', typeTaxUse],
        ['active', '=', true],
      ],
      ['id', 'name', 'amount'],
      10,
    );

    if (!taxes?.length) {
      console.warn(`⚠️ No active ${typeTaxUse} tax found for ${rate}%`);
      return [];
    }

    // Prefer non-group / simple VAT lines when multiple match
    const preferred = taxes.filter(
      (t) => /btw|vat|tva/i.test(t.name) && !/groep|group/i.test(t.name),
    );
    return (preferred.length ? preferred : taxes).map((t) => t.id);
  }

  async createProductTemplate(data: ImportProductData): Promise<number> {
    const weight =
      typeof data.weight === 'number' && data.weight > 0
        ? data.weight
        : DEFAULT_WEIGHT;

    const templateData: Record<string, unknown> = {
      name: data.name,
      categ_id: data.categoryId,
      list_price: data.listPrice,
      standard_price: data.standardPrice,
      type: 'consu',
      is_storable: true,
      weight,
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
      templateData.description_ecommerce = toEcommerceHtml(
        data.ecommerceDescription,
      );
    }

    if (data.publicCategoryIds && data.publicCategoryIds.length > 0) {
      templateData.public_categ_ids = [[6, 0, data.publicCategoryIds]];
    }

    if (data.productTagIds && data.productTagIds.length > 0) {
      templateData.product_tag_ids = [[6, 0, data.productTagIds]];
    }

    if (typeof data.taxRate === 'number' && data.taxRate > 0) {
      const saleTaxIds = await this.resolveTaxIds(data.taxRate, 'sale');
      if (saleTaxIds.length > 0) {
        templateData.taxes_id = [[6, 0, saleTaxIds]];
        console.log(`💶 Applied ${data.taxRate}% sale tax ids: ${saleTaxIds.join(',')}`);
      }
      const purchaseTaxIds = await this.resolveTaxIds(data.taxRate, 'purchase');
      if (purchaseTaxIds.length > 0) {
        templateData.supplier_taxes_id = [[6, 0, purchaseTaxIds]];
        console.log(
          `💶 Applied ${data.taxRate}% purchase tax ids: ${purchaseTaxIds.join(',')}`,
        );
      }
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
  // Internal category (product.category) path ensure
  // -----------------------------------------------------------------------

  /**
   * Ensure a full internal category path exists (e.g. "All / Kleding / Baje").
   * Creates missing segments under their parent. Returns the leaf category id.
   */
  async ensureCategoryPath(completeName: string): Promise<number> {
    const parts = completeName
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      throw new OdooImportError(
        'Category path is empty',
        'CATEGORY_PATH_EMPTY',
      );
    }

    let parentId: number | false = false;
    let leafId: number | null = null;

    for (const part of parts) {
      const domain: Array<[string, string, string | number | boolean]> =
        parentId === false
          ? [
              ['name', '=', part],
              ['parent_id', '=', false],
            ]
          : [
              ['name', '=', part],
              ['parent_id', '=', parentId],
            ];

      const existing = await odooClient.searchRead<{ id: number }>(
        this.uid,
        this.password,
        'product.category',
        domain,
        ['id'],
        1,
      );

      if (existing && existing.length > 0) {
        leafId = existing[0].id;
      } else {
        const values: Record<string, unknown> = { name: part };
        if (parentId !== false) {
          values.parent_id = parentId;
        }
        leafId = await odooClient.create(
          this.uid,
          this.password,
          'product.category',
          values,
        );
        console.log(
          `🆕 Created product.category "${part}" (id ${leafId}) under parent ${parentId === false ? 'root' : parentId}`,
        );
      }

      parentId = leafId;
    }

    if (leafId == null) {
      throw new OdooImportError(
        `Failed to resolve category path "${completeName}"`,
        'CATEGORY_PATH_FAILED',
        { completeName },
      );
    }

    return leafId;
  }

  // -----------------------------------------------------------------------
  // Brand / publisher attribute (MERK by default, Uitgeverij for books)
  // -----------------------------------------------------------------------

  /**
   * Attach a brand/publisher attribute line to the template.
   * @param attributeName  Odoo attribute to use. Defaults to MERK (with
   *                       legacy Merk 1 fallback). Books pass "Uitgeverij".
   */
  async addBrandAttribute(
    templateId: number,
    brandName: string,
    attributeName = 'MERK',
  ): Promise<void> {
    const candidateNames =
      attributeName === 'MERK' || attributeName === 'Merk 1'
        ? ['MERK', 'Merk 1']
        : [attributeName];

    const attrs = await odooClient.searchRead<{ id: number; name: string }>(
      this.uid,
      this.password,
      'product.attribute',
      [['name', 'in', candidateNames]],
      ['id', 'name'],
    );

    if (!attrs || attrs.length === 0) {
      throw new OdooImportError(
        `${attributeName} attribute not found in Odoo`,
        'BRAND_ATTRIBUTE_MISSING',
        { attributeName, candidateNames },
      );
    }

    const preferred =
      attrs.find((attr) => attr.name === attributeName) ??
      attrs.find((attr) => attr.name === 'MERK') ??
      attrs[0];
    const attributeId = preferred.id;

    const existingBrand = await odooClient.searchRead<{ id: number }>(
      this.uid,
      this.password,
      'product.attribute.value',
      [['attribute_id', '=', attributeId], ['name', '=', brandName]],
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
        { attribute_id: attributeId, name: brandName },
      );
    }

    await odooClient.create(
      this.uid,
      this.password,
      'product.template.attribute.line',
      {
        product_tmpl_id: templateId,
        attribute_id: attributeId,
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
   *
   * Adult MAAT lines can take several seconds; returning early left random
   * sizes (often S/M) without barcode/price/stock.
   */
  async waitForVariants(
    templateId: number,
    expectedCount: number,
    maxWaitMs = 15_000,
  ): Promise<
    Array<{ id: number; product_template_variant_value_ids: number[] }>
  > {
    const started = Date.now();
    let latest: Array<{
      id: number;
      product_template_variant_value_ids: number[];
    }> = [];
    let stableSince = Date.now();
    let lastCount = -1;

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

      if (latest.length !== lastCount) {
        lastCount = latest.length;
        stableSince = Date.now();
      }

      // Require expected count AND a short stability window so late variants
      // (e.g. S - 36) are included before we write barcodes.
      if (
        latest.length >= expectedCount &&
        Date.now() - stableSince >= 300
      ) {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
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
  // Existing barcode lookup / update
  // -----------------------------------------------------------------------

  /**
   * Find product.product rows by barcode (includes archived).
   * Used to update existing stock instead of creating barcode duplicates.
   */
  async findProductsByBarcodes(
    barcodes: string[],
  ): Promise<Map<string, ExistingBarcodeHit>> {
    const unique = [
      ...new Set(barcodes.map((b) => b?.trim()).filter(Boolean)),
    ];
    const found = new Map<string, ExistingBarcodeHit>();
    if (unique.length === 0) return found;

    const BATCH = 200;
    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const rows = await odooClient.call<
        Array<{
          id: number;
          barcode: string;
          display_name: string;
          qty_available: number;
          product_tmpl_id: [number, string];
        }>
      >({
        uid: this.uid,
        password: this.password,
        model: 'product.product',
        method: 'search_read',
        args: [[['barcode', 'in', batch]]],
        kwargs: {
          fields: [
            'id',
            'barcode',
            'display_name',
            'qty_available',
            'product_tmpl_id',
          ],
          limit: batch.length,
          context: { active_test: false },
        },
      });

      for (const row of rows || []) {
        if (!row.barcode) continue;
        found.set(row.barcode, {
          barcode: row.barcode,
          productId: row.id,
          templateId: row.product_tmpl_id[0],
          name: row.display_name,
          qtyAvailable: row.qty_available || 0,
        });
      }
    }

    return found;
  }

  /**
   * Update prices + stock on existing variants matched by barcode.
   * Also refreshes template list/standard price when provided.
   */
  async updateExistingByBarcodes(
    templateId: number,
    variants: ImportVariantData[],
    productIdsByBarcode: Map<string, number>,
    templatePatch?: {
      listPrice?: number;
      standardPrice?: number;
      publicCategoryIds?: number[];
      productTagIds?: number[];
      taxRate?: number;
      weight?: number;
      isPublished?: boolean;
    },
  ): Promise<VariantUpdateResult> {
    let updated = 0;

    for (const variant of variants) {
      const ean = variant.ean?.trim();
      if (!ean) continue;
      const productId = productIdsByBarcode.get(ean);
      if (!productId) continue;

      const updateData: Record<string, unknown> = {
        standard_price: variant.price || variant.rrp || 0,
        list_price: variant.rrp || variant.price || 0,
      };
      if (typeof templatePatch?.weight === 'number' && templatePatch.weight > 0) {
        updateData.weight = templatePatch.weight;
      }

      await odooClient.write(
        this.uid,
        this.password,
        'product.product',
        [productId],
        updateData,
      );
      await this.createStock(productId, variant.quantity);
      updated += 1;
    }

    if (templatePatch) {
      const tmpl: Record<string, unknown> = {};
      if (typeof templatePatch.listPrice === 'number') {
        tmpl.list_price = templatePatch.listPrice;
      }
      if (typeof templatePatch.standardPrice === 'number') {
        tmpl.standard_price = templatePatch.standardPrice;
      }
      if (templatePatch.publicCategoryIds?.length) {
        tmpl.public_categ_ids = [[6, 0, templatePatch.publicCategoryIds]];
      }
      if (templatePatch.productTagIds?.length) {
        tmpl.product_tag_ids = [[6, 0, templatePatch.productTagIds]];
      }
      if (typeof templatePatch.weight === 'number' && templatePatch.weight > 0) {
        tmpl.weight = templatePatch.weight;
      }
      if (templatePatch.isPublished === true) {
        tmpl.website_published = true;
      }
      if (typeof templatePatch.taxRate === 'number' && templatePatch.taxRate > 0) {
        const saleTaxIds = await this.resolveTaxIds(templatePatch.taxRate, 'sale');
        if (saleTaxIds.length > 0) tmpl.taxes_id = [[6, 0, saleTaxIds]];
        const purchaseTaxIds = await this.resolveTaxIds(
          templatePatch.taxRate,
          'purchase',
        );
        if (purchaseTaxIds.length > 0) {
          tmpl.supplier_taxes_id = [[6, 0, purchaseTaxIds]];
        }
      }
      if (Object.keys(tmpl).length > 0) {
        await odooClient.write(
          this.uid,
          this.password,
          'product.template',
          [templateId],
          tmpl,
        );
      }
    }

    return { updated, total: productIdsByBarcode.size };
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

    try {
      await odooClient.write(
        this.uid,
        this.password,
        'product.product',
        [odooVariantId],
        updateData,
      );
    } catch (writeError) {
      const msg = (writeError as Error).message || '';
      // Don't strip the barcode and leave a duplicate product — surface clearly.
      if (isBarcodeAlreadyExistsError(msg) && updateData.barcode) {
        throw new OdooImportError(
          `Barcode ${String(updateData.barcode)} bestaat al in Odoo. ` +
            `Importeer opnieuw om het bestaande product bij te werken in plaats van een nieuw product aan te maken.`,
          'BARCODE_ALREADY_EXISTS',
          { barcode: updateData.barcode, productId: odooVariantId },
        );
      }
      throw writeError;
    }
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

    // Keep low: Odoo/Cloudflare often 429s when writing several variants at once.
    const concurrency = 2;
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
