'use server';

import { requireAdmin } from '@/lib/auth';
import { correctValue } from '@/app/stats/history/actions';

// Bulk grid save. Admin-only gate here; the actual write delegates to
// correctValue, which independently enforces per-stat permission, the week
// lock (admins override, recorded via updated_by), NR-vs-real-0 (blank deletes
// the row, "0" writes a zero), and revalidates /stats + /dashboard. So a grid
// edit is byte-for-byte the same write as a History-table correction — nothing
// is bypassed.

export type BulkSaveResult = { ok: boolean; error?: string };

export async function saveBulkStat(
  statId: string,
  weekEnding: string,
  raw: string,
): Promise<BulkSaveResult> {
  await requireAdmin();
  try {
    await correctValue('stat', statId, weekEnding, raw);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed.' };
  }
}
