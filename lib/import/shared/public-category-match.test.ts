import { describe, expect, it } from 'vitest';
import {
  buildPublicCategoryPathMap,
  matchPublicCategoriesByPaths,
  normalizePublicCategoryPath,
  splitPublicCategoryPaths,
} from './public-category-match';

const categories = [
  { id: 1, name: 'Speelgoed', parent_id: false as const },
  { id: 2, name: 'Boeken', parent_id: [1, 'Speelgoed'] as [number, string] },
  { id: 3, name: 'Op leeftijd', parent_id: [1, 'Speelgoed'] as [number, string] },
  { id: 4, name: '3 jaar', parent_id: [3, 'Op leeftijd'] as [number, string] },
  { id: 5, name: '4–5 jaar', parent_id: [3, 'Op leeftijd'] as [number, string] },
  { id: 6, name: '0–12 maand', parent_id: [3, 'Op leeftijd'] as [number, string] },
];

describe('normalizePublicCategoryPath', () => {
  it('normalizes slashes and en-dashes', () => {
    expect(normalizePublicCategoryPath('Speelgoed / Op leeftijd / 4–5 jaar')).toBe(
      'speelgoed / op leeftijd / 4-5 jaar',
    );
  });
});

describe('buildPublicCategoryPathMap', () => {
  it('builds nested paths from parent_id', () => {
    const map = buildPublicCategoryPathMap(categories);
    expect(map.get(2)).toBe('Speelgoed / Boeken');
    expect(map.get(4)).toBe('Speelgoed / Op leeftijd / 3 jaar');
    expect(map.get(5)).toBe('Speelgoed / Op leeftijd / 4–5 jaar');
  });
});

describe('matchPublicCategoriesByPaths', () => {
  it('matches exact paths including en-dash variants', () => {
    const matched = matchPublicCategoriesByPaths(
      [
        'Speelgoed / Boeken',
        'Speelgoed / Op leeftijd / 3 jaar',
        'Speelgoed / Op leeftijd / 4-5 jaar',
      ],
      categories,
    );
    expect(matched.map((m) => m.id).sort()).toEqual([2, 4, 5]);
  });

  it('dedupes and ignores unknown paths', () => {
    const matched = matchPublicCategoriesByPaths(
      ['Speelgoed / Boeken', 'Speelgoed / Boeken', 'Onbekend / Pad'],
      categories,
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe(2);
  });
});

describe('splitPublicCategoryPaths', () => {
  it('splits comma-separated ecommerce category cells', () => {
    expect(
      splitPublicCategoryPaths(
        'Speelgoed / Boeken, Speelgoed / Op leeftijd / 3 jaar, Speelgoed / Op leeftijd / 4–5 jaar',
      ),
    ).toEqual([
      'Speelgoed / Boeken',
      'Speelgoed / Op leeftijd / 3 jaar',
      'Speelgoed / Op leeftijd / 4–5 jaar',
    ]);
  });
});
