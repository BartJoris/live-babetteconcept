import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  brusselsTodayYmd,
  brusselsYmdFromOdooDateOrder,
  dayLabelForYmd,
  groupOrdersByDay,
  isOdooDateOnBrusselsDay,
} from '@/lib/posDashboardDays';

describe('posDashboardDays', () => {
  it('maps Odoo UTC-naive date_order to a Brussels calendar day (winter CET)', () => {
    expect(brusselsYmdFromOdooDateOrder('2026-11-09 12:00:00')).toBe('2026-11-09');
    // 23:30 UTC = 00:30 Brussels next calendar day
    expect(brusselsYmdFromOdooDateOrder('2026-11-08 23:30:00')).toBe('2026-11-09');
  });

  it('maps Odoo UTC-naive date_order across the CEST midnight boundary', () => {
    // 22:30 UTC = 00:30 Brussels (UTC+2)
    expect(brusselsYmdFromOdooDateOrder('2026-08-28 22:30:00')).toBe('2026-08-29');
    expect(brusselsYmdFromOdooDateOrder('2026-08-28 21:30:00')).toBe('2026-08-28');
  });

  it('labels relative calendar days and falls back to dd/mm', () => {
    expect(dayLabelForYmd('2026-11-09', '2026-11-09')).toBe('Vandaag');
    expect(dayLabelForYmd('2026-11-08', '2026-11-09')).toBe('Gisteren');
    expect(dayLabelForYmd('2026-11-07', '2026-11-09')).toBe('Eergisteren');
    expect(dayLabelForYmd('2026-11-05', '2026-11-09')).toBe('05/11');
    expect(addCalendarDays('2026-11-01', -1)).toBe('2026-10-31');
  });

  it('groups orders newest day first and sums each day', () => {
    const buckets = groupOrdersByDay(
      [
        { id: 1, timestamp: '2026-11-08 12:00:00', total: 50 },
        { id: 2, timestamp: '2026-11-09 15:00:00', total: 20 },
        { id: 3, timestamp: '2026-11-09 16:00:00', total: 10 },
        { id: 4, timestamp: '2026-11-05 10:00:00', total: 5 },
      ],
      '2026-11-09',
    );

    expect(buckets.map((b) => b.label)).toEqual(['Vandaag', 'Gisteren', '05/11']);
    expect(buckets[0].total).toBe(30);
    expect(buckets[0].orders.map((o) => o.timestamp)).toEqual([
      '2026-11-09 16:00:00',
      '2026-11-09 15:00:00',
    ]);
    expect(buckets[1].total).toBe(50);
    expect(isOdooDateOnBrusselsDay('2026-11-09 08:00:00', '2026-11-09')).toBe(true);
    expect(isOdooDateOnBrusselsDay('2026-11-08 12:00:00', '2026-11-09')).toBe(false);
  });

  it('returns today as a Brussels YMD', () => {
    expect(brusselsTodayYmd(new Date('2026-11-09T10:00:00.000Z'))).toBe('2026-11-09');
  });
});
