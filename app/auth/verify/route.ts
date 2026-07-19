import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Verifies the magic-link token and establishes the session. Reached only by the
 * POST from the confirm page's "Continue" button (a full-page form submit), never
 * by the email link's GET — so link scanners can't consume the one-time token.
 *
 * verifyOtp's setAll writes the session cookies onto this redirect response; the
 * browser then follows to /board carrying them. Route-handler + response-bound
 * cookies is the reliable path (no client-action dispatch involved).
 */
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const form = await request.formData();
  const token_hash = String(form.get('token_hash') ?? '');
  const type = String(form.get('type') ?? '') as EmailOtpType;

  const invalid = () =>
    NextResponse.redirect(`${origin}/login?error=link_invalid`, { status: 303 });

  if (!token_hash || !type) return invalid();

  // 303 so the browser follows with a GET to /board.
  const response = NextResponse.redirect(`${origin}/board`, { status: 303 });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error || !data.user?.email) return invalid();

  const svc = getServiceClient();
  await svc
    .from('members')
    .update({ auth_uid: data.user.id, status: 'active' })
    .ilike('email', data.user.email);

  return response;
}
