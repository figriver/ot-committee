'use client';

import { useActionState } from 'react';
import { requestMagicLink, type LoginState } from './actions';

const INITIAL: LoginState = { ok: false, message: '' };

export function LoginForm({ notice }: { notice: string | null }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, INITIAL);

  return (
    <div className="auth-card">
      <h1 className="auth-title">OT Committee</h1>
      <p className="auth-sub">Sign in to the org board</p>

      {notice && <div className="auth-alert">{notice}</div>}

      {state.ok ? (
        <div className="auth-success">{state.message}</div>
      ) : (
        <form action={formAction} className="auth-form">
          <label className="auth-label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="auth-input"
            disabled={pending}
          />
          {state.message && !state.ok && (
            <div className="auth-error">{state.message}</div>
          )}
          <button type="submit" className="auth-btn" disabled={pending}>
            {pending ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}

      <p className="auth-foot">
        Access is invite-only. Ask an admin to add your email if you don’t have
        access yet.
      </p>
    </div>
  );
}
