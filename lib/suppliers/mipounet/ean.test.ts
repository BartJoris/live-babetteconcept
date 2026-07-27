import { describe, expect, it } from 'vitest';
import { buildMipounetEanMap, isMipounetEanCsv } from './ean';

const I26_CSV = `SKU;EAN
I26.271.JER007.23.2Y;8436589000001
I26.271.JER007.23.4Y;8436589000002
I26.130.JER005.23.2Y;8436589000003
MV26.1131.JER001.04.2Y;8436589000004
`;

describe('isMipounetEanCsv', () => {
  it('detects I26 EAN files', () => {
    expect(isMipounetEanCsv(I26_CSV)).toBe(true);
  });

  it('rejects order export', () => {
    expect(
      isMipounetEanCsv('Product reference;Product name;EAN13\n271.23;Shirt;'),
    ).toBe(false);
  });
});

describe('buildMipounetEanMap', () => {
  it('maps I26 and MV26 SKUs to ref|size', () => {
    const map = buildMipounetEanMap(I26_CSV);
    expect(map.get('271.23|2 jaar')).toBe('8436589000001');
    expect(map.get('271.23|4 jaar')).toBe('8436589000002');
    expect(map.get('130.23|2 jaar')).toBe('8436589000003');
    expect(map.get('1131.04|2 jaar')).toBe('8436589000004');
  });
});
