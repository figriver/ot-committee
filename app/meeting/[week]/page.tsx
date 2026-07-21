import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { winsByArea } from '@/lib/wins';
import { getMinutes } from '@/lib/minutes';
import { resolveWeekEnding, addDaysISO, formatWeekEnding, currentWeekEnding, isWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { MeetingSubNav } from '@/components/meeting-subnav';
import { MinutesEditor } from '@/components/minutes-editor';
import { WinRow } from '@/components/wins-client';

export const dynamic = 'force-dynamic';

// The weekly MEETING surface for one week — the real Thursday meeting: go
// through the week's wins area-by-area, and record the minutes. Both live here
// (separate records sharing the surface). /meeting/<week> is the shareable link
// an email points at; #minutes jumps to the minutes.

export default async function MeetingWeekPage({ params }: { params: Promise<{ week: string }> }) {
  const member = await requireMember();
  const { week } = await params;
  if (!isWeekEnding(week)) notFound();
  // snap to a valid week boundary (so a hand-typed date still resolves)
  const weekEnding = await resolveWeekEnding(week);

  const [areas, minutes, current] = await Promise.all([
    winsByArea(member.id, 'division', { weekEnding }),
    getMinutes(weekEnding),
    currentWeekEnding(),
  ]);

  const prev = addDaysISO(weekEnding, -7);
  const next = addDaysISO(weekEnding, 7);
  const isCurrent = weekEnding === current;
  const winTotal = areas.reduce((n, a) => n + a.wins.length, 0);
  const updatedAtLabel = minutes.updatedAt
    ? new Date(minutes.updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <MeetingSubNav active="week" />
      <div className="mt-wrap">
        <div className="mt-head">
          <div>
            <h1>Meeting{isCurrent ? ' — this week' : ''}</h1>
            <p className="mt-sub">This week’s wins, area by area, and the minutes.</p>
          </div>
          {!isCurrent && (
            <Link href={`/meeting/${current}`} className="mt-current">
              Jump to this week →
            </Link>
          )}
        </div>

        <div className="rpt-weeknav">
          <Link href={`/meeting/${prev}`} className="rpt-weekbtn">
            ‹ Prev
          </Link>
          <div className="rpt-weeklabel">
            Meeting week ending <strong>{formatWeekEnding(weekEnding)}</strong>
          </div>
          <Link href={`/meeting/${next}`} className="rpt-weekbtn">
            Next ›
          </Link>
        </div>

        {/* wins for the week, by area (the projection) */}
        {/* view-only surface — creation lives on Enter */}
        {isCurrent && (
          <Link href="/meeting/enter" className="mt-enterbtn">
            + Add wins / write minutes on Enter
          </Link>
        )}

        <section className="mt-section">
          <div className="mt-sectionhead">
            <h2>
              Wins <span className="mt-count">{winTotal}</span>
            </h2>
            <Link href="/wins" className="mt-alllink">
              All wins →
            </Link>
          </div>
          {winTotal === 0 ? (
            <p className="mt-empty">
              No wins logged for this week yet.{' '}
              <Link href="/meeting/enter" className="gr-emptylink">
                Add one on Enter
              </Link>
              .
            </p>
          ) : (
            areas.map((g) => (
              <div key={g.key} className="wins-area">
                <div className="wins-areahead">
                  <h3>{g.name}</h3>
                  <span className="wins-areacount">{g.wins.length}</span>
                </div>
                <ul className="win-list">
                  {g.wins.map((w) => (
                    <WinRow
                      key={w.id}
                      win={w}
                      canDelete={w.isMine || member.role === 'admin'}
                      showArea={false}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        {/* minutes for the week — READ ONLY here; admins edit on Enter */}
        <MinutesEditor
          weekEnding={weekEnding}
          initialBody={minutes.body}
          updatedByName={minutes.updatedByName}
          updatedAtLabel={updatedAtLabel}
          canEdit={member.role === 'admin'}
          view
          enterHref={`/meeting/enter?week=${weekEnding}`}
        />
      </div>
    </>
  );
}
