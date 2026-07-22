'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { getHatById, canEditHat } from '@/lib/writeups';

/**
 * Save a hat's body BY HAT ID — the unattached counterpart of saveWriteup,
 * which can only address a hat through its post. Authorization is the same rule
 * either way (canEditHat): an admin, or the post's effective holder once there
 * is a post. An unattached hat has no holder, so it is admin-only until it lands.
 */
export async function saveHatBody(hatId: string, body: string): Promise<void> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');

  const hat = await getHatById(hatId);
  if (!hat) throw new Error('That hat no longer exists.');
  if (!(await canEditHat(member, hat))) {
    throw new Error('Only an admin can edit a hat that is not on a post.');
  }

  const supa = getServiceClient();
  const { error } = await supa
    .from('post_writeups')
    .update({ body, updated_by: member.id, updated_at: new Date().toISOString() })
    .eq('id', hatId);
  if (error) throw new Error(`saveHatBody: ${error.message}`);

  revalidatePath(`/hatting/hat/${hatId}`);
  revalidatePath('/hatting');
  if (hat.postId) revalidatePath(`/post/${hat.postId}`);
}
