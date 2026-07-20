'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { canEditSubject, type SubjectType } from '@/lib/history';
import { isWeekEnding } from '@/lib/week';
import type { Member } from '@/lib/types';

function revalidate() {
  // Covers /stats and every nested history route.
  revalidatePath('/stats', 'layout');
}

function asSubjectType(v: unknown): SubjectType {
  if (v !== 'stat' && v !== 'hours') throw new Error('Bad subject type.');
  return v;
}

/** Session member + permission on the subject, or throw. Never trusts the client. */
async function authorize(
  subjectType: SubjectType,
  subjectId: string,
): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  const allowed = await canEditSubject(member, subjectType, subjectId);
  if (!allowed) {
    throw new Error(
      subjectType === 'stat'
        ? 'You can only correct stats on posts you hold.'
        : 'You can only correct your own hours.',
    );
  }
  return member;
}

/**
 * Correct (or fill in) one week's value from the history table.
 *
 * An empty string CLEARS the week back to "not reported" — the row is deleted
 * rather than zeroed, so NR and a real 0 stay distinguishable.
 *
 * member_id is never changed by a correction: it records WHOSE report the value
 * is. updated_by records who last wrote it, which is what the table shows.
 */
export async function correctValue(
  subjectTypeRaw: string,
  subjectId: string,
  weekEnding: string,
  raw: string,
): Promise<void> {
  const subjectType = asSubjectType(subjectTypeRaw);
  const member = await authorize(subjectType, subjectId);
  if (!isWeekEnding(weekEnding)) throw new Error('Bad week.');

  const trimmed = raw.trim();
  const clearing = trimmed === '';
  const num = Number(trimmed);
  if (!clearing && (Number.isNaN(num) || !Number.isFinite(num))) {
    throw new Error('Value must be a number.');
  }

  const supa = getServiceClient();
  const now = new Date().toISOString();

  if (subjectType === 'hours') {
    if (clearing) {
      await supa
        .from('member_hours')
        .delete()
        .eq('member_id', subjectId)
        .eq('week_ending', weekEnding);
    } else {
      const { error } = await supa.from('member_hours').upsert(
        {
          member_id: subjectId,
          week_ending: weekEnding,
          hours: num,
          updated_at: now,
          updated_by: member.id,
        },
        { onConflict: 'member_id,week_ending' },
      );
      if (error) throw new Error(`correctValue(hours): ${error.message}`);
    }
    revalidate();
    return;
  }

  // --- a named stat ---
  const { data: existing } = await supa
    .from('stat_entries')
    .select('id')
    .eq('stat_id', subjectId)
    .eq('week_ending', weekEnding)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (clearing) {
    if (existing) await supa.from('stat_entries').delete().eq('id', existing.id);
    revalidate();
    return;
  }

  if (existing) {
    // Correct the row in place — keeps member_id (whose report it was) intact.
    const { error } = await supa
      .from('stat_entries')
      .update({ value: num, updated_at: now, updated_by: member.id })
      .eq('id', existing.id);
    if (error) throw new Error(`correctValue(stat): ${error.message}`);
    revalidate();
    return;
  }

  // Nothing reported that week: create the entry. It belongs to the member whose
  // report it is — the corrector if they hold the post, otherwise (an admin
  // filling in for someone) the post's current holder.
  const { data: stat } = await supa
    .from('stats')
    .select('post_id')
    .eq('id', subjectId)
    .maybeSingle();
  if (!stat) throw new Error('Stat not found.');

  const { data: holders } = await supa
    .from('post_holders')
    .select('member_id')
    .eq('post_id', stat.post_id)
    .not('member_id', 'is', null)
    .order('sort_order', { ascending: true });
  const holderIds = (holders ?? []).map((h) => h.member_id as string);
  const ownerId = holderIds.includes(member.id) ? member.id : holderIds[0] ?? member.id;

  const { error } = await supa.from('stat_entries').insert({
    stat_id: subjectId,
    member_id: ownerId,
    week_ending: weekEnding,
    value: num,
    updated_at: now,
    updated_by: member.id,
  });
  if (error) throw new Error(`correctValue(stat insert): ${error.message}`);
  revalidate();
}

/**
 * Set how a stat rolls up to Monthly / Quarterly on the graph. Same permission
 * as correcting it: you hold the post, or you are an admin.
 */
export async function setStatRollup(statId: string, rollup: string): Promise<void> {
  await authorize('stat', statId);
  if (!['sum', 'average', 'last'].includes(rollup)) {
    throw new Error('Unknown rollup.');
  }
  const supa = getServiceClient();
  const { error } = await supa.from('stats').update({ rollup }).eq('id', statId);
  if (error) throw new Error(`setStatRollup: ${error.message}`);
  revalidate();
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Add a dated note to this stat / this member's hours. */
export async function addNote(
  subjectTypeRaw: string,
  subjectId: string,
  noteDate: string,
  body: string,
  showOnGraph: boolean,
): Promise<void> {
  const subjectType = asSubjectType(subjectTypeRaw);
  const member = await authorize(subjectType, subjectId);
  if (!ISO_DATE.test(noteDate)) throw new Error('Pick a date for the note.');
  const text = body.trim();
  if (text === '') throw new Error('Note text is required.');

  const supa = getServiceClient();
  const { error } = await supa.from('stat_notes').insert({
    subject_type: subjectType,
    subject_id: subjectId,
    note_date: noteDate,
    body: text,
    show_on_graph: showOnGraph,
    created_by: member.id,
  });
  if (error) throw new Error(`addNote: ${error.message}`);
  revalidate();
}

/** A member may edit/delete their OWN notes; admins may edit/delete any. */
async function authorizeNote(noteId: string): Promise<void> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  const supa = getServiceClient();
  const { data: note } = await supa
    .from('stat_notes')
    .select('created_by')
    .eq('id', noteId)
    .maybeSingle();
  if (!note) throw new Error('Note not found.');
  if (member.role !== 'admin' && note.created_by !== member.id) {
    throw new Error('You can only change your own notes.');
  }
}

export async function updateNote(
  noteId: string,
  noteDate: string,
  body: string,
): Promise<void> {
  await authorizeNote(noteId);
  if (!ISO_DATE.test(noteDate)) throw new Error('Pick a date for the note.');
  const text = body.trim();
  if (text === '') throw new Error('Note text is required.');

  const supa = getServiceClient();
  const { error } = await supa
    .from('stat_notes')
    .update({ note_date: noteDate, body: text, updated_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw new Error(`updateNote: ${error.message}`);
  revalidate();
}

/** Flag a note to render as a marker on the graph (drawn in slice 2c). */
export async function setNoteShowOnGraph(noteId: string, show: boolean): Promise<void> {
  await authorizeNote(noteId);
  const supa = getServiceClient();
  const { error } = await supa
    .from('stat_notes')
    .update({ show_on_graph: show, updated_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw new Error(`setNoteShowOnGraph: ${error.message}`);
  revalidate();
}

export async function deleteNote(noteId: string): Promise<void> {
  await authorizeNote(noteId);
  const supa = getServiceClient();
  const { error } = await supa.from('stat_notes').delete().eq('id', noteId);
  if (error) throw new Error(`deleteNote: ${error.message}`);
  revalidate();
}
