import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { memberDisplayNames } from '@/lib/member-names';

// Meeting minutes: one text record per week (the Thursday meeting). Reads are
// open to every logged-in member (shared committee record); writing is gated in
// the action (admin). Distinct from wins — minutes stay with their meeting.

export type Minutes = {
  weekEnding: string;
  body: string;
  updatedByName: string | null;
  updatedAt: string | null;
  hasContent: boolean;
};

export type MeetingWeek = {
  weekEnding: string;
  hasMinutes: boolean;
  winCount: number;
  updatedByName: string | null;
};

async function nameOf(ids: (string | null)[]): Promise<Map<string, string>> {
  return memberDisplayNames(ids);
}

/** The minutes for one week (empty shell if none saved yet). */
export async function getMinutes(weekEnding: string): Promise<Minutes> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('meeting_minutes')
    .select('body, updated_by, updated_at')
    .eq('week_ending', weekEnding)
    .maybeSingle();
  const names = await nameOf([data?.updated_by ?? null]);
  const body = (data?.body as string | null) ?? '';
  return {
    weekEnding,
    body,
    updatedByName: data?.updated_by ? names.get(data.updated_by) ?? null : null,
    updatedAt: data?.updated_at ?? null,
    hasContent: body.trim() !== '',
  };
}

/**
 * Weeks that HAD a meeting — any week with minutes or with wins — newest first,
 * for the Minutes archive. Capped so the list stays bounded.
 */
export async function listMeetingWeeks(limit = 52): Promise<MeetingWeek[]> {
  const supa = getServiceClient();
  const [minRes, winRes] = await Promise.all([
    supa.from('meeting_minutes').select('week_ending, updated_by, body'),
    supa.from('wins').select('week_ending'),
  ]);

  const byWeek = new Map<string, { hasMinutes: boolean; winCount: number; updatedBy: string | null }>();
  for (const m of minRes.data ?? []) {
    const has = ((m.body as string | null) ?? '').trim() !== '';
    byWeek.set(m.week_ending, {
      hasMinutes: has,
      winCount: 0,
      updatedBy: (m.updated_by as string | null) ?? null,
    });
  }
  for (const w of winRes.data ?? []) {
    const cur = byWeek.get(w.week_ending) ?? { hasMinutes: false, winCount: 0, updatedBy: null };
    cur.winCount += 1;
    byWeek.set(w.week_ending, cur);
  }

  const names = await nameOf([...byWeek.values()].map((v) => v.updatedBy));
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .slice(0, limit)
    .map(([weekEnding, v]) => ({
      weekEnding,
      hasMinutes: v.hasMinutes,
      winCount: v.winCount,
      updatedByName: v.updatedBy ? names.get(v.updatedBy) ?? null : null,
    }));
}
