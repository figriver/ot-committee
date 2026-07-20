'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { saveReminderTemplate } from '@/lib/reminders';

/**
 * Save the reminder template. Admin-only, enforced server-side (requireAdmin
 * redirects a non-admin) — the page being admin-only is not what protects this.
 */
export async function updateReminderTemplate(
  subject: string,
  body: string,
): Promise<void> {
  await requireAdmin();
  const s = subject.trim();
  const b = body.trim();
  if (s === '') throw new Error('Subject cannot be empty.');
  if (b === '') throw new Error('Message cannot be empty.');
  await saveReminderTemplate({ subject: s, body: b });
  revalidatePath('/settings/collection');
}
