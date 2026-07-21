import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getMyDashboard } from '@/lib/dashboard';
import { recentWins } from '@/lib/wins';
import { asScale, SCALES, type Scale } from '@/lib/series';
import { asRange, DEFAULT_RANGE, type Range } from '@/lib/range';
import { formatDate, currentWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { StatGraph } from '@/components/stat-graph';
import { StatsSubNav } from '@/components/stats-subnav';
import { CardControls } from '@/components/card-controls';
import { ControlSelect, RangeSelect } from '@/components/graph-controls';

export const dynamic = 'force-dynamic';

// Slice 2d — "My Dashboard". The member's own numbers in one place: their Hours
// graph plus a graph per named stat on the post(s) they hold.
//
// Personal by construction: the member comes from the session (requireMember)
// and getMyDashboard derives everything from that id. There is no member/post
// parameter in the URL, so there is nothing to tamper with. Committee-wide views
// are 2e.
//
// One scale selector drives every card (they share this URL's ?scale=), so the
// charts are always read on the same time base — comparing a weekly stat against
// a quarterly one would be a bad default.

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scale?: string; range?: string; from?: string; to?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const scale = asScale(sp.scale);
  const range = asRange(sp.range);

  // Hard right edge for the custom-range picker — the current week, never later.
  const latestWeek = await currentWeekEnding();

  const { cards, postCount, statCount, coveredCount } = await getMyDashboard(
    member,
    scale,
    range,
    sp.from,
    sp.to,
  );

  // One page-level control drives every card; preserve the other axis in links.
  const hrefWith = (over: { scale?: Scale; range?: Range }) => {
    const p = new URLSearchParams();
    const s = over.scale ?? scale;
    const r = over.range ?? range;
    if (s !== 'weekly') p.set('scale', s);
    if (r !== DEFAULT_RANGE) p.set('range', r);
    const qs = p.toString();
    return qs ? `/dashboard?${qs}` : '/dashboard';
  };
  const recent = await recentWins(member.id, 6);

  // Group by the branch each stat reaches this member through — the same
  // branches the report view drills into, so the two read the same way.
  const branches: { name: string; cards: typeof cards }[] = [];
  for (const c of cards) {
    let g = branches.find((b) => b.name === c.branch);
    if (!g) branches.push((g = { name: c.branch, cards: [] }));
    g.cards.push(c);
  }

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <StatsSubNav active="my" isAdmin={member.role === 'admin'} />
      <div className="db-wrap">
        <div className="db-head">
          <div>
            <h1>My Stats</h1>
            <p className="db-sub">
              {statCount > 0
                ? `Your hours and ${statCount} stat${statCount === 1 ? '' : 's'} you are responsible for` +
                  ` — ${postCount} post${postCount === 1 ? '' : 's'} you hold` +
                  (coveredCount > 0
                    ? `, plus ${coveredCount} on unfilled posts you cover.`
                    : '.')
                : 'Your hours on post.'}
            </p>
          </div>
          <Link href="/stats" className="db-report">
            Enter a report →
          </Link>
        </div>

        {/* login feed — recent committee wins so members stay abreast */}
        {recent.length > 0 && (
          <section className="db-feed">
            <div className="db-feedhead">
              <h2>Recent wins</h2>
              <Link href="/wins" className="db-feedlink">
                All wins →
              </Link>
            </div>
            <ul className="db-feedlist">
              {recent.map((w) => (
                <li key={w.id} className="db-feeditem">
                  <span className="db-feedbody">{w.body}</span>
                  <span className="db-feedmeta">
                    {w.isUnattributed ? 'unattributed' : w.memberName}
                    {w.areaPostId ? ` · ${w.divisionLabel}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="ctl-row db-controls">
          <ControlSelect
            label="Scale"
            value={scale}
            options={SCALES.map((s: Scale) => ({
              value: s,
              label: s[0].toUpperCase() + s.slice(1),
              href: hrefWith({ scale: s }),
            }))}
          />
          <RangeSelect
            value={range}
            basePath="/dashboard"
            params={{ scale: scale !== 'weekly' ? scale : undefined }}
            from={sp.from}
            to={sp.to}
            latestWeek={latestWeek}
          />
        </div>

        {branches.map((b) => (
        <section key={b.name} className="db-branch">
          <h2 className="db-branchname">{b.name}</h2>
        <div className="db-grid">
          {b.cards.map((c) => (
            // A card with no plot holds one line of text. Left to stretch (which
            // is what keeps chart cards' plots aligned) it matches the tall chart
            // beside it and becomes a large empty box — so it sizes to content.
            <section
              key={c.key}
              className={`db-card${
                c.series.points.some((p) => p.value != null) ? '' : ' db-card-nodata'
              }`}
            >
              <div className="db-cardhead">
                <div className="db-cardtitle">
                  <h3>{c.title}</h3>
                  {c.subtitle && <p className="db-cardsub">{c.subtitle}</p>}
                </div>
                <Link href={c.historyHref} className="db-histlink">
                  History →
                </Link>
              </div>
              <StatGraph
                unit={c.unit}
                scale={scale}
                points={c.series.points}
                notes={c.series.notes.map((n) => ({
                  id: n.id,
                  date: n.date,
                  dateLabel: formatDate(n.date),
                  body: n.body,
                }))}
                rollup={c.series.rollup}
                rollupNote={c.series.rollupNote}
                canSetRollup={c.series.canSetRollup}
                statId={c.subjectId}
                basePath="/dashboard"
                page={0}
                showControls={false}
              />
              <CardControls
                subjectType={c.subjectType}
                subjectId={c.subjectId}
                title={c.title}
                entry={c.entry}
              />
            </section>
          ))}
        </div>
        </section>
        ))}

        {statCount === 0 && (
          <p className="db-empty">
            {postCount === 0
              ? 'You do not hold a post yet, so there are no stats to graph. Your hours are above — an admin can link you to a post on the Org Board.'
              : 'No named stats on your post yet. Once an admin adds one under Settings → Manage Stats, it appears here.'}
          </p>
        )}
      </div>
    </>
  );
}
