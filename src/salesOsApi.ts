import { supabase } from "./integrations/supabase";

const CRM_API_ORIGIN = "https://google-crm-connect.vercel.app";

async function authorizedFetch(path: string, init?: RequestInit) {
  if (!supabase) throw new Error("CRM connection is not configured");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Сначала подключите CRM");

  const response = await fetch(`${CRM_API_ORIGIN}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Ошибка сервера: ${response.status}`) as Error & {
      code?: string;
    };
    error.code = body.code;
    throw error;
  }
  return body;
}

export type AiMode = "command" | "discovery" | "client" | "weekly";

export async function askSalesOsAi(mode: AiMode, message: string) {
  return authorizedFetch("/api/sales-os/assistant", {
    method: "POST",
    body: JSON.stringify({ mode, message }),
  }) as Promise<{
    reply: string;
    provider: string;
    fallback: string[];
  }>;
}

export async function getMailStatus() {
  return authorizedFetch("/api/sales-os/mail-sync") as Promise<{
    configured: boolean;
    host: string;
    port: number;
    user: string;
    secure: boolean;
    sendingEnabled: boolean;
  }>;
}

export async function syncMail(lookbackDays = 45) {
  return authorizedFetch("/api/sales-os/mail-sync", {
    method: "POST",
    body: JSON.stringify({ lookbackDays }),
  }) as Promise<{
    scanned: number;
    linked: number;
    alreadyImported: number;
    unmatched: { messageId: string; from: string; subject: string; date: string | null }[];
    lookbackDays: number;
    sendingEnabled: boolean;
  }>;
}
