'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { saveWriteup } from '@/app/post/[postId]/actions';

// The hat write-up: a read surface for everyone, an inline editor for the post's
// holder / an admin (enforced server-side in saveWriteup regardless).
//
// Body is a constrained markdown subset so a multi-section document (Purpose /
// Duties / Stats / VFP) reads cleanly and seeds from a file, WITHOUT a markdown
// dependency (this codebase carries no UI libs) and WITHOUT dangerouslySetInnerHTML
// — every node is built from text, so React escapes it and there is no injection.

const PLACEHOLDER = `## Purpose
Why this post exists.

## Duties
- First duty
- Second duty

## Stats
The stat(s) this post is measured on.

## VFP
The post's valuable final product.`;

/** Inline: **bold** only. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Block: #/## headings, - / * bullets, blank-line paragraphs. */
function renderHat(body: string): ReactNode[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={`u${key++}`} className="pw-ul">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flush();
      out.push(
        <h3 key={`h${key++}`} className="pw-h3">
          {inline(line.replace(/^##\s+/, ''))}
        </h3>,
      );
    } else if (/^#\s+/.test(line)) {
      flush();
      out.push(
        <h2 key={`h${key++}`} className="pw-h2">
          {inline(line.replace(/^#\s+/, ''))}
        </h2>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''));
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(
        <p key={`p${key++}`} className="pw-p">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  return out;
}

export function WriteupEditor({
  postId,
  initialBody,
  updatedByName,
  updatedAtLabel,
  canEdit,
}: {
  postId: string;
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
        await saveWriteup(postId, body);
        setSaved(body);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <section className="pw-card">
      <div className="pw-cardhead">
        <h2 className="pw-cardtitle">Hat write-up</h2>
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
            placeholder={PLACEHOLDER}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <div className="pw-err">{error}</div>}
          <div className="pw-actions">
            <button type="button" className="pw-save" onClick={save} disabled={pending}>
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
          <div className="pw-body">{renderHat(saved)}</div>
          {updatedByName && (
            <p className="pw-meta">
              Last updated by {updatedByName}
              {updatedAtLabel ? ` · ${updatedAtLabel}` : ''}
            </p>
          )}
        </>
      ) : (
        <p className="pw-empty">
          No hat write-up yet.
          {canEdit ? ' Use “Write hat” to add the post’s Purpose, Duties, Stats, and VFP.' : ''}
        </p>
      )}
    </section>
  );
}
