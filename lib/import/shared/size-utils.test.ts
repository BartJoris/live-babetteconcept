import { describe, it, expect } from 'vitest';
import { convertSize, mapSizeToOdooFormat, determineSizeAttribute, isUnitSize } from './size-utils';

describe('convertSize', () => {
  describe('single EU sizes', () => {
    it('converts 92 to "2 jaar"', () => {
      expect(convertSize('92')).toBe('2 jaar');
    });

    it('converts 68 to "6 maand"', () => {
      expect(convertSize('68')).toBe('6 maand');
    });

    it('converts 104 to "4 jaar"', () => {
      expect(convertSize('104')).toBe('4 jaar');
    });

    it('converts 50 to "0 maand"', () => {
      expect(convertSize('50')).toBe('0 maand');
    });

    it('converts 164 to "14 jaar"', () => {
      expect(convertSize('164')).toBe('14 jaar');
    });
  });

  describe('dual EU sizes', () => {
    it('converts 110/116 to "6 jaar" (uses larger)', () => {
      expect(convertSize('110/116')).toBe('6 jaar');
    });

    it('converts 92/98 to "3 jaar"', () => {
      expect(convertSize('92/98')).toBe('3 jaar');
    });

    it('converts 56/62 to "3 maand"', () => {
      expect(convertSize('56/62')).toBe('3 maand');
    });
  });

  describe('Y suffix (years)', () => {
    it('converts 3Y to "3 jaar"', () => {
      expect(convertSize('3Y')).toBe('3 jaar');
    });

    it('converts 10Y to "10 jaar"', () => {
      expect(convertSize('10Y')).toBe('10 jaar');
    });

    it('is case-insensitive', () => {
      expect(convertSize('5y')).toBe('5 jaar');
    });
  });

  describe('M suffix (months)', () => {
    it('converts 6M to "6 maand"', () => {
      expect(convertSize('6M')).toBe('6 maand');
    });

    it('converts 18M to "18 maand"', () => {
      expect(convertSize('18M')).toBe('18 maand');
    });

    it('is case-insensitive', () => {
      expect(convertSize('3m')).toBe('3 maand');
    });
  });

  describe('ranges', () => {
    it('converts 3-5Y to "5 jaar" (uses upper)', () => {
      expect(convertSize('3-5Y')).toBe('5 jaar');
    });

    it('converts 9-24M to "24 maand"', () => {
      expect(convertSize('9-24M')).toBe('24 maand');
    });

    it('converts mixed range 18M-2Y to "2 jaar"', () => {
      expect(convertSize('18M-2Y')).toBe('2 jaar');
    });
  });

  describe('one-size variants', () => {
    it('converts ONE SIZE to "U"', () => {
      expect(convertSize('ONE SIZE')).toBe('U');
    });

    it('converts OS to "U"', () => {
      expect(convertSize('OS')).toBe('U');
    });

    it('converts TU to "U"', () => {
      expect(convertSize('TU')).toBe('U');
    });
  });

  describe('Floss dual format (EU/age)', () => {
    it('converts 56/1M to "1 maand"', () => {
      expect(convertSize('56/1M')).toBe('1 maand');
    });

    it('converts 92/2Y to "2 jaar"', () => {
      expect(convertSize('92/2Y')).toBe('2 jaar');
    });

    it('converts 68/6M to "6 maand"', () => {
      expect(convertSize('68/6M')).toBe('6 maand');
    });

    it('converts 110/5Y-116/6Y to "6 jaar"', () => {
      expect(convertSize('110/5Y-116/6Y')).toBe('6 jaar');
    });
  });

  describe('passthrough cases', () => {
    it('returns empty/falsy input as-is', () => {
      expect(convertSize('')).toBe('');
    });

    it('returns unknown sizes as-is', () => {
      expect(convertSize('XL')).toBe('XL');
    });

    it('returns shoe sizes as-is', () => {
      expect(convertSize('38')).toBe('38');
    });
  });
});

