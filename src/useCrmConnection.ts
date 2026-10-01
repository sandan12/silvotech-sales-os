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

export type CrmClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  address: string | null;
  industry: string | null;
  contactPerson: string | null;
  nip: string | null;
  source: string | null;
  tags: string[];
  status: string;
  nextActionAt: string | null;
  lastAttemptAt: string | null;
  updatedAt: string;
  notes: string | null;
  stageId: string | null;
  expectedValue: number | null;
  currency: string;
};

export type CrmActivity = {
  id: string;
  clientId: string;
  type: string;
  content: string;
  createdAt: string;
  dueAt: string | null;
  completedAt: string | null;
};

export type CrmProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  isActive: boolean;
};

export type CrmInterest = {
  id: string;
  clientId: string;
  productId: string;
  quantity: number | null;
  note: string | null;
};

export type CrmStage = {
  id: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
};

export type CrmUpdateDraft = {
  clientId: string | null;
  newClient: {
    name: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    notes: string | null;
  } | null;
  content: string;
  type: "note" | "call" | "email" | "meeting" | "task";
  nextActionAt: string | null;
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
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [products, setProducts] = useState<CrmProduct[]>([]);
  const [interests, setInterests] = useState<CrmInterest[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);

  const loadCounts = useCallback(async () => {
    if (!supabase) return;
    setMode("connecting");
    setError(null);

    const [clientsResult, activitiesResult, productsResult, interestsResult, stagesResult] =
      await Promise.all([
      supabase
        .from("clients")
        .select(
          "id,name,email,phone,website,city,address,industry,contact_person,nip,source,tags,status,next_action_at,last_attempt_at,updated_at,notes,stage_id,expected_value,currency",
          { count: "exact" },
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(250),
      supabase
        .from("client_activities")
        .select("id,client_id,type,content,created_at,due_at,completed_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(750),
      supabase
        .from("products")
        .select("id,name,sku,category,unit,is_active", { count: "exact" })
        .order("name")
        .limit(500),
      supabase
        .from("client_interests")
        .select("id,client_id,product_id,quantity,note")
        .limit(1000),
      supabase
        .from("pipeline_stages")
        .select("id,name,position,is_won,is_lost")
        .order("position"),
    ]);

    const firstError =
      clientsResult.error ??
      activitiesResult.error ??
      productsResult.error ??
      interestsResult.error ??
      stagesResult.error;
    if (firstError) {
      setError(firstError.message);
      setMode(firstError.message.toLowerCase().includes("jwt") ? "auth-required" : "error");
      return;
    }

    setCounts({
      clients: clientsResult.count ?? clientsResult.data?.length ?? 0,
      activities: activitiesResult.count ?? activitiesResult.data?.length ?? 0,
      products: productsResult.count ?? productsResult.data?.length ?? 0,
    });
    setClients(
      (clientsResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        website: item.website,
        city: item.city,
        address: item.address,
        industry: item.industry,
        contactPerson: item.contact_person,
        nip: item.nip,
        source: item.source,
        tags: item.tags ?? [],
        status: item.status,
        nextActionAt: item.next_action_at,
        lastAttemptAt: item.last_attempt_at,
        updatedAt: item.updated_at,
        notes: item.notes,
        stageId: item.stage_id,
        expectedValue: item.expected_value,
        currency: item.currency,
      })),
    );
    setActivities(
      (activitiesResult.data ?? []).map((item) => ({
        id: item.id,
        clientId: item.client_id,
        type: item.type,
        content: item.content,
        createdAt: item.created_at,
        dueAt: item.due_at,
        completedAt: item.completed_at,
      })),
    );
    setProducts(
      (productsResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        category: item.category,
        unit: item.unit,
        isActive: item.is_active,
      })),
    );
    setInterests(
      (interestsResult.data ?? []).map((item) => ({
        id: item.id,
        clientId: item.client_id,
        productId: item.product_id,
        quantity: item.quantity,
        note: item.note,
      })),
    );
    setStages(
      (stagesResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        position: item.position,
        isWon: item.is_won,
        isLost: item.is_lost,
      })),
    );
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

  async function saveConfirmedUpdate(draft: CrmUpdateDraft) {
    const client = supabase;
    if (!client || !user) return { error: "Сначала подключите CRM." };
    let clientId = draft.clientId;

    if (!clientId && draft.newClient) {
      const { data: created, error: createError } = await client
        .from("clients")
        .insert({
          name: draft.newClient.name,
          email: draft.newClient.email,
          phone: draft.newClient.phone,
          website: draft.newClient.website,
          notes: draft.newClient.notes,
          source: "Sales OS",
          owner_id: user.id,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (createError) return { error: createError.message };
      clientId = created.id;
    }

    if (!clientId) return { error: "Не выбран и не создан клиент." };

    const { error: activityError } = await client.from("client_activities").insert({
      client_id: clientId,
      user_id: user.id,
      type: draft.type,
      content: draft.content,
      due_at: draft.nextActionAt,
    });

    if (activityError) return { error: activityError.message };

    if (draft.nextActionAt) {
      const { error: clientError } = await client
        .from("clients")
        .update({ next_action_at: draft.nextActionAt })
        .eq("id", clientId);
      if (clientError) return { error: clientError.message };
    }

    await loadCounts();
    return { error: null };
  }

  return {
    mode,
    user,
    error,
    counts,
    clients,
    activities,
    products,
    interests,
    stages,
    signIn,
    signInViaCrm,
    signOut,
    saveConfirmedUpdate,
    refresh: loadCounts,
  };
}
