import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { listGeneralHatsByGroup, listGroups } from '@/lib/general-hats';
import { createGeneralHat, moveGeneralHat } from '@/app/hatting/actions';
import { HattingSubNav } from '@/components/hatting-subnav';

export const dynamic = 'force-dynamic';

// The General Hats index: committee-level hat material, grouped. Post hats say
// "here is your job"; these say "here is what every member needs to know".
// Everyone reads. An admin also gets create + reorder, both server-enforced in
// the actions — nothing here is what protects them.

export default async function GeneralHatsPage() {
  const member = await requireMember();
  const isAdmin = member.role === 'admin';
  const [groups, sections] = await Promise.all([listGroups(), listGeneralHatsByGroup()]);
  const total = sections.reduce((n, s) => n + s.hats.length, 0);

  return (
    <>
      <HattingSubNav active="general" />
      <div className="gh-wrap">
      <header className="gh-head">
        <h1>General Hats</h1>
        <p className="gh-sub">
          What every OT Committee member needs to know, whatever post they hold. For the
          duties of one post, open that post from the <Link href="/board">org board</Link>.
        </p>
      </header>

      {isAdmin && (
        <details className="gh-new">
          <summary className="gh-newsummary">+ New general hat</summary>
          <form action={createGeneralHat} className="gh-newform">
            <label className="gh-field">
              <span className="gh-label">Title</span>
              <input
                type="text"
                name="title"
                required
                maxLength={120}
                placeholder="e.g. OT Committee Member Hat"
                className="gh-input"
              />
            </label>
            <label className="gh-field">
              <span className="gh-label">Group</span>
              <select name="group" className="gh-select" defaultValue={groups[0]?.key}>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="gh-create">
              Create &amp; write
            </button>
          </form>
        </details>
      )}

      {total === 0 && !isAdmin && (
        <p className="gh-none">No general hats have been written yet.</p>
      )}

      {sections.map(({ group, hats }) => (
        <section key={group.key} className="gh-group">
          <div className="gh-grouphead">
            <h2 className="gh-grouptitle">{group.label}</h2>
            {group.blurb && <p className="gh-groupblurb">{group.blurb}</p>}
          </div>

          {hats.length === 0 ? (
            <p className="gh-empty">Nothing in this group yet.</p>
          ) : (
            <ol className="gh-list">
              {hats.map((h, i) => (
                <li key={h.id} className="gh-item">
                  <Link href={`/hatting/general/${h.id}`} className="gh-row">
                    <span className="gh-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="gh-main">
                      <span className="gh-title">
                        {h.title}
                        {!h.hasContent && <span className="gh-draft">Not written yet</span>}
                      </span>
                      {h.excerpt && <span className="gh-excerpt">{h.excerpt}</span>}
                      {h.updatedByName && (
                        <span className="gh-meta">Last updated by {h.updatedByName}</span>
                      )}
                    </span>
                    <span className="gh-go" aria-hidden="true">
                      Read →
                    </span>
                  </Link>

                  {isAdmin && hats.length > 1 && (
                    <div className="gh-order">
                      <form action={moveGeneralHat}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button
                          type="submit"
                          className="gh-move"
                          disabled={i === 0}
                          aria-label={`Move ${h.title} up`}
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveGeneralHat}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button
                          type="submit"
                          className="gh-move"
                          disabled={i === hats.length - 1}
                          aria-label={`Move ${h.title} down`}
                        >
                          ↓
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
      </div>
    </>
  );
}