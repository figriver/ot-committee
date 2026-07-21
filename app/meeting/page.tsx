import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { currentWeekEnding } from '@/lib/week';

export const dynamic = 'force-dynamic';

// /meeting → this week's meeting. The canonical per-week URL is /meeting/<week>,
// which is what an email/link points at.
export default async function MeetingIndex() {
  await requireMember();
  redirect(`/meeting/${await currentWeekEnding()}`);
}
