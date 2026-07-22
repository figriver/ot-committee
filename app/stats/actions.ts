'use server';

import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { isWeekEnding } from '@/lib/week';
import { assertWeekOpen } from '@/lib/lock';
import { reportableStatIds } from '@/lib/reporting';
import { loadAdjustable } from '@/lib/adjustable';

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
    // Adjustable stats are never written here — they use stat_adjustments, and a
    // value in stat_entries would be silently ignored by their read path.
    const adjustable = await loadAdjustable(submitted.map((s) => s.statId));

    const { data: stats } = await supa
      .from('stats')
      .select('id, post_id')
      .in(
        'id',
        submitted.map((s) => s.statId),
      );
    const postByStat = new Map((stats ?? []).map((s) => [s.id, s.post_id]));

    const rows = submitted
      .filter((s) => reportable.has(s.statId) && postByStat.has(s.statId) && !adjustable.has(s.statId))
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

// ---------------------------------------------------------------------------
// Adjustable stats — the manual side (base + MANUAL, note required)
// ---------------------------------------------------------------------------

import { revalidatePath } from 'next/cache';
import { canEditSubject } from '@/lib/history';
import { assertWeekWritable } from '@/lib/lock';
import { deny, guard, type ActionResult } from '@/lib/action-result';

/** Split a names blob (newlines or commas) into distinct, trimmed names. */
function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const n = part.trim();
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      out.push(n);
    }
  }
  return out;
}

/**
 * Save (or clear) the MANUAL adjustment for an adjustable stat + week.
 *
 * The value shown is base + manual; the base is computed live, this writes the
 * manual part. A note is REQUIRED (also enforced by the DB). For an
 * active_members stat the manual is "named people not in the system": the caller
 * sends the names, the count of distinct names becomes manual_amount, and the
 * names are stored (and folded into the note) so nobody is double-counted and it
 * can be reconciled later.
 *
 * Authorized by EFFECTIVE holder (same as correcting the stat) and gated by the
 * week lock — a closed week is writable only as an admin override, which records
 * updated_by, exactly like a correction.
 *
 * An empty manual (blank amount, or no names) DELETES the row, returning the week
 * to base-only.
 */
export async function saveAdjustment(
  statId: string,
  weekEnding: string,
  manualRaw: string,
  namesRaw: string,
  noteRaw: string,
): Promise<ActionResult> {
  return guard(async () => {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  if (!(await canEditSubject(member, 'stat', statId))) {
    deny('You can only adjust stats you are responsible for.');
  }
  if (!isWeekEnding(weekEnding)) deny('Bad week.');
  await assertWeekWritable(member, weekEnding); // lock (admin override allowed)

  const supa = getServiceClient();
  const { data: stat } = await supa
    .from('stats')
    .select('is_adjustable, base_kind')
    .eq('id', statId)
    .maybeSingle();
  if (!stat?.is_adjustable) deny('Not an adjustable stat.');

  const note = noteRaw.trim();
  let manual: number;
  let namesJson: string | null = null;
  let finalNote = note;

  if (stat.base_kind === 'active_members') {
    const names = parseNames(namesRaw);
    if (names.length === 0) {
      // no names = no manual add → clear the row back to base-only
      await supa.from('stat_adjustments').delete().eq('stat_id', statId).eq('week_ending', weekEnding);
      revalidatePath('/stats', 'layout');
      revalidatePath('/dashboard');
      return;
    }
    manual = names.length; // total adds the count of distinct named people
    namesJson = JSON.stringify(names);
    // The note must NAME the people; fold the names in so it always does.
    finalNote = note ? `${note} — named: ${names.join(', ')}` : `Named active (not in system): ${names.join(', ')}`;
  } else {
    const trimmed = manualRaw.trim();
    if (trimmed === '') {
      await supa.from('stat_adjustments').delete().eq('stat_id', statId).eq('week_ending', weekEnding);
      revalidatePath('/stats', 'layout');
      revalidatePath('/dashboard');
      return;
    }
    manual = Number(trimmed);
    if (!Number.isFinite(manual)) deny('Manual amount must be a number.');
    if (finalNote === '') deny('A note is required for a manual adjustment.');
  }
  if (finalNote === '') deny('A note is required for a manual adjustment.');

  const now = new Date().toISOString();
  // created_by stays the ORIGINAL author (e.g. the import) — only updated_by
  // moves — so update in place when the row exists, insert otherwise.
  const { data: existing } = await supa
    .from('stat_adjustments')
    .select('id')
    .eq('stat_id', statId)
    .eq('week_ending', weekEnding)
    .maybeSingle();

  const fields = {
    manual_amount: manual,
    note: finalNote,
    names_json: namesJson,
    source: 'manual',
    updated_by: member.id,
    updated_at: now,
  };
  const { error } = existing
    ? await supa.from('stat_adjustments').update(fields).eq('id', existing.id)
    : await supa
        .from('stat_adjustments')
        .insert({ stat_id: statId, week_ending: weekEnding, created_by: member.id, ...fields });
  if (error) throw new Error(`saveAdjustment: ${error.message}`);
  revalidatePath('/stats', 'layout');
  revalidatePath('/dashboard');
  });
}
