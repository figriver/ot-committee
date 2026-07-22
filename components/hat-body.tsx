import type { ReactNode } from 'react';

// The ONE renderer for hat long-form bodies — a post's hat (post_writeups) and a
// general committee hat (general_hats) are the same kind of document, so they
// share this and never drift apart.
//
// Body is a constrained markdown subset so a multi-section document (Purpose /
// Duties / Stats / VFP) reads cleanly and seeds from a file, WITHOUT a markdown
// dependency (this codebase carries no UI libs) and WITHOUT dangerouslySetInnerHTML
// — every node is built from text, so React escapes it and there is no injection.
//
// No 'use client': plain functions returning elements, imported by both the
// server-rendered read surfaces and the client editor.

export const HAT_PLACEHOLDER = `## Purpose
Why this post exists.

## Duties
- First duty
- Second duty

## Stats
The stat(s) this post is measured on.

## VFP
The post's valuable final product.`;

/** Inline: **bold** only. */
export function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/** Block: #/## headings, - / * bullets, blank-line paragraphs. */
export function renderHat(body: string): ReactNode[] {
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

/** The rendered document. */
export function HatBody({ body }: { body: string }) {
  return <div className="pw-body">{renderHat(body)}</div>;
}
