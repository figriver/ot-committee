import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

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
};

export type CollectionView = {
  weekEnding: string;
  reported: MemberReportStatus[];
  missing: MemberReportStatus[];
  total: number;
};

export async function getCollection(weekEnding: string): Promise<CollectionView> {
  const supa = getServiceClient();

  const [memberRes, hoursRes] = await Promise.all([
    supa.from('members').select('id, name, email, role, status'),
    supa.from('member_hours').select('member_id, hours').eq('week_ending', weekEnding),
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
    }))
    .filter((m) => m.email !== '') // no email = nothing to chase
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  return {
    weekEnding,
    reported: rows.filter((r) => r.reported),
    missing: rows.filter((r) => !r.reported),
    total: rows.length,
  };
}
