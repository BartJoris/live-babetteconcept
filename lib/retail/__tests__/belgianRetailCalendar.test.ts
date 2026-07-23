import { describe, expect, it } from 'vitest';
import {
  getRetailCalendar,
  getSummerSoldenStart,
  getWinterSoldenStart,
  getWinterSperperiodeRange,
  getSummerSperperiodeRange,
  resolvePeriodPreset,
  classifyDateInYear,
} from '@/lib/retail/belgianRetailCalendar';

describe('belgianRetailCalendar', () => {
  it('starts winter solden on 3 Jan when 3 Jan is not Sunday', () => {
    // 2025-01-03 is Friday
    expect(getWinterSoldenStart(2025)).toBe('2025-01-03');
  });

  it('starts winter solden on 2 Jan when 3 Jan is Sunday', () => {
    // 2027-01-03 is Sunday
    expect(getWinterSoldenStart(2027)).toBe('2027-01-02');
  });

  it('starts summer solden on 1 Jul when 1 Jul is not Sunday', () => {
    // 2025-07-01 is Tuesday
    expect(getSummerSoldenStart(2025)).toBe('2025-07-01');
  });

  it('starts summer solden on 30 Jun when 1 Jul is Sunday', () => {
    // 2029-07-01 is Sunday
    expect(getSummerSoldenStart(2029)).toBe('2029-06-30');
  });

  it('builds winter sperperiode ending day before solden', () => {
    const range = getWinterSperperiodeRange(2025);
    expect(range.start).toBe('2024-12-03');
    expect(range.end).toBe('2025-01-02');
  });

  it('shifts winter sperperiode earlier when solden start early', () => {
    const range = getWinterSperperiodeRange(2027);
    expect(range.start).toBe('2026-12-02');
    expect(range.end).toBe('2027-01-01');
  });

  it('builds summer sperperiode for normal year', () => {
    const range = getSummerSperperiodeRange(2025);
    expect(range.start).toBe('2025-06-01');
    expect(range.end).toBe('2025-06-30');
  });

  it('shifts summer sperperiode when solden start on 30 Jun', () => {
    const range = getSummerSperperiodeRange(2029);
    expect(range.start).toBe('2029-05-31');
    expect(range.end).toBe('2029-06-29');
  });

  it('returns full calendar with season bounds', () => {
    const cal = getRetailCalendar(2025);
    expect(cal.winterSeason).toEqual({ start: '2025-01-03', end: '2025-06-30' });
    expect(cal.summerSeason).toEqual({ start: '2025-07-01', end: '2025-12-31' });
    expect(cal.duringSummerSales).toEqual(cal.summerSolden);
    expect(cal.notes.length).toBeGreaterThan(0);
  });

  it('resolves year_to_date up to provided now', () => {
    const range = resolvePeriodPreset(
      'year_to_date',
      2026,
      new Date(2026, 6, 22) // 22 Jul 2026
    );
    expect(range).toEqual({ start: '2026-01-01', end: '2026-07-22' });
  });

  it('classifies solden vs regular days', () => {
    expect(classifyDateInYear('2025-01-10', 2025)).toBe('winterSales');
    expect(classifyDateInYear('2025-03-15', 2025)).toBe('winterRegular');
    expect(classifyDateInYear('2025-07-10', 2025)).toBe('summerSales');
    expect(classifyDateInYear('2025-09-01', 2025)).toBe('summerRegular');
  });
});
