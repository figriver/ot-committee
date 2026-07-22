'use client';

import { useMemo, useState, useTransition } from 'react';
import { attachHat } from '@/app/hatting/post-hat-actions';
import type { PostOption } from '@/lib/writeups';

// The attach / reassign selector. There are ~106 posts and 91 of them have no
// hat, so a raw <select> is unusable — this filters as you type over the post
// name AND its division/department label.
//
// Posts that already hold a hat are shown but marked and NOT selectable: the
// server blocks that case anyway (attaching would overwrite a written document),
// and finding out after submitting would be worse than seeing it in the list.

export function PostPicker({
  hatId,
  posts,
  currentPostId,
  allowDetach,
  label,
}: {
  hatId: string;
  posts: PostOption[];
  currentPostId: string | null;
  allowDetach: boolean;
  label: string;
}) {
  const [q, setQ] = useState('');
  const [choice, setChoice] = useState<string | null>(currentPostId);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? posts.filter(
          (p) =>
            p.title.toLowerCase().includes(needle) ||
            p.contextLabel.toLowerCase().includes(needle),
        )
      : posts;
    return list.slice(0, 60);
  }, [q, posts]);

  const taken = (p: PostOption) => Boolean(p.occupiedByHatId) && p.id !== currentPostId;
  const dirty = choice !== currentPostId;

  const submit = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('hatId', hatId);
      fd.set('postId', choice ?? '');
      try {
        // Refusals come back as a value (a thrown message would be redacted in
        // a production build); only a redirect — success — throws from here.
        const result = await attachHat(fd);
        if (result && !result.ok) setError(result.message);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not move this hat.';
        if (msg.includes('NEXT_REDIRECT')) throw e;
        setError(msg);
      }
    });

  return (
    <div className="pp">
      <p className="pp-label">{label}</p>

      <input
        type="search"
        className="pp-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter posts by name or division…"
        aria-label="Filter posts"
        autoComplete="off"
      />

      <ul className="pp-list" role="listbox" aria-label="Posts">
        {allowDetach && (
          <li>
            <button
              type="button"
              role="option"
              aria-selected={choice === null}
              className={`pp-opt pp-unattached${choice === null ? ' pp-on' : ''}`}
              onClick={() => setChoice(null)}
            >
              <span className="pp-opttitle">Unattached</span>
              <span className="pp-optctx">Keep this hat in the pool, on no post</span>
            </button>
          </li>
        )}

        {matches.length === 0 && <li className="pp-none">No post matches “{q}”.</li>}

        {matches.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="option"
              aria-selected={choice === p.id}
              disabled={taken(p)}
              className={`pp-opt${choice === p.id ? ' pp-on' : ''}${taken(p) ? ' pp-taken' : ''}`}
              onClick={() => !taken(p) && setChoice(p.id)}
              title={taken(p) ? 'This post already has a hat' : undefined}
            >
              <span className="pp-opttitle">
                {p.title}
                {p.id === currentPostId && <span className="pp-here">current</span>}
                {taken(p) && <span className="pp-hashat">has a hat</span>}
              </span>
              <span className="pp-optctx">{p.contextLabel}</span>
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="pw-err">{error}</div>}

      <div className="pp-actions">
        <button type="button" className="pp-go" onClick={submit} disabled={!dirty || pending}>
          {pending
            ? 'Moving…'
            : choice === null
              ? // On an unattached hat nothing has been chosen yet; on an attached
                // one, choosing "Unattached" means taking it off its post.
                allowDetach
                ? 'Detach from post'
                : 'Pick a post above'
              : currentPostId
                ? 'Move to this post'
                : 'Attach to this post'}
        </button>
        {dirty && !pending && (
          <button type="button" className="pw-cancel" onClick={() => setChoice(currentPostId)}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
