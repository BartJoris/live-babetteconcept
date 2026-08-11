import { describe, expect, it } from 'vitest';
import {
  categoryPathExists,
  findCategoriesMatchingBrand,
  normalizeCategoryPath,
  resolveTypedCategoryPath,
  suggestCategoriesForBrand,
} from './category-suggest';

const categories = [
  { id: 1, name: 'All', complete_name: 'All' },
  { id: 10, name: 'Kleding', complete_name: 'All / Kleding' },
  { id: 11, name: "Baby's", complete_name: "All / Kleding / Baby's" },
  { id: 12, name: 'Kinderen', complete_name: 'All / Kleding / Kinderen' },
  { id: 20, name: 'AW26', complete_name: 'All / AW26' },
  { id: 265, name: 'Jelly Mallow', complete_name: 'All / Kleding / Jelly Mallow' },
  { id: 280, name: 'Nixnut', complete_name: 'All / Nixnut' },
];

describe('normalizeCategoryPath', () => {
  it('normalizes slashes and spaces', () => {
    expect(normalizeCategoryPath('All/Kleding/Baje')).toBe('All / Kleding / Baje');
    expect(normalizeCategoryPath('  All /  Nixnut  ')).toBe('All / Nixnut');
  });
});

describe('categoryPathExists', () => {
  it('finds exact path case-insensitively', () => {
    expect(categoryPathExists('all / nixnut', categories)?.id).toBe(280);
    expect(categoryPathExists('All / Missing', categories)).toBeUndefined();
  });
});

describe('findCategoriesMatchingBrand', () => {
  it('matches leaf and nested brand paths', () => {
    const matches = findCategoriesMatchingBrand('Jelly Mallow', categories);
    expect(matches.map((c) => c.id)).toEqual([265]);
  });
});

describe('suggestCategoriesForBrand', () => {
  it('lists existing match first, then AW26 / Kleding / All proposals', () => {
    const suggestions = suggestCategoriesForBrand('Nixnut', categories);
    expect(suggestions[0]).toMatchObject({
      path: 'All / Nixnut',
      isNew: false,
      existing: expect.objectContaining({ id: 280 }),
    });
    expect(suggestions.some((s) => s.path === 'All / AW26 / Nixnut' && s.isNew)).toBe(
      true,
    );
    expect(suggestions.some((s) => s.path === 'All / Kleding / Nixnut' && s.isNew)).toBe(
      true,
    );
  });

  it('prefers Baby path when size attribute is MAAT Baby\'s', () => {
    const suggestions = suggestCategoriesForBrand('Baje', categories, {
      sizeAttribute: "MAAT Baby's",
    });
    expect(
      suggestions.some((s) => s.path === "All / Kleding / Baby's / Baje"),
    ).toBe(true);
  });

  it('does not invent parents that are missing', () => {
    const sparse = [{ id: 1, name: 'All', complete_name: 'All' }];
    const suggestions = suggestCategoriesForBrand('Baje', sparse);
    expect(suggestions.map((s) => s.path)).toEqual(['All / Baje']);
  });
});

describe('resolveTypedCategoryPath', () => {
  it('wraps bare names under Kleding when available', () => {
    expect(resolveTypedCategoryPath('Baje', categories)).toBe('All / Kleding / Baje');
  });

  it('keeps full paths and prefixes All when needed', () => {
    expect(resolveTypedCategoryPath('Kleding / Baje', categories)).toBe(
      'All / Kleding / Baje',
    );
    expect(resolveTypedCategoryPath('All / AW26 / Baje', categories)).toBe(
      'All / AW26 / Baje',
    );
  });
});
