import { convertSize } from '@/lib/import/shared';

const SEASON_PREFIXES = new Set(['I26', 'MV26']);

/**
 * Build map key `${ref}|${dutchSize}` → EAN from Mipounet EAN CSV.
 * SKU: I26.{model}.{fabric}.{color}.{size} or legacy MV26.…
 */
export function buildMipounetEanMap(text: string): Map<string, string> {
  const lines = text.trim().split('\n');
  const eanMap = new Map<string, string>();

  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].toUpperCase().includes('SKU') && lines[i].toUpperCase().includes('EAN')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return eanMap;

  const headers = lines[headerIdx].split(';').map((h) => h.trim().toUpperCase());
  const skuIdx = headers.findIndex((h) => h === 'SKU');
  const eanIdx = headers.findIndex((h) => h.includes('EAN'));
  if (skuIdx === -1 || eanIdx === -1) return eanMap;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';').map((c) => c.trim());
    const sku = cols[skuIdx] || '';
    const ean = cols[eanIdx] || '';
    if (!sku || !ean) continue;

    const parts = sku.split('.');
    if (parts.length < 5 || !SEASON_PREFIXES.has(parts[0].toUpperCase())) continue;

    const model = parts[1];
    const color = parts[3];
    const sizeCode = parts.slice(4).join('.');
    const ref = `${model}.${color}`;

    let convertedSize: string;
    if (/^[SML]$/i.test(sizeCode)) {
      convertedSize = sizeCode.toUpperCase();
    } else {
      convertedSize = convertSize(sizeCode);
    }

    eanMap.set(`${ref}|${convertedSize}`, ean);
  }

  return eanMap;
}

export function isMipounetEanCsv(text: string): boolean {
  const upper = text.slice(0, 800).toUpperCase();
  if (!(upper.includes('SKU') && upper.includes('EAN'))) return false;
  return upper.includes('I26') || upper.includes('MV26');
}
