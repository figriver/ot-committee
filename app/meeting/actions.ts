'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { isWeekEnding } from '@/lib/week';

/**
 * Save (create or update) the minutes for a week. Admin-only — requireAdmin
 * redirects a non-admin, so the page hiding the editor is only cosmetic; this is
 * what actually enforces who may write. Records updated_by / updated_at on every
 * save; created_by only on first insert.
 */
export async function saveMinutes(weekEnding: string, body: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isWeekEnding(weekEnding)) throw new Error('Bad week.');

  const supa = getServiceClient();
  const now = new Date().toISOString();
  const { data: existing } = await supa
    .from('meeting_minutes')
    .select('id')
    .eq('week_ending', weekEnding)
    .maybeSingle();

  const { error } = existing
    ? await supa
        .from('meeting_minutes')
        .update({ body, updated_by: admin.id, updated_at: now })
        .eq('id', existing.id)
    : await supa.from('meeting_minutes').insert({
        week_ending: weekEnding,
        body,
        created_by: admin.id,
        updated_by: admin.id,
        updated_at: now,
      });
  if (error) throw new Error(`saveMinutes: ${error.message}`);

  revalidatePath(`/meeting/${weekEnding}`);
  revalidatePath('/minutes');
}
