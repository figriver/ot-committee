'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

// General hats are the committee's shared reference, so EVERY member reads them
// and only an ADMIN writes them. The pages hide the controls from members, but
// this is what actually stops the write — each action re-checks the session
// member's role server-side and throws rather than redirecting, so the inline
// editor can surface the reason.

async function requireAdminMember() {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  if (member.role !== 'admin') throw new Error('Only an admin can edit general hats.');
  return member;
}

function revalidate(id?: string) {
  revalidatePath('/hatting/general');
  if (id) revalidatePath(`/hatting/general/${id}`);
}

/** Next free slot at the bottom of a group. */
async function nextSortOrder(groupKey: string): Promise<number> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('general_hats')
    .select('sort_order')
    .eq('group_key', groupKey)
    .order('sort_order', { ascending: false })
    .limit(1);
  return ((data?.[0]?.sort_order as number | undefined) ?? 0) + 1;
}

async function assertGroupExists(groupKey: string) {
  const supa = getServiceClient();
  const { data } = await supa
    .from('general_hat_groups')
    .select('key')
    .eq('key', groupKey)
    .maybeSingle();
  if (!data) throw new Error('Unknown group.');
}

/** Create an empty hat in a group and open it for writing. */
export async function createGeneralHat(formData: FormData): Promise<void> {
  const member = await requireAdminMember();
  const title = String(formData.get('title') ?? '').trim();
  const groupKey = String(formData.get('group') ?? '').trim();
  if (title === '') throw new Error('A general hat needs a title.');
  await assertGroupExists(groupKey);

  const supa = getServiceClient();
  const { data, error } = await supa
    .from('general_hats')
    .insert({
      title,
      group_key: groupKey,
      body: '',
      sort_order: await nextSortOrder(groupKey),
      created_by: member.id,
      updated_by: member.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createGeneralHat: ${error.message}`);
  revalidate();
  redirect(`/hatting/general/${data.id as string}`);
}

/** Save a hat's long-form body (the editor's save handler). */
export async function saveGeneralHatBody(id: string, body: string): Promise<void> {
  const member = await requireAdminMember();
  const supa = getServiceClient();
  const { error } = await supa
    .from('general_hats')
    .update({ body, updated_by: member.id, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`saveGeneralHatBody: ${error.message}`);
  revalidate(id);
}

/** Rename a hat / move it to another group. Moving puts it at the group's end. */
export async function updateGeneralHatMeta(formData: FormData): Promise<void> {
  const member = await requireAdminMember();
  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const groupKey = String(formData.get('group') ?? '').trim();
  if (title === '') throw new Error('A general hat needs a title.');
  await assertGroupExists(groupKey);

  const supa = getServiceClient();
  const { data: current } = await supa
    .from('general_hats')
    .select('group_key')
    .eq('id', id)
    .maybeSingle();
  if (!current) throw new Error('That general hat no longer exists.');

  const moved = (current.group_key as string) !== groupKey;
  const { error } = await supa
    .from('general_hats')
    .update({
      title,
      group_key: groupKey,
      ...(moved ? { sort_order: await nextSortOrder(groupKey) } : {}),
      updated_by: member.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`updateGeneralHatMeta: ${error.message}`);
  revalidate(id);
}

/**
 * Reorder within a group by swapping sort_order with the neighbour above/below.
 * Swapping (rather than renumbering everything) keeps it to two writes and is
 * stable no matter how the numbers got where they are.
 */
export async function moveGeneralHat(formData: FormData): Promise<void> {
  await requireAdminMember();
  const id = String(formData.get('id') ?? '');
  const dir = String(formData.get('dir') ?? '');
  if (dir !== 'up' && dir !== 'down') throw new Error('Bad direction.');

  const supa = getServiceClient();
  const { data: hat } = await supa
    .from('general_hats')
    .select('id, group_key, sort_order')
    .eq('id', id)
    .maybeSingle();
  if (!hat) throw new Error('That general hat no longer exists.');

  const { data: siblings } = await supa
    .from('general_hats')
    .select('id, sort_order')
    .eq('group_key', hat.group_key as string)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  const list = siblings ?? [];
  const i = list.findIndex((s) => s.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return; // already at the end — no-op

  await Promise.all([
    supa.from('general_hats').update({ sort_order: list[j].sort_order }).eq('id', list[i].id),
    supa.from('general_hats').update({ sort_order: list[i].sort_order }).eq('id', list[j].id),
  ]);
  revalidate(id);
}

/** Remove a hat entirely (admin mis-creates need a way back). */
export async function deleteGeneralHat(formData: FormData): Promise<void> {
  await requireAdminMember();
  const id = String(formData.get('id') ?? '');
  const supa = getServiceClient();
  const { error } = await supa.from('general_hats').delete().eq('id', id);
  if (error) throw new Error(`deleteGeneralHat: ${error.message}`);
  revalidate();
  redirect('/hatting/general');
}