describe('mapSizeToOdooFormat', () => {
  it('maps XS to "XS - 34"', () => {
    expect(mapSizeToOdooFormat('XS')).toBe('XS - 34');
  });

  it('maps M to "M - 38"', () => {
    expect(mapSizeToOdooFormat('M')).toBe('M - 38');
  });

  it('maps L to "L - 40"', () => {
    expect(mapSizeToOdooFormat('L')).toBe('L - 40');
  });

  it('maps XXS to "XXS - 32"', () => {
    expect(mapSizeToOdooFormat('XXS')).toBe('XXS - 32');
  });

  it('maps XXL to "XXL - 44"', () => {
    expect(mapSizeToOdooFormat('XXL')).toBe('XXL - 44');
  });

  it('is case-insensitive', () => {
    expect(mapSizeToOdooFormat('xs')).toBe('XS - 34');
    expect(mapSizeToOdooFormat('m')).toBe('M - 38');
  });

  it('already-mapped stays the same', () => {
    expect(mapSizeToOdooFormat('M - 38')).toBe('M - 38');
    expect(mapSizeToOdooFormat('XS - 34')).toBe('XS - 34');
  });

  it('returns unknown sizes unchanged', () => {
    expect(mapSizeToOdooFormat('XXXL')).toBe('XXXL');
    expect(mapSizeToOdooFormat('42')).toBe('42');
  });

  it('handles empty input', () => {
    expect(mapSizeToOdooFormat('')).toBe('');
  });
});

describe('determineSizeAttribute', () => {
  describe('baby sizes', () => {
    it('returns "MAAT Baby\'s" for month sizes', () => {
      expect(determineSizeAttribute('6 maand')).toBe("MAAT Baby's");
      expect(determineSizeAttribute('3M')).toBe("MAAT Baby's");
    });

    it('returns "MAAT Baby\'s" for dual month format', () => {
      expect(determineSizeAttribute('56/1m')).toBe("MAAT Baby's");
    });
  });

  describe('kids sizes', () => {
    it('returns "MAAT Kinderen" for year sizes under 10', () => {
      expect(determineSizeAttribute('3 jaar')).toBe('MAAT Kinderen');
      expect(determineSizeAttribute('8 jaar')).toBe('MAAT Kinderen');
    });

    it('returns "MAAT Kinderen" for Y sizes under 10', () => {
      expect(determineSizeAttribute('5Y')).toBe('MAAT Kinderen');
    });

    it('returns "MAAT Kinderen" for kid number sizes', () => {
      expect(determineSizeAttribute('3/4')).toBe('MAAT Kinderen');
      expect(determineSizeAttribute('5/6')).toBe('MAAT Kinderen');
    });
  });

  describe('teen sizes', () => {
    it('returns "MAAT Tieners" for year sizes >= 10', () => {
      expect(determineSizeAttribute('10 jaar')).toBe('MAAT Tieners');
      expect(determineSizeAttribute('14 jaar')).toBe('MAAT Tieners');
    });

    it('returns "MAAT Tieners" for Y sizes >= 10', () => {
      expect(determineSizeAttribute('12Y')).toBe('MAAT Tieners');
    });

    it('returns "MAAT Tieners" for special teen patterns', () => {
      expect(determineSizeAttribute('11/12')).toBe('MAAT Tieners');
      expect(determineSizeAttribute('13/14')).toBe('MAAT Tieners');
    });
  });

  describe('adult sizes', () => {
    it('returns "MAAT Volwassenen" for letter sizes', () => {
      expect(determineSizeAttribute('XS')).toBe('MAAT Volwassenen');
      expect(determineSizeAttribute('M')).toBe('MAAT Volwassenen');
      expect(determineSizeAttribute('XXL')).toBe('MAAT Volwassenen');
    });
  });

  describe('array input', () => {
    it('uses first variant size from array', () => {
      expect(determineSizeAttribute([{ size: '6 maand' }])).toBe("MAAT Baby's");
      expect(determineSizeAttribute([{ size: 'M' }])).toBe('MAAT Volwassenen');
    });

    it('defaults to "MAAT Kinderen" for empty array', () => {
      expect(determineSizeAttribute([])).toBe('MAAT Kinderen');
    });
  });

  describe('fallback', () => {
    it('defaults to "MAAT Kinderen" for empty string', () => {
      expect(determineSizeAttribute('')).toBe('MAAT Kinderen');
    });
  });
});

describe('isUnitSize', () => {
  it('returns true for UNIT', () => {
    expect(isUnitSize('UNIT')).toBe(true);
  });

  it('returns true for U', () => {
    expect(isUnitSize('U')).toBe(true);
  });

  it('returns true for TU', () => {
    expect(isUnitSize('TU')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isUnitSize('unit')).toBe(true);
    expect(isUnitSize('tu')).toBe(true);
  });

  it('handles whitespace', () => {
    expect(isUnitSize(' U ')).toBe(true);
  });

  it('returns false for regular sizes', () => {
    expect(isUnitSize('S')).toBe(false);
    expect(isUnitSize('M')).toBe(false);
    expect(isUnitSize('92')).toBe(false);
  });
});
