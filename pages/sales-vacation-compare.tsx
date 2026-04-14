import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  listKnownSalesYears,
  VACATION_LABELS,
  VACATION_ROW_ORDER,
  type SchoolVacationId,
} from '@/lib/belgianSchoolVacations';

const formatBE = (amount: number) =>
  amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateBE = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

type PeriodRow = {
  salesYear: string;
  vacationId: SchoolVacationId;
  label: string;
  start: string;
  end: string;
  /** Eerste officiële vakantiedag (omzetperiode start eerder, weekend ervoor inbegrepen). */
  officialStart?: string;
  vacationDays?: number;
  omzet: number;
  orderCount: number;
  /** Cumulatieve omzet: index i = eerste i+1 kalenderdagen vanaf start (API; ontbreekt → val terug op volledige periode). */
  prefixOmzet?: number[];
  marge?: number;
  prefixMarge?: number[];
};

type YearMetric = {
  omzet: number;
  orderCount: number;
  marge?: number;
};

type YearTotalRow = {
  salesYear: string;
  jaarStart: string;
  jaarEnd: string;
  totalVacationDays: number;
  totaalJaar: YearMetric;
  totaalZonderVakantie: YearMetric;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Verkoopsjaarlabel (1 sep – 31 aug) waarin deze kalenderdatum valt. */
function salesYearContainingYmd(ymd: string): string {
  const [ys, ms, ds] = ymd.split('-').map(Number);
  if (!ys || !ms || !ds) return '';
  if (ms >= 9) return `${ys}-${ys + 1}`;
  return `${ys - 1}-${ys}`;
}

function daysInclusiveYmd(startYmd: string, endYmd: string): number {
  const [y1, m1, d1] = startYmd.split('-').map(Number);
  const [y2, m2, d2] = endYmd.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.floor((t2 - t1) / 86400000) + 1;
}

function vacationDaysForCell(cell: PeriodRow | undefined): number {
  if (!cell) return 0;
  if (typeof cell.vacationDays === 'number') return cell.vacationDays;
  return daysInclusiveYmd(cell.start, cell.end);
}

/**
 * Dagen vanaf vakantiestart t/m vandaag (lokaal), afgekapt op einddatum.
 * Lopende vakantie: alleen verstreken dagen tellen mee voor gemiddelde dagomzet.
 */
function elapsedVacationDaysForCell(cell: PeriodRow | undefined, todayYmd: string): number {
  if (!cell?.start || !cell?.end) return 0;
  if (todayYmd < cell.start) return 0;
  const through = todayYmd <= cell.end ? todayYmd : cell.end;
  return daysInclusiveYmd(cell.start, through);
}

function avgPerDayLabel(amount: number, days: number): string | null {
  if (days < 1) return null;
  return formatBE(amount / days);
}

function prefixAt(prefix: number[] | undefined, n: number): number | null {
  if (!prefix || n < 1 || n > prefix.length) return null;
  return prefix[n - 1];
}

/**
 * Jaar-op-jaar omzet: als de vakantie in het huidige jaar nog loopt, vergelijk eerste N dagen
 * met dezelfde N dagen vanaf de start bij het vorige jaar (N = verstreken dagen, afgekapt).
 */
function comparableYoYOmzet(
  cell: PeriodRow | undefined,
  prevCell: PeriodRow | undefined,
  todayYmd: string,
): { current: number; previous: number; dayAdjusted: boolean; compareDays?: number } {
  const curFull = cell?.omzet ?? 0;
  const prevFull = prevCell?.omzet ?? 0;
  if (!cell || !prevCell) {
    return { current: curFull, previous: prevFull, dayAdjusted: false };
  }

  const fullCur = vacationDaysForCell(cell);
  const fullPrev = vacationDaysForCell(prevCell);
  const elapsedCur = elapsedVacationDaysForCell(cell, todayYmd);
  const ongoingCur = fullCur >= 1 && elapsedCur < fullCur;

  if (!ongoingCur) {
    return { current: cell.omzet, previous: prevCell.omzet, dayAdjusted: false };
  }

  const n = Math.min(elapsedCur, fullPrev, fullCur);
  if (n < 1) {
    return { current: cell.omzet, previous: prevCell.omzet, dayAdjusted: false };
  }

  const c = prefixAt(cell.prefixOmzet, n);
  const p = prefixAt(prevCell.prefixOmzet, n);
  if (c === null || p === null) {
    return { current: cell.omzet, previous: prevCell.omzet, dayAdjusted: false };
  }
  return { current: c, previous: p, dayAdjusted: true, compareDays: n };
}

function comparableYoYMarge(
  cell: PeriodRow | undefined,
  prevCell: PeriodRow | undefined,
  todayYmd: string,
): { current: number; previous: number; dayAdjusted: boolean; compareDays?: number } {
  const curFull = cell?.marge ?? 0;
  const prevFull = prevCell?.marge ?? 0;
  if (!cell || !prevCell) {
    return { current: curFull, previous: prevFull, dayAdjusted: false };
  }

  const fullCur = vacationDaysForCell(cell);
  const fullPrev = vacationDaysForCell(prevCell);
  const elapsedCur = elapsedVacationDaysForCell(cell, todayYmd);
  const ongoingCur = fullCur >= 1 && elapsedCur < fullCur;

  if (!ongoingCur) {
    return { current: cell.marge ?? 0, previous: prevCell.marge ?? 0, dayAdjusted: false };
  }

  const n = Math.min(elapsedCur, fullPrev, fullCur);
  if (n < 1) {
    return { current: cell.marge ?? 0, previous: prevCell.marge ?? 0, dayAdjusted: false };
  }

  const c = prefixAt(cell.prefixMarge, n);
  const p = prefixAt(prevCell.prefixMarge, n);
  if (c === null || p === null) {
    return { current: cell.marge ?? 0, previous: prevCell.marge ?? 0, dayAdjusted: false };
  }
  return { current: c, previous: p, dayAdjusted: true, compareDays: n };
}

/** Omzetverhouding (dit jaar / vorig jaar) per andere vakantie, met dezelfde dag-correctie als YoY. */
function collectCrossVacationOmzetRatios(
  excludeVid: SchoolVacationId,
  yearY: string,
  prevY: string,
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
): number[] {
  const ratios: number[] = [];
  for (const vid of VACATION_ROW_ORDER) {
    if (vid === excludeVid) continue;
    const c = lookup.get(`${vid}:${yearY}`);
    const p = lookup.get(`${vid}:${prevY}`);
    if (!c || !p) continue;
    const yoy = comparableYoYOmzet(c, p, todayYmd);
    if (yoy.previous <= 0) continue;
    ratios.push(yoy.current / yoy.previous);
  }
  return ratios;
}

type UpcomingVacationProjection = {
  omzetProj: number;
  margeProj?: number;
  sourceCount: number;
};

/** Schatting vóór start van de periode: vorig jaar × gemiddelde trend andere vakanties (zelfde verkoopsjaar). */
function upcomingVacationProjection(
  vid: SchoolVacationId,
  yearY: string,
  prevY: string,
  cell: PeriodRow,
  prevCell: PeriodRow,
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): UpcomingVacationProjection | null {
  if (todayYmd >= cell.start) return null;
  if (prevCell.omzet <= 0) return null;
  const ratios = collectCrossVacationOmzetRatios(vid, yearY, prevY, lookup, todayYmd);
  if (ratios.length === 0) return null;
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const omzetProj = prevCell.omzet * avgRatio;

  let margeProj: number | undefined;
  if (marginAvailable && typeof prevCell.marge === 'number' && prevCell.marge > 0) {
    margeProj = prevCell.marge * (omzetProj / prevCell.omzet);
  }

  return { omzetProj, margeProj, sourceCount: ratios.length };
}

function isVacationUpcomingWithoutOmzet(cell: PeriodRow | undefined, todayYmd: string): boolean {
  if (!cell) return false;
  return todayYmd < cell.start && (cell.omzet ?? 0) <= 0;
}

type EffectiveYoYOmzet = {
  current: number;
  previous: number;
  dayAdjusted: boolean;
  compareDays?: number;
  projectionNote?: string;
};

function getEffectiveYoYOmzet(
  vid: SchoolVacationId,
  cell: PeriodRow | undefined,
  prevCell: PeriodRow | undefined,
  yearY: string,
  prevY: string,
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): EffectiveYoYOmzet {
  if (!cell || !prevCell) {
    return {
      current: cell?.omzet ?? 0,
      previous: prevCell?.omzet ?? 0,
      dayAdjusted: false,
    };
  }

  if (isVacationUpcomingWithoutOmzet(cell, todayYmd) && prevCell.omzet > 0) {
    const up = upcomingVacationProjection(vid, yearY, prevY, cell, prevCell, lookup, todayYmd, marginAvailable);
    if (up) {
      return {
        current: up.omzetProj,
        previous: prevCell.omzet,
        dayAdjusted: false,
        projectionNote: `Prognose: gemiddelde trend t.o.v. ${prevY} op basis van ${up.sourceCount} andere vakantie(s) in ${yearY}.`,
      };
    }
  }

  const r = comparableYoYOmzet(cell, prevCell, todayYmd);
  return {
    current: r.current,
    previous: r.previous,
    dayAdjusted: r.dayAdjusted,
    compareDays: r.compareDays,
  };
}

type EffectiveYoYMarge = {
  current: number;
  previous: number;
  dayAdjusted: boolean;
  compareDays?: number;
  projectionNote?: string;
};

function getEffectiveYoYMarge(
  vid: SchoolVacationId,
  cell: PeriodRow | undefined,
  prevCell: PeriodRow | undefined,
  yearY: string,
  prevY: string,
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): EffectiveYoYMarge {
  if (!cell || !prevCell) {
    return {
      current: cell?.marge ?? 0,
      previous: prevCell?.marge ?? 0,
      dayAdjusted: false,
    };
  }

  if (isVacationUpcomingWithoutOmzet(cell, todayYmd) && prevCell.omzet > 0) {
    const up = upcomingVacationProjection(vid, yearY, prevY, cell, prevCell, lookup, todayYmd, marginAvailable);
    if (up && up.margeProj !== undefined && (prevCell.marge ?? 0) > 0) {
      return {
        current: up.margeProj,
        previous: prevCell.marge ?? 0,
        dayAdjusted: false,
        projectionNote: `Prognose marge: zelfde relatieve trend als omzet (${up.sourceCount} referentievakanties).`,
      };
    }
  }

  const r = comparableYoYMarge(cell, prevCell, todayYmd);
  return {
    current: r.current,
    previous: r.previous,
    dayAdjusted: r.dayAdjusted,
    compareDays: r.compareDays,
  };
}

function yoYCompareNote(
  projectionNote: string | undefined,
  dayAdjusted: boolean,
  compareDays: number | undefined,
): string | undefined {
  const parts: string[] = [];
  if (projectionNote) parts.push(projectionNote);
  if (dayAdjusted && compareDays !== undefined) {
    parts.push(`Eerste ${compareDays} dagen van de periode vergeleken.`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function sumVacationOmzetForColumn(
  y: string,
  yi: number,
  columnYears: string[],
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): { actual: number; withProjection: number; hasUpcomingProj: boolean } {
  let actual = 0;
  let withProj = 0;
  let hasUpcomingProj = false;
  const prevY = yi > 0 ? columnYears[yi - 1] : null;

  for (const vid of VACATION_ROW_ORDER) {
    const cell = lookup.get(`${vid}:${y}`);
    const om = cell?.omzet ?? 0;
    actual += om;
    let usedProj = false;
    if (prevY && cell) {
      const prevCell = lookup.get(`${vid}:${prevY}`);
      if (prevCell) {
        const up = upcomingVacationProjection(vid, y, prevY, cell, prevCell, lookup, todayYmd, marginAvailable);
        if (up) {
          withProj += up.omzetProj;
          hasUpcomingProj = true;
          usedProj = true;
        }
      }
    }
    if (!usedProj) withProj += om;
  }

  return { actual, withProjection: withProj, hasUpcomingProj };
}

function sumVacationMargeForColumn(
  y: string,
  yi: number,
  columnYears: string[],
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): { actual: number; withProjection: number; hasUpcomingProj: boolean } {
  let actual = 0;
  let withProj = 0;
  let hasUpcomingProj = false;
  const prevY = yi > 0 ? columnYears[yi - 1] : null;

  for (const vid of VACATION_ROW_ORDER) {
    const cell = lookup.get(`${vid}:${y}`);
    const mar = cell?.marge ?? 0;
    actual += mar;
    let usedProj = false;
    if (prevY && cell && marginAvailable) {
      const prevCell = lookup.get(`${vid}:${prevY}`);
      if (prevCell) {
        const up = upcomingVacationProjection(vid, y, prevY, cell, prevCell, lookup, todayYmd, marginAvailable);
        if (up?.margeProj !== undefined) {
          withProj += up.margeProj;
          hasUpcomingProj = true;
          usedProj = true;
        }
      }
    }
    if (!usedProj) withProj += mar;
  }

  return { actual, withProjection: withProj, hasUpcomingProj };
}

function comparableTotalsYoYOmzet(
  yearY: string,
  prevY: string,
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): { current: number; previous: number; compareNote?: string } {
  let sumCur = 0;
  let sumPrev = 0;
  let anyDayAdjusted = false;
  let anyProjection = false;

  for (const vid of VACATION_ROW_ORDER) {
    const cell = lookup.get(`${vid}:${yearY}`);
    const prevCell = lookup.get(`${vid}:${prevY}`);
    if (!cell && !prevCell) continue;
    if (!cell || !prevCell) {
      sumCur += cell?.omzet ?? 0;
      sumPrev += prevCell?.omzet ?? 0;
      continue;
    }
    const eff = getEffectiveYoYOmzet(vid, cell, prevCell, yearY, prevY, lookup, todayYmd, marginAvailable);
    sumCur += eff.current;
    sumPrev += eff.previous;
    if (eff.dayAdjusted) anyDayAdjusted = true;
    if (eff.projectionNote) anyProjection = true;
  }

  const parts: string[] = [];
  if (anyDayAdjusted) {
    parts.push('Waar een vakantie nog loopt: zelfde aantal kalenderdagen t.o.v. vorig jaar.');
  }
  if (anyProjection) {
    parts.push('Toekomstige vakantie(s): schatting obv gemiddelde trend andere vakanties in dit jaar.');
  }

  return {
    current: sumCur,
    previous: sumPrev,
    compareNote: parts.length > 0 ? parts.join(' ') : undefined,
  };
}

function comparableTotalsYoYMarge(
  yearY: string,
  prevY: string,
  lookup: Map<string, PeriodRow>,
  todayYmd: string,
  marginAvailable: boolean,
): { current: number; previous: number; compareNote?: string } {
  let sumCur = 0;
  let sumPrev = 0;
  let anyDayAdjusted = false;
  let anyProjection = false;

  for (const vid of VACATION_ROW_ORDER) {
    const cell = lookup.get(`${vid}:${yearY}`);
    const prevCell = lookup.get(`${vid}:${prevY}`);
    if (!cell && !prevCell) continue;
    if (!cell || !prevCell) {
      sumCur += cell?.marge ?? 0;
      sumPrev += prevCell?.marge ?? 0;
      continue;
    }
    const eff = getEffectiveYoYMarge(vid, cell, prevCell, yearY, prevY, lookup, todayYmd, marginAvailable);
    sumCur += eff.current;
    sumPrev += eff.previous;
    if (eff.dayAdjusted) anyDayAdjusted = true;
    if (eff.projectionNote) anyProjection = true;
  }

  const parts: string[] = [];
  if (anyDayAdjusted) {
    parts.push('Waar een vakantie nog loopt: zelfde aantal kalenderdagen t.o.v. vorig jaar.');
  }
  if (anyProjection) {
    parts.push('Toekomstige vakantie(s): marge-schatting volgt omzet-trend.');
  }

  return {
    current: sumCur,
    previous: sumPrev,
    compareNote: parts.length > 0 ? parts.join(' ') : undefined,
  };
}

type SalesYearProjection = {
  projJaarOmzet: number;
  projZonderOmzet: number;
  projVakantieOmzet: number;
  projJaarMarge?: number;
  projZonderMarge?: number;
  projVakantieMarge?: number;
  elapsedDays: number;
  totalDays: number;
};

function computeSalesYearRunRateProjection(
  yt: YearTotalRow,
  todayYmd: string,
  vakantieOmzet: number,
  vakantieMarge: number,
  marginAvailable: boolean,
): SalesYearProjection | null {
  const { salesYear, jaarStart, jaarEnd, totaalJaar, totaalZonderVakantie } = yt;
  if (!jaarStart || !jaarEnd) return null;
  if (salesYearContainingYmd(todayYmd) !== salesYear) return null;
  if (todayYmd < jaarStart) return null;
  if (todayYmd > jaarEnd) return null;

  const periodEnd = todayYmd <= jaarEnd ? todayYmd : jaarEnd;
  const elapsedDays = daysInclusiveYmd(jaarStart, periodEnd);
  const totalDays = daysInclusiveYmd(jaarStart, jaarEnd);
  if (elapsedDays < 1 || totalDays < 1) return null;
  if (elapsedDays >= totalDays) return null;

  const jaarOmzet = totaalJaar.omzet;
  const jaarMarge = totaalJaar.marge ?? 0;
  const zonderOmzet = totaalZonderVakantie.omzet;
  const zonderMarge = totaalZonderVakantie.marge ?? 0;

  const rateO = jaarOmzet / elapsedDays;
  const projJaarOmzet = rateO * totalDays;
  let projZonderOmzet: number;
  let projVakantieOmzet: number;
  if (jaarOmzet > 0) {
    projZonderOmzet = projJaarOmzet * (zonderOmzet / jaarOmzet);
    projVakantieOmzet = projJaarOmzet * (vakantieOmzet / jaarOmzet);
  } else {
    projZonderOmzet = 0;
    projVakantieOmzet = 0;
  }

  const out: SalesYearProjection = {
    projJaarOmzet,
    projZonderOmzet,
    projVakantieOmzet,
    elapsedDays,
    totalDays,
  };

  if (marginAvailable) {
    const rateM = jaarMarge / elapsedDays;
    out.projJaarMarge = rateM * totalDays;
    if (jaarMarge > 0) {
      out.projZonderMarge = out.projJaarMarge * (zonderMarge / jaarMarge);
      out.projVakantieMarge = out.projJaarMarge * (vakantieMarge / jaarMarge);
    } else {
      out.projZonderMarge = 0;
      out.projVakantieMarge = 0;
    }
  }

  return out;
}

function ProjectionOmzetLine({ value }: { value: number }) {
  return (
    <div className="text-xs font-normal text-purple-800 mt-1 whitespace-nowrap">
      ∼ €{formatBE(value)} eind verkoopsjaar
    </div>
  );
}

function ProjectionMargeLine({ value }: { value: number }) {
  return (
    <div className="text-xs font-normal text-green-800 mt-1 whitespace-nowrap">
      ∼ €{formatBE(value)} marge eind verkoopsjaar
    </div>
  );
}

/** Jaar-op-jaar % voor opeenvolgende kolommen (dag-correctie + schatting vóór start). */
function collectConsecutiveYoYPctOmzet(
  columnYears: string[],
  lookup: Map<string, PeriodRow>,
  vacationId: SchoolVacationId,
  todayYmd: string,
  marginAvailable: boolean,
): number[] {
  const pcts: number[] = [];
  for (let i = 1; i < columnYears.length; i++) {
    const prevY = columnYears[i - 1];
    const currY = columnYears[i];
    const cell = lookup.get(`${vacationId}:${currY}`);
    const prevCell = lookup.get(`${vacationId}:${prevY}`);
    const eff = getEffectiveYoYOmzet(
      vacationId,
      cell,
      prevCell,
      currY,
      prevY,
      lookup,
      todayYmd,
      marginAvailable,
    );
    if (eff.previous > 0) pcts.push(((eff.current - eff.previous) / eff.previous) * 100);
  }
  return pcts;
}

function collectConsecutiveYoYPctMarge(
  columnYears: string[],
  lookup: Map<string, PeriodRow>,
  vacationId: SchoolVacationId,
  todayYmd: string,
  marginAvailable: boolean,
): number[] {
  const pcts: number[] = [];
  for (let i = 1; i < columnYears.length; i++) {
    const prevY = columnYears[i - 1];
    const currY = columnYears[i];
    const cell = lookup.get(`${vacationId}:${currY}`);
    const prevCell = lookup.get(`${vacationId}:${prevY}`);
    const eff = getEffectiveYoYMarge(
      vacationId,
      cell,
      prevCell,
      currY,
      prevY,
      lookup,
      todayYmd,
      marginAvailable,
    );
    if (eff.previous > 0) pcts.push(((eff.current - eff.previous) / eff.previous) * 100);
  }
  return pcts;
}

function arithmeticMean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Meest recente verkoopsjaarkolom met zomervakantie-omzet groter dan nul. */
function latestNonzeroVacationOmzet(
  columnYears: string[],
  lookup: Map<string, PeriodRow>,
  vacationId: SchoolVacationId,
): { year: string; omzet: number } | null {
  for (let i = columnYears.length - 1; i >= 0; i--) {
    const y = columnYears[i];
    const o = lookup.get(`${vacationId}:${y}`)?.omzet ?? 0;
    if (o > 0) return { year: y, omzet: o };
  }
  return null;
}

function latestNonzeroVacationMarge(
  columnYears: string[],
  lookup: Map<string, PeriodRow>,
  vacationId: SchoolVacationId,
): { year: string; marge: number } | null {
  for (let i = columnYears.length - 1; i >= 0; i--) {
    const y = columnYears[i];
    const m = lookup.get(`${vacationId}:${y}`)?.marge ?? 0;
    if (m > 0) return { year: y, marge: m };
  }
  return null;
}

const ZOMER_ID: SchoolVacationId = 'zomer';

/** Omzet- of margegroei t.o.v. het verkoopsjaar in de kolom links (eerste kolom: geen vergelijking). */
function YearOverYearPct({
  current,
  previous,
  previousYearLabel,
  compareNote,
}: {
  current: number;
  previous: number;
  previousYearLabel: string;
  compareNote?: string;
}) {
  if (previous <= 0) {
    if (current <= 0) return null;
    return (
      <div className="text-xs text-gray-500 font-normal mt-0.5">
        Geen vergelijking ({previousYearLabel}: €0)
      </div>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const toneClass =
    pct > 0.05 ? 'text-emerald-700' : pct < -0.05 ? 'text-red-700' : 'text-gray-600';
  const sign = pct > 0 ? '+' : '';
  return (
    <div className="mt-0.5">
      <div className={`text-xs font-medium ${toneClass}`}>
        {sign}
        {pct.toLocaleString('nl-BE', { maximumFractionDigits: 1 })}% t.o.v. {previousYearLabel}
      </div>
      {compareNote ? <div className="text-xs font-normal text-gray-500 mt-0.5">{compareNote}</div> : null}
    </div>
  );
}

export default function SalesVacationComparePage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const allYears = useMemo(() => listKnownSalesYears().slice().reverse(), []);
  const defaultSelection = useMemo(() => allYears.slice(0, 4), [allYears]);

  const [selectedYears, setSelectedYears] = useState<string[]>(defaultSelection);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [yearTotals, setYearTotals] = useState<YearTotalRow[]>([]);
  const [loadedSalesYears, setLoadedSalesYears] = useState<string[]>([]);
  const [marginAvailable, setMarginAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedYearsRef = useRef(selectedYears);
  selectedYearsRef.current = selectedYears;

  /** Stabiele sleutel: voorkomt useEffect-loops wanneer de array-referentie zonder inhoudswijziging verandert. */
  const salesYearsSelectionKey = useMemo(
    () => [...selectedYears].sort().join(','),
    [selectedYears],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUid = localStorage.getItem('odoo_uid');
      const storedPass = localStorage.getItem('odoo_pass');
      if (!storedUid || !storedPass) {
        router.push('/');
      }
    }
  }, [router]);

  const fetchData = useCallback(
    async (options?: { requestToken?: { aborted: boolean } }) => {
      const token = options?.requestToken;
      const salesYears = [...selectedYearsRef.current].sort();
      if (!isLoggedIn || salesYears.length === 0) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/sales-vacation-compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salesYears }),
        });
        const json = await res.json();
        if (token?.aborted) return;
        if (!res.ok) {
          setError(typeof json.error === 'string' ? json.error : 'Laden mislukt');
          return;
        }
        setPeriods(json.periods as PeriodRow[]);
        setYearTotals((json.yearTotals as YearTotalRow[]) ?? []);
        setMarginAvailable(Boolean(json.marginAvailable));
        setLoadedSalesYears((json.salesYears as string[]) ?? []);
      } catch {
        if (!token?.aborted) setError('Netwerkfout');
      } finally {
        if (!token?.aborted) setLoading(false);
      }
    },
    [isLoggedIn],
  );

  useEffect(() => {
    if (!isLoggedIn || selectedYears.length === 0) return;
    const requestToken = { aborted: false };
    void fetchData({ requestToken });
    return () => {
      requestToken.aborted = true;
    };
  }, [isLoggedIn, salesYearsSelectionKey, fetchData]);

  const lookup = useMemo(() => {
    const m = new Map<string, PeriodRow>();
    for (const p of periods) {
      m.set(`${p.vacationId}:${p.salesYear}`, p);
    }
    return m;
  }, [periods]);

  const yearTotalBySalesYear = useMemo(() => {
    const m = new Map<string, YearTotalRow>();
    for (const y of yearTotals) {
      m.set(y.salesYear, y);
    }
    return m;
  }, [yearTotals]);

  const columnYears = loadedSalesYears.length > 0 ? loadedSalesYears : [...selectedYears].sort();

  const todayYmd = localYmd(new Date());

  const elapsedVacationDaysByYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const y of columnYears) {
      let sum = 0;
      for (const vid of VACATION_ROW_ORDER) {
        sum += elapsedVacationDaysForCell(lookup.get(`${vid}:${y}`), todayYmd);
      }
      m.set(y, sum);
    }
    return m;
  }, [columnYears, lookup, todayYmd]);

  const projectionBySalesYear = useMemo(() => {
    const m = new Map<string, SalesYearProjection | null>();
    for (const y of columnYears) {
      const yt = yearTotalBySalesYear.get(y);
      if (!yt) {
        m.set(y, null);
        continue;
      }
      let vOmz = 0;
      let vMar = 0;
      for (const vid of VACATION_ROW_ORDER) {
        const c = lookup.get(`${vid}:${y}`);
        vOmz += c?.omzet ?? 0;
        vMar += c?.marge ?? 0;
      }
      m.set(y, computeSalesYearRunRateProjection(yt, todayYmd, vOmz, vMar, marginAvailable));
    }
    return m;
  }, [columnYears, yearTotalBySalesYear, lookup, todayYmd, marginAvailable]);

  /**
   * Zomerschatting onder de tabel: als de nieuwste kolom een schatting vóór zomerstart toont (paarse cel),
   * gebruiken we exact dezelfde methode als die cel. Anders: historische keten zomer↔zomer in de kolommen.
   */
  const summerOutlook = useMemo(() => {
    if (columnYears.length < 2) {
      return {
        ok: false as const,
        message: 'Selecteer minstens twee verkoopsjaren om een gemiddelde stijging en schatting voor de volgende zomer te tonen.',
      };
    }

    const yoyPcts = collectConsecutiveYoYPctOmzet(
      columnYears,
      lookup,
      ZOMER_ID,
      todayYmd,
      marginAvailable,
    );

    const lastIdx = columnYears.length - 1;
    const currY = columnYears[lastIdx];
    const prevY = columnYears[lastIdx - 1];
    const zCell = lookup.get(`${ZOMER_ID}:${currY}`);
    const zPrev = lookup.get(`${ZOMER_ID}:${prevY}`);

    if (zCell && zPrev) {
      const tableAligned = upcomingVacationProjection(
        ZOMER_ID,
        currY,
        prevY,
        zCell,
        zPrev,
        lookup,
        todayYmd,
        marginAvailable,
      );
      if (tableAligned) {
        const impliedGrowthPctOmzet = (tableAligned.omzetProj / zPrev.omzet) * 100 - 100;
        const historicalAvgYoYPct = yoyPcts.length > 0 ? arithmeticMean(yoyPcts)! : undefined;
        let projectedMarge: number | undefined;
        let baselineMarge: { year: string; marge: number } | undefined;
        let impliedGrowthPctMarge: number | undefined;
        if (marginAvailable && tableAligned.margeProj !== undefined && typeof zPrev.marge === 'number') {
          projectedMarge = tableAligned.margeProj;
          baselineMarge = { year: prevY, marge: zPrev.marge };
          if (zPrev.marge > 0) {
            impliedGrowthPctMarge = (tableAligned.margeProj / zPrev.marge) * 100 - 100;
          }
        }
        return {
          ok: true as const,
          projectionMode: 'tableAligned' as const,
          projectedOmzet: tableAligned.omzetProj,
          projectedMarge,
          baselineYear: prevY,
          baselineOmzet: zPrev.omzet,
          baselineMarge,
          targetSalesYear: currY,
          impliedGrowthPctOmzet,
          impliedGrowthPctMarge,
          sourceCount: tableAligned.sourceCount,
          historicalAvgYoYPct,
          historicalStepCount: yoyPcts.length,
        };
      }
    }

    if (yoyPcts.length === 0) {
      return {
        ok: false as const,
        message:
          'Geen schatting of historische zomer-stappen: geen paarse zomerschatting actief en onvoldoende jaar-op-jaar vergelijkingen voor de zomervakantie.',
      };
    }
    const avgYoYPct = arithmeticMean(yoyPcts)!;
    const baseline = latestNonzeroVacationOmzet(columnYears, lookup, ZOMER_ID);
    if (!baseline) {
      return {
        ok: false as const,
        message: 'Geen omzet gevonden voor de zomervakantie in de geselecteerde jaren.',
      };
    }
    const projectedOmzet = baseline.omzet * (1 + avgYoYPct / 100);

    let avgYoYMargePct: number | undefined;
    let baselineMarge: { year: string; marge: number } | undefined;
    let projectedMarge: number | undefined;
    if (marginAvailable) {
      const mPcts = collectConsecutiveYoYPctMarge(
        columnYears,
        lookup,
        ZOMER_ID,
        todayYmd,
        marginAvailable,
      );
      const avgM = arithmeticMean(mPcts);
      const bM = latestNonzeroVacationMarge(columnYears, lookup, ZOMER_ID);
      if (avgM !== null && mPcts.length > 0 && bM) {
        avgYoYMargePct = avgM;
        baselineMarge = bM;
        projectedMarge = bM.marge * (1 + avgM / 100);
      }
    }

    return {
      ok: true as const,
      projectionMode: 'historicalChain' as const,
      avgYoYPct,
      yoyStepCount: yoyPcts.length,
      baselineYear: baseline.year,
      baselineOmzet: baseline.omzet,
      projectedOmzet,
      avgYoYMargePct,
      baselineMarge,
      projectedMarge,
    };
  }, [columnYears, lookup, marginAvailable, todayYmd]);

  const toggleYear = (y: string) => {
    setSelectedYears((prev) => {
      if (prev.includes(y)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== y);
      }
      return [...prev, y].sort();
    });
  };

  const selectLastFour = () => {
    setSelectedYears(allYears.slice(0, 4));
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <div className="p-4">
        <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Vakantievergelijking</h1>
            <p className="text-sm text-gray-600 mb-4">
              Omzet tijdens de schoolvakanties (Vlaanderen), per <strong>verkoopsjaar</strong> (1 september t/m 31
              augustus). Per vakantie tellen we de omzet vanaf het <strong>weekend vóór de officiële start</strong>{' '}
              (zaterdag–zondag), omdat die dagen vaak al sterk zijn. De einddatum blijft die van de officiële kalender.
              Voor het <strong>lopende verkoopsjaar</strong> tonen de totalen onderaan een schatting eind verkoopsjaar
              (gemiddelde per verstreken dag × lengte van de periode; vakantie/zonder vakantie behouden dezelfde
              verhouding als nu). Per vakantiecel tonen we ook de <strong>gemiddelde dagomzet</strong>: omzet gedeeld door
              het aantal <strong>verstreken</strong> dagen in die periode (t/m vandaag), niet door de volledige lengte
              zolang de vakantie nog bezig is. Per cel (vanaf de tweede kolom) staat het{' '}
              <strong>percentage verschil</strong> t.o.v. het verkoopsjaar in de kolom links; als een vakantie in het
              nieuwere jaar <strong>nog bezig</strong> is, vergelijken we de omzet over hetzelfde aantal
              kalenderdagen vanaf de start met het vorige jaar. Staat een periode <strong>nog vóór de start</strong>, dan
              tonen we een <strong>schatting</strong> (paars) op basis van hoe de andere vakanties in hetzelfde
              verkoopsjaar zich t.o.v. het jaar ervoor gedragen. Onder de tabel staat voor de{' '}
              <strong>zomervakantie</strong> diezelfde paarse schatting zodra die van toepassing is; anders een schatting
              uit de historische zomer↔zomer stappen in de geselecteerde kolommen (meest recente zomer × (1 + gemiddelde
              groei)).
            </p>
            <div className="flex flex-wrap gap-3 items-center mb-2">
              {allYears.map((y) => (
                <label
                  key={y}
                  className="inline-flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedYears.includes(y)}
                    onChange={() => toggleYear(y)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-900 font-medium">{y}</span>
                </label>
              ))}
              <button
                type="button"
                onClick={selectLastFour}
                className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium"
              >
                Laatste 4 verkoopsjaren
              </button>
              <button
                type="button"
                onClick={() => fetchData()}
                disabled={loading || selectedYears.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow font-semibold text-sm"
              >
                Vernieuwen
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">{error}</div>
          )}

          {loading && periods.length === 0 && yearTotals.length === 0 ? (
            <p className="text-gray-700">Gegevens laden…</p>
          ) : (
            <div className="relative overflow-x-auto">
              {loading && (periods.length > 0 || yearTotals.length > 0) && (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center pt-8 bg-white/70 pointer-events-none"
                  aria-live="polite"
                >
                  <span className="text-sm font-medium text-gray-700 shadow-sm bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    Gegevens vernieuwen…
                  </span>
                </div>
              )}
              <table
                className={`w-full border border-gray-200 rounded-lg text-sm ${loading && (periods.length > 0 || yearTotals.length > 0) ? 'opacity-90' : ''}`}
              >
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-900 font-semibold border-b">Vakantie</th>
                    {columnYears.map((y) => (
                      <th key={y} className="px-3 py-2 text-right text-gray-900 font-semibold border-b whitespace-nowrap">
                        {y}
                        <div className="text-xs font-normal text-gray-500">Verkoopsjaar · omzet · gem. /dag</div>
                      </th>
                    ))}
                    {marginAvailable &&
                      columnYears.map((y) => (
                        <th
                          key={`m-${y}`}
                          className="px-3 py-2 text-right text-gray-900 font-semibold border-b whitespace-nowrap"
                        >
                          <span className="sr-only">{y} </span>
                          <div className="text-xs font-normal text-gray-500">Marge {y} · gem. /dag</div>
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {VACATION_ROW_ORDER.map((vid, rowIdx) => {
                    const label = VACATION_LABELS[vid];
                    return (
                      <tr key={vid} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-900 font-medium border-b border-gray-100">
                          {label}
                        </td>
                        {columnYears.map((y, yi) => {
                          const cell = lookup.get(`${vid}:${y}`);
                          const prevY = yi > 0 ? columnYears[yi - 1] : null;
                          const prevCell = prevY ? lookup.get(`${vid}:${prevY}`) : null;
                          const omzet = cell?.omzet ?? 0;
                          const dagen = vacationDaysForCell(cell);
                          const elapsedDagen = elapsedVacationDaysForCell(cell, todayYmd);
                          const up =
                            yi > 0 && prevY && cell && prevCell
                              ? upcomingVacationProjection(
                                  vid,
                                  y,
                                  prevY,
                                  cell,
                                  prevCell,
                                  lookup,
                                  todayYmd,
                                  marginAvailable,
                                )
                              : null;
                          const showUpcomingProj = Boolean(up);
                          return (
                            <td
                              key={y}
                              className="px-3 py-2 text-right text-gray-800 border-b border-gray-100 align-top"
                            >
                              {showUpcomingProj && up ? (
                                <>
                                  <div className="text-purple-900 font-semibold whitespace-nowrap">
                                    ∼ €{formatBE(up.omzetProj)}
                                  </div>
                                  <div className="text-xs text-purple-800/90 mt-0.5">
                                    Schatting vóór start (trend andere vakanties)
                                  </div>
                                  {dagen >= 1 && (
                                    <div className="text-xs text-gray-600 font-normal mt-0.5 whitespace-nowrap">
                                      Gem. ∼ €{avgPerDayLabel(up.omzetProj, dagen)}/dag over volledige periode
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="whitespace-nowrap">€{formatBE(omzet)}</div>
                                  {cell && elapsedDagen >= 1 && (
                                    <div className="text-xs text-gray-600 font-normal mt-0.5">
                                      <div className="whitespace-nowrap">
                                        Gem. €{avgPerDayLabel(omzet, elapsedDagen)}/dag
                                      </div>
                                      {elapsedDagen < dagen && (
                                        <div className="text-gray-500 mt-0.5">
                                          t/m vandaag: {elapsedDagen} van {dagen} dagen
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                              {prevY &&
                                cell &&
                                prevCell &&
                                (() => {
                                  const eff = getEffectiveYoYOmzet(
                                    vid,
                                    cell,
                                    prevCell,
                                    y,
                                    prevY,
                                    lookup,
                                    todayYmd,
                                    marginAvailable,
                                  );
                                  return (
                                    <YearOverYearPct
                                      current={eff.current}
                                      previous={eff.previous}
                                      previousYearLabel={prevY}
                                      compareNote={yoYCompareNote(
                                        eff.projectionNote,
                                        eff.dayAdjusted,
                                        eff.compareDays,
                                      )}
                                    />
                                  );
                                })()}
                              {cell && (
                                <>
                                  <div className="text-xs text-gray-500 font-normal mt-0.5 whitespace-normal">
                                    {formatDateBE(cell.start)} – {formatDateBE(cell.end)}
                                  </div>
                                  {cell.officialStart && cell.officialStart !== cell.start && (
                                    <div className="text-xs text-gray-400 font-normal mt-0.5">
                                      Officiële start {formatDateBE(cell.officialStart)}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-400 font-normal mt-0.5">
                                    {dagen} {dagen === 1 ? 'dag' : 'dagen'} (incl. weekend ervoor)
                                  </div>
                                </>
                              )}
                            </td>
                          );
                        })}
                        {marginAvailable &&
                          columnYears.map((y, yi) => {
                            const cell = lookup.get(`${vid}:${y}`);
                            const marge = cell?.marge ?? 0;
                            const dagenM = vacationDaysForCell(cell);
                            const elapsedM = elapsedVacationDaysForCell(cell, todayYmd);
                            const prevY = yi > 0 ? columnYears[yi - 1] : null;
                            const prevCell = prevY ? lookup.get(`${vid}:${prevY}`) : null;
                            const up =
                              yi > 0 && prevY && cell && prevCell
                                ? upcomingVacationProjection(
                                    vid,
                                    y,
                                    prevY,
                                    cell,
                                    prevCell,
                                    lookup,
                                    todayYmd,
                                    marginAvailable,
                                  )
                                : null;
                            const showUpcomingMarge = Boolean(up?.margeProj !== undefined);
                            return (
                              <td
                                key={`m-${y}`}
                                className="px-3 py-2 text-right text-green-800 border-b border-gray-100 align-top"
                              >
                                {showUpcomingMarge && up?.margeProj !== undefined ? (
                                  <>
                                    <div className="text-green-900 font-semibold whitespace-nowrap">
                                      ∼ €{formatBE(up.margeProj)}
                                    </div>
                                    <div className="text-xs text-green-800/90 mt-0.5">
                                      Schatting vóór start (zelfde trend als omzet)
                                    </div>
                                    {dagenM >= 1 && (
                                      <div className="text-xs text-green-700/90 font-normal mt-0.5 whitespace-nowrap">
                                        Gem. ∼ €{avgPerDayLabel(up.margeProj, dagenM)}/dag
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="whitespace-nowrap">€{formatBE(marge)}</div>
                                    {cell && elapsedM >= 1 && (
                                      <div className="text-xs text-green-700/90 font-normal mt-0.5">
                                        <div className="whitespace-nowrap">
                                          Gem. €{avgPerDayLabel(marge, elapsedM)}/dag
                                        </div>
                                        {elapsedM < dagenM && (
                                          <div className="text-green-700/70 mt-0.5">
                                            t/m vandaag: {elapsedM} van {dagenM} dagen
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                                {prevY &&
                                  cell &&
                                  prevCell &&
                                  (() => {
                                    const eff = getEffectiveYoYMarge(
                                      vid,
                                      cell,
                                      prevCell,
                                      y,
                                      prevY,
                                      lookup,
                                      todayYmd,
                                      marginAvailable,
                                    );
                                    return (
                                      <YearOverYearPct
                                        current={eff.current}
                                        previous={eff.previous}
                                        previousYearLabel={prevY}
                                        compareNote={yoYCompareNote(
                                          eff.projectionNote,
                                          eff.dayAdjusted,
                                          eff.compareDays,
                                        )}
                                      />
                                    );
                                  })()}
                              </td>
                            );
                          })}
                      </tr>
                    );
                  })}
                  <tr className="bg-amber-50 font-semibold border-t-2 border-amber-200">
                    <td className="px-3 py-2 text-gray-900 align-top">
                      Totaal vakantiedagen
                      <div className="text-xs font-normal text-gray-600 mt-0.5">Incl. weekend vóór start</div>
                    </td>
                    {columnYears.map((y) => {
                      const days = yearTotalBySalesYear.get(y)?.totalVacationDays ?? 0;
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-900 whitespace-nowrap">
                          {days} {days === 1 ? 'dag' : 'dagen'}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y) => (
                        <td key={`md-${y}`} className="px-3 py-2 text-right text-gray-400 border-b border-gray-100">
                          —
                        </td>
                      ))}
                  </tr>
                  <tr className="bg-blue-100 font-bold border-t-2 border-gray-300">
                    <td className="px-3 py-2 text-gray-900">Totaal vakantie</td>
                    {columnYears.map((y, yi) => {
                      const pack = sumVacationOmzetForColumn(
                        y,
                        yi,
                        columnYears,
                        lookup,
                        todayYmd,
                        marginAvailable,
                      );
                      const displaySum = pack.hasUpcomingProj ? pack.withProjection : pack.actual;
                      const prevY = yi > 0 ? columnYears[yi - 1] : null;
                      const totalYoY = prevY
                        ? comparableTotalsYoYOmzet(y, prevY, lookup, todayYmd, marginAvailable)
                        : null;
                      const pr = projectionBySalesYear.get(y);
                      const totDaysFull = yearTotalBySalesYear.get(y)?.totalVacationDays ?? 0;
                      const totDaysElapsed = elapsedVacationDaysByYear.get(y) ?? 0;
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-900 align-top">
                          <div
                            className={`whitespace-nowrap ${pack.hasUpcomingProj ? 'text-purple-950 font-semibold' : ''}`}
                          >
                            €{formatBE(displaySum)}
                            {pack.hasUpcomingProj ? (
                              <span className="text-xs font-normal text-purple-900/90"> (incl. schatting)</span>
                            ) : null}
                          </div>
                          {pack.hasUpcomingProj && (
                            <div className="text-xs text-gray-600 font-normal mt-0.5">
                              Effectief geboekt: €{formatBE(pack.actual)}
                            </div>
                          )}
                          {totDaysFull >= 1 &&
                            (pack.hasUpcomingProj ? (
                              <div className="text-xs text-gray-700 font-normal mt-0.5">
                                Gem. €{avgPerDayLabel(displaySum, totDaysFull)}/dag{' '}
                                <span className="text-gray-500">
                                  (som ÷ {totDaysFull} vakantiedagen in jaar, met schatting)
                                </span>
                              </div>
                            ) : (
                              totDaysElapsed >= 1 && (
                                <div className="text-xs text-gray-700 font-normal mt-0.5">
                                  Gem. €{avgPerDayLabel(pack.actual, totDaysElapsed)}/dag{' '}
                                  <span className="text-gray-500">
                                    (som omzet ÷ som verstreken dagen per vakantie
                                    {totDaysElapsed < totDaysFull ? `, ${totDaysElapsed}/${totDaysFull} dagen` : ''})
                                  </span>
                                </div>
                              )
                            ))}
                          {prevY && totalYoY && (
                            <YearOverYearPct
                              current={totalYoY.current}
                              previous={totalYoY.previous}
                              previousYearLabel={prevY}
                              compareNote={totalYoY.compareNote}
                            />
                          )}
                          {pr && !pack.hasUpcomingProj && (
                            <ProjectionOmzetLine value={pr.projVakantieOmzet} />
                          )}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y, yi) => {
                        const pack = sumVacationMargeForColumn(
                          y,
                          yi,
                          columnYears,
                          lookup,
                          todayYmd,
                          marginAvailable,
                        );
                        const displaySum = pack.hasUpcomingProj ? pack.withProjection : pack.actual;
                        const prevY = yi > 0 ? columnYears[yi - 1] : null;
                        const totalYoY = prevY
                          ? comparableTotalsYoYMarge(y, prevY, lookup, todayYmd, marginAvailable)
                          : null;
                        const pr = projectionBySalesYear.get(y);
                        const totDaysFull = yearTotalBySalesYear.get(y)?.totalVacationDays ?? 0;
                        const totDaysElapsed = elapsedVacationDaysByYear.get(y) ?? 0;
                        return (
                          <td key={`mt-${y}`} className="px-3 py-2 text-right text-green-900 align-top">
                            <div
                              className={`whitespace-nowrap ${pack.hasUpcomingProj ? 'text-green-950 font-semibold' : ''}`}
                            >
                              €{formatBE(displaySum)}
                              {pack.hasUpcomingProj ? (
                                <span className="text-xs font-normal text-green-900/90"> (incl. schatting)</span>
                              ) : null}
                            </div>
                            {pack.hasUpcomingProj && (
                              <div className="text-xs text-green-800/90 font-normal mt-0.5">
                                Effectief geboekt: €{formatBE(pack.actual)}
                              </div>
                            )}
                            {totDaysFull >= 1 &&
                              (pack.hasUpcomingProj ? (
                                <div className="text-xs text-green-800 font-normal mt-0.5">
                                  Gem. €{avgPerDayLabel(displaySum, totDaysFull)}/dag{' '}
                                  <span className="text-green-700/90">
                                    ({totDaysFull} vakantiedagen, met schatting)
                                  </span>
                                </div>
                              ) : (
                                totDaysElapsed >= 1 && (
                                  <div className="text-xs text-green-800 font-normal mt-0.5">
                                    Gem. €{avgPerDayLabel(pack.actual, totDaysElapsed)}/dag{' '}
                                    <span className="text-green-700/90">
                                      (som marge ÷ som verstreken dagen
                                      {totDaysElapsed < totDaysFull ? `, ${totDaysElapsed}/${totDaysFull}` : ''})
                                    </span>
                                  </div>
                                )
                              ))}
                            {prevY && totalYoY && (
                              <YearOverYearPct
                                current={totalYoY.current}
                                previous={totalYoY.previous}
                                previousYearLabel={prevY}
                                compareNote={totalYoY.compareNote}
                              />
                            )}
                            {pr && !pack.hasUpcomingProj && pr.projVakantieMarge !== undefined && (
                              <ProjectionMargeLine value={pr.projVakantieMarge} />
                            )}
                          </td>
                        );
                      })}
                  </tr>
                  <tr className="bg-slate-50 font-semibold border-b border-gray-200">
                    <td className="px-3 py-2 text-gray-900 align-top">
                      Totaal zonder vakantie
                      <div className="text-xs font-normal text-gray-500 mt-0.5 max-w-xs">
                        Omzet buiten de vakantieperiodes (geboekt). Telt met effectieve vakantie-omzet op tot het
                        geboekte verkoopsjaar.
                      </div>
                    </td>
                    {columnYears.map((y, yi) => {
                      const yt = yearTotalBySalesYear.get(y);
                      const omzet = yt?.totaalZonderVakantie.omzet ?? 0;
                      const vacPack = sumVacationOmzetForColumn(
                        y,
                        yi,
                        columnYears,
                        lookup,
                        todayYmd,
                        marginAvailable,
                      );
                      const pr = projectionBySalesYear.get(y);
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-800 align-top">
                          <div className="whitespace-nowrap">€{formatBE(omzet)}</div>
                          {vacPack.hasUpcomingProj && (
                            <div className="text-xs text-gray-500 font-normal mt-0.5">
                              + vakantie (incl. schatting) = zie totaal verkoopsjaar
                            </div>
                          )}
                          {pr && !vacPack.hasUpcomingProj && (
                            <ProjectionOmzetLine value={pr.projZonderOmzet} />
                          )}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y, yi) => {
                        const yt = yearTotalBySalesYear.get(y);
                        const marge = yt?.totaalZonderVakantie.marge ?? 0;
                        const vacPack = sumVacationMargeForColumn(
                          y,
                          yi,
                          columnYears,
                          lookup,
                          todayYmd,
                          marginAvailable,
                        );
                        const pr = projectionBySalesYear.get(y);
                        return (
                          <td key={`tz-${y}`} className="px-3 py-2 text-right text-green-800 align-top">
                            <div className="whitespace-nowrap">€{formatBE(marge)}</div>
                            {vacPack.hasUpcomingProj && (
                              <div className="text-xs text-green-700/80 font-normal mt-0.5">
                                + vakantie (incl. schatting) = zie totaal verkoopsjaar
                              </div>
                            )}
                            {pr && !vacPack.hasUpcomingProj && pr.projZonderMarge !== undefined && (
                              <ProjectionMargeLine value={pr.projZonderMarge} />
                            )}
                          </td>
                        );
                      })}
                  </tr>
                  <tr className="bg-slate-100 font-bold border-b border-gray-200">
                    <td className="px-3 py-2 text-gray-900 align-top">
                      Totaal verkoopsjaar
                      <div className="text-xs font-normal text-gray-500 mt-0.5 max-w-xs">
                        Bij vakantie-schatting: geboekt verkoopsjaar + verschil vakantie-schatting t.o.v. geboekt.
                      </div>
                    </td>
                    {columnYears.map((y, yi) => {
                      const yt = yearTotalBySalesYear.get(y);
                      const vacPack = sumVacationOmzetForColumn(
                        y,
                        yi,
                        columnYears,
                        lookup,
                        todayYmd,
                        marginAvailable,
                      );
                      const bookedOmzet = yt?.totaalJaar.omzet ?? 0;
                      const displayOmzet = vacPack.hasUpcomingProj
                        ? bookedOmzet + (vacPack.withProjection - vacPack.actual)
                        : bookedOmzet;
                      const pr = projectionBySalesYear.get(y);
                      return (
                        <td key={y} className="px-3 py-2 text-right text-gray-900 align-top">
                          <div
                            className={`whitespace-nowrap ${vacPack.hasUpcomingProj ? 'text-purple-950 font-semibold' : ''}`}
                          >
                            €{formatBE(displayOmzet)}
                            {vacPack.hasUpcomingProj ? (
                              <span className="text-xs font-normal text-purple-900/90"> (incl. vakantie-schatting)</span>
                            ) : null}
                          </div>
                          {vacPack.hasUpcomingProj && (
                            <div className="text-xs text-gray-600 font-normal mt-0.5">
                              Geboekt in POS: €{formatBE(bookedOmzet)}
                            </div>
                          )}
                          {yt?.jaarStart && yt.jaarEnd && (
                            <div className="text-xs text-gray-500 font-normal mt-0.5 whitespace-normal">
                              {formatDateBE(yt.jaarStart)} – {formatDateBE(yt.jaarEnd)}
                            </div>
                          )}
                          {pr && !vacPack.hasUpcomingProj && (
                            <ProjectionOmzetLine value={pr.projJaarOmzet} />
                          )}
                        </td>
                      );
                    })}
                    {marginAvailable &&
                      columnYears.map((y, yi) => {
                        const yt = yearTotalBySalesYear.get(y);
                        const vacPack = sumVacationMargeForColumn(
                          y,
                          yi,
                          columnYears,
                          lookup,
                          todayYmd,
                          marginAvailable,
                        );
                        const bookedMarge = yt?.totaalJaar.marge ?? 0;
                        const displayMarge = vacPack.hasUpcomingProj
                          ? bookedMarge + (vacPack.withProjection - vacPack.actual)
                          : bookedMarge;
                        const pr = projectionBySalesYear.get(y);
                        return (
                          <td key={`tj-${y}`} className="px-3 py-2 text-right text-green-900 align-top">
                            <div
                              className={`whitespace-nowrap ${vacPack.hasUpcomingProj ? 'text-green-950 font-semibold' : ''}`}
                            >
                              €{formatBE(displayMarge)}
                              {vacPack.hasUpcomingProj ? (
                                <span className="text-xs font-normal text-green-900/90"> (incl. schatting)</span>
                              ) : null}
                            </div>
                            {vacPack.hasUpcomingProj && (
                              <div className="text-xs text-green-800/90 font-normal mt-0.5">
                                Geboekt in POS: €{formatBE(bookedMarge)}
                              </div>
                            )}
                            {pr && !vacPack.hasUpcomingProj && pr.projJaarMarge !== undefined && (
                              <ProjectionMargeLine value={pr.projJaarMarge} />
                            )}
                          </td>
                        );
                      })}
                  </tr>
                </tbody>
              </table>
              {(periods.length > 0 || yearTotals.length > 0) && (
                <div
                  className={`mt-4 rounded-xl border p-4 text-sm ${
                    summerOutlook.ok
                      ? 'bg-sky-50 border-sky-200 text-sky-950'
                      : 'bg-gray-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <h2 className="font-semibold text-base mb-2 text-gray-900">
                    Zomervakantie: gemiddelde stijging en schatting volgende zomer
                  </h2>
                  {summerOutlook.ok && summerOutlook.projectionMode === 'tableAligned' ? (
                    <>
                      <p className="mb-2">
                        Voor verkoopsjaar <strong>{summerOutlook.targetSalesYear}</strong> is de zomerschatting hieronder{' '}
                        <strong>dezelfde</strong> als de paarse cel in de tabel: trend van{' '}
                        <strong>{summerOutlook.sourceCount}</strong> andere vakantie(s) in dat jaar t.o.v. het jaar ervoor,
                        toegepast op de zomer van <strong>{summerOutlook.baselineYear}</strong> (€
                        {formatBE(summerOutlook.baselineOmzet)}). Dat komt neer op{' '}
                        <strong>
                          {summerOutlook.impliedGrowthPctOmzet > 0 ? '+' : ''}
                          {summerOutlook.impliedGrowthPctOmzet.toLocaleString('nl-BE', {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </strong>{' '}
                        omzet t.o.v. die zomer in {summerOutlook.baselineYear}.
                      </p>
                      <p className="mb-2 text-base font-semibold text-gray-900">
                        Geschatte omzet volgende zomervakantie: ∼ €{formatBE(summerOutlook.projectedOmzet)}
                      </p>
                      {summerOutlook.projectedMarge !== undefined && summerOutlook.baselineMarge !== undefined && (
                        <p className="mb-2 text-green-900">
                          Marge (zelfde methode): vertrekpunt zomer {summerOutlook.baselineMarge.year} (€
                          {formatBE(summerOutlook.baselineMarge.marge)}), schatting ∼ €
                          {formatBE(summerOutlook.projectedMarge)}
                          {summerOutlook.impliedGrowthPctMarge !== undefined && (
                            <>
                              {' '}
                              (
                              <strong>
                                {summerOutlook.impliedGrowthPctMarge > 0 ? '+' : ''}
                                {summerOutlook.impliedGrowthPctMarge.toLocaleString('nl-BE', {
                                  maximumFractionDigits: 1,
                                })}
                                %
                              </strong>{' '}
                              t.o.v. die marge)
                            </>
                          )}
                          .
                        </p>
                      )}
                      {summerOutlook.historicalAvgYoYPct !== undefined && summerOutlook.historicalStepCount > 0 && (
                        <p className="mb-2 text-xs text-gray-700">
                          Ter vergelijking: gemiddelde historische zomer↔zomer groei over{' '}
                          <strong>{summerOutlook.historicalStepCount}</strong> stap(pen) in deze kolommen:{' '}
                          <strong>
                            {summerOutlook.historicalAvgYoYPct > 0 ? '+' : ''}
                            {summerOutlook.historicalAvgYoYPct.toLocaleString('nl-BE', {
                              maximumFractionDigits: 1,
                            })}
                            %
                          </strong>{' '}
                          (niet gebruikt voor het bedrag hierboven).
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                        Zelfde berekening als de paarse schatting in de tabel voor deze kolom. Enkel oriëntatie; geen model
                        voor weer, prijzen of verkoopdagen.
                      </p>
                    </>
                  ) : summerOutlook.ok && summerOutlook.projectionMode === 'historicalChain' ? (
                    <>
                      <p className="mb-2">
                        Gemiddelde jaarlijkse omzetstijging op de <strong>zomervakantie</strong> over{' '}
                        <strong>{summerOutlook.yoyStepCount}</strong>{' '}
                        {summerOutlook.yoyStepCount === 1
                          ? 'jaar-op-jaar vergelijking'
                          : 'opeenvolgende jaar-op-jaar vergelijkingen'}{' '}
                        in deze kolommen:{' '}
                        <strong>
                          {summerOutlook.avgYoYPct > 0 ? '+' : ''}
                          {summerOutlook.avgYoYPct.toLocaleString('nl-BE', {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </strong>
                        .
                      </p>
                      <p className="mb-2">
                        Vertrekpunt (meest recente kolom met zomeromzet): verkoopsjaar{' '}
                        <strong>{summerOutlook.baselineYear}</strong> — €{formatBE(summerOutlook.baselineOmzet)}.
                      </p>
                      <p className="mb-2 text-base font-semibold text-gray-900">
                        Geschatte omzet volgende zomervakantie: ∼ €{formatBE(summerOutlook.projectedOmzet)}
                      </p>
                      {summerOutlook.projectedMarge !== undefined && summerOutlook.baselineMarge !== undefined && (
                        <p className="mb-2 text-green-900">
                          Marge (zelfde methode): gemiddelde stijging{' '}
                          <strong>
                            {(summerOutlook.avgYoYMargePct ?? 0) > 0 ? '+' : ''}
                            {(summerOutlook.avgYoYMargePct ?? 0).toLocaleString('nl-BE', {
                              maximumFractionDigits: 1,
                            })}
                            %
                          </strong>
                          , vertrekpunt {summerOutlook.baselineMarge.year} (€
                          {formatBE(summerOutlook.baselineMarge.marge)}), schatting ∼ €
                          {formatBE(summerOutlook.projectedMarge)}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                        Schatting = omzet meest recente zomervakantie in de tabel × (1 + gemiddelde groei). Enkel
                        oriëntatie; geen model voor weer, prijzen of verkoopdagen.
                      </p>
                    </>
                  ) : (
                    <p>{summerOutlook.message}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
