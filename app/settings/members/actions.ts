'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { sendMagicLink } from '@/lib/magic-link';

export type InviteState = {
  ok: boolean;
  message: string;
  /** One line per address, so a bulk paste says what happened to each. */
  details?: string[];
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Admin-only: promote a member to admin or demote an admin to member. Any admin
 * may do this. Guardrail: never allow zero admins — demoting the LAST remaining
 * admin is blocked (this also covers an admin trying to demote themselves when
 * they're the only admin). Role takes effect on the target's next load, since
 * every page reads role from the DB per request.
 */
// NOTE: wired to a plain `<form action={…}>`, which has nowhere to render a
// returned value — so a refusal here still throws and still gets redacted in
// production. Acceptable because the form is only rendered for someone already
// permitted, and the field-level rules are enforced by the inputs themselves
// (required, type=…). Converting this would mean useActionState, not a return.
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
 * Admin-only: set a member's display name — what every byline, attribution and
 * chase list shows for them (lib/member-names.ts). Members are email-only by
 * default (0004), so without this they display as a raw email wherever the org
 * board doesn't already carry a holder name for them.
 *
 * Blank clears the name, falling back to the board holder name, then the email.
 */
// NOTE: wired to a plain `<form action={…}>`, which has nowhere to render a
// returned value — so a refusal here still throws and still gets redacted in
// production. Acceptable because the form is only rendered for someone already
// permitted, and the field-level rules are enforced by the inputs themselves
// (required, type=…). Converting this would mean useActionState, not a return.
export async function setMemberName(formData: FormData): Promise<void> {
  await requireAdmin(); // server-side gate (redirects non-admins)

  const memberId = String(formData.get('member_id') ?? '');
  const raw = String(formData.get('name') ?? '').trim();
  if (!memberId) redirect('/settings/members?error=bad');
  if (raw.length > 120) redirect('/settings/members?error=name_long');

  const svc = getServiceClient();
  const { error } = await svc
    .from('members')
    .update({ name: raw || null })
    .eq('id', memberId);
  if (error) redirect('/settings/members?error=save');

  revalidatePath('/settings/members');
  redirect('/settings/members?named=1');
}

/** Guardrail on a single paste, so a runaway list can't fan out unbounded. */
const MAX_INVITES = 100;

/**
 * Split a pasted address list into unique, lowercased emails. Accepts commas,
 * semicolons and whitespace/newlines as separators, so a list copied out of a
 * spreadsheet or a mail client works as-is.
 */
function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const token = part.trim();
    if (!token) continue;
    const email = token.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      invalid.push(token);
      continue;
    }
    if (seen.has(email)) continue; // same address twice in one paste
    seen.add(email);
    emails.push(email);
  }
  return { emails, invalid };
}

/** Run `work` over `items` a few at a time — kinder to the shared mailer than
 *  firing 100 sends at once, and far quicker than one at a time. */
async function inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  }
  return out;
}

/**
 * Admin-only: add one or more emails to the allowlist as members and send each
 * its magic link. Addresses may be separated by commas (also semicolons or
 * newlines), so a whole committee can be added in one paste.
 *
 * Existing rows are left as-is (an existing admin is not downgraded); the link
 * is (re)sent either way. Every address is reported on individually — one bad
 * or unsendable address never discards the rest.
 */
export async function inviteMember(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireAdmin(); // redirects non-admins

  const { emails, invalid } = parseEmailList(
    String(formData.get('email') ?? ''),
  );
  if (emails.length === 0) {
    return {
      ok: false,
      message: invalid.length
        ? 'No valid email addresses found. Separate addresses with commas.'
        : 'Please enter at least one email address.',
      details: invalid.map((t) => `${t} — not a valid email address`),
    };
  }
  if (emails.length > MAX_INVITES) {
    return {
      ok: false,
      message: `That's ${emails.length} addresses — please invite at most ${MAX_INVITES} at a time.`,
    };
  }

  const svc = getServiceClient();
  // One read of the allowlist, compared case-insensitively: emails are stored
  // lowercased by this action, but older rows may not be.
  const { data: rows, error: selErr } = await svc
    .from('members')
    .select('email');
  if (selErr) {
    return { ok: false, message: `Could not check members: ${selErr.message}` };
  }
  const known = new Set(
    (rows ?? []).map((r) => String(r.email ?? '').toLowerCase()),
  );

  const fresh = emails.filter((e) => !known.has(e));
  const already = emails.filter((e) => known.has(e));

  if (fresh.length > 0) {
    const { error } = await svc
      .from('members')
      .insert(fresh.map((email) => ({ email, role: 'member', status: 'invited' })));
    if (error) {
      return { ok: false, message: `Could not add members: ${error.message}` };
    }
  }

  // The allowlist row is what grants access; the magic link is a convenience.
  // If the (shared) mailer is rate-limited, keep the invite and say so — they
  // can still request a link from the login page.
  const sent: string[] = [];
  const unsent: string[] = [];
  await inBatches(emails, 4, async (email) => {
    try {
      await sendMagicLink(email);
      sent.push(email);
    } catch {
      unsent.push(email);
    }
  });

  const details = [
    ...fresh.map(
      (e) => `${e} — added${sent.includes(e) ? ', link sent' : ', link not sent'}`,
    ),
    ...already.map(
      (e) =>
        `${e} — already a member${sent.includes(e) ? ', link re-sent' : ', link not sent'}`,
    ),
    ...invalid.map((t) => `${t} — skipped, not a valid email address`),
  ];

  const parts: string[] = [];
  if (fresh.length === 0) parts.push('No new members to add');
  else parts.push(fresh.length === 1 ? 'Added 1 member' : `Added ${fresh.length} members`);
  if (already.length) parts.push(`${already.length} already on the list`);
  if (invalid.length) parts.push(`${invalid.length} skipped as invalid`);
  parts.push(
    unsent.length === 0
      ? `magic link${emails.length === 1 ? '' : 's'} sent`
      : `${sent.length} of ${emails.length} magic links sent — the rest can request one from the login page`,
  );

  revalidatePath('/settings/members');
  return { ok: true, message: `${parts.join(' · ')}.`, details };
}
