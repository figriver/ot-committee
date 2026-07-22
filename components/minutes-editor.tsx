'use client';

import { refusalMessage } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveMinutes } from '@/app/meeting/actions';

// Minutes for one week. Two modes:
//   view (This Week / read surfaces): read-only body; an admin gets a LINK to
//         Enter to write/edit — composers live only on Enter.
//   edit (the Enter screen): the inline editor. Everyone reads; an admin edits,
//         and the write is enforced server-side in saveMinutes regardless.

export function MinutesEditor({
  weekEnding,
  initialBody,
  updatedByName,
  updatedAtLabel,
  canEdit,
  view = false,
  enterHref = '/meeting/enter#minutes',
}: {
  weekEnding: string;
  initialBody: string;
  updatedByName: string | null;
  updatedAtLabel: string | null;
  canEdit: boolean;
  view?: boolean;
  enterHref?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(initialBody);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasContent = saved.trim() !== '';

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const refused = refusalMessage(await saveMinutes(weekEnding, body));
        if (refused) {
          setError(refused);
          return;
        }
        setSaved(body);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <section className="mn-card" id="minutes">
      <div className="mn-head">
        <h2>Minutes</h2>
        {canEdit &&
          (view ? (
            // View surface: composers live on Enter, so link there.
            <Link href={enterHref} className="mn-edit">
              {hasContent ? 'Edit on Enter →' : 'Write minutes on Enter →'}
            </Link>
          ) : (
            !editing && (
              <button type="button" className="mn-edit" onClick={() => setEditing(true)}>
                {hasContent ? 'Edit' : 'Write minutes'}
              </button>
            )
          ))}
      </div>

      {!view && editing ? (
        <>
          <textarea
            className="mn-textarea"
            rows={12}
            value={body}
            placeholder="Record the meeting — decisions, actions, notes…"
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <div className="mn-err">{error}</div>}
          <div className="mn-actions">
            <button type="button" className="mn-save" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save minutes'}
            </button>
            <button
              type="button"
              className="mn-cancel"
              onClick={() => {
                setBody(saved);
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : hasContent ? (
        <>
          <div className="mn-body">{saved}</div>
          {updatedByName && (
            <p className="mn-meta">
              Last updated by {updatedByName}
              {updatedAtLabel ? ` · ${updatedAtLabel}` : ''}
            </p>
          )}
        </>
      ) : (
        <p className="mn-empty">
          No minutes recorded for this meeting yet.
          {canEdit ? (view ? ' Write them on Enter.' : ' Use “Write minutes” above.') : ''}
        </p>
      )}
    </section>
  );
}
