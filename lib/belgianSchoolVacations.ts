/**
 * Officiële Belgische schoolvakantieperiodes (kleuter/lager/secundair, Vlaanderen),
 * zoals gepubliceerd op o.a. belgieschoolvakanties.be en vlaanderen.be.
 *
 * **Verkoopsjaar** in deze app: 1 september t/m 31 augustus. Labels zoals `2024-2025`
 * lopen van het eerste tot het tweede kalenderjaar (niet hetzelfde als kalenderjaar).
 */

export const SCHOOL_VACATION_IDS = ['herfst', 'kerst', 'krokus', 'pasen', 'zomer'] as const;
export type SchoolVacationId = (typeof SCHOOL_VACATION_IDS)[number];

export type VacationPeriod = {
  salesYear: string;
  vacationId: SchoolVacationId;
  /** Korte sleutel voor UI/API */
  label: string;
  /**
   * Eerste dag die meetelt voor omzet (inclusief het **weekend direct vóór** de officiële start,
   * zie {@link vacationStartIncludingPriorWeekend}).
   */
  start: string;
  /** Laatste dag (ongewijzigd t.o.v. de officiële kalender). */
  end: string;
  /** Eerste officiële vakantiedag (zonder uitbreiding). */
  officialStart: string;
};

export const VACATION_LABELS: Record<SchoolVacationId, string> = {
  herfst: 'Herfstvakantie',
  kerst: 'Kerstvakantie',
  krokus: 'Krokusvakantie',
  pasen: 'Paasvakantie',
  zomer: 'Zomervakantie',
};

/** Vaste volgorde van rijen in tabellen en grafieken */
export const VACATION_ROW_ORDER: SchoolVacationId[] = [...SCHOOL_VACATION_IDS];

type YearEntry = Record<SchoolVacationId, { start: string; end: string }>;

const BY_SALES_YEAR: Record<string, YearEntry> = {
  '2021-2022': {
    herfst: { start: '2021-11-01', end: '2021-11-07' },
    kerst: { start: '2021-12-27', end: '2022-01-09' },
    krokus: { start: '2022-02-28', end: '2022-03-06' },
    pasen: { start: '2022-04-04', end: '2022-04-18' },
    zomer: { start: '2022-07-01', end: '2022-08-31' },
  },
  '2022-2023': {
    herfst: { start: '2022-10-31', end: '2022-11-06' },
    kerst: { start: '2022-12-26', end: '2023-01-08' },
    krokus: { start: '2023-02-20', end: '2023-02-26' },
    pasen: { start: '2023-04-03', end: '2023-04-16' },
    zomer: { start: '2023-07-01', end: '2023-08-31' },
  },
  '2023-2024': {
    herfst: { start: '2023-10-30', end: '2023-11-05' },
    kerst: { start: '2023-12-25', end: '2024-01-07' },
    krokus: { start: '2024-02-12', end: '2024-02-18' },
    pasen: { start: '2024-04-01', end: '2024-04-14' },
    zomer: { start: '2024-07-01', end: '2024-08-31' },
  },
  '2024-2025': {
    herfst: { start: '2024-10-28', end: '2024-11-03' },
    kerst: { start: '2024-12-23', end: '2025-01-05' },
    krokus: { start: '2025-03-03', end: '2025-03-09' },
    pasen: { start: '2025-04-07', end: '2025-04-21' },
    zomer: { start: '2025-07-01', end: '2025-08-31' },
  },
  '2025-2026': {
    herfst: { start: '2025-10-27', end: '2025-11-02' },
    kerst: { start: '2025-12-22', end: '2026-01-04' },
    krokus: { start: '2026-02-16', end: '2026-02-22' },
    pasen: { start: '2026-04-06', end: '2026-04-19' },
    zomer: { start: '2026-07-01', end: '2026-08-31' },
  },
};

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Verkoopperiode start op de zaterdag van het weekend **direct vóór** de officiële eerste vakantiedag.
 * - Ma–vr: terug tot de zaterdag vóór die week (zo omvat je za–zo vóór een maandagstart).
 * - Zaterdag als start: voeg het voorgaande za–zo-blok toe (start − 7 dagen).
 * - Zondag als start: voeg het volledige weekend daarvoor toe (start − 8 dagen = zaterdag).
 */
