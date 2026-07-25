/**
 * Emile et Ida size format: 02A -> 2 jaar, 03M -> 3 maand, TU -> U,
 * 06-18M -> 6 - 18 maand, 02A-04A -> 2 - 4 jaar
 */
export function convertEmileetidaSize(size: string): string {
  if (!size) return '';
  const upper = size.toUpperCase().trim();

  if (upper === 'TU') return 'U';

  const monthRange = upper.match(/^(\d+)-(\d+)M$/);
  if (monthRange) {
    return `${parseInt(monthRange[1], 10)} - ${parseInt(monthRange[2], 10)} maand`;
  }

  const yearRange = upper.match(/^(\d+)A-(\d+)A$/);
  if (yearRange) {
    return `${parseInt(yearRange[1], 10)} - ${parseInt(yearRange[2], 10)} jaar`;
  }

  const singleYear = upper.match(/^(\d+)A$/);
  if (singleYear) return `${parseInt(singleYear[1], 10)} jaar`;

  const singleMonth = upper.match(/^(\d+)M$/);
  if (singleMonth) return `${parseInt(singleMonth[1], 10)} maand`;

  return size;
}
