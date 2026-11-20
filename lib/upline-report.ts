import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { memberDisplayNames } from '@/lib/member-names';
import { getAdjustableWeekly, loadAdjustable } from '@/lib/adjustable';
import { formatWeekEnding } from '@/lib/week';
import { specFor } from '@/lib/stat-details';

// THE UPLINE REPORT — the committee's weekly stat form, assembled.
//
// 13 numbered lines: a value, the definition paragraph issued with the form, and
// for most of them a detail table. Everything comes from what was already
// reported — stat_entries / member_hours for the values (0007/0009),
// stat_detail_lines for the tables (0022), the member list for line 5's roster.
// Nothing here is entered twice.
//
// The COLUMNS of each table are the form's, not the app's: line 1 prints
// "Name | Service | Org | OTC Member", where the first three come from the
// detail line's fields and the last is who reported it. That mapping lives in
// TABLES below, so a change to the form is a change here and not a rewrite.
//
// Empty tables are rendered with blank rows, exactly as the paper form does — a
// stat with no activity still shows its skeleton.

export type ReportCell = string;

export type ReportTable = {
  columns: string[];
  rows: ReportCell[][];
  /** Blank rows to print when there is no data, matching the paper form. */
  blankRows: number;
};

export type ReportLine = {
  line: number;
  label: string;
  value: string;
  definition: string | null;
  table: ReportTable | null;
};

export type UplineReport = {
  orgName: string;
  weekEnding: string;
  weekLabel: string;
  lines: ReportLine[];
  /** Lines whose definition has never been entered — surfaced, not hidden. */
  missingDefinitions: number[];
  /** Members counted in line 5's roster; the roster is only as complete as this. */
  rosterSize: number;
};

/**
 * How each line's detail lands in the form's columns. `field` reads a key from
 * the detail line's jsonb; `member` is who reported it; `const` is a fixed value
 * (line 5 prints a literal 1 in "Members").
 */
type ColumnSource =
  | { header: string; from: 'field'; key: string }
  | { header: string; from: 'member' }
  | { header: string; from: 'const'; value: string };

const TABLES: Record<number, { columns: ColumnSource[]; blankRows: number }> = {
  1: {
    blankRows: 4,
    columns: [
      { header: 'Name', from: 'field', key: 'person_name' },
      { header: 'Service', from: 'field', key: 'service' },
      { header: 'Org', from: 'field', key: 'org' },
      { header: 'OTC Member', from: 'member' },
    ],
  },
  3: {
    blankRows: 4,
    columns: [
      { header: 'Name', from: 'field', key: 'donor_name' },
      { header: 'Funds Raised', from: 'field', key: 'amount' },
      { header: 'Org', from: 'field', key: 'org' },
      { header: 'OTC Member', from: 'member' },
    ],
  },
  // Line 5 is not built from detail lines alone — see rosterRows().
  5: {
    blankRows: 0,
    columns: [
      { header: 'Name', from: 'field', key: 'member_name' },
      { header: 'Members', from: 'const', value: '1' },
      { header: 'Active', from: 'field', key: 'active' },
      { header: 'Project', from: 'field', key: 'project_or_post' },
    ],
  },
  7: {
    blankRows: 4,
    columns: [
      { header: 'Event held', from: 'field', key: 'event_name' },
      { header: 'I/C', from: 'field', key: 'ic' },
      { header: 'Products gotten', from: 'field', key: 'products_gotten' },
    ],
  },
  9: {
    blankRows: 4,
    columns: [
      { header: 'Total Hours', from: 'field', key: 'hours' },
      { header: 'Projects or Post', from: 'field', key: 'project_or_post' },
      { header: 'OTC Member', from: 'member' },
    ],
  },
  10: {
    blankRows: 4,
    columns: [
      { header: 'Project', from: 'field', key: 'project' },
      { header: 'Volunteer Name', from: 'field', key: 'volunteer_name' },
    ],
  },
  11: {
    blankRows: 4,
    columns: [
      { header: 'Staff', from: 'field', key: 'person_name' },
      { header: 'Org', from: 'field', key: 'org' },
      { header: 'OTC Member', from: 'member' },
    ],
  },
  13: {
    blankRows: 4,
    columns: [
      { header: 'IAS Funds Raised', from: 'field', key: 'donor_name' },
      { header: 'IAS Funds', from: 'field', key: 'amount' },
      { header: 'OTC Member', from: 'member' },
    ],
  },
};

const num = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v);
};

