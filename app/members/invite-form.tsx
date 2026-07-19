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
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="new.member@example.com"
          className="invite-input"
          disabled={pending}
        />
        <button type="submit" className="invite-btn" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      {state.message && (
        <div className={state.ok ? 'invite-ok' : 'invite-err'}>
          {state.message}
        </div>
      )}
    </div>
  );
}
