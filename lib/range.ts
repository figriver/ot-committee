// Graph RANGE (the visible window) — kept separate from series.ts (which is
// server-only) so the client graph can import these value constants too.
//
// Three orthogonal controls on the chart:
//   SCALE  = bucket granularity (weekly / monthly / quarterly)   — series.ts
//   RANGE  = which window of history is shown (this file)
//   SCROLL = pan within the window                               — CSS overflow
// They compose: e.g. quarterly granularity over a 1-year window, scrolled back.

export type Range = '3m' | '6m' | '1y' | 'all' | 'custom';

export const RANGES: Range[] = ['3m', '6m', '1y', 'all', 'custom'];

// Default = a readable recent window, never the full-history smash (170 weeks
// exist). Weekly 6mo = 26 weeks, matching the previous fixed default.
export const DEFAULT_RANGE: Range = '6m';

// Preset windows, in weeks (applied uniformly across scales as a calendar span).
export const RANGE_WEEKS: Record<'3m' | '6m' | '1y', number> = { '3m': 13, '6m': 26, '1y': 52 };

export const RANGE_LABELS: Record<Range, string> = {
  '3m': '3 mo',
  '6m': '6 mo',
  '1y': '1 yr',
  all: 'All',
  custom: 'Custom',
};

// Presets shown as buttons (custom is a separate toggle with date inputs).
export const RANGE_PRESETS: Range[] = ['3m', '6m', '1y', 'all'];

export function asRange(v: unknown): Range {
  return RANGES.includes(v as Range) ? (v as Range) : DEFAULT_RANGE;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}
