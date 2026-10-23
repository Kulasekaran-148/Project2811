import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { localStore } from './local.js';

/** Supabase when config.js is filled in, otherwise the in-browser demo. */
export async function createStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL.trim())) {
      throw new Error(`SUPABASE_URL in js/config.js should look like https://<project-ref>.supabase.co, but it is "${SUPABASE_URL}".`);
    }
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore(SUPABASE_URL.trim().replace(/\/$/, ''), SUPABASE_ANON_KEY.trim());
  }
  return localStore;
}
