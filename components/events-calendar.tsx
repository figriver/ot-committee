import Link from 'next/link';
import { monthGrid, monthTitle, shiftMonth, WEEKDAYS, formatShortDate } from '@/lib/calendar';
import type { EventSummary } from '@/lib/events';

// The month calendar — the point of the Events screen: what's coming, and what
// collides. A pure server component (every control is a Link), so planning a
// quarter costs no client JS.
//
// A date carrying more than one event is marked in BOTH layouts: desktop chips
// stack under a "2 events" badge, mobile dots sit under the same badge. That
// clash is the thing you came to the calendar to see.
//
// Mobile keeps the real grid (a month is a shape, not a list) but drops the chip
// text to dots and repeats the month underneath as a readable list — CSS
// switches between them at 640px.

export function EventsCalendar({
  month,
  today,
  events,
  conflicts,
}: {
  month: string;
  today: string;
  events: EventSummary[];
  conflicts: Set<string>;
}) {
  const weeks = monthGrid(month, today);
  const byDate = new Map<string, EventSummary[]>();
  for (const e of events) {
    byDate.set(e.eventDate, [...(byDate.get(e.eventDate) ?? []), e]);
  }
  const inMonth = events.filter((e) => e.eventDate.startsWith(month));

  const href = (m: string) => `/events?view=calendar&month=${m}`;

  return (
    <section className="ec">
      <div className="ec-nav">
        <Link className="ec-navbtn" href={href(shiftMonth(month, -1))} aria-label="Previous month">
          ←
        </Link>
        <h2 className="ec-title">{monthTitle(month)}</h2>
        <Link className="ec-navbtn" href={href(shiftMonth(month, 1))} aria-label="Next month">
          →
        </Link>
        <Link className="ec-today" href={href(today.slice(0, 7))}>
          Today
        </Link>
      </div>

      <div className="ec-grid" role="grid" aria-label={`${monthTitle(month)} events`}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="ec-dow" role="columnheader">
            <span className="ec-dow-long">{d}</span>
            <span className="ec-dow-short">{d[0]}</span>
          </div>
        ))}
        {weeks.flat().map((day) => {
          const list = byDate.get(day.iso) ?? [];
          const clash = conflicts.has(day.iso);
          return (
            <div
              key={day.iso}
              role="gridcell"
              className={[
                'ec-cell',
                day.inMonth ? '' : 'ec-out',
                day.isToday ? 'ec-todaycell' : '',
                clash ? 'ec-clash' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="ec-cellhead">
                <span className="ec-daynum">{day.dayOfMonth}</span>
                {clash && (
                  <span className="ec-clashtag" title="More than one event on this day">
                    {list.length} events
                  </span>
                )}
              </div>

              {/* desktop: named chips */}
              <ul className="ec-chips">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className={`ec-chip${e.progress.total > 0 && e.progress.open === 0 ? ' ec-chip-done' : ''}`}
                      title={`${e.typeLabel} · ${e.name}${
                        e.progress.total ? ` · ${e.progress.done}/${e.progress.total} done` : ''
                      }`}
                    >
                      <span className="ec-chipname">{e.name}</span>
                      {e.progress.total > 0 && (
                        <span className="ec-chipcount">
                          {e.progress.done}/{e.progress.total}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              {/* mobile: one dot per event (the list below carries the names) */}
              {list.length > 0 && (
                <div className="ec-dots" aria-hidden="true">
                  {list.slice(0, 4).map((e) => (
                    <span key={e.id} className="ec-dot" />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ec-monthlist">
        <h3 className="ec-mlhead">{monthTitle(month)} — {inMonth.length} event{inMonth.length === 1 ? '' : 's'}</h3>
        {inMonth.length === 0 ? (
          <p className="ec-mlempty">Nothing scheduled this month.</p>
        ) : (
          <ul className="ec-mllist">
            {inMonth.map((e) => (
              <li key={e.id} className={conflicts.has(e.eventDate) ? 'ec-mlclash' : undefined}>
                <Link href={`/events/${e.id}`} className="ec-mlrow">
                  <span className="ec-mldate">{formatShortDate(e.eventDate)}</span>
                  <span className="ec-mlname">{e.name}</span>
                  {e.progress.total > 0 && (
                    <span className="ec-mlcount">
                      {e.progress.done}/{e.progress.total}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
