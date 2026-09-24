import { describe, expect, it } from 'vitest';
import {
  applyAltTextUpdates,
  buildSuggestedUpdates,
  isFilenameLikeAlt,
  needsAltTextFix,
  productHasCorrectAltText,
  productNeedsAltTextFix,
  sortGalleryImages,
  suggestedAltText,
} from '../altText';
import type { SeoProductItem } from '../types';

function product(
  overrides: Partial<SeoProductItem> & Pick<SeoProductItem, 'name' | 'galleryImages'>
): SeoProductItem {
  return {
    id: 1,
    defaultCode: null,
    brand: null,
    hasMainImage: true,
    imageCount: overrides.galleryImages.length + 1,
    ...overrides,
  };
}

describe('suggestedAltText', () => {
  it('uses product name, image number and Babette Oostduinkerke', () => {
    expect(suggestedAltText('Jelly Mallow - Love block sweatshirt', 0)).toBe(
      'Jelly Mallow - Love block sweatshirt - 1 - Babette Oostduinkerke'
    );
  });

  it('numbers images from 1', () => {
    expect(suggestedAltText('Rode Winterjas', 0)).toBe(
      'Rode Winterjas - 1 - Babette Oostduinkerke'
    );
    expect(suggestedAltText('Rode Winterjas', 1)).toBe(
      'Rode Winterjas - 2 - Babette Oostduinkerke'
    );
    expect(suggestedAltText('Rode Winterjas', 4)).toBe(
      'Rode Winterjas - 5 - Babette Oostduinkerke'
    );
  });

  it('trims the product name', () => {
    expect(suggestedAltText('  Jas  ', 0)).toBe('Jas - 1 - Babette Oostduinkerke');
  });
});

describe('needsAltTextFix', () => {
  it('treats the suggested value as correct', () => {
    expect(needsAltTextFix('Mayoral - Jas', 'Mayoral - Jas')).toBe(false);
  });

  it('flags empty, filename-like and generic values', () => {
    expect(needsAltTextFix('', 'Mayoral - Jas')).toBe(true);
    expect(needsAltTextFix('  ', 'Mayoral - Jas')).toBe(true);
    expect(needsAltTextFix('photo.jpg', 'Mayoral - Jas')).toBe(true);
    expect(needsAltTextFix('Vorige hoofdafbeelding', 'Mayoral - Jas')).toBe(true);
  });

  it('flags values that do not match the suggested format', () => {
    expect(needsAltTextFix('Jas', 'Mayoral - Jas')).toBe(true);
  });
});

describe('isFilenameLikeAlt', () => {
  it('detects common image extensions', () => {
    expect(isFilenameLikeAlt('IMG_1234.JPG')).toBe(true);
    expect(isFilenameLikeAlt('product.webp')).toBe(true);
    expect(isFilenameLikeAlt('Mayoral - Jas')).toBe(false);
  });
});

describe('product alt status', () => {
  it('needs a fix when any gallery image is wrong', () => {
    const item = product({
      brand: 'Mayoral',
      name: 'Jas',
      galleryImages: [
        { id: 1, name: 'Jas - 1 - Babette Oostduinkerke', sequence: 1 },
        { id: 2, name: 'img.png', sequence: 2 },
      ],
    });
    expect(productNeedsAltTextFix(item)).toBe(true);
    expect(productHasCorrectAltText(item)).toBe(false);
  });

  it('is correct when every gallery image matches the suggestion', () => {
    const item = product({
      brand: 'Mayoral',
      name: 'Jas',
      galleryImages: [
        { id: 1, name: 'Jas - 1 - Babette Oostduinkerke', sequence: 1 },
        { id: 2, name: 'Jas - 2 - Babette Oostduinkerke', sequence: 2 },
      ],
    });
    expect(productNeedsAltTextFix(item)).toBe(false);
    expect(productHasCorrectAltText(item)).toBe(true);
  });

  it('is not correct when there are no gallery images', () => {
    const item = product({ name: 'Jas', galleryImages: [] });
    expect(productNeedsAltTextFix(item)).toBe(false);
    expect(productHasCorrectAltText(item)).toBe(false);
  });
});

describe('buildSuggestedUpdates', () => {
  it('builds updates in sequence order and skips values that already match', () => {
    const updates = buildSuggestedUpdates([
      {
        brand: 'Mayoral',
        name: 'Jas',
        galleryImages: [
          { id: 20, name: 'old', sequence: 2 },
          { id: 10, name: 'Jas - 1 - Babette Oostduinkerke', sequence: 1 },
        ],
      },
    ]);
    expect(updates).toEqual([
      { imageId: 20, altText: 'Jas - 2 - Babette Oostduinkerke' },
    ]);
  });

  it('can limit to missing alt texts', () => {
    const updates = buildSuggestedUpdates(
      [
        {
          brand: 'Mayoral',
          name: 'Jas',
          galleryImages: [
            { id: 1, name: 'Jas - 1 - Babette Oostduinkerke', sequence: 1 },
            { id: 2, name: 'foto.jpg', sequence: 2 },
          ],
        },
      ],
      { onlyMissing: true }
    );
    expect(updates).toEqual([
      { imageId: 2, altText: 'Jas - 2 - Babette Oostduinkerke' },
    ]);
  });
});

describe('sortGalleryImages and applyAltTextUpdates', () => {
  it('sorts by sequence then id', () => {
    expect(
      sortGalleryImages([
        { id: 3, sequence: 1 },
        { id: 1, sequence: 1 },
        { id: 2, sequence: 0 },
      ]).map((img) => img.id)
    ).toEqual([2, 1, 3]);
  });

  it('applies new names by image id', () => {
    const next = applyAltTextUpdates(
      [
        { id: 1, name: 'old', sequence: 1 },
        { id: 2, name: 'keep', sequence: 2 },
      ],
      [{ imageId: 1, altText: 'Mayoral - Jas' }]
    );
    expect(next).toEqual([
      { id: 1, name: 'Mayoral - Jas', sequence: 1 },
      { id: 2, name: 'keep', sequence: 2 },
    ]);
  });
});
