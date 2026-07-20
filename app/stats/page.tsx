import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getMemberReport } from '@/lib/stats';
import { resolveWeekEnding, addDaysISO, formatWeekEnding } from '@/lib/week';
import { getLockConfig, isLockedAt, describeLock } from '@/lib/lock';
import { AccountBar } from '@/components/account-bar';
import { submitReport } from './actions';

export const dynamic = 'force-dynamic';

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string; error?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;

  const weekEnding = await resolveWeekEnding(sp.week);
  const prevWeek = addDaysISO(weekEnding, -7);
  const nextWeek = addDaysISO(weekEnding, 7);
  const report = await getMemberReport(member.id, weekEnding);
  const hasStats = report.posts.some((p) => p.stats.length > 0);

  // A closed week is read-only here for everyone — including admins. An admin's
  // override belongs on the History page, where it is an explicit, attributed
  // correction rather than a silent re-submit of the whole report form.
  const lockCfg = await getLockConfig();
  const locked = isLockedAt(weekEnding, lockCfg);

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="rpt-wrap">
        <div className="rpt-head">
          <h1>Stats</h1>
          <Link href="/dashboard" className="rpt-back">
            My Dashboard →
          </Link>
        </div>
        <p className="rpt-sub">
          Enter and review your own hours and post stats, week by week.
        </p>

        <div className="rpt-weeknav">
          <Link href={`/stats?week=${prevWeek}`} className="rpt-weekbtn">
            ‹ Prev
          </Link>
          <div className="rpt-weeklabel">
            Week ending <strong>{formatWeekEnding(weekEnding)}</strong>
          </div>
          <Link href={`/stats?week=${nextWeek}`} className="rpt-weekbtn">
            Next ›
          </Link>
        </div>

        {sp.saved && <div className="rpt-ok">Saved.</div>}
        {sp.error === 'locked' && (
          <div className="rpt-err">
            That week has closed — nothing was saved.
          </div>
        )}
        {locked && (
          <div className="rpt-locked">
            <strong>This week is closed.</strong> Weeks lock {describeLock(lockCfg)},
            after which reports are read-only.{' '}
            {member.role === 'admin'
              ? 'As an admin you can still correct it from the History page — that is recorded as an override.'
              : 'If something needs correcting, ask an admin.'}
          </div>
        )}

        {/* key on the week so inputs reset to the selected week's saved values */}
        <form action={submitReport} className="rpt-form" key={weekEnding}>
          <input type="hidden" name="week_ending" value={weekEnding} />

          <section className="rpt-section">
            <label className="rpt-label" htmlFor="hours">
              Hours <span className="rpt-hint">(you, this week — once)</span>
              <Link
                href={`/stats/history/hours/${member.id}`}
                className="rpt-history-link"
              >
                History
              </Link>
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
              readOnly={locked}
              disabled={locked}
            />
          </section>

          {report.posts.length === 0 ? (
            <p className="rpt-empty">
              You don’t hold any posts yet, so there are no named stats to report
              — just your Hours above. (An admin links you to a post on the board.)
            </p>
          ) : !hasStats ? (
            <p className="rpt-empty">
              No named stats on your post(s) yet — just your Hours above. An admin
              can add stats under Settings → Manage Stats.
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
                        <Link
                          href={`/stats/history/stat/${s.statId}`}
                          className="rpt-history-link"
                        >
                          History
                        </Link>
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
                        readOnly={locked}
                        disabled={locked}
                      />
                    </div>
                  ))}
                </section>
              ))
          )}

          {!locked && (
            <button type="submit" className="rpt-btn">
              Save report
            </button>
          )}
        </form>
      </div>
    </>
  );
}
