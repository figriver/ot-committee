'use client';

import { useEffect, useState, useTransition } from 'react';
import { updateReminderTemplate } from '@/app/settings/collection/actions';
import type { MemberReportStatus } from '@/lib/collection';

// The chase-up screen's interactive parts: copy-to-clipboard, and editing the
// reminder template.
//
// The flow this is built for: open the screen → copy the missing addresses →
// copy the message → paste both into your own email → send. Nothing is sent by
// the system yet (see lib/reminders.ts).

/** Clipboard with a fallback: navigator.clipboard needs a secure context. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({
  text,
  label,
  className = 'col-btn',
  disabled = false,
}: {
  text: string;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={async () => setState((await copy(text)) ? 'ok' : 'fail')}
    >
      {state === 'ok' ? 'Copied ✓' : state === 'fail' ? 'Press Ctrl+C' : label}
    </button>
  );
}

export function CollectionClient({
  weekLabel,
  missing,
  reported,
  recipientLine,
  reportLink,
  templateSubject,
  templateBody,
  renderedSubject,
  renderedBody,
}: {
  weekEnding: string;
  weekLabel: string;
  missing: MemberReportStatus[];
  reported: MemberReportStatus[];
  recipientLine: string;
  reportLink: string;
  templateSubject: string;
  templateBody: string;
  renderedSubject: string;
  renderedBody: string;
}) {
  // Local copies so the fields stay responsive while the save round-trips —
  // binding an input straight to server state leaves it frozen mid-action.
  const [subject, setSubject] = useState(templateSubject);
  const [body, setBody] = useState(templateBody);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => setSubject(templateSubject), [templateSubject]);
  useEffect(() => setBody(templateBody), [templateBody]);

  const dirty = subject !== templateSubject || body !== templateBody;

  // What gets copied reflects what is on screen: an edit the admin has not saved
  // yet should still be what they paste into the email.
  const fill = (s: string) =>
    s.replaceAll('{week}', weekLabel).replaceAll('{link}', reportLink);
  const outSubject = dirty ? fill(subject) : renderedSubject;
  const outBody = dirty ? fill(body) : renderedBody;

  return (
    <>
      <section className="col-panel">
        <div className="col-panelhead">
          <h2>Not reported ({missing.length})</h2>
          <CopyButton
            text={recipientLine}
            label="Copy all missing emails"
            className="col-btn col-btn-primary"
            disabled={missing.length === 0}
          />
        </div>

        {missing.length === 0 ? (
          <p className="col-alldone">
            Everyone has reported for the week ending {weekLabel}. Nothing to chase.
          </p>
        ) : (
          <>
            <ul className="col-list">
              {missing.map((m) => (
                <li key={m.memberId} className="col-row">
                  <span className="col-dot col-dot-missing" aria-hidden="true" />
                  <span className="col-name">{m.name || m.email}</span>
                  <span className="col-email">{m.email}</span>
                  {m.status === 'invited' && (
                    <span className="col-badge" title="Invited but has never signed in">
                      invited
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <label className="col-fieldlabel" htmlFor="col-recipients">
              Addresses — paste into your email&rsquo;s To: field
            </label>
            <textarea
              id="col-recipients"
              className="col-textarea col-mono"
              readOnly
              rows={2}
              value={recipientLine}
              onFocus={(e) => e.currentTarget.select()}
            />
          </>
        )}
      </section>

      <section className="col-panel">
        <div className="col-panelhead">
          <h2>Reminder message</h2>
          <span className="col-hint">
            {'{week}'} and {'{link}'} fill in automatically
          </span>
        </div>

        <label className="col-fieldlabel" htmlFor="col-subject">
          Subject
        </label>
        <input
          id="col-subject"
          className="col-input"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setSaved(false);
          }}
        />

        <label className="col-fieldlabel" htmlFor="col-body">
          Message
        </label>
        <textarea
          id="col-body"
          className="col-textarea"
          rows={9}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
          }}
        />

        {err && <div className="col-err">{err}</div>}

        <div className="col-actions">
          <CopyButton text={outSubject} label="Copy subject" />
          <CopyButton text={outBody} label="Copy message" />
          <span className="col-spacer" />
          <button
            type="button"
            className="col-btn col-btn-primary"
            disabled={!dirty || pending}
            onClick={() => {
              setErr(null);
              start(async () => {
                try {
                  await updateReminderTemplate(subject, body);
                  setSaved(true);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : 'Could not save.');
                }
              });
            }}
          >
            {pending ? 'Saving…' : saved && !dirty ? 'Saved ✓' : 'Save template'}
          </button>
        </div>

        <p className="col-preview-label">Preview (what gets copied)</p>
        <div className="col-preview">
          <div className="col-preview-subject">{outSubject}</div>
          <div className="col-preview-body">{outBody}</div>
        </div>
      </section>

      <section className="col-panel col-panel-quiet">
        <div className="col-panelhead">
          <h2>Reported ({reported.length})</h2>
        </div>
        {reported.length === 0 ? (
          <p className="col-none">Nobody has reported for this week yet.</p>
        ) : (
          <ul className="col-list">
            {reported.map((m) => (
              <li key={m.memberId} className="col-row">
                <span className="col-dot col-dot-ok" aria-hidden="true" />
                <span className="col-name">{m.name || m.email}</span>
                <span className="col-email">{m.email}</span>
                <span className="col-hours">{m.hours} hrs</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
