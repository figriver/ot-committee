import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Ensure a confirmed auth user exists for `email` (public sign-ups are disabled,
 * so users are created here with the service-role admin API) and send them a
 * magic link. The Magic Link email template points at /auth/callback with a
 * token_hash, which the callback verifies to establish the session.
 *
 * Callers MUST gate on the members allowlist before calling this.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const svc = getServiceClient();

  const { error: createErr } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (
    createErr &&
    !/already.*(registered|exists)/i.test(createErr.message)
  ) {
    throw new Error(`sendMagicLink(createUser): ${createErr.message}`);
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${SITE}/auth/callback` },
  });
  if (error) throw new Error(`sendMagicLink(otp): ${error.message}`);
}
