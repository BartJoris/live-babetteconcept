/**
 * Parse Emile & Ida product image filenames.
 *
 * Supported formats:
 * - Legacy kids: AD008-creme-01.jpg, AD207B-lizeron-BB.jpg
 * - Accessories: AEBANANA1-vichy-acajou.jpg, AE119-BB-blush-01.jpg
 * - Woman / IDA: IDA-EARL-farine-01.jpg, IDA-ELEA-MARS.jpg, IDA-ELLEN-rayure beige-01.jpg
 * - Lifestyle: "EMILE IDA E26 AD019 AD009 … (1).jpg"
 */

export type EmileetidaImageInfo = {
  ref: string;
  color: string;
  isLifestyle: boolean;
  imageNumber: number;
};

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Normalize color tokens for fuzzy matching (spaces/hyphens stripped). */
export function normalizeEmileetidaColor(color: string): string {
  return color
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_\s]+/g, '')
    .replace(/rouge$/g, '')
    .replace(/clair$/g, '')
    .replace(/light$/g, '');
}

const COLOR_ALIASES: Record<string, string> = {
  denimbleach: 'denimbleu',
  bleach: 'bleu',
  rasalie: 'rosalie',
  rosemarie: 'rosemary',
  guariguette: 'gariguette',
  gariguette: 'gariguette',
  noirvenise: 'noirvernise',
  noirvernis: 'noirvernise',
  // Supplier CSV typo seen in AW26 orders
  helsinski: 'helsinki',
};

export function aliasEmileetidaColor(normalized: string): string {
  return COLOR_ALIASES[normalized] || normalized;
}

export function colorsMatchEmileetida(
  productColor: string,
  imageColor: string,
): boolean {
  const a = aliasEmileetidaColor(normalizeEmileetidaColor(productColor));
  const b = aliasEmileetidaColor(normalizeEmileetidaColor(imageColor));
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Product reference prefix in filenames:
 * IDA-EDOUNIA1, AE119, AEBANANA1, AD207B
 */
const REF_PATTERN = /^(IDA-[A-Z0-9]+|AE[A-Z0-9]+|AD[A-Z0-9]+)/i;

export function extractEmileetidaImageInfo(
  filename: string,
): EmileetidaImageInfo {
  const upperName = filename.toUpperCase();
  const isLifestyle =
    upperName.startsWith('EMILE ') || upperName.startsWith('EMILE_');

  if (isLifestyle) {
    return extractLifestyleInfo(filename);
  }

  if (!IMAGE_EXT.test(filename) && !filename.includes('.')) {
    // allow bare basenames in tests
  }

  const baseName = filename.replace(IMAGE_EXT, '').replace(/_tmp\d+$/i, '');

  // Trailing image index: -01, -1, _01
  let imageNumber = 0;
  let withoutNumber = baseName;
  const trailingNum = baseName.match(/(?:-|_)(\d+)$/);
  if (trailingNum) {
    imageNumber = parseInt(trailingNum[1], 10);
    withoutNumber = baseName.slice(0, -trailingNum[0].length);
  }

  const refMatch = withoutNumber.match(REF_PATTERN);
  if (!refMatch) {
    return { ref: '', color: '', isLifestyle: false, imageNumber };
  }

  const ref = refMatch[1].toUpperCase();
  let remainder = withoutNumber.slice(refMatch[0].length);

  // Leading separator after ref
  remainder = remainder.replace(/^[-_\s]+/, '');

  // Optional BB marker segment: -BB- or _BB_ or trailing -BB
  remainder = remainder.replace(/^BB[-_\s]+/i, '').replace(/[-_\s]+BB$/i, '');

  const color = remainder.replace(/_/g, ' ').trim();

  return {
    ref,
    color,
    isLifestyle: false,
    imageNumber,
  };
}

function extractLifestyleInfo(filename: string): EmileetidaImageInfo {
  const baseName = filename
    .replace(IMAGE_EXT, '')
    .replace(/\s*\(\d+[°]?\)\s*$/, '')
    .replace(/\s*\(\d+\s*$/, '');

  const refs: string[] = [];
  const parts = baseName.split(/\s+/);

  for (const part of parts) {
    const upper = part.toUpperCase();
    if (['EMILE', 'IDA', 'E26', 'E25', 'AW26', 'FW26', 'SS26'].includes(upper)) {
      continue;
    }
    if (/^(AD|AE)[A-Z0-9]+$/i.test(upper) || /^IDA-[A-Z0-9]+$/i.test(upper)) {
      refs.push(upper);
    }
  }

  const parenMatch = filename.match(/\((\d+)\)/);
  const imageNumber = parenMatch ? parseInt(parenMatch[1], 10) : 0;

  return {
    ref: refs[0] || '',
    color: '',
    isLifestyle: true,
    imageNumber,
  };
}

/** Extract all product references mentioned in a filename (scan API). */
export function extractEmileetidaReferences(filename: string): string[] {
  const info = extractEmileetidaImageInfo(filename);
  if (info.ref) return [info.ref];

  const refs = new Set<string>();
  const base = filename.replace(IMAGE_EXT, '');
  const re = /\b(IDA-[A-Z0-9]+|AE[A-Z0-9]+|AD[A-Z0-9]+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(base)) !== null) {
    refs.add(m[1].toUpperCase());
  }
  return Array.from(refs);
}
