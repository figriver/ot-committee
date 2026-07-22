import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { AccountBar } from '@/components/account-bar';
import { EventsCalendar } from '@/components/events-calendar';
import { EventComposer } from '@/components/event-composer';
import { MyActions } from '@/components/my-actions';
import {
  listEvents,
  conflictDates,
  defaultAreaPostId,
  type EventSummary,
} from '@/lib/events';
import { myOpenChecklistItems } from '@/lib/checklist';
import { getPostsForPicker } from '@/lib/stats';
import { memberOptions } from '@/lib/member-names';
import { gridRange, isMonth, monthOf, todayISO, formatLongDate } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

// Events — the calendar IS the screen: plan ahead, and see a clash before it
// happens. A list view is available for scanning everything at once.
//
// Everything an event has to get done lives on its detail page as checklist
// items — the reusable primitive (CHECKLIST.md), of which an event is simply the
// first parent type.

type SP = { view?: string; month?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const member = await requireMember();
  const sp = await searchParams;
  const today = todayISO();
  const view = sp.view === 'list' ? 'list' : 'calendar';
  const month = isMonth(sp.month) ? sp.month : monthOf(today);

  const range = view === 'calendar' ? gridRange(month) : {};
  const [events, mine, areaPosts, members, defaultArea] = await Promise.all([
    listEvents(member, range, today),
    myOpenChecklistItems(member, 8, today),
    getPostsForPicker(),
    memberOptions(),
    defaultAreaPostId(),
  ]);
  const conflicts = conflictDates(events);

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="ev-wrap">
        <div className="ev-head">
          <div>
            <h1>Events</h1>
            <p className="ev-sub">
              What the committee is putting on — and who has which piece of it.
            </p>
          </div>
          {member.role === 'admin' && (
            <EventComposer
              memberOptions={members.map((m) => ({ id: m.id, label: m.name }))}
              areaOptions={areaPosts.map((p) => ({ id: p.id, label: p.label }))}
              defaultAreaId={defaultArea ?? ''}
              today={today}
            />
          )}
        </div>

        <div className="ev-viewswitch" role="group" aria-label="Events view">
          {(['calendar', 'list'] as const).map((v) => (
            <Link
              key={v}
              href={v === 'calendar' ? `/events?view=calendar&month=${month}` : '/events?view=list'}
              className={`evs-pill${v === view ? ' evs-on' : ''}`}
              aria-current={v === view ? 'true' : undefined}
            >
              {v === 'calendar' ? 'Calendar' : 'List'}
            </Link>
          ))}
          {conflicts.size > 0 && view === 'calendar' && (
            <span className="ev-clashnote">
              {conflicts.size} day{conflicts.size === 1 ? '' : 's'} with more than one event
            </span>
          )}
        </div>

        <MyActions items={mine} />

        {view === 'calendar' ? (
          <EventsCalendar month={month} today={today} events={events} conflicts={conflicts} />
        ) : (
          <EventList events={events} today={today} conflicts={conflicts} />
        )}
      </div>
    </>
  );
}

function EventList({
  events,
  today,
  conflicts,
}: {
  events: EventSummary[];
  today: string;
  conflicts: Set<string>;
}) {
  const upcoming = events.filter((e) => e.eventDate >= today);
  const past = events.filter((e) => e.eventDate < today).reverse();

  if (events.length === 0) {
    return (
      <p className="ev-empty">
        No events yet. An admin can add one with <strong>+ New event</strong>.
      </p>
    );
  }

  return (
    <>
      <Group title="Upcoming" events={upcoming} conflicts={conflicts} empty="Nothing scheduled." />
      <Group title="Past" events={past} conflicts={conflicts} empty="Nothing yet." />
    </>
  );
}

function Group({
  title,
  events,
  conflicts,
  empty,
}: {
  title: string;
  events: EventSummary[];
  conflicts: Set<string>;
  empty: string;
}) {
  return (
    <section className="evl-group">
      <div className="evl-grouphead">
        <h2>{title}</h2>
        <span className="evl-groupcount">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="evl-empty">{empty}</p>
      ) : (
        <ul className="evl-list">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="evl-row">
                <span className="evl-date">
                  {formatLongDate(e.eventDate)}
                  {conflicts.has(e.eventDate) && (
                    <span className="evl-clash" title="Another event shares this day">
                      clash
                    </span>
                  )}
                </span>
                <span className="evl-main">
                  <span className="evl-name">{e.name}</span>
                  <span className="evl-meta">
                    <span className="evl-type">{e.typeLabel}</span>
                    <span className="evl-owner">
                      {e.ownerName ? `I/C ${e.ownerName}` : 'No I/C yet'}
                    </span>
                    {e.attendedCount != null && (
                      <span className="evl-att">{e.attendedCount} attended</span>
                    )}
                  </span>
                </span>
                <span className="evl-prog">
                  {e.progress.total === 0 ? (
                    <span className="evl-noitems">no checklist</span>
                  ) : (
                    <>
                      <span className="evl-progcount">
                        {e.progress.done}/{e.progress.total}
                      </span>
                      <span className="evl-bar" aria-hidden="true">
                        <span className="evl-barfill" style={{ width: `${e.progress.percent}%` }} />
                      </span>
                      {e.progress.overdue > 0 && (
                        <span className="evl-overdue">{e.progress.overdue} overdue</span>
                      )}
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
