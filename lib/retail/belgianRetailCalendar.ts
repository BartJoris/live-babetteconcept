/**
 * Belgian retail trading calendar (solden + sperperiodes + fashion seasons).
 *
 * Official classic FOD/UNIZO/VLAIO dates:
 * - Winter solden: 3 Jan – 31 Jan (2 Jan if 3 Jan is Sunday)
 * - Summer solden: 1 Jul – 31 Jul (30 Jun if 1 Jul is Sunday)
 *
 * Used as a trading calendar for analytics. Since Raad van State (20 May 2026)
 * the advertising restriction outside these windows is largely unenforceable,
 * but jan/jul remains the industry rhythm for reporting.
 */

export type DateRange = { start: string; end: string };

export type RetailPeriodKind =
  | 'winter_sales'
  | 'summer_sales'
  | 'winter_sperperiode'
  | 'summer_sperperiode'
  | 'winter_season'
  | 'summer_season'
  | 'before_winter_sales'
  | 'during_winter_sales'
  | 'after_winter_sales'
  | 'before_summer_sales'
  | 'during_summer_sales'
  | 'after_summer_sales'
  | 'year_to_date'
  | 'full_year';

export type PeriodPreset =
  | RetailPeriodKind
  | 'winter_regular'
  | 'summer_regular';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar YYYY-MM-DD (no UTC shift). */
export function formatYmd(year: number, month1to12: number, day: number): string {
  return `${year}-${pad2(month1to12)}-${pad2(day)}`;
}

