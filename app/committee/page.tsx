import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getStatGroups, asGrain, type OrgGrain } from '@/lib/groups';
import { getStatSeriesBatch, asScale, SCALES, type Scale } from '@/lib/series';
import { asRange, DEFAULT_RANGE, type Range } from '@/lib/range';
import { formatDate, currentWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { CommitteeBoard, type CommitteeGroup } from '@/components/committee-client';
import { StatsSubNav } from '@/components/stats-subnav';
import { ControlSelect, RangeSelect } from '@/components/graph-controls';

export const dynamic = 'force-dynamic';

// Slice 2e — the committee-wide stats dashboard, the surface projected at the
// weekly meeting and gone through area by area.
//
// Every active stat on the committee, rendered in GROUPS (lib/groups.ts). This
// page knows nothing about org structure: it asks for groups and lays out
// whatever it gets, so a custom group appears here the moment one exists.
//
// Visibility: every logged-in member sees every stat. That is the current rule
// (there is no restricted stat yet); when one exists, filter in getStatGroups so
// every grouping inherits it at once.

export default async function CommitteePage({
  searchParams,
}: {
  searchParams: Promise<{ scale?: string; by?: string; range?: string; from?: string; to?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const scale = asScale(sp.scale);
  const range = asRange(sp.range);
  const grain: OrgGrain = asGrain(sp.by);

  // Hard right edge for the custom-range picker — the current week, never later.
  const latestWeek = await currentWeekEnding();

  const groups = await getStatGroups(grain);

  // ONE batched read for every chart on the page, rather than three queries per
  // stat. A committee dashboard grows with the board, so the N+1 would bite.
  const statIds = groups.flatMap((g) => g.stats.map((s) => s.id));
  const series = await getStatSeriesBatch(statIds, scale, false, range, sp.from, sp.to);

  const view: CommitteeGroup[] = groups.map((g) => ({
    key: g.key,
    name: g.name,
    subtitle: g.subtitle,
    source: g.source,
    cards: g.stats.flatMap((s) => {
      const sv = series.get(s.id);
      if (!sv) return [];
      return [
        {
          statId: s.id,
          title: s.name,
          subtitle: s.contextLabel,
          historyHref: `/stats/history/stat/${s.id}`,
          hasData: sv.points.some((p) => p.value != null),
          points: sv.points,
          notes: sv.notes.map((n) => ({
            id: n.id,
            date: n.date,
            dateLabel: formatDate(n.date),
            body: n.body,
          })),
          rollup: sv.rollup,
          rollupNote: sv.rollupNote,
        },
      ];
    }),
  }));

  const totalStats = view.reduce((n, g) => n + g.cards.length, 0);
  const href = (next: { scale?: Scale; by?: OrgGrain; range?: Range }) => {
    const q = new URLSearchParams();
    const s = next.scale ?? scale;
    const b = next.by ?? grain;
    const r = next.range ?? range;
    if (s !== 'weekly') q.set('scale', s);
    if (b !== 'division') q.set('by', b);
    if (r !== DEFAULT_RANGE) q.set('range', r);
    const qs = q.toString();
    return qs ? `/committee?${qs}` : '/committee';
  };

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <StatsSubNav active="committee" isAdmin={member.role === 'admin'} />
      <div className="cm-wrap">
        <div className="cm-head">
          <div>
            <h1>Committee Stats</h1>
            <p className="cm-sub">
              {totalStats} stat{totalStats === 1 ? '' : 's'} across {view.length}{' '}
              {view.length === 1 ? 'group' : 'groups'} — go through them area by area.
            </p>
          </div>
          <Link href="/dashboard" className="cm-mine">
            My Stats →
          </Link>
        </div>

        <div className="ctl-row cm-controls">
          <ControlSelect
            label="Scale"
            value={scale}
            options={SCALES.map((s: Scale) => ({
              value: s,
              label: s[0].toUpperCase() + s.slice(1),
              href: href({ scale: s }),
            }))}
          />
          <RangeSelect
            value={range}
            basePath="/committee"
            params={{
              scale: scale !== 'weekly' ? scale : undefined,
              by: grain !== 'division' ? grain : undefined,
            }}
            from={sp.from}
            to={sp.to}
            latestWeek={latestWeek}
          />
          <ControlSelect
            label="Group by"
            value={grain}
            options={(['division', 'department'] as OrgGrain[]).map((g) => ({
              value: g,
              label: g[0].toUpperCase() + g.slice(1),
              href: href({ by: g }),
            }))}
          />
        </div>

        {view.length === 0 ? (
          <p className="cm-empty">
            No stats have been defined yet. An admin can add them under{' '}
            <Link href="/settings/stats" className="gr-emptylink">
              Settings → Manage Stats
            </Link>
            .
          </p>
        ) : (
          <CommitteeBoard groups={view} scale={scale} />
        )}
      </div>
    </>
  );
}
