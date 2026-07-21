'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { canEditPostWriteup } from '@/lib/writeups';

// Save a post's hat write-up. Authorization enforced HERE (holder or admin) —
// the UI hides the editor for others, but this is what actually stops the write.
// created_by is set once (first save) and preserved; updated_by/at move each time.
export async function saveWriteup(postId: string, body: string): Promise<void> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  if (!(await canEditPostWriteup(member, postId))) {
    throw new Error('Only the post’s holder or an admin can edit this hat.');
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
}
