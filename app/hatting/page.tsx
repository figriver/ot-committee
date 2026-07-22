import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { getPostHatIndex } from '@/lib/post-hats';
import { listUnattachedHats } from '@/lib/writeups';
import { HattingSubNav } from '@/components/hatting-subnav';
import { HatSearch } from '@/components/hat-search';
import { createUnattachedHat } from '@/app/hatting/post-hat-actions';

export const dynamic = 'force-dynamic';

// The post-hat index: every org-board post whose hat has been written, searchable
// by post name AND by the text inside the hat — with the un-hatted posts listed
// underneath, because the gaps are the point as much as the coverage.

export default async function PostHatsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const member = await requireMember();
  const { q } = await searchParams;
  const [index, unattached] = await Promise.all([
    getPostHatIndex(q ?? ''),
    listUnattachedHats(),
  ]);
  const { hatted, unhatted, totalPosts, totalHatted, query } = index;
  const isAdmin = member.role === 'admin';
  // The pool is a small, unordered set that no one searches by post name, so it
  // is filtered by title only — and shown whole when there is no query.
  const pool = query
    ? unattached.filter((u) => u.title.toLowerCase().includes(query.toLowerCase()))
    : unattached;

  const resultLabel = query
    ? `${hatted.length} hat${hatted.length === 1 ? '' : 's'} · ${unhatted.length} un-hatted post${
        unhatted.length === 1 ? '' : 's'
      } match “${query}”`
    : `${totalHatted} of ${totalPosts} posts have a hat`;

  return (
    <>
      <HattingSubNav active="posts" />
      <div className="ph-wrap">
        <header className="ph-head">
          <h1>Post Hats</h1>
          <p className="ph-sub">
            Each post’s own write-up — its Purpose, Duties, Stats and VFP. Search matches the
            post name <em>and</em> the text inside the hat. What every member reads regardless
            of post is under <Link href="/hatting/general">General Hats</Link>.
          </p>
        </header>

        <HatSearch initial={query} resultLabel={resultLabel} />

        <section className="ph-group">
          <div className="ph-grouphead">
            <h2 className="ph-grouptitle">Hatted posts</h2>
            <span className="ph-count">{hatted.length}</span>
          </div>

          {hatted.length === 0 ? (
            <p className="ph-empty">
              {query ? 'No hat matches that search.' : 'No post hats have been written yet.'}
            </p>
          ) : (
            <ul className="ph-list">
              {hatted.map((h) => (
                <li key={h.postId}>
                  <Link href={`/post/${h.postId}`} className="ph-row">
                    <span className="ph-main">
                      <span className="ph-title">
                        {h.title}
                        {h.isHFA && <span className="ph-hfa">HFA</span>}
                      </span>
                      <span className="ph-ctx">{h.contextLabel}</span>
                      {h.snippet && (
                        <span className={`ph-snippet${h.snippetIsMatch ? ' ph-hit' : ''}`}>
                          {h.snippetIsMatch && <span className="ph-hitflag">match</span>}
                          {h.snippet}
                        </span>
                      )}
                    </span>
                    <span className="ph-side">
                      {!h.isHFA && h.holderName && (
                        <span className="ph-holder">{h.holderName}</span>
                      )}
                      {h.updatedByName && (
                        <span className="ph-by">Updated by {h.updatedByName}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(pool.length > 0 || isAdmin) && (
          <section className="ph-group">
            <div className="ph-grouphead">
              <h2 className="ph-grouptitle">Unattached hats</h2>
              <span className={`ph-count${pool.length ? ' ph-pool' : ''}`}>{pool.length}</span>
            </div>
            <p className="ph-groupblurb">
              Written, but on no post yet — so nobody holds them. Attach one to put it on a
              post’s page.
            </p>

            {pool.length === 0 ? (
              <p className="ph-empty">
                {query ? 'No unattached hat matches that search.' : 'Nothing waiting to be attached.'}
              </p>
            ) : (
              <ul className="ph-list">
                {pool.map((u) => (
                  <li key={u.id}>
                    <Link href={`/hatting/hat/${u.id}`} className="ph-row">
                      <span className="ph-main">
                        <span className="ph-title">
                          {u.title}
                          {!u.hasContent && <span className="ph-hfa">Empty</span>}
                        </span>
                        <span className="ph-ctx">On no post</span>
                        {u.excerpt && <span className="ph-snippet">{u.excerpt}</span>}
                      </span>
                      <span className="ph-side">
                        <span className="ph-attach">Attach to a post →</span>
                        {u.updatedByName && (
                          <span className="ph-by">Updated by {u.updatedByName}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {isAdmin && (
              <details className="gh-new ph-newhat">
                <summary className="gh-newsummary">+ Start a hat with no post</summary>
                <form action={createUnattachedHat} className="gh-newform">
                  <label className="gh-field">
                    <span className="gh-label">What is this hat for?</span>
                    <input
                      type="text"
                      name="title"
                      required
                      maxLength={120}
                      placeholder="e.g. Bookstore Officer"
                      className="gh-input"
                    />
                  </label>
                  <button type="submit" className="gh-create">
                    Create &amp; write
                  </button>
                </form>
              </details>
            )}
          </section>
        )}

        {/* The COUNT of gaps is the signal and is always visible; the full list
            is 90-odd rows on a fresh board, so it opens on demand — except when
            it is short, or when a search is running and the matches are the
            point. */}
        <section className="ph-group">
          <details className="ph-gapwrap" open={Boolean(query) || unhatted.length <= 12}>
            <summary className="ph-grouphead ph-gapsummary">
              <h2 className="ph-grouptitle">No hat yet</h2>
              <span className="ph-count ph-gap">{unhatted.length}</span>
              <span className="ph-gaphint">
                {unhatted.length === 0
                  ? ''
                  : 'posts still waiting for a write-up — open one to write it'}
              </span>
            </summary>

            {unhatted.length === 0 ? (
              <p className="ph-empty">
                {query ? 'No un-hatted post matches that search.' : 'Every post has a hat.'}
              </p>
            ) : (
              <ul className="ph-gaps">
                {unhatted.map((p) => (
                  <li key={p.postId}>
                    <Link href={`/post/${p.postId}`} className="ph-gaprow" title={p.contextLabel}>
                      <span className="ph-gaptitle">{p.title}</span>
                      <span className="ph-gapctx">{p.contextLabel}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>

        {isAdmin && (
          <p className="ph-foot">
            A post hat is written on the post itself — open any post from the{' '}
            <Link href="/board">org board</Link> or from a row above.
          </p>
        )}
      </div>
    </>
  );
}
