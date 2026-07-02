export type StatMap = Record<string, number | string>;

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export function getToken() {
  return localStorage.getItem("crm_token") ?? "";
}

export function setToken(token: string) {
  localStorage.setItem("crm_token", token);
}

async function request<T>(path: string, init: RequestInit = {}, fallback?: T): Promise<T> {
  try {
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
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

export const demoStats: StatMap = {
  totalLeads: 128,
  newToday: 12,
  activeConversations: 34,
  optIn: 88,
  noOptIn: 40,
  ageConfirmed: 61,
  sentToday: 96,
  receivedToday: 143,
  aiToday: 27,
  activeCampaigns: 2,
  activeAutomations: 6,
  purchasesToday: 5,
  estimatedRevenue: 430,
  stopLeads: 7,
  failedMessages: 1
};

export const demoLeads = [
  {
    id: "lead_1",
    name: "Valeria S.",
    username: "vale_s",
    status: "CALIENTE",
    optInCommercial: true,
    ageConfirmed: true,
    followUpAllowed: true,
    totalSpent: 120,
    lastInboundMessage: "Me pasas precio?",
    tags: [{ tag: { name: "precio", color: "#d97706" } }]
  },
  {
    id: "lead_2",
    name: "Marco R.",
    username: "marco_r",
    status: "INTERESADO",
    optInCommercial: true,
    ageConfirmed: false,
    followUpAllowed: true,
    totalSpent: 0,
    lastInboundMessage: "Quiero info",
    tags: [{ tag: { name: "revision", color: "#7c3aed" } }]
  },
  {
    id: "lead_3",
    name: "Dani",
    username: "daniv",
    status: "NO_VOLVER_A_ESCRIBIR",
    optInCommercial: false,
    ageConfirmed: false,
    followUpAllowed: false,
    totalSpent: 0,
    lastInboundMessage: "No me escribas",
    tags: []
  }
];

export const demoConversations = [
  {
    id: "conv_1",
    name: "Valeria S.",
    type: "PRIVATE",
    lastMessage: "Me pasas precio?",
    unreadCount: 2,
    responded: false,
    conversationActive: true,
    lastMessageAt: new Date().toISOString(),
    lead: demoLeads[0]
  },
  {
    id: "conv_2",
    name: "Marco R.",
    type: "PRIVATE",
    lastMessage: "Quiero info",
    unreadCount: 0,
    responded: true,
    conversationActive: true,
    lastMessageAt: new Date(Date.now() - 3600_000).toISOString(),
    lead: demoLeads[1]
  }
];

export const demoMessages = [
  { id: "m1", direction: "INBOUND", body: "Hola, quiero info", createdAt: new Date(Date.now() - 3600_000).toISOString() },
  { id: "m2", direction: "OUTBOUND", body: "Hola :) antes de pasarte la info, me confirmas que eres mayor de edad?", createdAt: new Date(Date.now() - 3300_000).toISOString(), aiGenerated: true },
  { id: "m3", direction: "INBOUND", body: "Si, soy mayor. Me pasas precio?", createdAt: new Date().toISOString() }
];

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { email: string; role: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  dashboard: () => request<StatMap>("/api/dashboard", {}, demoStats),
  leads: () => request<typeof demoLeads>("/api/leads", {}, demoLeads),
  conversations: () => request<typeof demoConversations>("/api/conversations", {}, demoConversations),
  messages: (conversationId: string) => request<typeof demoMessages>(`/api/conversations/${conversationId}/messages`, {}, demoMessages),
  sendMessage: (conversationId: string, text: string) =>
    request(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  telegramStatus: () => request<{ status: string; qrCodeDataUrl?: string | null; username?: string | null }>("/api/telegram/status", {}, { status: "DISCONNECTED" }),
  startQr: () => request<{ status: string; qrCodeDataUrl?: string | null }>("/api/telegram/qr/start", { method: "POST" }, { status: "QR_PENDING" }),
  campaigns: () => request<unknown[]>("/api/campaigns", {}, []),
  automations: () => request<unknown[]>("/api/automations", {}, []),
  templates: () => request<unknown[]>("/api/templates", {}, []),
  media: () => request<unknown[]>("/api/media", {}, []),
  purchases: () => request<unknown[]>("/api/purchases", {}, []),
  aiConfig: () => request<Record<string, unknown>>("/api/ai/config", {}, { model: "gpt-4.1-mini", globalEnabled: false })
};
