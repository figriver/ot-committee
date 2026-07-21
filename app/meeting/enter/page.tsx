import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { loadHierarchy } from '@/lib/hierarchy';
import { getPostsForPicker } from '@/lib/stats';
import { getMinutes } from '@/lib/minutes';
import { currentWeekEnding, resolveWeekEnding, formatWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { MeetingSubNav } from '@/components/meeting-subnav';
import { WinComposer } from '@/components/win-composer';
import { MinutesEditor } from '@/components/minutes-editor';

export const dynamic = 'force-dynamic';

// ENTER — the SINGLE place all Meeting creation happens. Everything else (This
// Week / Wins / Minutes) is read+filter and links here. Members get the win
// composer; admins additionally get the unattributed-win composer and the
// this-week minutes editor. One screen, no mode-switching.

export default async function MeetingEnterPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const member = await requireMember();
  const isAdmin = member.role === 'admin';
  const sp = await searchParams;

  const [h, pickerPosts, current] = await Promise.all([
    loadHierarchy(),
    getPostsForPicker(),
    currentWeekEnding(),
  ]);
  // Minutes target the current week by default, or a specific week when Enter is
  // reached via "Edit on Enter" from a past week — so any week stays editable
  // while composers live only here.
  const week = sp.week ? await resolveWeekEnding(sp.week) : current;
  const areaOptions = pickerPosts.map((p) => ({ id: p.id, label: p.label }));
  const defaultAreaId = h.postsHeldBy(member.id)[0] ?? '';
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
            <h1>Enter</h1>
            <p className="mt-sub">
              Add wins and record the meeting minutes — everything you create lives here.
            </p>
          </div>
          <Link href="/meeting" className="mt-current">
            This week →
          </Link>
        </div>

        {/* member: add a win — primary, at top */}
        <section className="wins-add">
          <h2 className="wins-addh">
            Add a win
            <span className="wins-addhint">free text, tagged to an area — add as many as you like</span>
          </h2>
          <WinComposer
            mode="member"
            areaOptions={areaOptions}
            defaultAreaId={defaultAreaId}
            today={today}
          />
        </section>

        {/* admin: unattributed win */}
        {isAdmin && (
          <section className="wins-add wins-add-admin">
            <h2 className="wins-addh">Add unattributed win (admin)</h2>
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
