import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy } from '@/lib/hierarchy';

// Stats COLLECTION: who has reported for a week, and who has not.
//
// "Reported" = the member has a member_hours value for that week. Hours is the
// universal per-member signal (2a): everyone reports it, regardless of how many
// posts they hold or whether their posts carry named stats. Keying the chase
// list off named stats would silently excuse anyone whose post has none.
//
// A member with a row but a NULL value has not reported — the row exists only
// as a shell in that case, and NR must not read as done.

export type MemberReportStatus = {
  memberId: string;
  name: string | null;
  email: string;
  role: string;
  status: string; // invited | active
  reported: boolean;
  hours: string | null;
  /** Stats this member is the EFFECTIVE holder of — what they actually owe. */
  owedStats: number;
};

export type CollectionView = {
  weekEnding: string;
  reported: MemberReportStatus[];
  /** Active members who owe a report — the actual chase list. */
  missingActive: MemberReportStatus[];
  /**
   * Invited but never signed in. They cannot report yet, so chasing them for
   * stats is the wrong action — getting them signed in is a different problem,
   * and lumping the two together makes the chase list wrong.
   */
  neverSignedIn: MemberReportStatus[];
  total: number;
};

export async function getCollection(weekEnding: string): Promise<CollectionView> {
  const supa = getServiceClient();

  const [memberRes, hoursRes, hier] = await Promise.all([
    supa.from('members').select('id, name, email, role, status'),
    supa.from('member_hours').select('member_id, hours').eq('week_ending', weekEnding),
    // "Who owes what" follows the EFFECTIVE holder, so a member covering unfilled
    // posts is shown owing those stats too — the same resolver the report view
    // and the dashboard use.
    loadHierarchy(),
  ]);

  const hoursBy = new Map<string, string>();
  for (const h of hoursRes.data ?? []) {
    if (h.hours != null) hoursBy.set(h.member_id, String(h.hours));
  }

  const rows: MemberReportStatus[] = (memberRes.data ?? [])
    .map((m) => ({
      memberId: m.id,
      name: (m.name as string | null) ?? null,
      email: (m.email as string) ?? '',
      role: m.role as string,
      status: m.status as string,
      reported: hoursBy.has(m.id),
      hours: hoursBy.get(m.id) ?? null,
      owedStats: hier.statsFor(m.id).length,
    }))
    .filter((m) => m.email !== '') // no email = nothing to chase
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  const missing = rows.filter((r) => !r.reported);
  return {
    weekEnding,
    reported: rows.filter((r) => r.reported),
    missingActive: missing.filter((r) => r.status === 'active'),
    neverSignedIn: missing.filter((r) => r.status !== 'active'),
    total: rows.length,
  };
}
