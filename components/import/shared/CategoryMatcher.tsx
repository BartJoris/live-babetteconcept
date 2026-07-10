import type { Category } from './types';

const CSV_CATEGORY_TO_DUTCH: Record<string, string[]> = {
  'ACCESSORIES': ['Accessoires', 'Tassen', 'Hoeden'],
  'SHOES': ['Schoenen'],
  'TEE SHIRTS': ['T-shirts', 'Tops'],
  'CARDIGAN & PULLOVER': ['Truien', 'Vesten', 'Cardigans'],
  'DRESSES': ['Jurken'],
  'SKIRTS': ['Rokken'],
  'SHORTS': ['Shorts'],
  'SWEATSHIRTS': ['Sweaters', 'Truien'],
  'BLOUSES': ['Blouses', 'Tops', 'Hemden'],
  'BLOOMERS': ['Broeken', 'Broekjes'],
  'TROUSERS': ['Broeken'],
  'JUMPSUITS': ['Jumpsuits', 'Pakjes'],
  'DRESS': ['Jurken'],
  'SKIRT': ['Rokken'],
  'BLOUSE': ['Blouses', 'Tops', 'Hemden'],
  'SHIRT': ['Hemden', 'Tops', 'Blouses'],
  'SWEATER': ['Sweaters', 'Truien'],
  'JACKET': ['Jassen', 'Vesten'],
  'PANTS': ['Broeken'],
  'LEGGINGS': ['Leggings', 'Broeken'],
  'ONESIE': ['Pakjes', 'Bodysuits'],
  'SET': ['Sets', 'Pakjes'],
  'SOCKS': ['Sokken', 'Accessoires'],
  'BUCKET HAT': ['Hoeden', 'Accessoires'],
  'SUN HAT': ['Hoeden', 'Accessoires'],
};

export function findMatchingPublicCategories(
  csvCategory: string | undefined,
  sizeAttribute: string | undefined,
  publicCategories: Array<{ id: number; name: string; display_name?: string }>,
): Array<{ id: number; name: string }> {
  if (!csvCategory) return [];

  const upperCategory = csvCategory.toUpperCase().trim();
  const searchTerms = CSV_CATEGORY_TO_DUTCH[upperCategory];

  if (!searchTerms) {
    console.log(`⚠️ No mapping found for CSV category: ${csvCategory}`);
    return [];
  }

  let ageGroupFilter: string | null = null;
  if (sizeAttribute === "MAAT Baby's") {
    ageGroupFilter = 'baby';
  } else if (
    sizeAttribute === 'MAAT Kinderen' ||
    sizeAttribute === 'MAAT Tieners'
  ) {
    ageGroupFilter = 'kinderen';
  }

  const matches = publicCategories.filter((cat) => {
    const catName = (cat.display_name || cat.name).toLowerCase();
    const matchesSearchTerm = searchTerms.some((term) =>
      catName.includes(term.toLowerCase()),
    );

    if (!ageGroupFilter) {
      return matchesSearchTerm;
    }

    const matchesAgeGroup =
      catName.includes(ageGroupFilter) &&
      !catName.includes('dames') &&
      !catName.includes('heren');

    return matchesSearchTerm && matchesAgeGroup;
  });

  if (matches.length > 0) {
    console.log(
      `✅ Found ${matches.length} matching categories for "${csvCategory}" (${sizeAttribute}): ${matches.map((m) => m.display_name || m.name).join(', ')}`,
    );
  } else {
    console.log(
      `⚠️ No categories found for "${csvCategory}" (${sizeAttribute})`,
    );
  }

  return matches.map((m) => ({ id: m.id, name: m.display_name || m.name }));
}

export { CSV_CATEGORY_TO_DUTCH };
export type { Category };
