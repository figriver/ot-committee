'use client';

import { useState, useTransition } from 'react';
import { HatBody, HAT_PLACEHOLDER } from '@/components/hat-body';
import type { ActionResult } from '@/lib/action-result';

// The hat card: a read surface for everyone, an inline editor for whoever may
// write it. Used by BOTH a post's hat and a general committee hat — the only
// difference is the `save` action handed in, and authorization is enforced
// server-side inside that action regardless of what `canEdit` says here.

export function HatEditor({
  cardTitle,
  initialBody,
  save,
  canEdit,
  updatedByName,
  updatedAtLabel,
  emptyText,
  placeholder = HAT_PLACEHOLDER,
}: {
  cardTitle: string;
  initialBody: string;
  /** Refusals come back as a value; only a crash throws (lib/action-result.ts). */
  save: (body: string) => Promise<ActionResult | void>;
  canEdit: boolean;
  updatedByName: string | null;
  updatedAtLabel: string | null;
  emptyText: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [saved, setSaved] = useState(initialBody);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasContent = saved.trim() !== '';

  const onSave = () =>
    start(async () => {
      setError(null);
      try {
        const result = await save(body);
        if (result && !result.ok) {
          setError(result.message);
          return; // refused — keep the editor open with the text intact
        }
        setSaved(body);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <section className="pw-card">
      <div className="pw-cardhead">
        <h2 className="pw-cardtitle">{cardTitle}</h2>
        {canEdit && !editing && (
          <button type="button" className="pw-edit" onClick={() => setEditing(true)}>
            {hasContent ? 'Edit' : 'Write hat'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <p className="pw-edithint">
            Use <code>## Purpose</code>, <code>## Duties</code> … for sections,
            <code>- </code> for bullets, <code>**bold**</code> for emphasis.
          </p>
          <textarea
            className="pw-textarea"
            rows={20}
            value={body}
            placeholder={placeholder}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <div className="pw-err">{error}</div>}
          <div className="pw-actions">
            <button type="button" className="pw-save" onClick={onSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save hat'}
            </button>
            <button
              type="button"
              className="pw-cancel"
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
          <HatBody body={saved} />
          {updatedByName && (
            <p className="pw-meta">
              Last updated by {updatedByName}
              {updatedAtLabel ? ` · ${updatedAtLabel}` : ''}
            </p>
          )}
        </>
      ) : (
        <p className="pw-empty">{emptyText}</p>
      )}
    </section>
  );
}
