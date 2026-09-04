export type GroupBy = 'month' | 'quarter';

export type ActionCategory =
  | 'in_invoice'
  | 'in_refund'
  | 'out_invoice'
  | 'out_refund'
  | 'entry'
  | 'vat_entry'
  | 'payment_inbound'
  | 'payment_outbound'
  | 'bank_statement';

export type AccountingSource =
  | 'account.move'
  | 'account.payment'
  | 'account.bank.statement.line';

export type PartnerUser = {
  id: number;
  name: string;
  login: string;
};

export type AccountingEntry = {
  id: number;
  source: AccountingSource;
  category: ActionCategory;
  date: string;
  createDate: string;
  createAt: string | null;
  estimatedMinutes: number;
  amount: number;
  state: string;
  ref: string | null;
  name: string | null;
  partnerName: string | null;
  journalName: string | null;
  userName: string | null;
  userId: number | null;
};

export type CategorySummary = {
  category: ActionCategory;
  label: string;
  count: number;
  amount: number;
  estimatedMinutes: number;
};

export type PeriodBucket = {
  key: string;
  label: string;
  summary: CategorySummary[];
  totalCount: number;
  totalAmount: number;
  estimatedMinutes: number;
  sessionCount: number;
  entries: AccountingEntry[];
};

export type ProcessPlaybookItem = {
  category: ActionCategory;
  label: string;
  description: string;
  count: number;
  amount: number;
  estimatedMinutes: number;
  avgMinutesPerAction: number;
  periods: string[];
  avgPerPeriod: number;
  frequencyLabel: string;
};

export type WorkSession = {
  userId: number | null;
  userName: string | null;
  startAt: string;
  endAt: string;
  actionCount: number;
  estimatedMinutes: number;
};

export type UserEffort = {
  userId: number | null;
  userName: string;
  sessionCount: number;
  actionCount: number;
  estimatedMinutes: number;
};

export type EffortSummary = {
  estimatedMinutes: number;
  sessionCount: number;
  gapMinutes: number;
  defaultActionMinutes: number;
  users: UserEffort[];
};

export type AccountingInsights = {
  dateFrom: string;
  dateTo: string;
  groupBy: GroupBy;
  houseUsers: PartnerUser[];
  partnerUsers: PartnerUser[];
  partnerUsersActive: PartnerUser[];
  overall: CategorySummary[];
  totalCount: number;
  totalAmount: number;
  effort: EffortSummary;
  periods: PeriodBucket[];
  processes: ProcessPlaybookItem[];
  warnings: string[];
};

type OdooMove = {
  id: number;
  name?: string;
  date?: string;
  create_date?: string;
  create_uid?: unknown;
  state?: string;
  amount_total_signed?: number;
  amount_total?: number;
  ref?: string | false;
  partner_id?: unknown;
  journal_id?: unknown;
  move_type?: string;
};

type OdooPayment = {
  id: number;
  name?: string;
  date?: string;
  create_date?: string;
  create_uid?: unknown;
  state?: string;
  amount?: number;
  payment_type?: string;
  partner_id?: unknown;
  journal_id?: unknown;
  ref?: string | false;
  memo?: string | false;
  move_id?: unknown;
};

type OdooBankLine = {
  id: number;
  date?: string;
  create_date?: string;
  create_uid?: unknown;
  amount?: number;
  payment_ref?: string | false;
  partner_id?: unknown;
  journal_id?: unknown;
  is_reconciled?: boolean;
  move_id?: unknown;
  ref?: string | false;
  state?: string;
};

const HOUSE_USER_RE = /margot/i;
const VAT_RE = /\b(btw|vat|tva|taxe?\b|btw-aangifte|vat return)/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Gap between two actions of the same user that still counts as one work session. */
export const SESSION_GAP_MINUTES = 30;
/** Time attributed to a lone action, and added after the last action in a session. */
export const DEFAULT_ACTION_MINUTES = 3;
/** Cap so overnight batch jobs cannot look like a 12-hour workday. */
export const MAX_SESSION_MINUTES = 8 * 60;

const SESSION_GAP_MS = SESSION_GAP_MINUTES * 60 * 1000;
const DEFAULT_ACTION_MS = DEFAULT_ACTION_MINUTES * 60 * 1000;
const MAX_SESSION_MS = MAX_SESSION_MINUTES * 60 * 1000;

export const ACTION_CATEGORY_ORDER: ActionCategory[] = [
  'in_invoice',
  'in_refund',
  'out_invoice',
  'out_refund',
  'payment_inbound',
  'payment_outbound',
  'bank_statement',
  'vat_entry',
  'entry',
];

