import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase de sólo lectura pública (anon key).
 * Devuelve `null` si no hay variables de entorno configuradas, para que la app
 * pueda funcionar en modo preview con snapshot local (ver lib/db/catalog.ts).
 */
export function createPublicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
