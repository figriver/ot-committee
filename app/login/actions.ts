'use server';

import { getServiceClient } from '@/lib/supabase/server';
import { sendMagicLink } from '@/lib/magic-link';

export type LoginState = { ok: boolean; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Request a magic link. Only allowlisted emails (a row in members) get one;
 * a non-allowlisted email gets the SAME response and no link/account (no
 * account enumeration). Allowlist is read with the service-role client.
 */
export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  const svc = getServiceClient();
  const { data, error } = await svc
    .from('members')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (error) {
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }

  if (data) {
    // Swallow mailer errors (e.g. rate limits) so we never leak whether an
    // email is on the allowlist; the user just retries.
    try {
      await sendMagicLink(email);
    } catch {
      /* server-side mailer issue; response stays neutral */
    }
  }

  return {
    ok: true,
    message:
      'If that email is approved, a login link is on its way — check your inbox.',
  };
}
