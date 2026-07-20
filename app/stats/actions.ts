'use server';

import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { isWeekEnding } from '@/lib/week';

/**
 * Save the current member's weekly report: their Hours (once) + a value for each
 * named stat on a post they hold, for the given week. Upserts, so re-saving
 * updates. member_id always comes from the session — never the client.
 *
 * Field convention: `hours`, and `stat_<statId>` for each stat.
 */
export async function submitReport(formData: FormData): Promise<void> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');

  const weekEnding = String(formData.get('week_ending') ?? '');
  if (!isWeekEnding(weekEnding)) redirect('/stats');

  const supa = getServiceClient();
  const now = new Date().toISOString();

  // --- Hours (universal, keyed to the member) ---
  const hoursRaw = String(formData.get('hours') ?? '').trim();
  if (hoursRaw !== '') {
    const hours = Number(hoursRaw);
    if (!Number.isNaN(hours)) {
      await supa.from('member_hours').upsert(
        { member_id: member.id, week_ending: weekEnding, hours, updated_at: now },
        { onConflict: 'member_id,week_ending' },
      );
    }
  }

  // --- Named stats (only for posts the member actually holds) ---
  const submitted: { statId: string; value: number }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (typeof raw !== 'string' || !key.startsWith('stat_')) continue;
    const v = raw.trim();
    if (v === '') continue;
    const num = Number(v);
    if (Number.isNaN(num)) continue;
    submitted.push({ statId: key.slice('stat_'.length), value: num });
  }

  if (submitted.length > 0) {
    const { data: holders } = await supa
      .from('post_holders')
      .select('post_id')
      .eq('member_id', member.id);
    const held = new Set((holders ?? []).map((h) => h.post_id));

    const { data: stats } = await supa
      .from('stats')
      .select('id, post_id')
      .in(
        'id',
        submitted.map((s) => s.statId),
      );
    const postByStat = new Map((stats ?? []).map((s) => [s.id, s.post_id]));

    const rows = submitted
      .filter((s) => held.has(postByStat.get(s.statId)!))
      .map((s) => ({
        stat_id: s.statId,
        member_id: member.id,
        week_ending: weekEnding,
        value: s.value,
        updated_at: now,
      }));

    if (rows.length > 0) {
      await supa
        .from('stat_entries')
        .upsert(rows, { onConflict: 'stat_id,member_id,week_ending' });
    }
  }

  redirect(`/stats?week=${weekEnding}&saved=1`);
}