function weekdaySunday0(year: number, month1to12: number, day: number): number {
  return new Date(year, month1to12 - 1, day).getDay();
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return formatYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function todayYmd(now = new Date()): string {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Winter solden start: 3 Jan, or 2 Jan if 3 Jan is Sunday. */
export function getWinterSoldenStart(year: number): string {
  const jan3IsSunday = weekdaySunday0(year, 1, 3) === 0;
  return jan3IsSunday ? formatYmd(year, 1, 2) : formatYmd(year, 1, 3);
}

export function getWinterSoldenEnd(year: number): string {
  return formatYmd(year, 1, 31);
}

/** Summer solden start: 1 Jul, or 30 Jun if 1 Jul is Sunday. */
export function getSummerSoldenStart(year: number): string {
  const jul1IsSunday = weekdaySunday0(year, 7, 1) === 0;
  return jul1IsSunday ? formatYmd(year, 6, 30) : formatYmd(year, 7, 1);
}

export function getSummerSoldenEnd(year: number): string {
  return formatYmd(year, 7, 31);
}

export function getWinterSoldenRange(year: number): DateRange {
  return { start: getWinterSoldenStart(year), end: getWinterSoldenEnd(year) };
}

export function getSummerSoldenRange(year: number): DateRange {
  return { start: getSummerSoldenStart(year), end: getSummerSoldenEnd(year) };
}

/**
 * Sperperiode before winter solden:
 * default 3 Dec (prev year) – day before winter solden start.
 * If winter solden start early (2 Jan), sperperiode also shifts one day earlier.
 */
export function getWinterSperperiodeRange(year: number): DateRange {
  const soldenStart = getWinterSoldenStart(year);
  const early = soldenStart.endsWith('-01-02');
  return {
    start: early ? formatYmd(year - 1, 12, 2) : formatYmd(year - 1, 12, 3),
    end: addDaysYmd(soldenStart, -1),
  };
}

/**
 * Sperperiode before summer solden:
 * default 1 Jun – day before summer solden start.
 */
export function getSummerSperperiodeRange(year: number): DateRange {
  const soldenStart = getSummerSoldenStart(year);
  const early = soldenStart.endsWith('-06-30');
  return {
    start: early ? formatYmd(year, 5, 31) : formatYmd(year, 6, 1),
    end: addDaysYmd(soldenStart, -1),
  };
}

/** Winter trading season: winter solden start → 30 Jun. */
export function getWinterSeasonRange(year: number): DateRange {
  return { start: getWinterSoldenStart(year), end: formatYmd(year, 6, 30) };
}

/** Summer trading season: summer solden start → 31 Dec. */
export function getSummerSeasonRange(year: number): DateRange {
  return { start: getSummerSoldenStart(year), end: formatYmd(year, 12, 31) };
}

/** After winter solden until end of winter season (1 Feb – 30 Jun). */
export function getAfterWinterSalesRange(year: number): DateRange {
  return { start: formatYmd(year, 2, 1), end: formatYmd(year, 6, 30) };
}

/** After summer solden until year end (1 Aug – 31 Dec). */
export function getAfterSummerSalesRange(year: number): DateRange {
  return { start: formatYmd(year, 8, 1), end: formatYmd(year, 12, 31) };
}

/**
 * "Before winter sales" inside the winter cycle is empty historically
 * (season starts at solden). For analytics we treat it as the sperperiode
 * immediately before winter solden (Dec → day before solden).
 */
export function getBeforeWinterSalesRange(year: number): DateRange {
  return getWinterSperperiodeRange(year);
}

/**
 * Before summer sales within summer cycle: from summer season concept
 * there is no prior regular summer before solden in Babette model.
 * Use winter-season tail after winter solden until day before summer solden
 * (1 Feb – day before summer solden) as "pre-summer-sales trading".
 */
export function getBeforeSummerSalesRange(year: number): DateRange {
  return {
    start: formatYmd(year, 2, 1),
    end: addDaysYmd(getSummerSoldenStart(year), -1),
  };
}

export type RetailCalendar = {
  year: number;
  notes: string[];
  winterSolden: DateRange;
  summerSolden: DateRange;
  winterSperperiode: DateRange;
  summerSperperiode: DateRange;
  winterSeason: DateRange;
  summerSeason: DateRange;
  beforeWinterSales: DateRange;
  duringWinterSales: DateRange;
  afterWinterSales: DateRange;
  beforeSummerSales: DateRange;
  duringSummerSales: DateRange;
  afterSummerSales: DateRange;
};

export function getRetailCalendar(year: number): RetailCalendar {
  const winterSolden = getWinterSoldenRange(year);
  const summerSolden = getSummerSoldenRange(year);
  return {
    year,
    notes: [
      'Trading calendar based on classic Belgian solden dates (FOD/UNIZO/VLAIO).',
      'Raad van State (20 May 2026): advertising "solden" outside these windows is largely unenforceable; dates remain the analytics rhythm.',
      'Winter solden start on 3 Jan, or 2 Jan if 3 Jan is Sunday.',
      'Summer solden start on 1 Jul, or 30 Jun if 1 Jul is Sunday.',
    ],
    winterSolden,
    summerSolden,
    winterSperperiode: getWinterSperperiodeRange(year),
    summerSperperiode: getSummerSperperiodeRange(year),
    winterSeason: getWinterSeasonRange(year),
    summerSeason: getSummerSeasonRange(year),
    beforeWinterSales: getBeforeWinterSalesRange(year),
    duringWinterSales: winterSolden,
    afterWinterSales: getAfterWinterSalesRange(year),
    beforeSummerSales: getBeforeSummerSalesRange(year),
    duringSummerSales: summerSolden,
    afterSummerSales: getAfterSummerSalesRange(year),
  };
}

export function resolvePeriodPreset(
  preset: PeriodPreset,
  year: number,
  now = new Date()
): DateRange {
  switch (preset) {
    case 'winter_sales':
    case 'during_winter_sales':
      return getWinterSoldenRange(year);
    case 'summer_sales':
    case 'during_summer_sales':
      return getSummerSoldenRange(year);
    case 'winter_sperperiode':
      return getWinterSperperiodeRange(year);
    case 'summer_sperperiode':
      return getSummerSperperiodeRange(year);
    case 'winter_season':
      return getWinterSeasonRange(year);
    case 'summer_season':
      return getSummerSeasonRange(year);
    case 'before_winter_sales':
      return getBeforeWinterSalesRange(year);
    case 'after_winter_sales':
    case 'winter_regular':
      return getAfterWinterSalesRange(year);
    case 'before_summer_sales':
      return getBeforeSummerSalesRange(year);
    case 'after_summer_sales':
    case 'summer_regular':
      return getAfterSummerSalesRange(year);
    case 'full_year':
      return { start: formatYmd(year, 1, 1), end: formatYmd(year, 12, 31) };
    case 'year_to_date': {
      const y = now.getFullYear() === year ? year : year;
      const end = now.getFullYear() === year ? todayYmd(now) : formatYmd(year, 12, 31);
      return { start: formatYmd(y, 1, 1), end };
    }
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unknown period preset: ${_exhaustive}`);
    }
  }
}

export type SalesPeriodBucket =
  | 'winterSales'
  | 'winterRegular'
  | 'summerSales'
  | 'summerRegular'
  | null;

/** Classify a YYYY-MM-DD (or datetime) into Babette trading buckets for `year`. */
export function classifyDateInYear(dateStr: string, year: number): SalesPeriodBucket {
  const day = dateStr.slice(0, 10);
  const winter = getWinterSoldenRange(year);
  const summer = getSummerSoldenRange(year);

  if (day >= winter.start && day <= winter.end) return 'winterSales';
  if (day >= summer.start && day <= summer.end) return 'summerSales';
  if (day >= formatYmd(year, 2, 1) && day <= formatYmd(year, 6, 30)) {
    // Exclude summer solden early start on Jun 30 if applicable (already covered)
    if (day >= summer.start && day <= summer.end) return 'summerSales';
    return 'winterRegular';
  }
  if (day >= formatYmd(year, 8, 1) && day <= formatYmd(year, 12, 31)) {
    return 'summerRegular';
  }
  if (day === formatYmd(year, 1, 1)) return 'summerRegular';
  return null;
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  'year_to_date',
  'full_year',
  'winter_season',
  'summer_season',
  'before_winter_sales',
  'during_winter_sales',
  'after_winter_sales',
  'before_summer_sales',
  'during_summer_sales',
  'after_summer_sales',
  'winter_sales',
  'summer_sales',
  'winter_sperperiode',
  'summer_sperperiode',
  'winter_regular',
  'summer_regular',
];
