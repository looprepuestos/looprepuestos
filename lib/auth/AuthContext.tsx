"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountRequestRow, ProfileRow, WhatsAppOrderItem, WhatsAppOrderRow, WholesalePriceRow } from "@/types/database";
import type { OrderNotification } from "@/lib/order-notifications";
import type { PublicProduct } from "@/types/product";

interface AuthContextValue {
  session: Session | null;
  profile: ProfileRow | null;
  request: AccountRequestRow | null;
  pendingRequests: AccountRequestRow[];
  favorites: ReadonlySet<string>;
  notifications: OrderNotification[];
  unreadNotifications: number;
  notificationError: string;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<string | null>;
  orderHistory: WhatsAppOrderRow[];
  refreshOrderHistory: () => Promise<string | null>;
  changeOrder: (order: WhatsAppOrderRow, action: "cancel" | "remove_item", itemIndex?: number) => Promise<string | null>;
  wholesalePrices: ReadonlyMap<string, number>;
  isWholesale: boolean;
  priceFor: (product: PublicProduct) => number;
  loading: boolean;
  accountOpen: boolean;
  openAccount: () => void;
  closeAccount: () => void;
  signInWithGoogle: () => Promise<string | null>;
  connectSalesGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  submitWholesaleRequest: (input: { nombre: string; local: string; localidad: string; whatsapp: string }) => Promise<string | null>;
  resolveWholesaleRequest: (requestId: string, approve: boolean) => Promise<string | null>;
  toggleFavorite: (sku: string) => Promise<void>;
  recordWhatsAppOrder: (input: { customerName: string; locality: string; delivery: "Envío" | "Retiro"; payment: "Efectivo" | "Transferencia"; notes: string; items: WhatsAppOrderItem[]; total: number }) => Promise<string | null>;
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
  const [pendingRequests, setPendingRequests] = useState<AccountRequestRow[]>([]);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());
  const [orderHistory, setOrderHistory] = useState<WhatsAppOrderRow[]>([]);
  const [wholesalePrices, setWholesalePrices] = useState<ReadonlyMap<string, number>>(new Map());
  const [loading, setLoading] = useState(() => Boolean(client));
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationState, setNotificationState] = useState<{ userId: string; items: OrderNotification[]; unread: number; error: string }>({ userId: '', items: [], unread: 0, error: '' });
  const notifications = useMemo(() => notificationState.userId === session?.user.id ? notificationState.items : [], [notificationState,session?.user.id]);
  const unreadNotifications = notificationState.userId === session?.user.id ? notificationState.unread : 0;
  const notificationError = notificationState.userId === session?.user.id ? notificationState.error : '';
  const refreshNotifications = useCallback(async () => {
    if (!client || !session) return;
    const userId = session.user.id;
    try {
      const [list, count] = await Promise.all([
        client.from('order_notifications').select('id,order_id,title,message,changes,created_at,read_at').eq('user_id',userId).order('read_at',{ascending:true,nullsFirst:true}).order('created_at',{ascending:false}).limit(50),
        client.from('order_notifications').select('id',{count:'exact',head:true}).eq('user_id',userId).is('read_at',null),
      ]);
      if (list.error || count.error) throw new Error('No se pudieron cargar los avisos. Tocá Actualizar para reintentar.');
      setNotificationState({userId,items:(list.data ?? []) as OrderNotification[],unread:count.count ?? 0,error:''});
    } catch {
      setNotificationState(current => ({userId,items:current.userId===userId?current.items:[],unread:current.userId===userId?current.unread:0,error:'No se pudieron cargar los avisos. Tocá Actualizar para reintentar.'}));
    }
  }, [client,session]);
  const markNotificationRead = useCallback(async (id: string) => {
    if (!client || !session) return 'Primero iniciá sesión.';
    try {
      const { error } = await client.from('order_notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('user_id',session.user.id).is('read_at',null);
      if (error) return 'No se pudo marcar el aviso como leído.';
      await refreshNotifications(); return null;
    } catch { return 'No se pudo marcar el aviso como leído.'; }
  },[client,session,refreshNotifications]);
  useEffect(() => {
    if (!session) return;
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshNotifications(); };
    refreshVisible();
    const timer = window.setInterval(refreshVisible,30000);
    window.addEventListener('focus',refreshVisible);
    document.addEventListener('visibilitychange',refreshVisible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus',refreshVisible); document.removeEventListener('visibilitychange',refreshVisible); };
  },[session,refreshNotifications]);

  const loadPrivateData = useCallback(async (activeSession: Session | null) => {
    if (!client || !activeSession) {
      setProfile(null);
      setRequest(null);
      setPendingRequests([]);
      setFavorites(new Set());
      setOrderHistory([]);
      setWholesalePrices(new Map());
      return;
    }
    const userId = activeSession.user.id;
    const [profileResult, requestResult, favoritesResult, historyResult] = await Promise.all([
      client.from("profiles").select("id,email,nombre,role,created_at,updated_at").eq("id", userId).maybeSingle(),
      client.from("account_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("favorites").select("sku").eq("user_id", userId),
      client.from("whatsapp_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);
    const nextProfile = (profileResult.data as ProfileRow | null) ?? null;
    setProfile(nextProfile);
    setRequest((requestResult.data as AccountRequestRow | null) ?? null);
    setFavorites(new Set((favoritesResult.data ?? []).map((row) => String(row.sku))));
    setOrderHistory((historyResult.data as WhatsAppOrderRow[] | null) ?? []);
    if (nextProfile?.role === "MAYORISTA" || nextProfile?.role === "ADMIN") {
      const { data, error } = await client.rpc("get_wholesale_prices");
      if (error) {
        console.error("No se pudieron cargar los precios mayoristas:", error.message);
        setWholesalePrices(new Map());
      } else {
        const rows = (data as WholesalePriceRow[] | null) ?? [];
        setWholesalePrices(new Map(rows.map((row) => [row.sku, Number(row.precio_mayorista)])));
      }
    } else {
      setWholesalePrices(new Map());
    }
    if (nextProfile?.role === "ADMIN") {
      const { data } = await client
        .from("account_requests")
        .select("*")
        .eq("estado", "PENDIENTE")
        .order("created_at", { ascending: true });
      setPendingRequests((data as AccountRequestRow[] | null) ?? []);
    } else {
      setPendingRequests([]);
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
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

  const connectSalesGoogle = useCallback(async () => {
    if (!client || !session || profile?.role !== "ADMIN") return "Solo el administrador puede conectar la planilla.";
    sessionStorage.setItem('loop-return-to-sales', '1');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        queryParams: {
          prompt: 'consent',
          ...(session.user.email ? { login_hint: session.user.email } : {}),
        },
      },
    });
    if (error) sessionStorage.removeItem('loop-return-to-sales');
    return error?.message ?? null;
  }, [client, session, profile?.role]);

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

  const resolveWholesaleRequest = useCallback(async (requestId: string, approve: boolean) => {
    if (!client || !session || profile?.role !== "ADMIN") return "No tenés permisos para realizar esta acción.";
    const { error } = await client.rpc("resolver_solicitud_mayorista", {
      p_request_id: requestId,
      p_aprobar: approve,
    });
    if (error) return error.message;
    await loadPrivateData(session);
    return null;
  }, [client, session, profile?.role, loadPrivateData]);

  const recordWhatsAppOrder = useCallback(async (input: { customerName: string; locality: string; delivery: "Envío" | "Retiro"; payment: "Efectivo" | "Transferencia"; notes: string; items: WhatsAppOrderItem[]; total: number }) => {
    if (!client || !session) return null;
    const { data, error } = await client.from("whatsapp_orders").insert({
      user_id: session.user.id,
      customer_name: input.customerName.trim(),
      locality: input.locality.trim(),
      delivery: input.delivery,
      payment_method: input.payment,
      notes: input.notes.trim() || null,
      items: input.items,
      total_estimated: input.total,
    }).select("*").single();
    if (error || !data) {
      if (error) console.error("No se pudo registrar el pedido:", error.code);
      return null;
    }
    setOrderHistory((current) => [data as WhatsAppOrderRow, ...current].slice(0, 30));
    return data.id;
  }, [client, session]);

  const isWholesale = profile?.role === "MAYORISTA" || profile?.role === "ADMIN";
  const refreshOrderHistory = useCallback(async () => {
    if (!client || !session) return "Primero iniciá sesión.";
    try {
      const { data, error } = await client.from("whatsapp_orders").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(30);
      if (error) return "No se pudieron actualizar tus pedidos.";
      setOrderHistory((data as WhatsAppOrderRow[] | null) ?? []);
      return null;
    } catch { return "No se pudieron actualizar tus pedidos. Revisá tu conexión."; }
  }, [client, session]);

  const changeOrder = useCallback(async (order: WhatsAppOrderRow, action: "cancel" | "remove_item", itemIndex?: number) => {
    if (!session) return "Primero iniciá sesión.";
    try {
      const response = await fetch("/api/orders/customer", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action, itemIndex, expectedUpdatedAt: order.updated_at }),
      });
      const payload = await response.json() as { order?: WhatsAppOrderRow; error?: string };
      if (!response.ok || !payload.order) {
        if (response.status === 409) await refreshOrderHistory();
        return payload.error || "No se pudo modificar el pedido.";
      }
      const updated = payload.order;
      setOrderHistory((current) => current.map((item) => item.id === updated.id ? updated : item));
      return null;
    } catch { return "No se pudo confirmar el cambio. Actualizá el historial para comprobar el estado."; }
  }, [session, refreshOrderHistory]);

  const priceFor = useCallback((product: PublicProduct) => {
    const publicPrice = product.precioPromocional !== null && product.precioPromocional < product.precioPublico
      ? product.precioPromocional
      : product.precioPublico;
    return wholesalePrices.get(product.parentSku ?? product.sku) ?? publicPrice;
  }, [wholesalePrices]);

  const value = useMemo<AuthContextValue>(() => ({
    notifications, unreadNotifications, notificationError, refreshNotifications, markNotificationRead,
    session, profile, request, pendingRequests, favorites, orderHistory, refreshOrderHistory, changeOrder, wholesalePrices, isWholesale, priceFor, loading, accountOpen,
    openAccount: () => setAccountOpen(true),
    closeAccount: () => setAccountOpen(false),
    signInWithGoogle, connectSalesGoogle, signOut, submitWholesaleRequest, resolveWholesaleRequest, toggleFavorite, recordWhatsAppOrder,
  }), [notifications, unreadNotifications, notificationError, refreshNotifications, markNotificationRead, session, profile, request, pendingRequests, favorites, orderHistory, refreshOrderHistory, changeOrder, wholesalePrices, isWholesale, priceFor, loading, accountOpen, signInWithGoogle, connectSalesGoogle, signOut, submitWholesaleRequest, resolveWholesaleRequest, toggleFavorite, recordWhatsAppOrder]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
