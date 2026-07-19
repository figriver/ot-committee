'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

/** Admin: create a named stat attached to a post. */
export async function createStat(formData: FormData): Promise<void> {
  await requireAdmin();

  const postId = String(formData.get('post_id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!postId || !name) redirect('/stats?error=missing');

  const supa = getServiceClient();
  const { data: post } = await supa
    .from('posts')
    .select('id')
    .eq('id', postId)
    .maybeSingle();
  if (!post) redirect('/stats?error=post');

  const { error } = await supa
    .from('stats')
    .insert({ post_id: postId, name, active: true });
  if (error) redirect('/stats?error=save');

  revalidatePath('/stats');
  revalidatePath('/report');
  redirect('/stats?created=1');
}
