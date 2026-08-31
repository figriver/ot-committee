'use client';

import { useActionState, useEffect, useRef } from 'react';
import { inviteMember, type InviteState } from './actions';

const INITIAL: InviteState = { ok: false, message: '' };

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteMember, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the field after a successful invite.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="invite-box">
      <form ref={formRef} action={formAction} className="invite-form">
        {/* A textarea, not <input type="email">: the browser's email validation
            rejects a comma-separated list, and a pasted committee runs long. */}
        <textarea
          name="email"
          required
          rows={2}
          autoComplete="off"
          spellCheck={false}
          placeholder="new.member@example.com, second@example.com"
          className="invite-input"
          disabled={pending}
        />
        <button type="submit" className="invite-btn" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      <p className="invite-hint">
        Add several at once — separate addresses with commas or new lines.
      </p>
      {state.message && (
        <div className={state.ok ? 'invite-ok' : 'invite-err'}>
          {state.message}
          {state.details && state.details.length > 0 && (
            <ul className="invite-details">
              {state.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
