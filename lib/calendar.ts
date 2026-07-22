// Month-grid date math. Pure functions on YYYY-MM / YYYY-MM-DD strings, UTC
// only (same rule as lib/week.ts — Vercel runs UTC and the committee's dates are
// calendar dates, not instants). No DB, no server-only: a client component can
// import this too.
//
// Generic on purpose: the Events calendar is the first caller, but a Slice 4
// programs/targets calendar wants exactly the same grid.

export type CalendarDay = {
  iso: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean; // false for the leading/trailing days of adjacent months
  isToday: boolean;
  isWeekend: boolean;
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = parse(v);
  return !Number.isNaN(d.getTime()) && iso(d) === v;
}

function parse(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD (UTC), the app-wide convention. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The YYYY-MM a date falls in. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Shift a YYYY-MM by whole months (negative goes back). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "July 2026" */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The inclusive date range the month's GRID covers — from the Sunday on or
 * before the 1st to the Saturday on or after the last. Fetch events for this
 * range, not the calendar month, or the leading/trailing cells render empty
 * while showing a date that has events.
 */
export function gridRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const from = new Date(first);
  from.setUTCDate(from.getUTCDate() - from.getUTCDay());
  const to = new Date(last);
  to.setUTCDate(to.getUTCDate() + (6 - to.getUTCDay()));
  return { from: iso(from), to: iso(to) };
}

/** The month as weeks of 7 days, Sunday-first, padded with adjacent-month days. */
export function monthGrid(month: string, today: string = todayISO()): CalendarDay[][] {
  const { from, to } = gridRange(month);
  const weeks: CalendarDay[][] = [];
  const cursor = parse(from);
  const end = parse(to);
  let week: CalendarDay[] = [];
  while (cursor <= end) {
    const cellISO = iso(cursor);
    week.push({
      iso: cellISO,
      dayOfMonth: cursor.getUTCDate(),
      inMonth: cellISO.startsWith(month),
      isToday: cellISO === today,
      isWeekend: cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6,
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weeks;
}

/** "Wed, Jul 22, 2026" — the long form used in headers. */
export function formatLongDate(isoDate: string): string {
  return parse(isoDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Jul 22" — the compact form used in dense lists. */
export function formatShortDate(isoDate: string): string {
  return parse(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
