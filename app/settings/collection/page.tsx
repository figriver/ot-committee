import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getCollection } from '@/lib/collection';
import { getReminderTemplate, buildReminder } from '@/lib/reminders';
import { getLockConfig, isLockedAt, describeLock } from '@/lib/lock';
import { resolveWeekEnding, addDaysISO, formatWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { CollectionClient } from '@/components/collection-client';

export const dynamic = 'force-dynamic';

// Chase-up: for a week, who has reported and who has not — the missing list
// being the point of the screen.
//
// Admin-only, enforced by requireAdmin() server-side (not by hiding the nav
// link). Sending is MANUAL for now: copy the addresses, copy the message, send
// from your own mail client. See lib/reminders.ts for the seam that a system
// sender would plug into.

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const member = await requireAdmin();
  const sp = await searchParams;

  const weekEnding = await resolveWeekEnding(sp.week);
  const [view, template, lockCfg] = await Promise.all([
    getCollection(weekEnding),
    getReminderTemplate(),
    getLockConfig(),
  ]);

  const weekLabel = formatWeekEnding(weekEnding);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const reportLink = `${siteUrl}/stats?week=${weekEnding}`;
  const draft = buildReminder(
    template,
    { week: weekLabel, link: reportLink },
    view.missingActive.map((m) => m.email),
  );

  const locked = isLockedAt(weekEnding, lockCfg);
  const pct = view.total ? Math.round((view.reported.length / view.total) * 100) : 0;

  return (
    <>
      <AccountBar email={member.email} isAdmin />
      <div className="col-wrap">
        <div className="col-head">
          <div>
            <h1>Collection</h1>
            <p className="col-sub">
              Who has reported their hours, and who still needs chasing.
            </p>
          </div>
          <Link href="/settings" className="col-back">
            ← Settings
          </Link>
        </div>

        <div className="rpt-weeknav">
          <Link
            href={`/settings/collection?week=${addDaysISO(weekEnding, -7)}`}
            className="rpt-weekbtn"
          >
            ‹ Prev
          </Link>
          <div className="rpt-weeklabel">
            Week ending <strong>{weekLabel}</strong>
            {locked ? (
              <span className="col-lockchip">Closed</span>
            ) : (
              <span className="col-openchip">Open</span>
            )}
          </div>
          <Link
            href={`/settings/collection?week=${addDaysISO(weekEnding, 7)}`}
            className="rpt-weekbtn"
          >
            Next ›
          </Link>
        </div>

        <div className="col-summary">
          <div className="col-stat">
            <span className="col-statnum">{view.missingActive.length}</span>
            <span className="col-statlabel">to chase</span>
          </div>
          <div className="col-stat col-stat-quiet">
            <span className="col-statnum">{view.reported.length}</span>
            <span className="col-statlabel">reported</span>
          </div>
          <div className="col-bar" role="img" aria-label={`${pct}% reported`}>
            <div className="col-barfill" style={{ width: `${pct}%` }} />
          </div>
          <span className="col-pct">{pct}% in</span>
        </div>
        <p className="col-locknote">Weeks close {describeLock(lockCfg)}.</p>

        <CollectionClient
          weekEnding={weekEnding}
          weekLabel={weekLabel}
          missingActive={view.missingActive}
          neverSignedIn={view.neverSignedIn}
          reported={view.reported}
          recipientLine={draft.recipientLine}
          reportLink={reportLink}
          templateSubject={template.subject}
          templateBody={template.body}
          renderedSubject={draft.subject}
          renderedBody={draft.body}
        />
      </div>
    </>
  );
}