export function actionCategoryLabel(category: ActionCategory): string {
  switch (category) {
    case 'in_invoice':
      return 'Aankoopfactuur';
    case 'in_refund':
      return 'Creditnota leverancier';
    case 'out_invoice':
      return 'Verkoopfactuur';
    case 'out_refund':
      return 'Creditnota klant';
    case 'entry':
      return 'Diverse boeking';
    case 'vat_entry':
      return 'BTW-boeking';
    case 'payment_inbound':
      return 'Ontvangen betaling';
    case 'payment_outbound':
      return 'Uitgaande betaling';
    case 'bank_statement':
      return 'Bankafschrift / Reconciliatie';
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function actionCategoryDescription(category: ActionCategory): string {
  switch (category) {
    case 'in_invoice':
      return 'Leveranciersfacturen invoeren, controleren en boeken in Odoo.';
    case 'in_refund':
      return 'Creditnota’s van leveranciers verwerken en boeken.';
    case 'out_invoice':
      return 'Verkoopfacturen aanmaken en boeken.';
    case 'out_refund':
      return 'Creditnota’s voor klanten aanmaken.';
    case 'entry':
      return 'Diverse journaalboekingen: correcties, afschrijvingen of voorzieningen.';
    case 'vat_entry':
      return 'BTW-gerelateerde journaalboekingen voorbereiden of afsluiten.';
    case 'payment_inbound':
      return 'Ontvangen betalingen registreren en afletteren tegen openstaande facturen.';
    case 'payment_outbound':
      return 'Uitgaande betalingen aan leveranciers registreren en afletteren.';
    case 'bank_statement':
      return 'Bankafschriften importeren en regels reconciliëren met openstaande posten.';
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function many2oneName(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[1] === 'string' && value[1].trim()) {
    return value[1];
  }
  return null;
}

export function many2oneId(value: unknown): number | null {
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const slice = value.slice(0, 10);
  return DATE_ONLY_RE.test(slice) ? slice : null;
}

/** Parse Odoo naive UTC datetimes (`YYYY-MM-DD HH:MM:SS`) to a Date. */
export function parseOdooDatetime(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDurationMinutes(minutes: number): string {
  if (!(minutes > 0)) return '0 min';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (rest === 0) return `${hours} u`;
  return `${hours} u ${rest} min`;
}

function entryKey(entry: AccountingEntry): string {
  return `${entry.source}-${entry.id}`;
}

export function isHouseUser(user: { name: string; login: string }): boolean {
  return HOUSE_USER_RE.test(user.name) || HOUSE_USER_RE.test(user.login);
}

export function isSystemUser(user: { id: number; name: string; login: string }): boolean {
  if (user.id === 1) return true;
  const login = user.login.toLowerCase();
  if (login === '__system__' || login === 'public' || login === 'portal') return true;
  if (/^odoo\s*bot$/i.test(user.name)) return true;
  if (/^public\s*user$/i.test(user.name)) return true;
  return false;
}

export function isVatRelated(...parts: Array<string | null | undefined>): boolean {
  return parts.some((part) => Boolean(part && VAT_RE.test(part)));
}

export function categorizeMove(
  moveType: string | undefined,
  journalName: string | null,
  name: string | null,
  ref: string | null
): ActionCategory {
  switch (moveType) {
    case 'in_invoice':
    case 'in_receipt':
      return 'in_invoice';
    case 'in_refund':
      return 'in_refund';
    case 'out_invoice':
    case 'out_receipt':
      return 'out_invoice';
    case 'out_refund':
      return 'out_refund';
    case 'entry':
      return isVatRelated(journalName, name, ref) ? 'vat_entry' : 'entry';
    default:
      return isVatRelated(journalName, name, ref) ? 'vat_entry' : 'entry';
  }
}

export function categorizePayment(paymentType: string | undefined): ActionCategory {
  return paymentType === 'inbound' ? 'payment_inbound' : 'payment_outbound';
}

export function periodKey(date: string, groupBy: GroupBy): string {
  const [year, month] = date.split('-').map(Number);
  if (groupBy === 'month') return `${year}-${String(month).padStart(2, '0')}`;
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

export function periodLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === 'month') {
    const [yearStr, monthStr] = key.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const name = new Date(year, month - 1, 1).toLocaleDateString('nl-BE', {
      month: 'long',
      year: 'numeric',
    });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  const [year, quarter] = key.split('-Q');
  return `Q${quarter} ${year}`;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function classifyUsers(users: PartnerUser[]): {
  houseUsers: PartnerUser[];
  partnerUsers: PartnerUser[];
  systemUsers: PartnerUser[];
} {
  const houseUsers: PartnerUser[] = [];
  const partnerUsers: PartnerUser[] = [];
  const systemUsers: PartnerUser[] = [];
  for (const user of users) {
    if (isSystemUser(user)) {
      systemUsers.push(user);
      continue;
    }
    if (isHouseUser(user)) {
      houseUsers.push(user);
      continue;
    }
    partnerUsers.push(user);
  }
  return { houseUsers, partnerUsers, systemUsers };
}

function emptySummaries(): CategorySummary[] {
  return ACTION_CATEGORY_ORDER.map((category) => ({
    category,
    label: actionCategoryLabel(category),
    count: 0,
    amount: 0,
    estimatedMinutes: 0,
  }));
}

export function summarizeEntries(entries: AccountingEntry[]): CategorySummary[] {
  const byCategory = new Map(emptySummaries().map((row) => [row.category, row]));
  for (const entry of entries) {
    const row = byCategory.get(entry.category);
    if (!row) continue;
    row.count += 1;
    row.amount += Math.abs(entry.amount);
    row.estimatedMinutes += entry.estimatedMinutes || 0;
  }
  return ACTION_CATEGORY_ORDER.map((category) => byCategory.get(category)!).filter(
    (row) => row.count > 0
  );
}

export function frequencyLabel(avgPerPeriod: number, groupBy: GroupBy): string {
  const unit = groupBy === 'month' ? 'maand' : 'kwartaal';
  if (avgPerPeriod >= 8 && groupBy === 'month') return `ongeveer wekelijks (${avgPerPeriod.toFixed(1)}× per maand)`;
  if (avgPerPeriod >= 1) {
    return `${avgPerPeriod.toFixed(1).replace('.', ',')}× per ${unit}`;
  }
  return `sporadisch (${avgPerPeriod.toFixed(1).replace('.', ',')}× per ${unit})`;
}

export function groupEntries(entries: AccountingEntry[], groupBy: GroupBy): PeriodBucket[] {
  const buckets = new Map<string, AccountingEntry[]>();
  for (const entry of entries) {
    const key = periodKey(entry.date, groupBy);
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }

  const keys = [...buckets.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map((key) => {
    const periodEntries = (buckets.get(key) ?? []).sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.id - a.id;
    });
    const summary = summarizeEntries(periodEntries);
    return {
      key,
      label: periodLabel(key, groupBy),
      summary,
      totalCount: periodEntries.length,
      totalAmount: summary.reduce((sum, row) => sum + row.amount, 0),
      estimatedMinutes: summary.reduce((sum, row) => sum + row.estimatedMinutes, 0),
      sessionCount: countSessions(periodEntries),
      entries: periodEntries,
    };
  });
}

export function buildProcesses(periods: PeriodBucket[], groupBy: GroupBy): ProcessPlaybookItem[] {
  const periodCount = Math.max(periods.length, 1);
  const byCategory = new Map<
    ActionCategory,
    { count: number; amount: number; estimatedMinutes: number; periods: string[] }
  >();

  for (const period of periods) {
    for (const row of period.summary) {
      const current = byCategory.get(row.category) ?? {
        count: 0,
        amount: 0,
        estimatedMinutes: 0,
        periods: [],
      };
      current.count += row.count;
      current.amount += row.amount;
      current.estimatedMinutes += row.estimatedMinutes;
      current.periods.push(period.label);
      byCategory.set(row.category, current);
    }
  }

  return ACTION_CATEGORY_ORDER.flatMap((category) => {
    const data = byCategory.get(category);
    if (!data) return [];
    const avgPerPeriod = data.count / periodCount;
    return [
      {
        category,
        label: actionCategoryLabel(category),
        description: actionCategoryDescription(category),
        count: data.count,
        amount: data.amount,
        estimatedMinutes: data.estimatedMinutes,
        avgMinutesPerAction: data.count > 0 ? data.estimatedMinutes / data.count : 0,
        periods: data.periods,
        avgPerPeriod,
        frequencyLabel: frequencyLabel(avgPerPeriod, groupBy),
      },
    ];
  });
}

export function assembleInsights(
  entries: AccountingEntry[],
  params: {
    dateFrom: string;
    dateTo: string;
    groupBy: GroupBy;
    houseUsers: PartnerUser[];
    partnerUsers: PartnerUser[];
    warnings?: string[];
  }
): AccountingInsights {
  const effort = estimateWorkEffort(entries);
  const periods = groupEntries(effort.entries, params.groupBy);
  const overall = summarizeEntries(effort.entries);
  const activeIds = new Set(
    effort.entries.map((entry) => entry.userId).filter((id): id is number => id != null)
  );
  const partnerUsersActive = params.partnerUsers.filter((user) => activeIds.has(user.id));

  return {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    groupBy: params.groupBy,
    houseUsers: params.houseUsers,
    partnerUsers: params.partnerUsers,
    partnerUsersActive,
    overall,
    totalCount: effort.entries.length,
    totalAmount: overall.reduce((sum, row) => sum + row.amount, 0),
    effort: {
      estimatedMinutes: effort.estimatedMinutes,
      sessionCount: effort.sessions.length,
      gapMinutes: SESSION_GAP_MINUTES,
      defaultActionMinutes: DEFAULT_ACTION_MINUTES,
      users: effort.users,
    },
    periods,
    processes: buildProcesses(periods, params.groupBy),
    warnings: params.warnings ?? [],
  };
}

export function estimateWorkEffort(entries: AccountingEntry[]): {
  entries: AccountingEntry[];
  sessions: WorkSession[];
  users: UserEffort[];
  estimatedMinutes: number;
} {
  const byUser = new Map<string, AccountingEntry[]>();
  for (const entry of entries) {
    const key = String(entry.userId ?? `name:${entry.userName ?? 'onbekend'}`);
    const list = byUser.get(key);
    if (list) list.push(entry);
    else byUser.set(key, [entry]);
  }

  const minutesByKey = new Map<string, number>();
  const sessions: WorkSession[] = [];

  for (const userEntries of byUser.values()) {
    const dated = userEntries
      .map((entry) => ({ entry, at: entry.createAt ? Date.parse(entry.createAt) : NaN }))
      .filter((row) => Number.isFinite(row.at))
      .sort((a, b) => a.at - b.at || a.entry.id - b.entry.id);

    const undated = userEntries.filter((entry) => !entry.createAt || Number.isNaN(Date.parse(entry.createAt)));
    for (const entry of undated) {
      minutesByKey.set(entryKey(entry), DEFAULT_ACTION_MINUTES);
      sessions.push({
        userId: entry.userId,
        userName: entry.userName,
        startAt: `${entry.date}T00:00:00.000Z`,
        endAt: `${entry.date}T00:00:00.000Z`,
        actionCount: 1,
        estimatedMinutes: DEFAULT_ACTION_MINUTES,
      });
    }

    let bucket: typeof dated = [];
    const flush = () => {
      if (bucket.length === 0) return;
      const start = bucket[0].at;
      const end = bucket[bucket.length - 1].at;
      let durationMs = end - start + DEFAULT_ACTION_MS;
      if (durationMs < DEFAULT_ACTION_MS) durationMs = DEFAULT_ACTION_MS;
      if (durationMs > MAX_SESSION_MS) durationMs = MAX_SESSION_MS;
      const perMinutes = durationMs / bucket.length / 60_000;
      for (const row of bucket) {
        minutesByKey.set(entryKey(row.entry), perMinutes);
      }
      const first = bucket[0].entry;
      sessions.push({
        userId: first.userId,
        userName: first.userName,
        startAt: first.createAt ?? new Date(start).toISOString(),
        endAt: bucket[bucket.length - 1].entry.createAt ?? new Date(end).toISOString(),
        actionCount: bucket.length,
        estimatedMinutes: durationMs / 60_000,
      });
      bucket = [];
    };

    for (const row of dated) {
      if (bucket.length === 0) {
        bucket.push(row);
        continue;
      }
      const prev = bucket[bucket.length - 1].at;
      if (row.at - prev > SESSION_GAP_MS) flush();
      bucket.push(row);
    }
    flush();
  }

  const enriched = entries.map((entry) => ({
    ...entry,
    estimatedMinutes: minutesByKey.get(entryKey(entry)) ?? DEFAULT_ACTION_MINUTES,
  }));

  const usersMap = new Map<string, UserEffort>();
  for (const session of sessions) {
    const key = String(session.userId ?? session.userName ?? 'onbekend');
    const current = usersMap.get(key) ?? {
      userId: session.userId,
      userName: session.userName ?? 'Onbekend',
      sessionCount: 0,
      actionCount: 0,
      estimatedMinutes: 0,
    };
    current.sessionCount += 1;
    current.actionCount += session.actionCount;
    current.estimatedMinutes += session.estimatedMinutes;
    usersMap.set(key, current);
  }

  const users = [...usersMap.values()].sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);
  const estimatedMinutes = users.reduce((sum, user) => sum + user.estimatedMinutes, 0);

  return { entries: enriched, sessions, users, estimatedMinutes };
}

function countSessions(entries: AccountingEntry[]): number {
  return estimateWorkEffort(entries).sessions.length;
}

function userFromCreateUid(value: unknown): { id: number | null; name: string | null } {
  return { id: many2oneId(value), name: many2oneName(value) };
}

function isPartnerCreateUid(
  createUid: unknown,
  partnerIds: Set<number> | null
): boolean {
  const user = userFromCreateUid(createUid);
  if (user.id == null) return false;
  if (partnerIds) return partnerIds.has(user.id);
  if (user.name && HOUSE_USER_RE.test(user.name)) return false;
  if (user.name && /^odoo\s*bot$/i.test(user.name)) return false;
  return true;
}

export function entriesFromOdooRecords(params: {
  moves: OdooMove[];
  payments: OdooPayment[];
  bankLines: OdooBankLine[];
  partnerIds: Set<number> | null;
}): AccountingEntry[] {
  const paymentMoveIds = new Set<number>();
  const bankMoveIds = new Set<number>();
  const entries: AccountingEntry[] = [];

  for (const payment of params.payments) {
    if (!isPartnerCreateUid(payment.create_uid, params.partnerIds)) continue;
    const date = dateOnly(payment.date);
    if (!date) continue;
    const user = userFromCreateUid(payment.create_uid);
    const moveId = many2oneId(payment.move_id);
    if (moveId != null) paymentMoveIds.add(moveId);
    const created = parseOdooDatetime(payment.create_date);
    entries.push({
      id: payment.id,
      source: 'account.payment',
      category: categorizePayment(payment.payment_type),
      date,
      createDate: dateOnly(payment.create_date) ?? date,
      createAt: created ? created.toISOString() : null,
      estimatedMinutes: 0,
      amount: asNumber(payment.amount),
      state: asText(payment.state) ?? '',
      ref: asText(payment.ref) ?? asText(payment.memo),
      name: asText(payment.name),
      partnerName: many2oneName(payment.partner_id),
      journalName: many2oneName(payment.journal_id),
      userName: user.name,
      userId: user.id,
    });
  }

  for (const line of params.bankLines) {
    if (!isPartnerCreateUid(line.create_uid, params.partnerIds)) continue;
    const date = dateOnly(line.date);
    if (!date) continue;
    const user = userFromCreateUid(line.create_uid);
    const moveId = many2oneId(line.move_id);
    if (moveId != null) bankMoveIds.add(moveId);
    const created = parseOdooDatetime(line.create_date);
    entries.push({
      id: line.id,
      source: 'account.bank.statement.line',
      category: 'bank_statement',
      date,
      createDate: dateOnly(line.create_date) ?? date,
      createAt: created ? created.toISOString() : null,
      estimatedMinutes: 0,
      amount: asNumber(line.amount),
      state: line.is_reconciled ? 'reconciled' : (asText(line.state) ?? 'open'),
      ref: asText(line.ref) ?? asText(line.payment_ref),
      name: asText(line.payment_ref),
      partnerName: many2oneName(line.partner_id),
      journalName: many2oneName(line.journal_id),
      userName: user.name,
      userId: user.id,
    });
  }

  for (const move of params.moves) {
    if (!isPartnerCreateUid(move.create_uid, params.partnerIds)) continue;
    if (paymentMoveIds.has(move.id) || bankMoveIds.has(move.id)) continue;
    const date = dateOnly(move.date);
    if (!date) continue;
    const user = userFromCreateUid(move.create_uid);
    const journalName = many2oneName(move.journal_id);
    const name = asText(move.name);
    const ref = asText(move.ref);
    const created = parseOdooDatetime(move.create_date);
    entries.push({
      id: move.id,
      source: 'account.move',
      category: categorizeMove(move.move_type, journalName, name, ref),
      date,
      createDate: dateOnly(move.create_date) ?? date,
      createAt: created ? created.toISOString() : null,
      estimatedMinutes: 0,
      amount:
        move.amount_total_signed != null
          ? asNumber(move.amount_total_signed)
          : asNumber(move.amount_total),
      state: asText(move.state) ?? '',
      ref,
      name,
      partnerName: many2oneName(move.partner_id),
      journalName,
      userName: user.name,
      userId: user.id,
    });
  }

  return entries;
}

