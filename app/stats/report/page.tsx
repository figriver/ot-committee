import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { buildUplineReport } from '@/lib/upline-report';
import { resolveWeekEnding, addDaysISO, formatWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { StatsSubNav } from '@/components/stats-subnav';

export const dynamic = 'force-dynamic';

// The upline report, on screen — what the .docx will contain, so the operator
// can read it before sending rather than after. Admin-only: this is the
// committee's outgoing report, not a personal view.

export default async function UplineReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const member = await requireAdmin();
  const sp = await searchParams;
  const weekEnding = await resolveWeekEnding(sp.week);
  const report = await buildUplineReport(weekEnding);

  const qs = (w: string) => `/stats/report?week=${w}`;

  return (
    <>
      <AccountBar email={member.email} isAdmin />
      <StatsSubNav active="report" isAdmin />
      <div className="ur-wrap">
        <header className="ur-head">
          <div>
            <h1>Upline stat report</h1>
            <p className="ur-sub">
              The weekly form for EUS Stats I/C · OTC Int · Chair · D-Chair · PES, assembled
              from what members reported. Read it here, then download the .docx to attach.
            </p>
          </div>
          <a className="ur-download" href={`/stats/report/docx?week=${weekEnding}`}>
            Download .docx
          </a>
        </header>

        <div className="ur-weeknav">
          <Link href={qs(addDaysISO(weekEnding, -7))} className="ur-weekbtn">
            ‹ Prev
          </Link>
          <span className="ur-weeklabel">Week ending {formatWeekEnding(weekEnding)}</span>
          <Link href={qs(addDaysISO(weekEnding, 7))} className="ur-weekbtn">
            Next ›
          </Link>
        </div>

        {report.missingDefinitions.length > 0 && (
          <div className="ur-warn">
            <strong>
              Line{report.missingDefinitions.length === 1 ? '' : 's'}{' '}
              {report.missingDefinitions.join(', ')}
            </strong>{' '}
            have no definition text yet. The definitions are the wording issued by OTC Int, so
            they were not invented here — paste them in under{' '}
            <Link href="/settings/stats">Settings → Manage Stats</Link> and they will appear on
            every report from then on.
          </div>
        )}

        <p className="ur-rosternote">
          Line 5 lists the <strong>{report.rosterSize} members in this system</strong>. Anyone
          not yet added as a member has no row — the roster is only as complete as the member
          list.
        </p>

        <article className="ur-paper">
          <h2 className="ur-title">Stat form for {report.orgName}</h2>
          <p className="ur-for">For W/Eing {report.weekLabel}</p>

          {report.lines.map((l) => (
            <section key={l.line} className="ur-line">
              <h3 className="ur-lineheads">
                <span className="ur-num">{l.line}.</span>
                <span className="ur-label">{l.label}:</span>
                <span className="ur-value">{l.value === '' ? '0' : l.value}</span>
              </h3>
              {l.definition && l.definition.trim() !== '' ? (
                <p className="ur-def">{l.definition}</p>
              ) : (
                <p className="ur-defmissing">Definition not entered yet.</p>
              )}

              {l.table && (
                <table className="ur-table">
                  <thead>
                    <tr>
                      {l.table.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {l.table.rows.length > 0
                      ? l.table.rows.map((r, i) => (
                          <tr key={i}>
                            {r.map((v, j) => (
                              <td key={j}>{v}</td>
                            ))}
                          </tr>
                        ))
                      : Array.from({ length: Math.max(l.table.blankRows, 1) }, (_, i) => (
                          <tr key={`b${i}`} className="ur-blankrow">
                            {l.table!.columns.map((c) => (
                              <td key={c}>&nbsp;</td>
                            ))}
                          </tr>
                        ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
