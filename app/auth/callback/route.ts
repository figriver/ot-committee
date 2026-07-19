import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server';

/**
 * Magic-link landing. The email template links here with ?token_hash=&type=.
 * We verify the token (which establishes the session cookies on the response),
 * link the auth user to their member row + mark them active, then redirect in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/board';

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  // Session cookies get written onto this response by verifyOtp's setAll.
  const response = NextResponse.redirect(`${origin}${next}`);
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
  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  // Wire the auth user to the allowlisted member and activate them.
  const svc = getServiceClient();
  await svc
    .from('members')
    .update({ auth_uid: data.user.id, status: 'active' })
    .ilike('email', data.user.email);

  return response;
}
