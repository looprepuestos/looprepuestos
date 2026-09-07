"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountRequestRow, ProfileRow } from "@/types/database";

interface AuthContextValue {
  session: Session | null;
  profile: ProfileRow | null;
  request: AccountRequestRow | null;
  favorites: ReadonlySet<string>;
  loading: boolean;
  accountOpen: boolean;
  openAccount: () => void;
  closeAccount: () => void;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  submitWholesaleRequest: (input: { nombre: string; local: string; localidad: string; whatsapp: string }) => Promise<string | null>;
  toggleFavorite: (sku: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function browserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(browserClient);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [request, setRequest] = useState<AccountRequestRow | null>(null);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

  const loadPrivateData = useCallback(async (activeSession: Session | null) => {
    if (!client || !activeSession) {
      setProfile(null);
      setRequest(null);
      setFavorites(new Set());
      return;
    }
    const userId = activeSession.user.id;
    const [profileResult, requestResult, favoritesResult] = await Promise.all([
      client.from("profiles").select("id,email,nombre,role,created_at,updated_at").eq("id", userId).maybeSingle(),
      client.from("account_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("favorites").select("sku").eq("user_id", userId),
    ]);
    setProfile((profileResult.data as ProfileRow | null) ?? null);
    setRequest((requestResult.data as AccountRequestRow | null) ?? null);
    setFavorites(new Set((favoritesResult.data ?? []).map((row) => String(row.sku))));
  }, [client]);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      return loadPrivateData(data.session);
    }).finally(() => setLoading(false));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadPrivateData(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [client, loadPrivateData]);

  const signInWithGoogle = useCallback(async () => {
    if (!client) return "El acceso de usuarios todavía no está configurado.";
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return error?.message ?? null;
  }, [client]);

  const signOut = useCallback(async () => {
    await client?.auth.signOut();
    setAccountOpen(false);
  }, [client]);

  const submitWholesaleRequest = useCallback(async (input: { nombre: string; local: string; localidad: string; whatsapp: string }) => {
    if (!client || !session) return "Primero iniciá sesión.";
    const { data, error } = await client.from("account_requests").insert({
      user_id: session.user.id,
      nombre: input.nombre.trim(),
      service_local: input.local.trim(),
      localidad: input.localidad.trim(),
      whatsapp: input.whatsapp.trim(),
      estado: "PENDIENTE",
    }).select("*").single();
    if (error) return error.message;
    setRequest(data as AccountRequestRow);
    return null;
  }, [client, session]);

  const toggleFavorite = useCallback(async (sku: string) => {
    if (!client || !session) {
      setAccountOpen(true);
      return;
    }
    const exists = favorites.has(sku);
    setFavorites((current) => {
      const next = new Set(current);
      if (exists) next.delete(sku); else next.add(sku);
      return next;
    });
    const query = exists
      ? client.from("favorites").delete().eq("user_id", session.user.id).eq("sku", sku)
      : client.from("favorites").insert({ user_id: session.user.id, sku });
    const { error } = await query;
    if (error) void loadPrivateData(session);
  }, [client, session, favorites, loadPrivateData]);

  const value = useMemo<AuthContextValue>(() => ({
    session, profile, request, favorites, loading, accountOpen,
    openAccount: () => setAccountOpen(true),
    closeAccount: () => setAccountOpen(false),
    signInWithGoogle, signOut, submitWholesaleRequest, toggleFavorite,
  }), [session, profile, request, favorites, loading, accountOpen, signInWithGoogle, signOut, submitWholesaleRequest, toggleFavorite]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