export function vacationStartIncludingPriorWeekend(officialStartYmd: string): string {
  const [y, m, d] = officialStartYmd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const dow = start.getDay();

  if (dow === 6) {
    const sat = new Date(start);
    sat.setDate(sat.getDate() - 7);
    return dateToYmd(sat);
  }
  if (dow === 0) {
    const sat = new Date(start);
    sat.setDate(sat.getDate() - 8);
    return dateToYmd(sat);
  }

  let cur = new Date(start);
  cur.setDate(cur.getDate() - 1);
  while (cur.getDay() !== 6) {
    cur.setDate(cur.getDate() - 1);
  }
  return dateToYmd(cur);
}

/** Aantal kalenderdagen in het interval [startYmd, endYmd] (grenzen inclusief). */
export function vacationDaysInclusive(startYmd: string, endYmd: string): number {
  const [y1, m1, d1] = startYmd.split('-').map(Number);
  const [y2, m2, d2] = endYmd.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.floor((t2 - t1) / 86400000) + 1;
}

export function listKnownSalesYears(): string[] {
  return Object.keys(BY_SALES_YEAR).sort();
}

export function isKnownSalesYear(y: string): boolean {
  return y in BY_SALES_YEAR;
}

export function getVacationPeriodsForSalesYears(salesYears: string[]): VacationPeriod[] {
  const out: VacationPeriod[] = [];
  for (const salesYear of salesYears) {
    const entry = BY_SALES_YEAR[salesYear];
    if (!entry) continue;
    for (const vacationId of VACATION_ROW_ORDER) {
      const { start: officialStart, end } = entry[vacationId];
      const start = vacationStartIncludingPriorWeekend(officialStart);
      out.push({
        salesYear,
        vacationId,
        label: VACATION_LABELS[vacationId],
        start,
        end,
        officialStart,
      });
    }
  }
  return out;
}

export function getOverallDateBounds(periods: VacationPeriod[]): { minStart: string; maxEnd: string } | null {
  if (periods.length === 0) return null;
  let minStart = periods[0].start;
  let maxEnd = periods[0].end;
  for (const p of periods) {
    if (p.start < minStart) minStart = p.start;
    if (p.end > maxEnd) maxEnd = p.end;
  }
  return { minStart, maxEnd };
}

/**
 * Verkoopsjaar: 1 september t/m 31 augustus.
 * Alleen voor bekende sleutels in BY_SALES_YEAR.
 */
export function getSalesYearCalendarBounds(salesYear: string): { start: string; end: string } | null {
  if (!(salesYear in BY_SALES_YEAR)) return null;
  const parts = salesYear.split('-');
  if (parts.length !== 2) return null;
  const y1 = parseInt(parts[0], 10);
  const y2 = parseInt(parts[1], 10);
  if (Number.isNaN(y1) || Number.isNaN(y2) || y2 !== y1 + 1) return null;
  return {
    start: `${y1}-09-01`,
    end: `${y2}-08-31`,
  };
}

/** Min/max datum voor alle geselecteerde verkoopsjaren (volledige periode 1 sep – 31 aug). */
export function getOverallSalesYearCalendarBounds(
  salesYears: string[],
): { minStart: string; maxEnd: string } | null {
  let minStart = '';
  let maxEnd = '';
  for (const sy of salesYears) {
    const b = getSalesYearCalendarBounds(sy);
    if (!b) continue;
    if (!minStart || b.start < minStart) minStart = b.start;
    if (!maxEnd || b.end > maxEnd) maxEnd = b.end;
  }
  return minStart && maxEnd ? { minStart, maxEnd } : null;
}
