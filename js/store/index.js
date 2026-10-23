import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { localStore } from './local.js';

/** Supabase when config.js is filled in, otherwise the in-browser demo. */
export async function createStore() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createSupabaseStore } = await import('./supabase.js');
    return createSupabaseStore(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return localStore;
}
