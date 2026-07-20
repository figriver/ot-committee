import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';

// Reminder drafts for the chase-up screen.
//
// TODAY the only channel is MANUAL: the admin copies the missing members'
// addresses and the filled-in template, and sends it from their own mail client.
// Nothing is sent by the system.
//
// The seam for adding system sending later is deliberate and narrow:
//
//   * buildReminder() produces a channel-INDEPENDENT draft — recipients plus a
//     rendered subject and body. A Resend-backed sender, or an SMS sender, takes
//     the same draft; it does not re-derive any of this.
//   * The template lives in `settings` (like the week-lock config), so it is
//     edited once and reused by whatever sends it.
//
// So adding "Send from the system" is: implement a ReminderSender, register it,
// and add the button. The draft, the recipient list, and the editing UI are
// already here and do not change.

export type ReminderChannel = 'manual' | 'email' | 'sms';

/** Channels that can actually deliver today. Manual = copy/paste, by a human. */
export const AVAILABLE_CHANNELS: ReminderChannel[] = ['manual'];

export type ReminderTemplate = { subject: string; body: string };

export type ReminderDraft = ReminderTemplate & {
  recipients: string[];
  /** Ready to paste into a To: field. */
  recipientLine: string;
};

/**
 * A future sender implements this. Nothing implements it yet — 'manual' needs no
 * code, it is the admin's own mail client.
 */
export interface ReminderSender {
  channel: ReminderChannel;
  send(draft: ReminderDraft): Promise<{ sent: number; failed: string[] }>;
}

const SETTING_SUBJECT = 'reminder_subject';
const SETTING_BODY = 'reminder_body';

export const DEFAULT_TEMPLATE: ReminderTemplate = {
  subject: 'We need your stats for the week ending {week}',
  body: `Hi,

We don't have your stats yet for the week ending {week}.

Please report them here: {link}

It takes a minute — hours plus any stats on your post. Thanks for keeping the
committee's stats straight.`,
};

/** The saved template, falling back to the default when unset. */
export async function getReminderTemplate(): Promise<ReminderTemplate> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('settings')
    .select('key, value')
    .in('key', [SETTING_SUBJECT, SETTING_BODY]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  return {
    subject: map.get(SETTING_SUBJECT)?.trim() || DEFAULT_TEMPLATE.subject,
    body: map.get(SETTING_BODY)?.trim() || DEFAULT_TEMPLATE.body,
  };
}

export async function saveReminderTemplate(t: ReminderTemplate): Promise<void> {
  const supa = getServiceClient();
  const now = new Date().toISOString();
  const { error } = await supa.from('settings').upsert(
    [
      { key: SETTING_SUBJECT, value: t.subject, updated_at: now },
      { key: SETTING_BODY, value: t.body, updated_at: now },
    ],
    { onConflict: 'key' },
  );
  if (error) throw new Error(`saveReminderTemplate: ${error.message}`);
}

/** {week} and {link} are the only placeholders — keep it obvious to edit. */
export function renderTemplate(
  t: ReminderTemplate,
  vars: { week: string; link: string },
): ReminderTemplate {
  const fill = (s: string) =>
    s.replaceAll('{week}', vars.week).replaceAll('{link}', vars.link);
  return { subject: fill(t.subject), body: fill(t.body) };
}

export function buildReminder(
  template: ReminderTemplate,
  vars: { week: string; link: string },
  recipients: string[],
): ReminderDraft {
  const rendered = renderTemplate(template, vars);
  return {
    ...rendered,
    recipients,
    // Comma-separated: accepted by Gmail, Outlook and Apple Mail alike.
    recipientLine: recipients.join(', '),
  };
}
