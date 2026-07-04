export type StatMap = Record<string, number | string>;

export type Lead = {
  id: string;
  name: string;
  username?: string | null;
  status: string;
  optInCommercial: boolean;
  ageConfirmed: boolean;
  followUpAllowed: boolean;
  totalSpent: number | string;
  lastInboundMessage?: string | null;
  tags: { tag: { name: string; color: string } }[];
};

export type Conversation = {
  id: string;
  name: string;
  type: string;
  lastMessage?: string | null;
  unreadCount: number;
  responded: boolean;
  conversationActive: boolean;
  lastMessageAt?: string | null;
  lead?: Lead | null;
};

export type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL" | "SYSTEM" | string;
  body?: string | null;
  createdAt: string;
  aiGenerated?: boolean;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const emptyStats: StatMap = {
  totalLeads: 0,
  newToday: 0,
  activeConversations: 0,
  optIn: 0,
  noOptIn: 0,
  ageConfirmed: 0,
  sentToday: 0,
  receivedToday: 0,
  aiToday: 0,
  activeCampaigns: 0,
  activeAutomations: 0,
  purchasesToday: 0,
  estimatedRevenue: 0,
  stopLeads: 0,
  failedMessages: 0
};

export function getToken() {
  return localStorage.getItem("crm_token") ?? "";
}

export function setToken(token: string) {
  localStorage.setItem("crm_token", token);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { email: string; role: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  dashboard: () => request<StatMap>("/api/dashboard"),
  leads: () => request<Lead[]>("/api/leads"),
  conversations: () => request<Conversation[]>("/api/conversations"),
  messages: (conversationId: string) => request<Message[]>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, text: string) =>
    request(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  telegramStatus: () => request<{ status: string; qrCodeDataUrl?: string | null; username?: string | null }>("/api/telegram/status"),
  startQr: () => request<{ status: string; qrCodeDataUrl?: string | null }>("/api/telegram/qr/start", { method: "POST" }),
  campaigns: () => request<unknown[]>("/api/campaigns"),
  automations: () => request<unknown[]>("/api/automations"),
  templates: () => request<unknown[]>("/api/templates"),
  media: () => request<unknown[]>("/api/media"),
  purchases: () => request<unknown[]>("/api/purchases"),
  aiConfig: () => request<Record<string, unknown>>("/api/ai/config")
};
