import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { listMeetingWeeks } from '@/lib/minutes';
import { formatWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { MeetingSubNav } from '@/components/meeting-subnav';

export const dynamic = 'force-dynamic';

// Past meetings — every week that had minutes or wins, newest first. Each opens
// its weekly meeting surface (/meeting/<week>), where the minutes live.

export default async function MinutesArchive() {
  const member = await requireMember();
  const weeks = await listMeetingWeeks();

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <MeetingSubNav active="minutes" />
      <div className="mt-wrap">
        <div className="mt-head">
          <div>
            <h1>Past meetings</h1>
            <p className="mt-sub">Every week with minutes or wins — open one to read its record.</p>
          </div>
        </div>

        {weeks.length === 0 ? (
          <p className="mt-empty">No meetings recorded yet.</p>
        ) : (
          <ul className="ml-list">
            {weeks.map((w) => (
              <li key={w.weekEnding}>
                <Link href={`/meeting/${w.weekEnding}`} className="ml-row">
                  <span className="ml-week">{formatWeekEnding(w.weekEnding)}</span>
                  <span className="ml-tags">
                    {w.hasMinutes ? (
                      <span className="ml-has">Minutes</span>
                    ) : (
                      <span className="ml-no">No minutes</span>
                    )}
                    {w.winCount > 0 && (
                      <span className="ml-wins">
                        {w.winCount} win{w.winCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {w.updatedByName && <span className="ml-by">· {w.updatedByName}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
