import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadPostAreas, areaContext, areaBucket, divisionLabel, type OrgGrain } from '@/lib/area';

// The Wins / Results feed — the committee's narrative production. Reads are open
// to every logged-in member (wins are shared good news); writes are authorized
// in the actions (a member adds their own; unattributed is admin-only).

export type Win = {
  id: string;
  body: string;
  winDate: string; // ISO
  weekEnding: string; // ISO
  areaPostId: string | null;
  areaLabel: string; // "Dept — Post" or "(no area)"
  divisionLabel: string; // "Division N — Name" / "Unassigned"
  memberId: string | null;
  memberName: string | null; // display name, or null when unattributed
  isUnattributed: boolean;
  createdByName: string | null;
  isMine: boolean; // for the viewer
};

export type WinFilters = {
  from?: string; // ISO win_date >=
  to?: string; // ISO win_date <=
  areaPostId?: string;
  memberId?: string; // '' → any; 'unattributed' → is_unattributed
};

export type WinArea = {
  key: string;
  name: string;
  subtitle: string | null;
  wins: Win[];
};

// ---------------------------------------------------------------------------
// Shared read + hydrate
// ---------------------------------------------------------------------------

async function hydrate(
  rows: {
    id: string;
    body: string;
    win_date: string;
    week_ending: string;
    area_post_id: string | null;
    member_id: string | null;
    is_unattributed: boolean;
    created_by: string | null;
  }[],
  viewerId: string,
): Promise<Win[]> {
  const supa = getServiceClient();
  const areas = await loadPostAreas();
  const memberIds = [
    ...new Set(rows.flatMap((r) => [r.member_id, r.created_by]).filter(Boolean) as string[]),
  ];
  const names = new Map<string, string>();
  if (memberIds.length) {
    const { data } = await supa.from('members').select('id, name, email').in('id', memberIds);
    for (const m of data ?? [])
      names.set(m.id, (m.name as string | null) || (m.email as string | null) || 'Unknown');
  }
  return rows.map((r) => {
    const a = r.area_post_id ? areas.get(r.area_post_id) : undefined;
    return {
      id: r.id,
      body: r.body,
      winDate: r.win_date,
      weekEnding: r.week_ending,
      areaPostId: r.area_post_id,
      areaLabel: r.area_post_id ? areaContext(a) : '(no area)',
      divisionLabel: divisionLabel(a),
      memberId: r.member_id,
      memberName: r.member_id ? names.get(r.member_id) ?? 'Unknown' : null,
      isUnattributed: r.is_unattributed,
      createdByName: r.created_by ? names.get(r.created_by) ?? null : null,
      isMine: r.member_id === viewerId,
    };
  });
}

/** The wins stream matching `filters`, newest first. */
export async function listWins(viewerId: string, filters: WinFilters = {}): Promise<Win[]> {
  const supa = getServiceClient();
  let q = supa
    .from('wins')
    .select('id, body, win_date, week_ending, area_post_id, member_id, is_unattributed, created_by')
    .order('win_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.from) q = q.gte('win_date', filters.from);
  if (filters.to) q = q.lte('win_date', filters.to);
  if (filters.areaPostId) q = q.eq('area_post_id', filters.areaPostId);
  if (filters.memberId === 'unattributed') q = q.eq('is_unattributed', true);
  else if (filters.memberId) q = q.eq('member_id', filters.memberId);

  const { data } = await q;
  return hydrate(data ?? [], viewerId);
}

/**
 * Wins grouped BY AREA (the meeting-projection view), using the same org buckets
 * as the 2e stats dashboard so areas line up across both surfaces. Empty areas
 * are dropped; groups are in board order.
 */
export async function winsByArea(
  viewerId: string,
  grain: OrgGrain,
  filters: WinFilters = {},
): Promise<WinArea[]> {
  const wins = await listWins(viewerId, filters);
  const areas = await loadPostAreas();
  const buckets = new Map<string, { name: string; subtitle: string | null; sort: number; wins: Win[] }>();
  for (const w of wins) {
    const a = w.areaPostId ? areas.get(w.areaPostId) : undefined;
    const b = areaBucket(a, grain);
    let bucket = buckets.get(b.key);
    if (!bucket) buckets.set(b.key, (bucket = { name: b.name, subtitle: b.subtitle, sort: b.sort, wins: [] }));
    bucket.wins.push(w);
  }
  return [...buckets.entries()]
    .sort((x, y) => x[1].sort - y[1].sort)
    .map(([key, b]) => ({ key, name: b.name, subtitle: b.subtitle, wins: b.wins }));
}

/** The most recent `limit` wins, for the login feed. */
export async function recentWins(viewerId: string, limit = 6): Promise<Win[]> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('wins')
    .select('id, body, win_date, week_ending, area_post_id, member_id, is_unattributed, created_by')
    .order('win_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return hydrate(data ?? [], viewerId);
}

/** Members who have at least one win — for the By Member filter. */
export async function membersWithWins(): Promise<{ id: string; name: string }[]> {
  const supa = getServiceClient();
  const [{ data: wins }, { data: members }] = await Promise.all([
    supa.from('wins').select('member_id').not('member_id', 'is', null),
    supa.from('members').select('id, name, email'),
  ]);
  const nameOf = new Map(
    (members ?? []).map((m) => [m.id, (m.name as string | null) || (m.email as string | null) || 'Unknown']),
  );
  const ids = [...new Set((wins ?? []).map((w) => w.member_id as string))];
  return ids
    .map((id) => ({ id, name: nameOf.get(id) ?? 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
