import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// ONE rule for how a member is named in the UI, so no surface ever falls back to
// a raw email while a real name is available somewhere.
//
//   members.name  →  the name they've been given in Settings → Members
//   holder_name   →  what the org board calls them on a post they hold
//   email         →  last resort
//
// The middle step matters because members.name is optional (0004 made the app
// email-only) while the board has carried real names since the first import —
// so "Held by Michael Figueroa" and "Last updated by michael@…" were the same
// person on one page.
//
// A holder_name that is itself an email is skipped: linking a holder to a member
// stamps holder_name with their email (board/actions.ts), and that is not a name.

const looksLikeEmail = (s: string) => s.includes('@');

function pick(name: unknown, holderName: string | undefined, email: unknown): string {
  const n = typeof name === 'string' ? name.trim() : '';
  if (n) return n;
  const h = holderName?.trim() ?? '';
  if (h && !looksLikeEmail(h)) return h;
  const e = typeof email === 'string' ? email.trim() : '';
  return e || 'Unknown';
}

/** Display names for many members at once (one round trip per table). */
export async function memberDisplayNames(
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return out;

  const supa = getServiceClient();
  const [{ data: members }, { data: holders }] = await Promise.all([
    supa.from('members').select('id, name, email').in('id', unique),
    supa
      .from('post_holders')
      .select('member_id, holder_name, sort_order, post_id')
      .in('member_id', unique)
      // post_id is a deterministic tiebreak: a member holding several posts
      // usually has sort_order 0 on all of them, and an arbitrary winner would
      // make a byline flicker between two names across requests.
      .order('sort_order', { ascending: true })
      .order('post_id', { ascending: true }),
  ]);

  // First usable board name wins — a member may hold several posts.
  const boardName = new Map<string, string>();
  for (const h of holders ?? []) {
    const mid = h.member_id as string | null;
    const hn = (h.holder_name as string | null)?.trim();
    if (mid && hn && !looksLikeEmail(hn) && !boardName.has(mid)) boardName.set(mid, hn);
  }

  for (const m of members ?? []) {
    out.set(m.id as string, pick(m.name, boardName.get(m.id as string), m.email));
  }
  return out;
}

/** Display name for a single member; null when the member doesn't exist. */
export async function memberDisplayName(id: string | null): Promise<string | null> {
  if (!id) return null;
  return (await memberDisplayNames([id])).get(id) ?? null;
}
