import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { crmSnapshot } from "./crm";
import { isSupabaseConfigured, supabase } from "./integrations/supabase";

export type CrmConnectionMode =
  | "snapshot"
  | "auth-required"
  | "connecting"
  | "live"
  | "error";

type Counts = {
  clients: number;
  activities: number;
  products: number;
};

export function useCrmConnection() {
  const [mode, setMode] = useState<CrmConnectionMode>(
    isSupabaseConfigured ? "connecting" : "snapshot",
  );
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({
    clients: crmSnapshot.clientCount,
    activities: crmSnapshot.activityCount,
    products: crmSnapshot.productCount,
  });

  const loadCounts = useCallback(async () => {
    if (!supabase) return;
    setMode("connecting");
    setError(null);

    const [clients, activities, products] = await Promise.all([
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase.from("client_activities").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
    ]);

    const firstError = clients.error ?? activities.error ?? products.error;
    if (firstError) {
      setError(firstError.message);
      setMode(firstError.message.toLowerCase().includes("jwt") ? "auth-required" : "error");
      return;
    }

    setCounts({
      clients: clients.count ?? 0,
      activities: activities.count ?? 0,
      products: products.count ?? 0,
    });
    setMode("live");
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      if (nextUser) void loadCounts();
      else setMode("auth-required");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) void loadCounts();
      else setMode("auth-required");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadCounts]);

  async function signIn(email: string, password: string) {
    if (!supabase) return { error: "Подключение к CRM не настроено." };

    setError(null);
    setMode("connecting");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setMode("auth-required");
      return { error: "Не удалось войти. Проверьте email и пароль от CRM." };
    }

    return { error: null };
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return {
    mode,
    user,
    error,
    counts,
    signIn,
    signOut,
    refresh: loadCounts,
  };
}
