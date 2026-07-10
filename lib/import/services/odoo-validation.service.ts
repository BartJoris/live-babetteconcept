import { odooClient } from '@/lib/odooClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  field: string;
  status: 'pass' | 'fail' | 'warning';
  expected: string;
  actual: string;
  message: string;
}

export interface ProductValidation {
  templateId: number;
  productName: string;
  results: ValidationResult[];
  overallStatus: 'pass' | 'fail' | 'warning';
}

export interface ExpectedProductData {
  name: string;
  categoryId: number;
  brandName: string;
  variantCount: number;
  publicCategoryIds?: number[];
  tagIds?: number[];
  isPublished: boolean;
  hasImages: boolean;
}

export class OdooValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'OdooValidationError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OdooValidationService {
  constructor(
    private uid: number,
    private password: string,
  ) {}

  // -----------------------------------------------------------------------
  // Single product
  // -----------------------------------------------------------------------

  async validateImportedProduct(
    templateId: number,
    expected: ExpectedProductData,
  ): Promise<ProductValidation> {
    const results: ValidationResult[] = [];

    const templates = await odooClient.read<{
      id: number;
      name: string;
      categ_id: [number, string];
      list_price: number;
      standard_price: number;
      website_published: boolean;
      image_1920: string | false;
      public_categ_ids: number[];
      product_tag_ids: number[];
    }>(
      this.uid,
      this.password,
      'product.template',
      [templateId],
      [
        'name',
        'categ_id',
        'list_price',
        'standard_price',
        'website_published',
        'image_1920',
        'public_categ_ids',
        'product_tag_ids',
      ],
    );

    if (!templates || templates.length === 0) {
      return {
        templateId,
        productName: expected.name,
        results: [
          {
            field: 'template',
            status: 'fail',
            expected: `Template ${templateId} exists`,
            actual: 'Not found',
            message: `Template ${templateId} does not exist in Odoo`,
          },
        ],
        overallStatus: 'fail',
      };
    }

    const tpl = templates[0];

    results.push(this.check('name', expected.name, tpl.name));

    results.push(
      this.check(
        'categ_id',
        String(expected.categoryId),
        String(tpl.categ_id[0]),
        `Internal category`,
      ),
    );

    results.push(
      this.check(
        'website_published',
        String(expected.isPublished),
        String(tpl.website_published),
        'Published status',
      ),
    );

    results.push(await this.validateBrand(templateId, expected.brandName));
    results.push(await this.validateVariantCount(templateId, expected.variantCount));

    if (expected.hasImages) {
      const hasMainImage = tpl.image_1920 !== false && tpl.image_1920 !== '';
      results.push({
        field: 'image_1920',
        status: hasMainImage ? 'pass' : 'fail',
        expected: 'Main image present',
        actual: hasMainImage ? 'Image set' : 'No image',
        message: hasMainImage ? 'Main image is set' : 'Main image is missing',
      });
    }

    if (expected.publicCategoryIds && expected.publicCategoryIds.length > 0) {
      results.push(
        this.checkIdSet(
          'public_categ_ids',
          expected.publicCategoryIds,
          tpl.public_categ_ids,
          'Public categories',
        ),
      );
    }

    if (expected.tagIds && expected.tagIds.length > 0) {
      results.push(
        this.checkIdSet(
          'product_tag_ids',
          expected.tagIds,
          tpl.product_tag_ids,
          'Product tags',
        ),
      );
    }

    const overallStatus = this.deriveOverallStatus(results);

    return {
      templateId,
      productName: expected.name,
      results,
      overallStatus,
    };
  }

  // -----------------------------------------------------------------------
  // Batch
  // -----------------------------------------------------------------------

  async validateBatch(
    validations: Array<{
      templateId: number;
      expected: ExpectedProductData;
    }>,
  ): Promise<ProductValidation[]> {
    const out: ProductValidation[] = [];
    for (const { templateId, expected } of validations) {
      out.push(await this.validateImportedProduct(templateId, expected));
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private check(
    field: string,
    expected: string,
    actual: string,
    label?: string,
  ): ValidationResult {
    const pass = expected === actual;
    return {
      field,
      status: pass ? 'pass' : 'fail',
      expected,
      actual,
      message: pass
        ? `${label ?? field} matches`
        : `${label ?? field} mismatch: expected "${expected}", got "${actual}"`,
    };
  }

  private checkIdSet(
    field: string,
    expectedIds: number[],
    actualIds: number[],
    label: string,
  ): ValidationResult {
    const missing = expectedIds.filter(id => !actualIds.includes(id));
    if (missing.length === 0) {
      return {
        field,
        status: 'pass',
        expected: expectedIds.join(', '),
        actual: actualIds.join(', '),
        message: `All ${label} present`,
      };
    }
    return {
      field,
      status: 'fail',
      expected: expectedIds.join(', '),
      actual: actualIds.join(', '),
      message: `Missing ${label}: ${missing.join(', ')}`,
    };
  }

  private async validateBrand(
    templateId: number,
    expectedBrand: string,
  ): Promise<ValidationResult> {
    try {
      const lines = await odooClient.searchRead<{
        attribute_id: [number, string];
        value_ids: number[];
      }>(
        this.uid,
        this.password,
        'product.template.attribute.line',
        [['product_tmpl_id', '=', templateId]],
        ['attribute_id', 'value_ids'],
      );

      const merkLine = lines.find(
        l => l.attribute_id[1] === 'MERK' || l.attribute_id[1] === 'Merk 1',
      );

      if (!merkLine) {
        return {
          field: 'brand',
          status: 'fail',
          expected: expectedBrand,
          actual: 'No MERK attribute line',
          message: 'Brand attribute line is missing on the template',
        };
      }

      if (merkLine.value_ids.length === 0) {
        return {
          field: 'brand',
          status: 'fail',
          expected: expectedBrand,
          actual: 'No brand value',
          message: 'MERK attribute line has no values',
        };
      }

      const values = await odooClient.read<{ name: string }>(
        this.uid,
        this.password,
        'product.attribute.value',
        merkLine.value_ids,
        ['name'],
      );

      const actualBrand = values.map(v => v.name).join(', ');
      const match = values.some(v => v.name === expectedBrand);

      return {
        field: 'brand',
        status: match ? 'pass' : 'fail',
        expected: expectedBrand,
        actual: actualBrand,
        message: match
          ? `Brand "${expectedBrand}" is set`
          : `Brand mismatch: expected "${expectedBrand}", got "${actualBrand}"`,
      };
    } catch (err) {
      return {
        field: 'brand',
        status: 'fail',
        expected: expectedBrand,
        actual: 'Error',
        message: `Failed to validate brand: ${(err as Error).message}`,
      };
    }
  }

  private async validateVariantCount(
    templateId: number,
    expectedCount: number,
  ): Promise<ValidationResult> {
    try {
      const variants = await odooClient.search(
        this.uid,
        this.password,
        'product.product',
        [['product_tmpl_id', '=', templateId]],
      );

      const actual = variants.length;
      const pass = actual === expectedCount;

      return {
        field: 'variant_count',
        status: pass ? 'pass' : actual > 0 ? 'warning' : 'fail',
        expected: String(expectedCount),
        actual: String(actual),
        message: pass
          ? `${actual} variant(s) created`
          : `Expected ${expectedCount} variants, found ${actual}`,
      };
    } catch (err) {
      return {
        field: 'variant_count',
        status: 'fail',
        expected: String(expectedCount),
        actual: 'Error',
        message: `Failed to count variants: ${(err as Error).message}`,
      };
    }
  }

  private deriveOverallStatus(results: ValidationResult[]): 'pass' | 'fail' | 'warning' {
    if (results.some(r => r.status === 'fail')) return 'fail';
    if (results.some(r => r.status === 'warning')) return 'warning';
    return 'pass';
  }
}
