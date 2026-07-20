import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getMyDashboard } from '@/lib/dashboard';
import { asScale, SCALES, type Scale } from '@/lib/series';
import { formatDate } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { StatGraph } from '@/components/stat-graph';
import { StatsSubNav } from '@/components/stats-subnav';
import { CardControls } from '@/components/card-controls';

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
  searchParams: Promise<{ scale?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;
  const scale = asScale(sp.scale);

  const { cards, postCount, statCount, coveredCount } = await getMyDashboard(member, scale);

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
      <StatsSubNav active="my" />
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

        <div className="db-scales" role="group" aria-label="Time scale">
          {SCALES.map((s: Scale) => (
            <Link
              key={s}
              href={s === 'weekly' ? '/dashboard' : `/dashboard?scale=${s}`}
              className={`gr-scale${s === scale ? ' gr-scale-on' : ''}`}
              aria-current={s === scale ? 'true' : undefined}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </Link>
          ))}
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
