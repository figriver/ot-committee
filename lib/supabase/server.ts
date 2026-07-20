import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. SERVER ONLY.
 *
 * Slice 1a has no auth and RLS allows only the `authenticated` role, so every
 * database read/write runs here with the service-role key (which bypasses RLS).
 * The anon client is never used for member-spanning reads.
 */
// The schema generic defaults to the literal "public"; DB_SCHEMA makes it a
// runtime value, so widen it (see getDbSchema below).
type AnySchemaClient = SupabaseClient<any, any, any>;

let cached: AnySchemaClient | null = null;

/**
 * Which Postgres schema holds the data.
 *
 *   public (default) = PRODUCTION — the real committee record. Never seed or
 *                      test against it.
 *   dev              = DEVELOPMENT — same table structure, throwaway data.
 *                      Seed and truncate freely.
 *
 * One Supabase project, two schemas (migration 0011). Vercel leaves DB_SCHEMA
 * unset, so production gets `public`; .env.local sets DB_SCHEMA=dev so local
 * runs and tests never touch real records. Auth is unaffected — auth.users is
 * shared by both (that client lives in ./ssr.ts).
 */
export function getDbSchema(): string {
  return process.env.DB_SCHEMA?.trim() || 'public';
}

export function getServiceClient(): AnySchemaClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY (see .env.local.example).',
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: getDbSchema() },
  });
  return cached;
}