export async function buildUplineReport(weekEnding: string): Promise<UplineReport> {
  const supa = getServiceClient();

  const [{ data: statRows }, { data: setting }, { data: members }] = await Promise.all([
    supa
      .from('stats')
      .select('id, name, report_line, report_label, definition, detail_kind')
      .not('report_line', 'is', null)
      .order('report_line', { ascending: true }),
    supa.from('settings').select('value').eq('key', 'report_org_name').maybeSingle(),
    supa.from('members').select('id, name, email'),
  ]);

  const stats = statRows ?? [];
  const ids = stats.map((s) => s.id as string);

  // ---- values ---------------------------------------------------------------
  const adjustable = await loadAdjustable(ids);
  const [{ data: entries }, { data: hours }, { data: detail }] = await Promise.all([
    supa.from('stat_entries').select('stat_id, value, member_id').eq('week_ending', weekEnding),
    supa.from('member_hours').select('member_id, hours').eq('week_ending', weekEnding),
    supa
      .from('stat_detail_lines')
      .select('stat_id, member_id, fields, sort_order')
      .eq('week_ending', weekEnding)
      .order('sort_order', { ascending: true }),
  ]);

  const summed = new Map<string, number>();
  for (const e of entries ?? []) {
    if (e.value == null) continue;
    summed.set(e.stat_id as string, (summed.get(e.stat_id as string) ?? 0) + Number(e.value));
  }
  const hoursTotal = (hours ?? []).reduce((n, h) => n + Number(h.hours ?? 0), 0);

  // Adjustable stats report their computed base + manual, same as every surface.
  const adjTotals = new Map<string, number>();
  for (const id of ids) {
    const spec = adjustable.get(id);
    if (!spec) continue;
    const weekly = await getAdjustableWeekly(spec, weekEnding, weekEnding);
    const t = weekly.get(weekEnding);
    if (t != null) adjTotals.set(id, t);
  }

  // ---- names ----------------------------------------------------------------
  const allMemberIds = [
    ...new Set([
      ...(detail ?? []).map((d) => d.member_id as string),
      ...(members ?? []).map((m) => m.id as string),
    ]),
  ];
  const names = await memberDisplayNames(allMemberIds);

  // ---- line 5's roster: EVERY member, not only those with detail -------------
  const activeIds = new Set<string>([
    ...(hours ?? []).filter((h) => Number(h.hours ?? 0) > 0).map((h) => h.member_id as string),
    ...(entries ?? []).map((e) => e.member_id as string),
  ]);
  const line5Stat = stats.find((s) => s.report_line === 5);
  const line5Detail = (detail ?? []).filter((d) => d.stat_id === line5Stat?.id);
  const projectByMember = new Map<string, string>();
  for (const d of line5Detail) {
    const f = (d.fields ?? {}) as Record<string, unknown>;
    const who = String(f.member_name ?? '').trim();
    const proj = String(f.project_or_post ?? '').trim();
    if (proj) projectByMember.set(who.toLowerCase(), proj);
  }
  // Hours detail doubles as "what they worked on" when line 5 has no row.
  const hoursDetail = (detail ?? []).filter((d) => d.stat_id === null);
  const hoursProjectByMember = new Map<string, string>();
  for (const d of hoursDetail) {
    const f = (d.fields ?? {}) as Record<string, unknown>;
    const proj = String(f.project_or_post ?? '').trim();
    const id = d.member_id as string;
    if (!proj) continue;
    hoursProjectByMember.set(id, [hoursProjectByMember.get(id), proj].filter(Boolean).join('; '));
  }

  const rosterRows = (members ?? [])
    .map((m) => {
      const id = m.id as string;
      const name = names.get(id) ?? 'Unknown';
      const project =
        projectByMember.get(name.toLowerCase()) ?? hoursProjectByMember.get(id) ?? '';
      return [name, '1', activeIds.has(id) ? '1' : '', project];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  // ---- assemble -------------------------------------------------------------
  const lines: ReportLine[] = [];
  const missingDefinitions: number[] = [];

  for (const s of stats) {
    const line = s.report_line as number;
    const id = s.id as string;
    const value =
      line === 9
        ? num(adjTotals.get(id) ?? hoursTotal)
        : num(adjTotals.get(id) ?? summed.get(id) ?? null);

    if (!s.definition || String(s.definition).trim() === '') missingDefinitions.push(line);

    let table: ReportTable | null = null;
    const shape = TABLES[line];
    if (shape) {
      const columns = shape.columns.map((c) => c.header);
      let rows: ReportCell[][];
      if (line === 5) {
        rows = rosterRows;
      } else {
        // Line 9's detail is the HOURS lines, which carry stat_id NULL because
        // hours live in member_hours and not in stat_entries (0022). Filtering
        // by this stat's id would silently print an empty table under a real
        // total, which is worse than no table at all.
        const mine =
          line === 9
            ? (detail ?? []).filter((d) => d.stat_id === null)
            : (detail ?? []).filter((d) => d.stat_id === id);
        rows = mine.map((d) => {
          const f = (d.fields ?? {}) as Record<string, unknown>;
          return shape.columns.map((c) => {
            if (c.from === 'member') return names.get(d.member_id as string) ?? '';
            if (c.from === 'const') return c.value;
            const raw = f[c.key];
            return raw === undefined || raw === null ? '' : String(raw);
          });
        });
      }
      table = { columns, rows, blankRows: shape.blankRows };
    }

    lines.push({
      line,
      label: (s.report_label as string) ?? (s.name as string),
      value,
      definition: (s.definition as string | null) ?? null,
      table,
    });
  }

  return {
    orgName: (setting?.value as string) ?? 'OT Committee',
    weekEnding,
    weekLabel: formatWeekEnding(weekEnding),
    lines,
    missingDefinitions,
    rosterSize: (members ?? []).length,
  };
}

/** Which detail spec backs a line, for the "where does this come from" hint. */
export function sourceHint(line: ReportLine, detailKind: string | null): string | null {
  const spec = specFor(detailKind);
  return spec ? spec.hint : null;
}
