import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { getReportView } from '@/lib/reporting';
import { resolveWeekEnding, addDaysISO, formatWeekEnding } from '@/lib/week';
import { getLockConfig, isLockedAt, describeLock } from '@/lib/lock';
import { AccountBar } from '@/components/account-bar';
import { submitReport } from './actions';
import { AdjustableEntryCard } from '@/components/adjustable-entry';
import { WinComposer } from '@/components/win-composer';
import { getPostsForPicker } from '@/lib/stats';
import { listWins } from '@/lib/wins';
import { StatsSubNav } from '@/components/stats-subnav';
import { DetailEntryCard } from '@/components/detail-entry';
import { detailKinds, linesFor } from '@/lib/detail-lines';
import { specFor, HOURS_KIND } from '@/lib/stat-details';

export const dynamic = 'force-dynamic';

// The member's reporting view, organised by the board.
//
// Root shows the posts they hold plus a card per junior branch that rolls up to
// them; `?post=` drills one level down. At every level they can enter that
// post's own stats. Which branches appear is decided entirely by the effective
// holder (lib/hierarchy.ts) — post someone to a junior and that branch leaves
// this view for theirs.

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string; error?: string; post?: string }>;
}) {
  const member = await requireMember();
  const sp = await searchParams;

  const weekEnding = await resolveWeekEnding(sp.week);
  const prevWeek = addDaysISO(weekEnding, -7);
  const nextWeek = addDaysISO(weekEnding, 7);

  const view = await getReportView(member.id, weekEnding, sp.post);


  // Null = this member is not responsible for that post (it devolved to someone
  // else, or never rolled up to them). Not found rather than a silent redirect.
  if (!view) notFound();

  // Stats that owe the report a detail table are entered in their own card (the
  // value and its rows save together), so they are held OUT of the plain form.
  const kinds = await detailKinds(view.ownStats.map((s) => s.statId));
  const detailStats = await Promise.all(
    view.ownStats
      .filter((s) => kinds.has(s.statId))
      .map(async (s) => ({
        ...s,
        kind: kinds.get(s.statId)!,
        lines: await linesFor(s.statId, member.id, weekEnding),
      })),
  );
  const plainStats = view.ownStats.filter((s) => !kinds.has(s.statId));
  const hoursSpec = specFor(HOURS_KIND);
  const hoursLines = hoursSpec ? await linesFor(null, member.id, weekEnding) : [];

  const lockCfg = await getLockConfig();
  const locked = isLockedAt(weekEnding, lockCfg);

  // Wins-this-week entry — part of the unified weekly report. Area options + the
  // member's own recent wins for an in-context list.
  const [winPicker, recentMine] = await Promise.all([
    getPostsForPicker(),
    listWins(member.id, { memberId: member.id }),
  ]);
  const winAreas = winPicker.map((p) => ({ id: p.id, label: p.label }));
  const winDefaultArea = view.heldPosts[0]?.postId ?? '';
  const winToday = new Date().toISOString().slice(0, 10);
  const recentMineTop = recentMine.slice(0, 3);

  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    q.set('week', weekEnding);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `/stats?${q.toString()}`;
  };

  const atRoot = view.postId === null;
  const hasOwnStats = view.ownStats.length > 0;

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <StatsSubNav active="enter" isAdmin={member.role === 'admin'} />
      <div className="rpt-wrap">
        <div className="rpt-head">
          <h1>Stats</h1>
          <Link href="/dashboard" className="rpt-back">
            My Stats →
          </Link>
        </div>
        <p className="rpt-sub">
          Everything you are responsible for — your own posts, and any unfilled
          posts under them.
        </p>

        <div className="rpt-weeknav">
          <Link href={qs({ week: prevWeek, post: sp.post })} className="rpt-weekbtn">
            ‹ Prev
          </Link>
          <div className="rpt-weeklabel">
            Week ending <strong>{formatWeekEnding(weekEnding)}</strong>
          </div>
          <Link href={qs({ week: nextWeek, post: sp.post })} className="rpt-weekbtn">
            Next ›
          </Link>
        </div>

        {sp.saved && <div className="rpt-ok">Saved.</div>}
        {sp.error === 'locked' && (
          <div className="rpt-err">That week has closed — nothing was saved.</div>
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

        {/* breadcrumb — how far down the board this view is */}
        {!atRoot && (
          <nav className="rpt-crumbs" aria-label="Breadcrumb">
            {view.breadcrumb.map((b, i) => (
              <span key={b.postId ?? 'root'}>
                <Link href={qs({ post: b.postId ?? undefined })} className="rpt-crumb">
                  {b.title}
                </Link>
                <span className="rpt-crumbsep" aria-hidden="true">
                  ›
                </span>
                {i === view.breadcrumb.length - 1 && (
                  <span className="rpt-crumbcur">{view.title}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {!atRoot && (
          <div className="rpt-nodehead">
            <h2>{view.title}</h2>
            <p className="rpt-nodectx">{view.context}</p>
          </div>
        )}

        {view.totalBelow > 0 && (
          <p className="rpt-progress">
            {view.reportedBelow} of {view.totalBelow} stat
            {view.totalBelow === 1 ? '' : 's'} reported here this week.
          </p>
        )}

        <form action={submitReport} className="rpt-form" key={`${weekEnding}-${sp.post ?? ''}`}>
          <input type="hidden" name="week_ending" value={weekEnding} />
          <input type="hidden" name="return_post" value={sp.post ?? ''} />

          {/* Hours is per MEMBER, not per post — only at the root. With a
              detail spec it moves to its own card below (value + project rows
              save together); without one it stays a plain field here. */}
          {atRoot && !hoursSpec && (
            <section className="rpt-section">
              <label className="rpt-label" htmlFor="hours">
                Hours <span className="rpt-hint">(you, this week — once)</span>
                <Link href={`/stats/history/hours/${member.id}`} className="rpt-history-link">
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
                defaultValue={view.hours ?? ''}
                readOnly={locked}
                disabled={locked}
              />
            </section>
          )}

          {atRoot && view.heldPosts.length === 0 && (
            <p className="rpt-empty">
              You don’t hold any posts yet, so there are no stats to report — just
              your Hours above. (An admin links you to a post on the board.)
            </p>
          )}

          {plainStats.length > 0 && (
            <section className="rpt-section">
              <div className="rpt-post">
                <span className="rpt-post-title">
                  {atRoot ? 'Stats on your posts' : `Stats on ${view.title}`}
                </span>
              </div>
              {plainStats.map((s) => (
                <div key={s.statId} className="rpt-stat">
                  <label className="rpt-stat-label" htmlFor={`stat_${s.statId}`}>
                    {s.name}
                    <Link href={`/stats/history/stat/${s.statId}`} className="rpt-history-link">
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
          )}

          {!locked && (hasOwnStats || atRoot) && (
            <button type="submit" className="rpt-btn">
              Save report
            </button>
          )}
        </form>

        {/* Stats whose report needs a detail table. Outside the plain form for
            the same reason as the adjustables: each saves itself, atomically
            with its rows, so a value can never land without its detail. */}
        {(hoursSpec || detailStats.length > 0) && (
          <section className="adj-section">
            <h3 className="adj-heading">
              Stats with a detail table
              <span className="adj-headinghint">
                the report wants the who / what / where behind the number
              </span>
            </h3>
            <div className="de-grid">
              {atRoot && hoursSpec && (
                <DetailEntryCard
                  subjectType="hours"
                  statId={null}
                  statName="Hours"
                  heading="My Hours"
                  detailKind={HOURS_KIND}
                  weekEnding={weekEnding}
                  initialValue={view.hours == null ? '' : String(view.hours)}
                  initialLines={hoursLines}
                  readOnly={locked}
                />
              )}
              {detailStats.map((s) => (
                <DetailEntryCard
                  key={s.statId}
                  subjectType="stat"
                  statId={s.statId}
                  statName={s.name}
                  detailKind={s.kind}
                  weekEnding={weekEnding}
                  initialValue={s.value ?? ''}
                  initialLines={s.lines}
                  readOnly={locked}
                />
              ))}
            </div>
          </section>
        )}

        {/* Adjustable stats (base + manual): entered outside the plain form,
            since each saves its own base+manual+note via saveAdjustment. */}
        {view.adjustables.length > 0 && (
          <section className="adj-section">
            <h3 className="adj-heading">
              Computed stats
              <span className="adj-headinghint">
                base is system-computed — add the manual part with a note
              </span>
            </h3>
            <div className="adj-grid">
              {view.adjustables.map((a) => (
                <AdjustableEntryCard
                  key={a.statId}
                  entry={a}
                  weekEnding={weekEnding}
                  locked={locked}
                  isAdmin={member.role === 'admin'}
                />
              ))}
            </div>
          </section>
        )}

        {/* Wins this week — part of the member's unified weekly report (hours +
            stats + wins entered together). The per-member win composer lives
            HERE; meeting-time admin entry (unattributed, minutes) is on Meeting
            Enter. Root only (per-member, not per drilled post). */}
        {atRoot && (
          <section className="wins-add wins-add-enter">
            <h3 className="wins-addh">
              Wins this week
              <span className="wins-addhint">free text, tagged to an area — part of your weekly report</span>
            </h3>
            <WinComposer
              mode="member"
              areaOptions={winAreas}
              defaultAreaId={winDefaultArea}
              today={winToday}
            />
            {recentMineTop.length > 0 && (
              <ul className="wins-recentmine">
                {recentMineTop.map((w) => (
                  <li key={w.id}>
                    <span className="wins-recentbody">{w.body}</span>
                    <span className="wins-recentmeta">{w.divisionLabel}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/wins" className="wins-seeall">
              See all wins →
            </Link>
          </section>
        )}

        {/* junior cards — the branches rolling up to this member */}
        {view.juniors.length > 0 && (
          <section className="jr-section">
            <h3 className="jr-heading">
              {atRoot ? 'Posts under you' : `Under ${view.title}`}
              <span className="jr-headinghint">
                unfilled posts you cover — open one to report its stats
              </span>
            </h3>
            <div className="jr-grid">
              {view.juniors
                .slice()
                .sort((a, b) => b.totalStats - a.totalStats)
                .map((j) => (
                  <Link
                    key={j.postId}
                    href={qs({ post: j.postId })}
                    className={`jr-card${j.totalStats === 0 ? ' jr-card-empty' : ''}`}
                  >
                    <span className="jr-title">{j.title}</span>
                    <span className="jr-context">{j.context}</span>
                    <span className="jr-meta">
                      {j.isHFA && <span className="jr-hfa">HFA</span>}
                      {j.hasUnlinkedHolder && (
                        <span className="jr-warn" title="A name on the board, but not linked to a member who can report">
                          not linked
                        </span>
                      )}
                      {j.totalStats === 0 ? (
                        <span className="jr-count jr-count-none">No stats yet</span>
                      ) : (
                        <span className="jr-count">
                          {j.reportedStats}/{j.totalStats} reported
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
            </div>
          </section>
        )}

        {!atRoot && view.juniors.length === 0 && !hasOwnStats && (
          <p className="rpt-empty">
            Nothing to report on this post, and no posts under it that you cover.
          </p>
        )}
      </div>
    </>
  );
}
