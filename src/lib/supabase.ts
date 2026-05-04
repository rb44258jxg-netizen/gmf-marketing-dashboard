import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in.',
  );
}

// Note: we don't pass the Database generic — supabase-js v2.45+ has stricter
// generic resolution that mis-types hand-written schemas. Row shapes are
// defined in ./database.types.ts and cast explicitly at call sites.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const hasSupabaseConfig = Boolean(url && anonKey);
