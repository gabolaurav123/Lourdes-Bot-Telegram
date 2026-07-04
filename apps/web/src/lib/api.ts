export type StatMap = Record<string, number | string>;

export type Lead = {
  id: string;
  name: string;
  username?: string | null;
  phone?: string | null;
  source?: string | null;
  status: string;
  optInCommercial: boolean;
  ageConfirmed: boolean;
  followUpAllowed: boolean;
  aiEnabled?: boolean;
  notes?: string | null;
  userWroteFirst?: boolean;
  conversationActive?: boolean;
  totalSpent: number | string;
  lastInboundMessage?: string | null;
  lastInteractionAt?: string | null;
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
  mediaAsset?: MediaAsset | null;
  createdAt: string;
  aiGenerated?: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  message: string;
  imageId?: string | null;
  link?: string | null;
  sendTime?: string | null;
  dailyLimit: number;
  pauseSeconds: number;
  sensitive: boolean;
  startAt?: string | null;
  _count?: { recipients: number };
};

export type Automation = {
  id: string;
  name: string;
  status: string;
  trigger: string;
  delaySeconds: number;
  action: string;
  actionPayload: Record<string, unknown>;
  executionLimit?: number;
  sensitive: boolean;
  allowRepeat: boolean;
  _count?: { runs: number };
};

export type Template = {
  id: string;
  name: string;
  category: string;
  text: string;
  active: boolean;
  imageId?: string | null;
};

export type MediaAsset = {
  id: string;
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type Purchase = {
  id: string;
  amount: string | number;
  paymentMethod: string;
  plan: string;
  notes?: string | null;
  status: string;
  createdAt: string;
  lead?: Lead;
};

export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

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

export function clearToken() {
  localStorage.removeItem("crm_token");
}

export function mediaUrl(url?: string | null) {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(init.headers ?? {})
      }
    });
  } catch {
    throw new Error("No se pudo conectar con la API. Revisa VITE_API_URL en la web y APP_URL/CORS_ORIGINS en la API.");
  }
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { email: string; role: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () => request<{ user: { id: string; email: string; role: string } }>("/api/auth/me"),
  dashboard: () => request<StatMap>("/api/dashboard"),
  leads: () => request<Lead[]>("/api/leads"),
  updateLead: (id: string, payload: Record<string, unknown>) => request<Lead>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  conversations: () => request<Conversation[]>("/api/conversations"),
  messages: (conversationId: string) => request<Message[]>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, text: string) =>
    request(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),
  telegramStatus: () => request<{ status: string; qrCodeDataUrl?: string | null; username?: string | null }>("/api/telegram/status"),
  startQr: () => request<{ status: string; qrCodeDataUrl?: string | null }>("/api/telegram/qr/start", { method: "POST" }),
  syncTelegram: (limit = 1000) => request<{ count: number }>("/api/telegram/sync", { method: "POST", body: JSON.stringify({ limit }) }),
  logoutTelegram: () => request<{ ok: boolean }>("/api/telegram/logout", { method: "POST" }),
  resetTelegramCrm: () => request<{ ok: boolean; deleted: Record<string, number> }>("/api/telegram/reset", { method: "POST", body: JSON.stringify({ confirm: "REINICIAR" }) }),
  campaigns: () => request<Campaign[]>("/api/campaigns"),
  createCampaign: (payload: Record<string, unknown>) => request<Campaign>("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }),
  activateCampaign: (id: string) => request<Campaign>(`/api/campaigns/${id}/activate`, { method: "POST" }),
  pauseCampaign: (id: string) => request<Campaign>(`/api/campaigns/${id}/pause`, { method: "POST" }),
  deleteCampaign: (id: string) => request(`/api/campaigns/${id}`, { method: "DELETE" }),
  previewCampaign: (id: string) => request<{ count: number; sample: Lead[] }>(`/api/campaigns/${id}/preview`),
  automations: () => request<Automation[]>("/api/automations"),
  createAutomation: (payload: Record<string, unknown>) => request<Automation>("/api/automations", { method: "POST", body: JSON.stringify(payload) }),
  updateAutomation: (id: string, payload: Record<string, unknown>) => request<Automation>(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAutomation: (id: string) => request(`/api/automations/${id}`, { method: "DELETE" }),
  templates: () => request<Template[]>("/api/templates"),
  createTemplate: (payload: Record<string, unknown>) => request<Template>("/api/templates", { method: "POST", body: JSON.stringify(payload) }),
  updateTemplate: (id: string, payload: Record<string, unknown>) => request<Template>(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTemplate: (id: string) => request(`/api/templates/${id}`, { method: "DELETE" }),
  media: () => request<MediaAsset[]>("/api/media"),
  uploadMedia: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<MediaAsset>("/api/media", { method: "POST", body });
  },
  deleteMedia: (id: string) => request(`/api/media/${id}`, { method: "DELETE" }),
  purchases: () => request<Purchase[]>("/api/purchases"),
  createPurchase: (payload: Record<string, unknown>) => request<Purchase>("/api/purchases", { method: "POST", body: JSON.stringify(payload) }),
  updatePurchase: (id: string, status: string) => request<Purchase>(`/api/purchases/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  aiConfig: () => request<Record<string, unknown>>("/api/ai/config"),
  updateAiConfig: (payload: Record<string, unknown>) => request<Record<string, unknown>>("/api/ai/config", { method: "PUT", body: JSON.stringify(payload) })
};
