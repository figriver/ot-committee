import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy } from '@/lib/hierarchy';
import { memberDisplayName } from '@/lib/member-names';
import type { Member } from '@/lib/types';

// A post's "hat" write-up: the position's Purpose / Duties / Stats / VFP, held as
// one formatted (markdown-ish) body. Reads are open to every member (the board is
// a shared reference); WRITING is the post's effective holder or an admin —
// enforced in the action, mirroring canEditSubject for stats.

export type PostWriteup = {
  body: string;
  updatedByName: string | null;
  updatedAt: string | null;
  hasContent: boolean;
};

export type PostHeader = {
  id: string;
  title: string;
  contextLabel: string; // "Div 1 · Department of X"
  holderName: string | null;
  isHFA: boolean; // no linked member holds it
};

async function nameOf(id: string | null): Promise<string | null> {
  return memberDisplayName(id);
}

/** Post identity + board context for the detail page header. */
export async function getPostHeader(postId: string): Promise<PostHeader | null> {
  const h = await loadHierarchy();
  const p = h.posts.get(postId);
  if (!p) return null;
  const contextLabel = p.isDivisionHead
    ? `Div ${p.divisionNumber ?? '?'} · (division head)`
    : `Div ${p.divisionNumber ?? '?'} · ${p.departmentName ?? '—'}`;
  return {
    id: p.id,
    title: p.title,
    contextLabel,
    holderName: p.holderName,
    isHFA: !p.holderMemberId,
  };
}

/** The hat write-up for a post (empty shell if none saved yet). */
export async function getWriteup(postId: string): Promise<PostWriteup> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('post_writeups')
    .select('body, updated_by, updated_at')
    .eq('post_id', postId)
    .maybeSingle();
  const body = (data?.body as string | null) ?? '';
  return {
    body,
    updatedByName: await nameOf((data?.updated_by as string | null) ?? null),
    updatedAt: (data?.updated_at as string | null) ?? null,
    hasContent: body.trim() !== '',
  };
}

/** Who may edit a hat: an admin, or the post's EFFECTIVE holder (same resolver
 *  as stat editing, so an unfilled post's hat is editable by whoever covers it). */
export async function canEditPostWriteup(member: Member, postId: string): Promise<boolean> {
  if (member.role === 'admin') return true;
  const h = await loadHierarchy();
  return h.effectiveHolderOf(postId) === member.id;
}
