import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy } from '@/lib/hierarchy';
import { memberDisplayName, memberDisplayNames } from '@/lib/member-names';
import type { Member } from '@/lib/types';

// A post's "hat" write-up: the position's Purpose / Duties / Stats / VFP, held as
// one formatted (markdown-ish) body. Reads are open to every member (the board is
// a shared reference); WRITING is the post's effective holder or an admin —
// enforced in the action, mirroring canEditSubject for stats.

export type PostWriteup = {
  /** The hat row's own id — null when this post has no hat yet. Needed to move
   *  a hat between posts, which addresses the HAT, not the post (0021). */
  hatId: string | null;
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
    .select('id, body, updated_by, updated_at')
    .eq('post_id', postId)
    .maybeSingle();
  const body = (data?.body as string | null) ?? '';
  return {
    hatId: (data?.id as string | null) ?? null,
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

// ---------------------------------------------------------------------------
// Hats that are not (yet) on a post — 0021
//
// A hat is written before anyone works out whose post it is, so post_id is
// nullable and an unattached hat carries its own `title`. Everything below deals
// with a hat BY ITS OWN ID, because an unattached one has no post to look it up
// by. Attached hats keep working through the functions above, unchanged.
// ---------------------------------------------------------------------------

export type Hat = {
  id: string;
  postId: string | null;
  /** The post's title when attached, else the hat's own. Never empty. */
  displayTitle: string;
  /** What is stored on the hat itself — its name in the pool. */
  ownTitle: string | null;
  body: string;
  hasContent: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
};

export type UnattachedHat = {
  id: string;
  title: string;
  hasContent: boolean;
  excerpt: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

/** A post as an option in the attach/reassign picker. */
export type PostOption = {
  id: string;
  title: string;
  contextLabel: string;
  /** Set when the post ALREADY has a hat — the picker warns before submitting. */
  occupiedByHatId: string | null;
};

function firstLine(body: string): string | null {
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const text = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
    if (text) return text.length > 150 ? `${text.slice(0, 149)}…` : text;
  }
  return null;
}

/** One hat by its own id — attached or not. */
export async function getHatById(id: string): Promise<Hat | null> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('post_writeups')
    .select('id, post_id, title, body, updated_by, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  const postId = (data.post_id as string | null) ?? null;
  const ownTitle = (data.title as string | null) ?? null;
  let postTitle: string | null = null;
  if (postId) {
    const h = await loadHierarchy();
    postTitle = h.posts.get(postId)?.title ?? null;
  }
  const body = (data.body as string | null) ?? '';
  return {
    id: data.id as string,
    postId,
    displayTitle: postTitle ?? ownTitle ?? 'Untitled hat',
    ownTitle,
    body,
    hasContent: body.trim() !== '',
    updatedByName: await nameOf((data.updated_by as string | null) ?? null),
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

/** The pool: hats with no post, newest first. */
export async function listUnattachedHats(): Promise<UnattachedHat[]> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('post_writeups')
    .select('id, title, body, updated_by, updated_at')
    .is('post_id', null)
    .order('updated_at', { ascending: false });

  const rows = data ?? [];
  const names = await memberDisplayNames(rows.map((r) => r.updated_by as string | null));
  return rows.map((r) => {
    const body = (r.body as string | null) ?? '';
    return {
      id: r.id as string,
      title: ((r.title as string | null) ?? '').trim() || 'Untitled hat',
      hasContent: body.trim() !== '',
      excerpt: firstLine(body),
      updatedByName: r.updated_by ? names.get(r.updated_by as string) ?? null : null,
      updatedAt: (r.updated_at as string | null) ?? null,
    };
  });
}

/**
 * Every post, in board order, flagged with whether it already holds a hat — the
 * options for the attach/reassign picker. ~106 rows of title + label, so the
 * whole list goes to the client and filtering is instant; the hat BODIES are
 * what would be too big to ship, and they stay on the server.
 */
export async function listPostOptions(): Promise<PostOption[]> {
  const supa = getServiceClient();
  const [h, { data: writeups }] = await Promise.all([
    loadHierarchy(),
    supa.from('post_writeups').select('id, post_id').not('post_id', 'is', null),
  ]);
  const hatByPost = new Map(
    (writeups ?? []).map((w) => [w.post_id as string, w.id as string]),
  );

  return [...h.posts.values()]
    .sort((a, b) => a.groupSort - b.groupSort)
    .map((p) => ({
      id: p.id,
      title: p.title,
      contextLabel: p.isDivisionHead
        ? `Div ${p.divisionNumber ?? '?'} · (division head)`
        : `Div ${p.divisionNumber ?? '?'} · ${p.departmentName ?? '—'}`,
      occupiedByHatId: hatByPost.get(p.id) ?? null,
    }));
}

/** Who may edit a hat given the hat itself: an unattached hat has no holder, so
 *  it is admin-only until it lands on a post. */
export async function canEditHat(member: Member, hat: Hat): Promise<boolean> {
  if (member.role === 'admin') return true;
  if (!hat.postId) return false;
  return canEditPostWriteup(member, hat.postId);
}
