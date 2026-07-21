import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getStatGroups, asGrain, type OrgGrain } from '@/lib/groups';
import { getStatSeriesBatch, asScale, SCALES, type Scale } from '@/lib/series';
import { asRange, DEFAULT_RANGE, RANGE_PRESETS, RANGE_LABELS, type Range } from '@/lib/range';
import { formatDate } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { CommitteeBoard, type CommitteeGroup } from '@/components/committee-client';
import { StatsSubNav } from '@/components/stats-subnav';

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

        <div className="cm-controls">
          <div className="cm-ctlgroup" role="group" aria-label="Time scale">
            {SCALES.map((s: Scale) => (
              <Link
                key={s}
                href={href({ scale: s })}
                className={`gr-scale${s === scale ? ' gr-scale-on' : ''}`}
                aria-current={s === scale ? 'true' : undefined}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </Link>
            ))}
          </div>
          <div className="cm-ctlgroup" role="group" aria-label="Date range">
            <span className="cm-ctllabel">Range</span>
            <div className="gr-ranges">
              {RANGE_PRESETS.map((r) => (
                <Link
                  key={r}
                  href={href({ range: r })}
                  className={`gr-range${r === range ? ' gr-range-on' : ''}`}
                  aria-current={r === range ? 'true' : undefined}
                >
                  {RANGE_LABELS[r]}
                </Link>
              ))}
            </div>
          </div>
          <div className="cm-ctlgroup" role="group" aria-label="Group stats by">
            <span className="cm-ctllabel">Group by</span>
            {(['division', 'department'] as OrgGrain[]).map((g) => (
              <Link
                key={g}
                href={href({ by: g })}
                className={`gr-scale${g === grain ? ' gr-scale-on' : ''}`}
                aria-current={g === grain ? 'true' : undefined}
              >
                {g[0].toUpperCase() + g.slice(1)}
              </Link>
            ))}
          </div>
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
