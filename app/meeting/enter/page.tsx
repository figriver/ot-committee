import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getPostsForPicker } from '@/lib/stats';
import { getMinutes } from '@/lib/minutes';
import { currentWeekEnding, resolveWeekEnding, formatWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { MeetingSubNav } from '@/components/meeting-subnav';
import { WinComposer } from '@/components/win-composer';
import { MinutesEditor } from '@/components/minutes-editor';

export const dynamic = 'force-dynamic';

// MEETING ENTER — meeting-time ADMIN entry only: unattributed wins (good news
// with no member) and the minutes. A member's own wins are part of their unified
// weekly report on Stats Enter (/stats), entered alongside hours + stats — so
// there is no per-member win composer here.

export default async function MeetingEnterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const member = await requireMember();
  const isAdmin = member.role === 'admin';
  const sp = await searchParams;

  const [pickerPosts, current] = await Promise.all([
    getPostsForPicker(),
    currentWeekEnding(),
  ]);
  // Minutes target the current week by default, or a specific week when Enter is
  // reached via "Edit on Enter" from a past week — so any week stays editable
  // while composers live only here.
  const week = sp.week ? await resolveWeekEnding(sp.week) : current;
  const areaOptions = pickerPosts.map((p) => ({ id: p.id, label: p.label }));
  const today = new Date().toISOString().slice(0, 10);
  const minutes = isAdmin ? await getMinutes(week) : null;
  const updatedAtLabel = minutes?.updatedAt
    ? new Date(minutes.updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <AccountBar email={member.email} isAdmin={isAdmin} />
      <MeetingSubNav active="enter" />
      <div className="mt-wrap">
        <div className="mt-head">
          <div>
            <h1>Meeting entry</h1>
            <p className="mt-sub">
              Meeting-time entry: unattributed good news and the minutes. Your own wins go
              in your <Link href="/stats" className="gr-emptylink">weekly report</Link>, with your stats.
            </p>
          </div>
          <Link href="/meeting" className="mt-current">
            This week →
          </Link>
        </div>

        {/* Members report their own wins with their stats on the weekly report;
            Meeting Enter is meeting-time admin entry only. */}
        {!isAdmin && (
          <section className="wins-add">
            <p className="mt-empty">
              Nothing to enter here — meeting-time entry (unattributed wins, minutes) is
              admin-only. Add your own wins on your{' '}
              <Link href="/stats" className="gr-emptylink">weekly report</Link> alongside your stats.
            </p>
          </section>
        )}

        {/* admin: unattributed win — meeting-time good news with no member */}
        {isAdmin && (
          <section className="wins-add wins-add-admin">
            <h2 className="wins-addh">
              Add unattributed win (admin)
              <span className="wins-addhint">meeting-time good news with no member behind it</span>
            </h2>
            <WinComposer mode="unattributed" areaOptions={areaOptions} defaultAreaId="" today={today} />
          </section>
        )}

        {/* admin: write/edit this week's minutes — below the wins composers */}
        {isAdmin && minutes && (
          <section className="mt-enterminutes">
            <p className="mt-minutesweek">
              Minutes for the meeting week ending <strong>{formatWeekEnding(week)}</strong>
            </p>
            <MinutesEditor
              weekEnding={week}
              initialBody={minutes.body}
              updatedByName={minutes.updatedByName}
              updatedAtLabel={updatedAtLabel}
              canEdit
            />
          </section>
        )}
      </div>
    </>
  );
}
