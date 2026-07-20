'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { sendMagicLink } from '@/lib/magic-link';

export type InviteState = { ok: boolean; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Admin-only: promote a member to admin or demote an admin to member. Any admin
 * may do this. Guardrail: never allow zero admins — demoting the LAST remaining
 * admin is blocked (this also covers an admin trying to demote themselves when
 * they're the only admin). Role takes effect on the target's next load, since
 * every page reads role from the DB per request.
 */
export async function setMemberRole(formData: FormData): Promise<void> {
  await requireAdmin(); // server-side gate (redirects non-admins)

  const memberId = String(formData.get('member_id') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!memberId || (role !== 'admin' && role !== 'member')) {
    redirect('/settings/members?error=bad');
  }

  const svc = getServiceClient();
  const { data: target } = await svc
    .from('members')
    .select('id, role')
    .eq('id', memberId)
    .maybeSingle();
  if (!target) redirect('/settings/members?error=notfound');
  if (target.role === role) redirect('/settings/members'); // no-op

  // Never allow zero admins: block demoting the last admin.
  if (target.role === 'admin' && role === 'member') {
    const { count } = await svc
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      redirect('/settings/members?error=last_admin');
    }
  }

  const { error } = await svc
    .from('members')
    .update({ role })
    .eq('id', memberId);
  if (error) redirect('/settings/members?error=save');

  revalidatePath('/settings/members');
  redirect(`/settings/members?role=${role}`);
}

/**
 * Admin-only: add an email to the allowlist as a member and send its magic link.
 * Existing rows are left as-is (an existing admin is not downgraded); the link
 * is (re)sent either way.
 */
export async function inviteMember(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireAdmin(); // redirects non-admins

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  const svc = getServiceClient();
  const { data: existing, error: selErr } = await svc
    .from('members')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (selErr) {
    return { ok: false, message: `Could not check member: ${selErr.message}` };
  }

  if (!existing) {
    const { error } = await svc
      .from('members')
      .insert({ email, role: 'member', status: 'invited' });
    if (error) {
      return { ok: false, message: `Could not add member: ${error.message}` };
    }
  }

  // The allowlist row is what grants access; the magic link is a convenience.
  // If the (shared) mailer is rate-limited, keep the invite and say so — they
  // can still request a link from the login page.
  let emailed = true;
  try {
    await sendMagicLink(email);
  } catch {
    emailed = false;
  }
  revalidatePath('/settings/members');
  return {
    ok: true,
    message: emailed
      ? `Invited ${email} — a magic link has been sent.`
      : `Added ${email} to the allowlist, but the magic link couldn’t be sent right now (mailer limit). They can request one from the login page.`,
  };
}
