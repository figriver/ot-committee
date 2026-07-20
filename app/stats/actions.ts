'use server';

import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { isWeekEnding } from '@/lib/week';
import { assertWeekOpen } from '@/lib/lock';
import { reportableStatIds } from '@/lib/reporting';

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

  // The lock is enforced HERE, before anything is saved — the form is rendered
  // read-only for a closed week, but that is only cosmetic; this is what stops a
  // stale tab or a hand-rolled POST. Closed means closed for everyone on this
  // path, admins included: an override has to be the attributed, one-value
  // correction on the History page, not a silent bulk re-submit.
  let weekOpen = true;
  try {
    await assertWeekOpen(weekEnding);
  } catch {
    weekOpen = false;
  }
  if (!weekOpen) redirect(`/stats?week=${weekEnding}&error=locked`);

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
    // Authorised by EFFECTIVE holder, not direct holder: a member covering an
    // unfilled branch reports its stats, and someone posted to a junior stops
    // being able to report the branch that devolved away from them. Same
    // resolver the UI uses, so what is shown and what is accepted cannot drift.
    const reportable = await reportableStatIds(member.id);

    const { data: stats } = await supa
      .from('stats')
      .select('id, post_id')
      .in(
        'id',
        submitted.map((s) => s.statId),
      );
    const postByStat = new Map((stats ?? []).map((s) => [s.id, s.post_id]));

    const rows = submitted
      .filter((s) => reportable.has(s.statId) && postByStat.has(s.statId))
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

  // Come back to the level the report was entered at, not the root.
  const returnPost = String(formData.get('return_post') ?? '').trim();
  redirect(
    `/stats?week=${weekEnding}&saved=1${returnPost ? `&post=${returnPost}` : ''}`,
  );
}
