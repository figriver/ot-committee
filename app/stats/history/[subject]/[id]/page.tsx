import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { getStatHistory, getHoursHistory, type SubjectType } from '@/lib/history';
import { getSeries, asScale } from '@/lib/series';
import { asRange } from '@/lib/range';
import { getLockConfig, isLockedAt, describeLock } from '@/lib/lock';
import { formatWeekEnding, formatDate, currentWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { HistoryClient } from '@/components/history-client';

export const dynamic = 'force-dynamic';

// One page serves both history views: /stats/history/stat/<statId> and
// /stats/history/hours/<memberId>. Everything below the header is identical —
// only where the rows come from differs.

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ subject: string; id: string }>;
  searchParams: Promise<{
    tab?: string;
    page?: string;
    scale?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const member = await requireMember();
  const { subject, id } = await params;
  const sp = await searchParams;

  if (subject !== 'stat' && subject !== 'hours') notFound();
  const subjectType = subject as SubjectType;

  const pageNum = Math.max(0, parseInt(sp.page ?? '0', 10) || 0);
  const tab = sp.tab === 'notes' ? 'notes' : 'values';

  const view =
    subjectType === 'stat'
      ? await getStatHistory(member, id, pageNum)
      : await getHoursHistory(member, id, pageNum);
  if (!view) notFound();

  // Dates are formatted server-side so the client renders the same strings.
  // Lock config is read ONCE and applied per row — a page shows 12 weeks, and
  // each one closes on its own schedule.
  const lockCfg = await getLockConfig();
  const rows = view.rows.map((r) => ({
    weekEnding: r.weekEnding,
    label: formatWeekEnding(r.weekEnding),
    value: r.value,
    updatedBy: r.updatedBy,
    locked: isLockedAt(r.weekEnding, lockCfg),
    detail: r.detail,
  }));
  // The graph reads the same entries as the table, over its own selectable
  // window (Piece 3: scale = granularity, range = window, scroll = pan).
  const scale = asScale(sp.scale);
  const range = asRange(sp.range);
  const latestWeek = await currentWeekEnding();
  const series = await getSeries(subjectType, id, scale, view.canEdit, range, sp.from, sp.to);
  const graphNotes = series.notes.map((n) => ({
    id: n.id,
    date: n.date,
    dateLabel: formatDate(n.date),
    body: n.body,
  }));

  const notes = view.notes.map((n) => ({
    id: n.id,
    noteDate: n.noteDate,
    dateLabel: formatDate(n.noteDate),
    body: n.body,
    showOnGraph: n.showOnGraph,
    createdByName: n.createdByName,
    isMine: n.isMine,
  }));

  const basePath = `/stats/history/${subjectType}/${id}`;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="sh-wrap">
        <div className="sh-head">
          <h1>{view.title}</h1>
          <Link href="/stats" className="sh-back">
            ← Stats
          </Link>
        </div>
        {view.subtitle && <p className="sh-sub">{view.subtitle}</p>}

        <HistoryClient
          subjectType={subjectType}
          subjectId={id}
          tab={tab}
          basePath={basePath}
          page={view.page}
          hasNewer={view.hasNewer}
          hasOlder={view.hasOlder}
          unit={view.unit}
          canEdit={view.canEdit}
          isAdmin={member.role === 'admin'}
          today={today}
          rows={rows}
          notes={notes}
          scale={scale}
          seriesPoints={series.points}
          graphNotes={graphNotes}
          rollup={series.rollup}
          rollupNote={series.rollupNote}
          canSetRollup={series.canSetRollup}
          lockLabel={describeLock(lockCfg)}
          range={range}
          windowFrom={series.windowFrom}
          windowTo={series.windowTo}
          latestWeek={latestWeek}
        />
      </div>
    </>
  );
}
