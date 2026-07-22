'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { isWeekEnding } from '@/lib/week';
import { assertWeekOpen, assertWeekWritable } from '@/lib/lock';
import { reportableStatIds } from '@/lib/reporting';
import { detailKindOf, replaceLines, linesFor } from '@/lib/detail-lines';
import { specFor, validateLines, type DetailLineInput } from '@/lib/stat-details';
import { deny, guard, type ActionResult } from '@/lib/action-result';

// Saving a reported number TOGETHER WITH the detail the report requires.
//
// One action, not two, because the rule is "the value doesn't save without its
// detail" — two actions could leave a value standing with its detail refused.
// The value and the lines are written in the same call, after the lines pass.
//
// Refusals return (refuse/deny + guard) so the member reads WHY: "Service Starts
// is 2, so the report wants 2 starts — 1 filled in" is the whole point.

export type DetailSubmission = {
  subjectType: 'stat' | 'hours';
  /** null for hours */
  statId: string | null;
  statName: string;
  weekEnding: string;
  /** Blank clears the value. */
  value: string;
  lines: DetailLineInput[];
  /**
   * Whose report this is. Omitted = the session member's own. Set only by the
   * admin bulk grid, which enters on other members' behalf.
   */
  memberId?: string;
  /** 'report' = the weekly form (a closed week is closed for everyone);
   *  'correction' = admin bulk/history (an admin may override a closed week). */
  mode: 'report' | 'correction';
};

export async function saveEntryWithDetail(input: DetailSubmission): Promise<ActionResult> {
  return guard(async () => {
    const actor = await getCurrentMember();
    if (!actor) redirect('/login');
    if (!isWeekEnding(input.weekEnding)) deny('That is not a reporting week.');

    const isAdmin = actor.role === 'admin';
    const memberId = input.memberId ?? actor.id;
    if (memberId !== actor.id && !isAdmin) {
      deny('Only an admin can enter a report for someone else.');
    }

    // Week lock. The weekly form is shut for everyone once the week closes; a
    // correction may be an attributed admin override.
    if (input.mode === 'report') await assertWeekOpen(input.weekEnding);
    else await assertWeekWritable(actor, input.weekEnding);

    if (input.subjectType === 'stat') {
      if (!input.statId) deny('That stat no longer exists.');
      // Only stats this member is actually answerable for — same resolver the
      // report form uses, so what is shown and what is accepted cannot drift.
      if (memberId === actor.id) {
        const reportable = await reportableStatIds(actor.id);
        if (!reportable.has(input.statId!)) deny('That stat is not on a post you hold.');
      }
    }

    const raw = input.value.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) deny(`${input.statName} must be a number.`);

    // ---- the detail, checked against the stat's spec --------------------
    const kind = await detailKindOf(input.subjectType, input.statId);
    const spec = specFor(kind);
    if (spec) {
      const problem = validateLines(spec, input.lines, value, input.statName);
      if (problem) deny(problem);
    }

    // ---- write the value ------------------------------------------------
    const supa = getServiceClient();
    const now = new Date().toISOString();

    if (input.subjectType === 'hours') {
      if (value === null) {
        await supa
          .from('member_hours')
          .delete()
          .eq('member_id', memberId)
          .eq('week_ending', input.weekEnding);
      } else {
        await supa.from('member_hours').upsert(
          {
            member_id: memberId,
            week_ending: input.weekEnding,
            hours: value,
            updated_by: actor.id,
            updated_at: now,
          },
          { onConflict: 'member_id,week_ending' },
        );
      }
    } else if (value === null) {
      await supa
        .from('stat_entries')
        .delete()
        .eq('stat_id', input.statId!)
        .eq('member_id', memberId)
        .eq('week_ending', input.weekEnding);
    } else {
      await supa.from('stat_entries').upsert(
        {
          stat_id: input.statId!,
          member_id: memberId,
          week_ending: input.weekEnding,
          value,
          updated_by: actor.id,
          updated_at: now,
        },
        { onConflict: 'stat_id,member_id,week_ending' },
      );
    }

    // ---- and its detail, in the same breath ------------------------------
    if (spec) {
      await replaceLines({
        statId: input.statId,
        memberId,
        weekEnding: input.weekEnding,
        kind: kind!,
        lines: input.lines,
        actorId: actor.id,
      });
    }

    revalidatePath('/stats', 'layout');
    revalidatePath('/dashboard');
    revalidatePath('/committee');
  });
}

/** The saved lines for one cell, so the admin grid can open an editor on demand
 *  instead of shipping every line for every stat and week up front. */
export async function loadDetailLines(
  statId: string | null,
  weekEnding: string,
  memberId?: string,
): Promise<ActionResult<{ lines: DetailLineInput[] }>> {
  return guard(async () => {
    const actor = await getCurrentMember();
    if (!actor) redirect('/login');
    const who = memberId ?? actor.id;
    if (who !== actor.id && actor.role !== 'admin') {
      deny('Only an admin can read someone else’s report detail.');
    }
    return { lines: await linesFor(statId, who, weekEnding) };
  });
}
