'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentMember, requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { getWeekLockDow, weekEndingOnOrAfter, isWeekEnding } from '@/lib/week';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function revalidate() {
  revalidatePath('/wins');
  revalidatePath('/dashboard'); // the login feed
}

/** The reporting week (week_ending) a win_date falls in. */
async function weekOf(winDate: string): Promise<string> {
  const dow = await getWeekLockDow();
  return weekEndingOnOrAfter(winDate, dow);
}

/**
 * A member adds their OWN win: free text, tagged to an area (a post), dated.
 * member_id is ALWAYS the session member — never the client. Multiple wins per
 * week are allowed (each is its own row).
 */
export async function addWin(
  body: string,
  areaPostId: string,
  winDate: string,
): Promise<void> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');

  const text = body.trim();
  if (text === '') throw new Error('A win needs some text.');
  if (!ISO_DATE.test(winDate) || !isWeekEnding(winDate)) throw new Error('Pick a date.');
  const area = areaPostId.trim() || null;

  const supa = getServiceClient();
  const { error } = await supa.from('wins').insert({
    body: text,
    win_date: winDate,
    week_ending: await weekOf(winDate),
    area_post_id: area,
    member_id: member.id,
    is_unattributed: false,
    created_by: member.id,
  });
  if (error) throw new Error(`addWin: ${error.message}`);
  revalidate();
}

/**
 * Add an UNATTRIBUTED win — good news with no member behind it, for the meeting.
 * Admin-only (requireAdmin redirects a non-admin). member_id stays null; the
 * admin is recorded as created_by only.
 */
export async function addUnattributedWin(
  body: string,
  areaPostId: string,
  winDate: string,
): Promise<void> {
  const admin = await requireAdmin();

  const text = body.trim();
  if (text === '') throw new Error('A win needs some text.');
  if (!ISO_DATE.test(winDate) || !isWeekEnding(winDate)) throw new Error('Pick a date.');
  const area = areaPostId.trim() || null;

  const supa = getServiceClient();
  const { error } = await supa.from('wins').insert({
    body: text,
    win_date: winDate,
    week_ending: await weekOf(winDate),
    area_post_id: area,
    member_id: null,
    is_unattributed: true,
    created_by: admin.id,
  });
  if (error) throw new Error(`addUnattributedWin: ${error.message}`);
  revalidate();
}

/** Delete a win — the member who owns it, or an admin. */
export async function deleteWin(winId: string): Promise<void> {
  const member = await getCurrentMember();
  if (!member) redirect('/login');
  const supa = getServiceClient();
  const { data: win } = await supa.from('wins').select('member_id').eq('id', winId).maybeSingle();
  if (!win) return;
  if (member.role !== 'admin' && win.member_id !== member.id) {
    throw new Error('You can only remove your own wins.');
  }
  const { error } = await supa.from('wins').delete().eq('id', winId);
  if (error) throw new Error(`deleteWin: ${error.message}`);
  revalidate();
}
