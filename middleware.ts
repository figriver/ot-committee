import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Everything under these paths requires a logged-in Supabase user.
const PROTECTED = ['/board', '/members', '/report', '/stats'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Validates the JWT against the Auth server (and refreshes cookies above).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Root → board (which itself bounces to /login when logged out).
  if (path === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/board';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const isProtected = PROTECTED.some(
    (p) => path === p || path.startsWith(p + '/'),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // Already logged in → skip the login page.
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/board';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and the auth route handlers
  // (which manage their own cookies/redirects).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/).*)'],
};
