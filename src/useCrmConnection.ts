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

const CRM_ORIGIN = "https://google-crm-connect.vercel.app";
const CRM_BRIDGE_URL = `${CRM_ORIGIN}/sales-os-auth`;
const CRM_MESSAGE_TYPE = "silvotech:sales-os-auth";

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

  async function signInViaCrm() {
    const client = supabase;
    if (!client) return { error: "Подключение к CRM не настроено." };

    setError(null);
    const popup = window.open(
      CRM_BRIDGE_URL,
      "silvotech-crm-auth",
      "popup=yes,width=560,height=720",
    );

    if (!popup) {
      return { error: "Браузер заблокировал окно CRM. Разрешите всплывающие окна и повторите." };
    }

    return await new Promise<{ error: string | null }>((resolve) => {
      let settled = false;

      const finish = (result: { error: string | null }) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        window.clearInterval(closedCheck);
        window.clearTimeout(timeout);
        resolve(result);
      };

      const onMessage = async (event: MessageEvent) => {
        if (event.origin !== CRM_ORIGIN || event.source !== popup) return;
        if (event.data?.type !== CRM_MESSAGE_TYPE) return;

        const accessToken = event.data?.accessToken;
        const refreshToken = event.data?.refreshToken;
        if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
          finish({ error: "CRM вернула неполную сессию. Повторите подключение." });
          return;
        }

        const { error: sessionError } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          finish({ error: "Не удалось принять сессию CRM. Повторите подключение." });
          return;
        }

        popup.postMessage({ type: `${CRM_MESSAGE_TYPE}:ack` }, CRM_ORIGIN);
        popup.close();
        finish({ error: null });
      };

      const closedCheck = window.setInterval(() => {
        if (popup.closed) {
          finish({ error: "Окно CRM было закрыто до завершения подключения." });
        }
      }, 500);

      const timeout = window.setTimeout(() => {
        popup.close();
        finish({ error: "CRM не ответила. Убедитесь, что вы вошли в неё, и повторите." });
      }, 60_000);

      window.addEventListener("message", onMessage);
    });
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
    signInViaCrm,
    signOut,
    refresh: loadCounts,
  };
}
