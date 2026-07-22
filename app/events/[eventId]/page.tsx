import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { AccountBar } from '@/components/account-bar';
import { ChecklistPanel } from '@/components/checklist-panel';
import { EventAttendance } from '@/components/event-attendance';
import { EventEditor } from '@/components/event-editor';
import { getEventDetail, listEvents } from '@/lib/events';
import { memberOptions } from '@/lib/member-names';
import { getPostsForPicker } from '@/lib/stats';
import { todayISO, formatLongDate, monthOf } from '@/lib/calendar';
import { addEventItem, setEventItemDone, removeEventItem } from '@/app/events/actions';

export const dynamic = 'force-dynamic';

// One event: its facts, its turnout, and — the working surface — its checklist.
// The checklist is rendered by the parent-agnostic ChecklistPanel; this page's
// only job there is to bind the event's id into the server actions it calls.

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const member = await requireMember();
  const { eventId } = await params;
  const today = todayISO();

  const event = await getEventDetail(eventId, member, today);
  if (!event) notFound();

  const [members, areaPosts, sameDay] = await Promise.all([
    memberOptions(),
    event.canManage ? getPostsForPicker() : Promise.resolve([]),
    listEvents(member, { from: event.eventDate, to: event.eventDate }, today),
  ]);
  const clashes = sameDay.filter((e) => e.id !== event.id);

  const progress = {
    total: event.items.length,
    done: event.items.filter((i) => i.isDone).length,
    open: event.items.filter((i) => !i.isDone).length,
    overdue: event.items.filter((i) => i.isOverdue).length,
    percent:
      event.items.length === 0
        ? 0
        : Math.round((event.items.filter((i) => i.isDone).length / event.items.length) * 100),
  };

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="evd-wrap">
        <Link href={`/events?view=calendar&month=${monthOf(event.eventDate)}`} className="evd-back">
          ← Events
        </Link>

        <header className="evd-head">
          <div>
            <p className="evd-ctx">{event.typeLabel}</p>
            <h1>{event.name}</h1>
            <p className="evd-when">
              {formatLongDate(event.eventDate)}
              {event.eventDate < today && <span className="evd-past">past</span>}
            </p>
          </div>
          {event.canManage && (
            <EventEditor
              eventId={event.id}
              name={event.name}
              type={event.type}
              eventDate={event.eventDate}
              ownerId={event.ownerId}
              areaPostId={event.areaPostId}
              notes={event.notes}
              memberOptions={members.map((m) => ({ id: m.id, label: m.name }))}
              areaOptions={areaPosts.map((p) => ({ id: p.id, label: p.label }))}
            />
          )}
        </header>

        {clashes.length > 0 && (
          <div className="evd-clash">
            <strong>Same day as</strong>{' '}
            {clashes.map((c, n) => (
              <span key={c.id}>
                {n > 0 && ', '}
                <Link href={`/events/${c.id}`}>{c.name}</Link>
              </span>
            ))}
          </div>
        )}

        <div className="evd-cols">
          <div className="evd-main">
            <ChecklistPanel
              items={event.items}
              progress={progress}
              canManage={event.canManage}
              assignees={members.map((m) => ({ id: m.id, label: m.name }))}
              actions={{
                add: addEventItem.bind(null, event.id),
                toggle: setEventItemDone.bind(null, event.id),
                remove: removeEventItem.bind(null, event.id),
              }}
              emptyHint={
                event.canManage
                  ? 'No items yet — add what has to get done (food, speaker, décor, promo, call-in, set-up) and who has each piece.'
                  : 'No checklist items yet. The I/C builds this list.'
              }
            />
          </div>

          <aside className="evd-side">
            <section className="evd-facts">
              <h2 className="evd-factstitle">Details</h2>
              <dl className="evd-dl">
                <dt>I/C</dt>
                <dd>{event.ownerName ?? <span className="evd-none">Unassigned</span>}</dd>
                <dt>Area</dt>
                <dd>
                  {event.areaPostId ? (
                    <>
                      {event.areaLabel}
                      <span className="evd-div">{event.divisionLabel}</span>
                    </>
                  ) : (
                    <span className="evd-none">(no area)</span>
                  )}
                </dd>
                {event.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd className="evd-notes">{event.notes}</dd>
                  </>
                )}
                {event.createdByName && (
                  <>
                    <dt>Created by</dt>
                    <dd>{event.createdByName}</dd>
                  </>
                )}
              </dl>
            </section>

            <EventAttendance
              eventId={event.id}
              confirmed={event.confirmedCount}
              attended={event.attendedCount}
              canManage={event.canManage}
              recordedBy={event.attendanceByName}
              recordedAt={event.attendanceAt}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
