import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getMyDashboard } from '@/lib/dashboard';
import { asScale, SCALES, type Scale } from '@/lib/series';
import { formatDate } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { StatGraph } from '@/components/stat-graph';

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

  const { cards, postCount, statCount } = await getMyDashboard(member, scale);

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="db-wrap">
        <div className="db-head">
          <div>
            <h1>My Dashboard</h1>
            <p className="db-sub">
              {statCount > 0
                ? `Your hours and ${statCount} stat${statCount === 1 ? '' : 's'} across ${postCount} post${postCount === 1 ? '' : 's'} you hold.`
                : 'Your hours on post.'}
            </p>
          </div>
          <Link href="/stats" className="db-report">
            Report this week →
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

        <div className="db-grid">
          {cards.map((c) => (
            <section key={c.key} className="db-card">
              <div className="db-cardhead">
                <div className="db-cardtitle">
                  <h2>{c.title}</h2>
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
            </section>
          ))}
        </div>

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
