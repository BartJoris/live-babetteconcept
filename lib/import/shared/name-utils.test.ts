import { describe, it, expect } from 'vitest';
import { toTitleCase, toSentenceCase, formatProductName } from './name-utils';

describe('toTitleCase', () => {
  it('capitalizes first letter of each word', () => {
    expect(toTitleCase('bear fleece jacket')).toBe('Bear Fleece Jacket');
  });

  it('handles all uppercase input', () => {
    expect(toTitleCase('BEAR FLEECE JACKET')).toBe('Bear Fleece Jacket');
  });

  it('handles mixed case', () => {
    expect(toTitleCase('bEaR fLeEcE jACKET')).toBe('Bear Fleece Jacket');
  });

  it('handles single word', () => {
    expect(toTitleCase('jacket')).toBe('Jacket');
  });

  it('handles extra spaces between words', () => {
    expect(toTitleCase('bear  fleece   jacket')).toBe('Bear Fleece Jacket');
  });
});

describe('toSentenceCase', () => {
  it('capitalizes only first letter', () => {
    expect(toSentenceCase('BEAR FLEECE JACKET')).toBe('Bear fleece jacket');
  });

  it('handles already lowercase input', () => {
    expect(toSentenceCase('bear fleece jacket')).toBe('Bear fleece jacket');
  });

  it('handles single character', () => {
    expect(toSentenceCase('a')).toBe('A');
  });

  it('returns empty/falsy input as-is', () => {
    expect(toSentenceCase('')).toBe('');
  });
});

describe('formatProductName', () => {
  it('substitutes template placeholders', () => {
    const result = formatProductName(
      '{brand} - {name} - {color}',
      { brand: 'Flöss', name: 'Fresa Onesie', color: 'Blue Violet' }
    );
    expect(result).toBe('Flöss - Fresa Onesie - Blue Violet');
  });

  it('cleans up trailing separators from empty values', () => {
    const result = formatProductName(
      '{brand} - {name} - {color}',
      { brand: 'Flöss', name: 'Fresa Onesie', color: '' }
    );
    expect(result).toBe('Flöss - Fresa Onesie');
  });

  it('applies title casing option', () => {
    const result = formatProductName(
      '{brand} - {name}',
      { brand: 'flöss', name: 'fresa onesie' },
      { brand: 'title', name: 'title' }
    );
    expect(result).toBe('Flöss - Fresa Onesie');
  });

  it('applies sentence casing option', () => {
    const result = formatProductName(
      '{name}',
      { name: 'BEAR FLEECE JACKET' },
      { name: 'sentence' }
    );
    expect(result).toBe('Bear fleece jacket');
  });

  it('none casing preserves original case', () => {
    const result = formatProductName(
      '{name}',
      { name: 'BEAR FLEECE' },
      { name: 'none' }
    );
    expect(result).toBe('BEAR FLEECE');
  });

  it('cleans trailing separator when last placeholder is empty', () => {
    const result = formatProductName(
      '{brand} - {name}',
      { brand: 'Test', name: '' }
    );
    expect(result).toBe('Test');
  });

  it('collapses consecutive separators from multiple empty values', () => {
    const result = formatProductName(
      '{brand} - {name} - {color}',
      { brand: 'Test', name: '', color: '' }
    );
    expect(result).toBe('Test -');
  });
});
