import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getMemberReport } from '@/lib/stats';
import { resolveWeekEnding, addDaysISO, formatWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { submitReport } from './actions';

export const dynamic = 'force-dynamic';

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;

  const weekEnding = await resolveWeekEnding(sp.week);
  const prevWeek = addDaysISO(weekEnding, -7);
  const nextWeek = addDaysISO(weekEnding, 7);
  const report = await getMemberReport(member.id, weekEnding);
  const hasStats = report.posts.some((p) => p.stats.length > 0);

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="rpt-wrap">
        <div className="rpt-head">
          <h1>Weekly report</h1>
          <Link href="/board" className="rpt-back">
            ← Board
          </Link>
        </div>

        <div className="rpt-weeknav">
          <Link href={`/report?week=${prevWeek}`} className="rpt-weekbtn">
            ‹ Prev
          </Link>
          <div className="rpt-weeklabel">
            Week ending <strong>{formatWeekEnding(weekEnding)}</strong>
          </div>
          <Link href={`/report?week=${nextWeek}`} className="rpt-weekbtn">
            Next ›
          </Link>
        </div>

        {sp.saved && <div className="rpt-ok">Report saved.</div>}

        {/* key on the week so inputs reset to the selected week's saved values */}
        <form action={submitReport} className="rpt-form" key={weekEnding}>
          <input type="hidden" name="week_ending" value={weekEnding} />

          <section className="rpt-section">
            <label className="rpt-label" htmlFor="hours">
              Hours <span className="rpt-hint">(you, this week — once)</span>
            </label>
            <input
              id="hours"
              name="hours"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              placeholder="e.g. 40"
              className="rpt-input"
              defaultValue={report.hours ?? ''}
            />
          </section>

          {report.posts.length === 0 ? (
            <p className="rpt-empty">
              You don’t hold any posts yet, so there are no named stats to report
              — just your Hours above. (An admin links you to a post on the board.)
            </p>
          ) : !hasStats ? (
            <p className="rpt-empty">
              No named stats on your post(s) yet. An admin can add one on the{' '}
              <Link href="/stats" className="rpt-inline-link">
                Stats
              </Link>{' '}
              page.
            </p>
          ) : (
            report.posts
              .filter((p) => p.stats.length > 0)
              .map((p) => (
                <section key={p.postId} className="rpt-section">
                  <div className="rpt-post">
                    <span className="rpt-post-dept">{p.deptName}</span>
                    <span className="rpt-post-title">{p.title}</span>
                  </div>
                  {p.stats.map((s) => (
                    <div key={s.statId} className="rpt-stat">
                      <label className="rpt-stat-label" htmlFor={`stat_${s.statId}`}>
                        {s.name}
                      </label>
                      <input
                        id={`stat_${s.statId}`}
                        name={`stat_${s.statId}`}
                        type="number"
                        step="any"
                        inputMode="decimal"
                        placeholder="value"
                        className="rpt-input"
                        defaultValue={s.value ?? ''}
                      />
                    </div>
                  ))}
                </section>
              ))
          )}

          <button type="submit" className="rpt-btn">
            Save report
          </button>
        </form>
      </div>
    </>
  );
}
