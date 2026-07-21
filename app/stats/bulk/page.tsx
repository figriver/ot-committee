import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { AccountBar } from '@/components/account-bar';
import { StatsSubNav } from '@/components/stats-subnav';
import { getBulkGrid } from '@/lib/bulk';
import { currentWeekEnding, addDaysISO, formatWeekEnding } from '@/lib/week';
import { getWeekLock, getLockConfig, describeLock } from '@/lib/lock';
import { BulkGrid } from '@/components/bulk-grid';

export const dynamic = 'force-dynamic';

// Admin-only consolidated grid to enter/correct many stats at once. Columns are
// the most recent N weeks (current week first). Every cell writes through the
// same validated path as per-post entry (see lib/bulk + saveBulkStat).

const WEEK_OPTIONS = [1, 4, 8];

export default async function BulkStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  const member = await requireAdmin();
  const sp = await searchParams;
  const count = WEEK_OPTIONS.includes(Number(sp.weeks)) ? Number(sp.weeks) : 4;

  const current = await currentWeekEnding();
  const weeks: string[] = [];
  for (let i = 0; i < count; i++) weeks.push(addDaysISO(current, -7 * i)); // newest first

  const [rows, cfg, ...locks] = await Promise.all([
    getBulkGrid(weeks),
    getLockConfig(),
    ...weeks.map((w) => getWeekLock(member, w)),
  ]);

  const weekMeta = weeks.map((w, i) => ({
    week: w,
    label: formatWeekEnding(w),
    isCurrent: w === current,
    locked: locks[i].locked,
    isOverride: locks[i].isOverride,
  }));

  return (
    <>
      <AccountBar email={member.email} isAdmin />
      <StatsSubNav active="bulk" isAdmin />
      <div className="bulk-wrap">
        <div className="bulk-head">
          <div>
            <h1>Bulk stats entry</h1>
            <p className="bulk-sub">
              Enter or correct many stats at once. A blank cell is <strong>not reported</strong>;
              type <strong>0</strong> for a real zero. Weeks close {describeLock(cfg)} — a locked
              past week saves as a recorded override. Adjustable stats (Hours, Active Members,
              Target&nbsp;Dones) are edited on their own card so their required note is never skipped.
            </p>
          </div>
          <div className="bulk-weekpick" role="group" aria-label="Weeks shown">
            {WEEK_OPTIONS.map((n) => (
              <Link
                key={n}
                href={`/stats/bulk?weeks=${n}`}
                className={`bulk-weekopt${n === count ? ' bulk-weekopt-on' : ''}`}
                aria-current={n === count ? 'true' : undefined}
              >
                {n === 1 ? '1 wk' : `${n} wks`}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="bulk-empty">No active stats yet.</p>
        ) : (
          <BulkGrid rows={rows} weeks={weekMeta} />
        )}
      </div>
    </>
  );
}
