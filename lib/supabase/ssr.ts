import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cookie-bound Supabase client for AUTH only (anon key). Used in server
 * components, server actions, and route handlers to read the logged-in user
 * and to run auth operations (magic link, verify, sign-out).
 *
 * IMPORTANT: this is NOT for board data. Board reads/writes go through the
 * service-role client (lib/supabase/server.ts) — under RLS the anon/user client
 * returns zero rows (the "Company OS trap"). Auth session lives here; data lives
 * on the service-role client.
 */
export async function getAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Throws in a Server Component render (cookies are read-only there);
          // the middleware refreshes the session, so it's safe to ignore.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* no-op in RSC render */
          }
        },
      },
    },
  );
}
