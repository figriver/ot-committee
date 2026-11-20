import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getPostsForPicker, getStatsWithContext } from '@/lib/stats';
import { getServiceClient } from '@/lib/supabase/server';
import { AccountBar } from '@/components/account-bar';
import { createStat, saveStatDefinition } from './actions';

export const dynamic = 'force-dynamic';

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const [posts, stats] = await Promise.all([
    getPostsForPicker(),
    getStatsWithContext(),
  ]);

  // group stats by post label for display
  // The report lines, read straight from the stats table (report_line/label/
  // definition were added by 0023).
  const supa = getServiceClient();
  const { data: reportStats } = await supa
    .from('stats')
    .select('id, name, report_line, report_label, definition')
    .not('report_line', 'is', null)
    .order('report_line', { ascending: true });

  const byPost = new Map<
    string,
    { label: string; stats: { id: string; name: string }[] }
  >();
  for (const s of stats) {
    const g = byPost.get(s.postId) ?? { label: s.postLabel, stats: [] };
    g.stats.push({ id: s.id, name: s.name });
    byPost.set(s.postId, g);
  }

  return (
    <>
      <AccountBar email={admin.email} isAdmin />
      <div className="stx-wrap">
        <div className="stx-head">
          <h1>Manage Stats</h1>
          <Link href="/settings" className="stx-back">
            ← Settings
          </Link>
        </div>
        <p className="stx-intro">
          Create a named production stat and attach it to a post. Whoever holds
          that post reports it each week. Hours is reported separately, per member.
        </p>

        {sp.created && (
          <div className="stx-ok">Stat created.</div>
        )}
        {sp.error && (
          <div className="stx-err">
            {sp.error === 'missing'
              ? 'Pick a post and enter a stat name.'
              : 'Could not create the stat. Try again.'}
          </div>
        )}

        <form action={createStat} className="stx-form">
          <label className="stx-label" htmlFor="post_id">
            Post
          </label>
          <select id="post_id" name="post_id" required className="stx-select" defaultValue="">
            <option value="" disabled>
              Choose a post…
            </option>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="stx-label" htmlFor="name">
            Stat name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Bodies in the shop"
            className="stx-input"
          />

          <button type="submit" className="stx-btn">
            Create stat
          </button>
        </form>

        {/* The 13 lines of the issued upline form. Their definitions are the
            wording OTC Int publishes, so they are editable here rather than
            baked into the generator. */}
        {(reportStats ?? []).length > 0 && (
          <section className="stx-defs">
            <h2 className="stx-subhead">Upline report definitions</h2>
            <p className="stx-intro">
              Printed under each stat on the weekly form. Paste the wording from the issued
              form — anything left blank is shown as “not entered”, never guessed.
            </p>
            {(reportStats ?? []).map((s) => (
              <form key={s.id} action={saveStatDefinition} className="stx-defform">
                <input type="hidden" name="stat_id" value={s.id} />
                <div className="stx-defhead">
                  <span className="stx-defline">{s.report_line}</span>
                  <span className="stx-defname">{s.report_label ?? s.name}</span>
                  {!s.definition && <span className="stx-defmissing">not entered</span>}
                </div>
                <textarea
                  name="definition"
                  rows={3}
                  className="stx-deftext"
                  defaultValue={s.definition ?? ''}
                  placeholder="Paste the definition from the issued form…"
                />
                <button type="submit" className="stx-defsave">
                  Save definition
                </button>
              </form>
            ))}
          </section>
        )}

        <h2 className="stx-subhead">Existing stats</h2>
        {byPost.size === 0 ? (
          <p className="stx-empty">No stats yet.</p>
        ) : (
          <ul className="stx-list">
            {[...byPost.values()].map((g) => (
              <li key={g.label} className="stx-list-item">
                <div className="stx-list-post">{g.label}</div>
                <div className="stx-list-stats">
                  {g.stats.map((s) => (
                    <Link
                      key={s.id}
                      href={`/stats/history/stat/${s.id}`}
                      className="stx-chip stx-chip-link"
                      title="View & correct this stat’s history"
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
