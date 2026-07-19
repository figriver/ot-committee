import 'server-only';
import { redirect } from 'next/navigation';
import { getAuthClient } from '@/lib/supabase/ssr';
import { getServiceClient } from '@/lib/supabase/server';
import type { Member } from '@/lib/types';

/**
 * The member row for the currently logged-in Supabase user, or null if there is
 * no session OR the session's email is not on the allowlist (no members row).
 *
 * The user comes from the cookie-bound auth client; the member row is read with
 * the SERVICE-ROLE client (members has RLS — the anon/user client would return
 * zero rows).
 */
export async function getCurrentMember(): Promise<Member | null> {
  const supabase = await getAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const svc = getServiceClient();
  const { data, error } = await svc
    .from('members')
    .select('id, email, role, status, auth_uid')
    .ilike('email', user.email) // exact, case-insensitive
    .maybeSingle();
  if (error) throw new Error(`getCurrentMember: ${error.message}`);
  return (data as Member) ?? null;
}

/** Gate a page/route on being a logged-in allowlisted member. */
export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) redirect('/login?error=not_allowed');
  return member;
}

/** Gate a page/route on being an admin (redirects members to the board). */
export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (member.role !== 'admin') redirect('/board?error=admins_only');
  return member;
}
