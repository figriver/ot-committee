'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

/** Admin: create a named stat attached to a post. */
// NOTE: wired to a plain `<form action={…}>`, which has nowhere to render a
// returned value — so a refusal here still throws and still gets redacted in
// production. Acceptable because the form is only rendered for someone already
// permitted, and the field-level rules are enforced by the inputs themselves
// (required, type=…). Converting this would mean useActionState, not a return.
export async function createStat(formData: FormData): Promise<void> {
  await requireAdmin();

  const postId = String(formData.get('post_id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!postId || !name) redirect('/settings/stats?error=missing');

  const supa = getServiceClient();
  const { data: post } = await supa
    .from('posts')
    .select('id')
    .eq('id', postId)
    .maybeSingle();
  if (!post) redirect('/settings/stats?error=post');

  const { error } = await supa
    .from('stats')
    .insert({ post_id: postId, name, active: true });
  if (error) redirect('/settings/stats?error=save');

  revalidatePath('/settings/stats');
  revalidatePath('/stats'); // the member report page, so new stats show there
  redirect('/settings/stats?created=1');
}

/**
 * The definition paragraph printed under a stat on the upline report.
 *
 * It is DATA rather than code because OTC Int issues the form: when the wording
 * changes, an admin pastes the new text and the next report picks it up — no
 * deploy. Blank is allowed and meaningful: the report says so rather than
 * printing something invented.
 */
export async function saveStatDefinition(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('stat_id') ?? '');
  const definition = String(formData.get('definition') ?? '').trim();
  const supa = getServiceClient();
  const { error } = await supa
    .from('stats')
    .update({ definition: definition === '' ? null : definition })
    .eq('id', id);
  if (error) throw new Error(`saveStatDefinition: ${error.message}`);
  revalidatePath('/settings/stats');
  revalidatePath('/stats/report');
}
