'use client';

import { useState, useTransition } from 'react';
import { saveMinutes } from '@/app/meeting/actions';

// Minutes for one week: everyone reads; an admin edits. The edit affordance is
// only shown to admins, but the write is enforced server-side in saveMinutes.

export function MinutesEditor({
  weekEnding,
  initialBody,
  updatedByName,
  updatedAtLabel,
  canEdit,
}: {
  weekEnding: string;
  initialBody: string;
  updatedByName: string | null;
  updatedAtLabel: string | null;
  canEdit: boolean;
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
        await saveMinutes(weekEnding, body);
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
        {canEdit && !editing && (
          <button type="button" className="mn-edit" onClick={() => setEditing(true)}>
            {hasContent ? 'Edit' : 'Write minutes'}
          </button>
        )}
      </div>

      {editing ? (
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
          {canEdit ? ' Use “Write minutes” above.' : ''}
        </p>
      )}
    </section>
  );
}
