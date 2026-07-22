'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy } from '@/lib/hierarchy';

// Attaching, moving and detaching a post hat (0021). Writing a hat's BODY is
// still governed by canEditPostWriteup — the post's holder may write their own
// hat. Deciding WHICH POST a hat belongs to is an org-board decision, so every
// action here is admin-only and says so server-side.

/**
 * Expected, explainable failures are RETURNED, not thrown. Next redacts the
 * message of anything thrown out of a server action in a production build
 * ("The specific message is omitted…"), so a thrown error would reach the admin
 * as a blank wall — and "this post already has a hat, move that one first" is
 * precisely the sentence they need. Refusal still happens on the server either
 * way; only the wording survives the trip.
 */
export type AttachResult = { ok: true } | { ok: false; message: string };

const DENIED = 'Only an admin can attach or move a hat.';

async function adminOrNull() {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  return member.role === 'admin' ? member : null;
}

function revalidate(postIds: (string | null)[] = [], hatId?: string) {
  revalidatePath('/hatting');
  revalidatePath('/board', 'layout');
  if (hatId) revalidatePath(`/hatting/hat/${hatId}`);
  for (const id of postIds) if (id) revalidatePath(`/post/${id}`);
}

/** Start a hat with no post: it needs its own name, since there is none to borrow. */
export async function createUnattachedHat(formData: FormData): Promise<void> {
  const member = await adminOrNull();
  if (!member) throw new Error(DENIED); // a plain <form>; there is no UI to show a result in
  const title = String(formData.get('title') ?? '').trim();
  if (title === '') throw new Error('An unattached hat needs a title.');

  const supa = getServiceClient();
  const { data, error } = await supa
    .from('post_writeups')
    .insert({
      post_id: null,
      title,
      body: '',
      created_by: member.id,
      updated_by: member.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createUnattachedHat: ${error.message}`);
  revalidate();
  redirect(`/hatting/hat/${data.id as string}`);
}

/**
 * Attach a hat to a post, move it to a different one, or detach it (postId '').
 *
 * A post holds at most one hat. If the target already has one this BLOCKS rather
 * than warns-and-overwrites: the thing being overwritten is a written document,
 * and there is no undo. The admin detaches or moves the sitting hat first — the
 * error names it so that is one click away.
 */
export async function attachHat(formData: FormData): Promise<AttachResult> {
  const member = await adminOrNull();
  if (!member) return { ok: false, message: DENIED };
  const hatId = String(formData.get('hatId') ?? '');
  const rawPost = String(formData.get('postId') ?? '').trim();
  const postId = rawPost === '' ? null : rawPost;

  const supa = getServiceClient();
  const { data: hat } = await supa
    .from('post_writeups')
    .select('id, post_id, title')
    .eq('id', hatId)
    .maybeSingle();
  if (!hat) return { ok: false, message: 'That hat no longer exists.' };

  const from = (hat.post_id as string | null) ?? null;
  if (from === postId) return { ok: true }; // nothing to do

  const h = await loadHierarchy();

  if (postId) {
    const target = h.posts.get(postId);
    if (!target) return { ok: false, message: 'That post no longer exists.' };

    const { data: sitting } = await supa
      .from('post_writeups')
      .select('id')
      .eq('post_id', postId)
      .maybeSingle();
    if (sitting && sitting.id !== hatId) {
      return {
        ok: false,
        message:
          `“${target.title}” already has a hat. Move or detach that one first — ` +
          `attaching here would overwrite it.`,
      };
    }
  }

  // Detaching needs a name to fall back on, or the row breaks its check
  // constraint. Take the post's title, which is what it was called anyway.
  const patch: Record<string, unknown> = {
    post_id: postId,
    updated_by: member.id,
    updated_at: new Date().toISOString(),
  };
  if (!postId && !((hat.title as string | null) ?? '').trim()) {
    patch.title = h.posts.get(from ?? '')?.title ?? 'Untitled hat';
  }

  const { error } = await supa.from('post_writeups').update(patch).eq('id', hatId);
  if (error) return { ok: false, message: `Could not move this hat: ${error.message}` };

  revalidate([from, postId], hatId);
  // Follow the hat to wherever it now lives.
  redirect(postId ? `/post/${postId}` : `/hatting/hat/${hatId}`);
}
