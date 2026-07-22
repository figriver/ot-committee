'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { canEditPostWriteup } from '@/lib/writeups';
import { refuse, done, type ActionResult } from '@/lib/action-result';

// Save a post's hat write-up. Authorization enforced HERE (holder or admin) —
// the UI hides the editor for others, but this is what actually stops the write.
// created_by is set once (first save) and preserved; updated_by/at move each time.
export async function saveWriteup(postId: string, body: string): Promise<ActionResult> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  // Returned, not thrown: a production build redacts a thrown message, and this
  // sentence is the whole point of refusing (see lib/action-result.ts).
  if (!(await canEditPostWriteup(member, postId))) {
    return refuse('Only the post’s holder or an admin can edit this hat.');
  }

  const supa = getServiceClient();
  const now = new Date().toISOString();
  const { data: existing } = await supa
    .from('post_writeups')
    .select('id')
    .eq('post_id', postId)
    .maybeSingle();

  if (existing) {
    const { error } = await supa
      .from('post_writeups')
      .update({ body, updated_by: member.id, updated_at: now })
      .eq('id', existing.id);
    if (error) throw new Error(`saveWriteup: ${error.message}`);
  } else {
    const { error } = await supa.from('post_writeups').insert({
      post_id: postId,
      body,
      created_by: member.id,
      updated_by: member.id,
      updated_at: now,
    });
    if (error) throw new Error(`saveWriteup: ${error.message}`);
  }
  revalidatePath(`/post/${postId}`);
  // The board may show a "has hat" affordance per post.
  revalidatePath('/board', 'layout');
  return done;
}
