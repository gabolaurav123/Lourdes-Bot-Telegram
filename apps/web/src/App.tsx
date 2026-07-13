import { useEffect, useMemo, useState, type FormEvent } from "react";
import clsx from "clsx";
import {
  Activity,
  ArchiveX,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  GalleryHorizontalEnd,
  Image,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  QrCode,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Trash2,
  Upload,
  UserRoundCheck,
  UsersRound,
  WandSparkles,
  Workflow,
  X
} from "lucide-react";
import {
  api,
  clearToken,
  emptyStats,
  getToken,
  mediaUrl,
  setToken,
  type Automation,
  type Campaign,
  type Conversation,
  type Lead,
  type MediaAsset,
  type Message,
  type Purchase,
  type StatMap,
  type SystemStatus,
  type Template
} from "./lib/api";
import { StatCard } from "./components/StatCard";

type IconType = typeof LayoutDashboard;
type Section = "dashboard" | "inbox" | "leads" | "campaigns" | "automations" | "templates" | "media" | "purchases" | "settings";
type TelegramStatus = { status: string; qrCodeDataUrl?: string | null; username?: string | null };
type AiConfig = Record<string, unknown> & {
  model?: string;
  promptBase?: string;
  temperature?: number;
  maxTokens?: number;
  tone?: string;
  maxChars?: number;
  globalEnabled?: boolean;
  encryptedApiKey?: boolean;
  allowedHours?: { start?: string; end?: string; timezone?: string };
  forbiddenWords?: string[];
};

const emptySystemStatus: SystemStatus = {
  worker: { online: false, state: "OFFLINE" },
  telegram: { configured: false, connected: false, status: "DISCONNECTED" },
  openai: { configured: false, enabled: false, model: "gpt-4.1-mini" }
};

const sections: { id: Section; label: string; icon: IconType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "leads", label: "Leads", icon: UsersRound },
  { id: "campaigns", label: "Campanas", icon: Send },
  { id: "automations", label: "Automatizaciones", icon: Workflow },
  { id: "templates", label: "Plantillas", icon: MessageSquareText },
  { id: "media", label: "Media", icon: GalleryHorizontalEnd },
  { id: "purchases", label: "Compras", icon: ShoppingBag },
  { id: "settings", label: "Ajustes", icon: Settings }
];

const templateCategories = [
  "BIENVENIDA",
  "CONFIRMACION_EDAD",
  "PRECIO",
  "SEGUIMIENTO_24H",
  "SEGUIMIENTO_48H",
  "PROMO",
  "CIERRE_SUAVE",
  "POST_COMPRA",
  "NO_INTERESADO",
  "STOP"
];

const leadStatuses = [
  "NUEVO",
  "INTERESADO",
  "CALIENTE",
  "RESPONDIO",
  "PENDIENTE_PAGO",
  "COMPRO",
  "NO_INTERESADO",
  "NO_VOLVER_A_ESCRIBIR",
  "BLOQUEADO",
  "ERROR",
  "REQUIERE_REVISION_MANUAL"
];

const automationTriggers = [
  "NEW_MESSAGE_RECEIVED",
  "LEAD_CREATED",
  "LEAD_STATUS_CHANGED",
  "AGE_CONFIRMED",
  "PRICE_REQUESTED",
  "PRICE_SENT_NO_REPLY",
  "LEAD_IDLE_24H",
  "LEAD_IDLE_48H",
  "LEAD_STARTED_NO_PURCHASE",
  "PURCHASE_REGISTERED",
  "TAG_ADDED",
  "CAMPAIGN_RECEIVED",
  "STOP_REQUESTED"
];

const automationActions = [
  "SEND_MESSAGE",
  "SEND_IMAGE",
  "SEND_MESSAGE_IMAGE",
  "CHANGE_STATUS",
  "ADD_TAG",
  "REMOVE_TAG",
  "CREATE_INTERNAL_TASK",
  "NOTIFY_ADMIN",
  "STOP_AI",
  "STOP_AUTOMATIONS"
];

const campaignSegments = [
  { value: "optin", label: "Opt-in + permiso de seguimiento", segment: { optInCommercial: true } },
  { value: "adult", label: "Opt-in + seguimiento + mayor de edad", segment: { optInCommercial: true, ageConfirmed: true } },
  { value: "interested", label: "Interesados con opt-in", segment: { optInCommercial: true, status: "INTERESADO" } },
  { value: "hot", label: "Calientes con opt-in", segment: { optInCommercial: true, status: "CALIENTE" } },
  { value: "buyers", label: "Compradores con opt-in", segment: { optInCommercial: true, status: "COMPRO" } }
];

const excludedCampaignStatuses = ["NO_VOLVER_A_ESCRIBIR", "NO_INTERESADO", "BLOQUEADO", "ERROR"];

const templateVariables = ["nombre", "username", "precio", "plan", "link_pago", "link_bot", "fecha", "fuente"];

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado";
}

function formatMoney(value: number | string | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : "$0.00";
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function App() {
  const [authChecked, setAuthChecked] = useState(!getToken());
  const [tokenReady, setTokenReady] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  const [stats, setStats] = useState<StatMap>(emptyStats);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [aiConfig, setAiConfig] = useState<AiConfig>({});
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [telegram, setTelegram] = useState<TelegramStatus>({ status: "DISCONNECTED" });
  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(emptySystemStatus);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }

    api.me()
      .then(() => {
        if (active) setTokenReady(true);
      })
      .catch(() => {
        clearToken();
        if (active) setTokenReady(false);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function loadAll() {
    setLoadError("");
    try {
      const [dashboardStats, leadItems, conversationItems, telegramStatus, campaignItems, automationItems, templateItems, mediaItems, purchaseItems, aiSettings, currentSystemStatus] = await Promise.all([
        api.dashboard(),
        api.leads(),
        api.conversations(),
        api.telegramStatus(),
        api.campaigns(),
        api.automations(),
        api.templates(),
        api.media(),
        api.purchases(),
        api.aiConfig(),
        api.systemStatus()
      ]);

      setStats(dashboardStats);
      setLeads(leadItems);
      setConversations(conversationItems);
      setSelectedConversation((current) => {
        if (!conversationItems.length) return null;
        if (!current) return conversationItems[0];
        return conversationItems.find((conversation) => conversation.id === current.id) ?? conversationItems[0];
      });
      setTelegram(telegramStatus);
      setCampaigns(campaignItems);
      setAutomations(automationItems);
      setTemplates(templateItems);
      setMediaAssets(mediaItems);
      setPurchases(purchaseItems);
      setAiConfig(aiSettings);
      setSystemStatus(currentSystemStatus);
    } catch (error) {
      const detail = messageFromError(error);
      setStats(emptyStats);
      setLeads([]);
      setConversations([]);
      setSelectedConversation(null);
      setMessages([]);
      setLoadError(detail);
      if (detail.includes("401") || detail.includes("No autenticado") || detail.includes("Sesion invalida")) {
        clearToken();
        setTokenReady(false);
      }
    }
  }

  async function refreshLeadsAndConversations() {
    const [dashboardStats, leadItems, conversationItems] = await Promise.all([api.dashboard(), api.leads(), api.conversations()]);
    setStats(dashboardStats);
    setLeads(leadItems);
    setConversations(conversationItems);
    setSelectedConversation((current) => {
      if (!conversationItems.length) return null;
      if (!current) return conversationItems[0];
      return conversationItems.find((conversation) => conversation.id === current.id) ?? conversationItems[0];
    });
  }

  async function refreshCampaigns() {
    const [items, dashboardStats, currentSystemStatus] = await Promise.all([api.campaigns(), api.dashboard(), api.systemStatus()]);
    setCampaigns(items);
    setStats(dashboardStats);
    setSystemStatus(currentSystemStatus);
  }

  async function refreshAutomations() {
    setAutomations(await api.automations());
    setStats(await api.dashboard());
  }

  async function refreshTemplates() {
    setTemplates(await api.templates());
  }

  async function refreshMedia() {
    setMediaAssets(await api.media());
  }

  async function refreshPurchases() {
    setPurchases(await api.purchases());
    await refreshLeadsAndConversations();
  }

  async function pollTelegramStatus(times = 12) {
    for (let index = 0; index < times; index += 1) {
      await sleep(2500);
      const status = await api.telegramStatus();
      setTelegram(status);
      if (status.status === "CONNECTED" || status.status === "ERROR" || status.status === "EXPIRED") return;
    }
  }

  async function startTelegramQr() {
    try {
      setLoadError("");
      const status = await api.startQr();
      setTelegram(status);
      void pollTelegramStatus();
    } catch (error) {
      setLoadError(messageFromError(error));
    }
  }

  useEffect(() => {
    if (!tokenReady) return;
    void loadAll();
  }, [tokenReady]);

  useEffect(() => {
    if (!selectedConversation?.id) {
      setMessages([]);
      return;
    }
    void api.messages(selectedConversation.id).then(setMessages).catch(() => setMessages([]));
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!tokenReady || section !== "inbox") return;
    const conversationId = selectedConversation?.id;
    const refreshInbox = async () => {
      const [conversationItems, messageItems, currentSystemStatus] = await Promise.all([
        api.conversations(),
        conversationId ? api.messages(conversationId) : Promise.resolve([]),
        api.systemStatus()
      ]);
      setConversations(conversationItems);
      setMessages(messageItems);
      setSystemStatus(currentSystemStatus);
      setSelectedConversation((current) => current
        ? conversationItems.find((conversation) => conversation.id === current.id) ?? conversationItems[0] ?? null
        : conversationItems[0] ?? null);
    };
    const timer = window.setInterval(() => void refreshInbox().catch(() => undefined), 5_000);
    return () => window.clearInterval(timer);
  }, [section, selectedConversation?.id, tokenReady]);

  useEffect(() => {
    if (!tokenReady || (section !== "campaigns" && section !== "settings")) return;
    const timer = window.setInterval(() => {
      void Promise.all([api.campaigns(), api.systemStatus()])
        .then(([items, currentSystemStatus]) => {
          setCampaigns(items);
          setSystemStatus(currentSystemStatus);
        })
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [section, tokenReady]);

  if (!authChecked) {
    return (
      <main className="grid min-h-screen place-items-center bg-panel px-4 text-sm text-zinc-600">
        Verificando sesion...
      </main>
    );
  }

  if (!tokenReady) return <Login onReady={() => setTokenReady(true)} />;

  return (
    <div className="min-h-screen bg-panel text-ink">
      {mobileNavOpen && (
        <>
          <button className="fixed inset-0 z-30 bg-black/30 lg:hidden" aria-label="Cerrar menu" onClick={() => setMobileNavOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-line bg-white px-3 py-4 shadow-xl lg:hidden">
            <div className="flex h-12 items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-pine text-white"><MessageSquareText size={19} /></span>
                <div><p className="text-sm font-semibold">Telegram CRM</p><p className="text-xs text-zinc-500">Consent ops</p></div>
              </div>
              <button className="icon-button" title="Cerrar menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
            </div>
            <nav className="mt-5 space-y-1">
              {sections.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSection(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={clsx("flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium", section === item.id ? "bg-ink text-white" : "text-zinc-600 hover:bg-zinc-100")}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        </>
      )}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-white px-3 py-4 lg:block">
        <div className="flex h-12 items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-pine text-white">
            <MessageSquareText size={19} />
          </span>
          <div>
            <p className="text-sm font-semibold">Telegram CRM</p>
            <p className="text-xs text-zinc-500">Consent ops</p>
          </div>
        </div>
        <nav className="mt-5 space-y-1">
          {sections.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={clsx(
                "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                section === item.id ? "bg-ink text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-ink"
              )}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-4 left-3 right-3 rounded-lg border border-line bg-panel p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck size={16} className="text-pine" />
            Reglas activas
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600">
            <span className="rounded-md bg-white px-2 py-1">Opt-in</span>
            <span className="rounded-md bg-white px-2 py-1">Stop</span>
            <span className="rounded-md bg-white px-2 py-1">Edad</span>
            <span className="rounded-md bg-white px-2 py-1">Auditoria</span>
          </div>
        </div>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button className="grid h-9 w-9 place-items-center rounded-md border border-line lg:hidden" title="Abrir menu" onClick={() => setMobileNavOpen(true)}>
              <LayoutDashboard size={18} />
            </button>
            <div>
              <h1 className="text-lg font-semibold">{sections.find((item) => item.id === section)?.label}</h1>
              <p className="max-w-[170px] truncate text-xs text-zinc-500 sm:max-w-none">{telegram.status === "CONNECTED" ? `Telegram @${telegram.username ?? "conectado"}` : `Telegram ${telegram.status.toLowerCase()}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSection("settings")} className="icon-button" title="Ajustes">
              <Settings size={18} />
            </button>
            <button
              onClick={() => {
                clearToken();
                setTokenReady(false);
              }}
              className="icon-button"
              title="Cerrar sesion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="px-4 py-5 lg:px-7">
          {loadError && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
              <span>No se pudo cargar o guardar informacion real. Detalle: {loadError}</span>
              <button onClick={() => setLoadError("")} title="Cerrar"><X size={16} /></button>
            </div>
          )}

          {section === "dashboard" && <Dashboard stats={stats} leads={leads} telegram={telegram} onStartQr={startTelegramQr} />}
          {section === "inbox" && (
            <InboxView
              conversations={conversations}
              selected={selectedConversation}
              onSelect={setSelectedConversation}
              messages={messages}
              composer={composer}
              setComposer={setComposer}
              systemStatus={systemStatus}
               onSend={async (mediaAssetId, sensitive) => {
                 if ((!composer.trim() && !mediaAssetId) || !selectedConversation) return;
                 const text = composer.trim();
                 try {
                   await api.sendMessage(selectedConversation.id, text || undefined, mediaAssetId, sensitive);
                   setComposer("");
                   setMessages(await api.messages(selectedConversation.id));
                  await refreshLeadsAndConversations();
                } catch (error) {
                  setLoadError(messageFromError(error));
                }
              }}
               onUpdateLead={async (leadId, payload) => {
                await api.updateLead(leadId, payload);
                 await refreshLeadsAndConversations();
               }}
               onRetryMedia={async (messageId) => {
                 if (!selectedConversation) return;
                 await api.retryMessageMedia(selectedConversation.id, messageId);
                 setMessages(await api.messages(selectedConversation.id));
               }}
               onError={setLoadError}
            />
          )}
          {section === "leads" && <LeadsView leads={leads} search={search} setSearch={setSearch} onUpdateLead={async (id, payload) => {
            await api.updateLead(id, payload);
            await refreshLeadsAndConversations();
          }} />}
          {section === "campaigns" && <CampaignsView campaigns={campaigns} leads={leads} mediaAssets={mediaAssets} systemStatus={systemStatus} onReload={refreshCampaigns} onError={setLoadError} />}
          {section === "automations" && <AutomationsView automations={automations} mediaAssets={mediaAssets} onReload={refreshAutomations} onError={setLoadError} />}
          {section === "templates" && <TemplatesView templates={templates} mediaAssets={mediaAssets} onReload={refreshTemplates} onError={setLoadError} />}
          {section === "media" && <MediaView mediaAssets={mediaAssets} onReload={refreshMedia} onError={setLoadError} />}
          {section === "purchases" && <PurchasesView leads={leads} purchases={purchases} onReload={refreshPurchases} onError={setLoadError} />}
          {section === "settings" && (
            <SettingsView
              telegram={telegram}
              setTelegram={setTelegram}
              aiConfig={aiConfig}
              systemStatus={systemStatus}
              onStartQr={startTelegramQr}
              onReloadAi={async () => setAiConfig(await api.aiConfig())}
              onReloadAll={loadAll}
              onError={setLoadError}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Login({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login(email.trim(), password);
      setToken(result.token);
      onReady();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No se pudo iniciar sesion");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-panel px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
            <Lock size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Ingreso privado</h1>
            <p className="text-xs text-zinc-500">Solo usuarios configurados en el servidor</p>
          </div>
        </div>
        <label className="field-label">Email</label>
        <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" />
        <label className="field-label mt-3">Contrasena</label>
        <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} autoComplete="current-password" />
        {error && <p className="mt-3 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
        <button className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine text-sm font-semibold text-white">
          <KeyRound size={17} />
          Entrar
        </button>
      </form>
    </main>
  );
}

function Dashboard({ stats, leads, telegram, onStartQr }: { stats: StatMap; leads: Lead[]; telegram: TelegramStatus; onStartQr: () => Promise<void> }) {
  const countsByStatus = useMemo(() => {
    return leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [leads]);

  const statCards = [
    ["Total leads", stats.totalLeads, UsersRound, "pine"],
    ["Nuevos hoy", stats.newToday, UserRoundCheck, "amber"],
    ["Conversaciones", stats.activeConversations, Inbox, "ink"],
    ["Opt-in", stats.optIn, ShieldCheck, "pine"],
    ["IA hoy", stats.aiToday, Bot, "coral"],
    ["Campanas activas", stats.activeCampaigns, Send, "amber"],
    ["Compras hoy", stats.purchasesToday, CircleDollarSign, "pine"],
    ["Errores", stats.failedMessages, ArchiveX, "coral"]
  ] as const;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value, icon, tone]) => (
          <StatCard key={label} label={label} value={value ?? 0} icon={icon} tone={tone} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Embudo comercial real</h2>
            <Activity size={18} className="text-pine" />
          </div>
          {leads.length === 0 ? (
            <p className="mt-4 rounded-md bg-panel px-3 py-3 text-sm text-zinc-500">Todavia no hay leads reales sincronizados desde Telegram.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {Object.entries(countsByStatus).map(([status, count]) => (
                <div key={status} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{status}</span>
                    <ChevronRight size={16} className="text-zinc-400" />
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-zinc-100">
                    <div className="h-2 rounded-full bg-pine" style={{ width: `${Math.max(8, Math.min(100, (count / leads.length) * 100))}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{count} leads</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Telegram</h2>
            <QrCode size={18} className="text-pine" />
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="grid h-32 w-32 place-items-center rounded-lg border border-dashed border-line bg-panel">
              {telegram.qrCodeDataUrl ? <img src={telegram.qrCodeDataUrl} alt="QR Telegram" className="h-28 w-28" /> : <QrCode size={42} className="text-zinc-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <StatusBadge status={telegram.status} />
              <p className="mt-3 text-sm text-zinc-500">
                {telegram.status === "CONNECTED" ? `Cuenta conectada ${telegram.username ? `@${telegram.username}` : ""}` : "Genera el QR y escanealo desde Telegram movil."}
              </p>
              <button onClick={onStartQr} className="button-primary mt-4">
                <QrCode size={17} />
                Generar QR
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InboxView(props: {
  conversations: Conversation[];
  selected: Conversation | null;
  onSelect: (conversation: Conversation) => void;
  messages: Message[];
  composer: string;
  setComposer: (value: string) => void;
  systemStatus: SystemStatus;
  onSend: (mediaAssetId?: string, sensitive?: boolean) => Promise<void>;
  onUpdateLead: (leadId: string, payload: Record<string, unknown>) => Promise<void>;
  onRetryMedia: (messageId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const lead = props.selected?.lead ?? null;
  const [noteDraft, setNoteDraft] = useState("");
  const [attachedImage, setAttachedImage] = useState<MediaAsset | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sensitiveMessage, setSensitiveMessage] = useState(false);
  const aiStatus = !props.systemStatus.openai.configured
    ? "IA sin API key"
    : !props.systemStatus.openai.enabled
      ? "IA global apagada"
      : lead?.aiEnabled === false
        ? "IA pausada en este chat"
        : "IA automatica activa";
  const latestMissingMediaId = [...props.messages]
    .reverse()
    .find((message) => message.direction === "INBOUND" && !message.body && !message.mediaAsset)?.id;

  useEffect(() => {
    setNoteDraft(lead?.notes ?? "");
  }, [lead?.id, lead?.notes]);

  useEffect(() => {
    setAttachedImage(null);
    setSensitiveMessage(false);
  }, [props.selected?.id]);

  async function uploadImage(file?: File) {
    if (!file) return;
    setUploadingImage(true);
    try {
      setAttachedImage(await api.uploadMedia(file));
    } catch (error) {
      props.onError(messageFromError(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function removeAttachedImage() {
    if (!attachedImage) return;
    await api.deleteMedia(attachedImage.id).catch(() => undefined);
    setAttachedImage(null);
  }

  async function sendComposer() {
    await props.onSend(attachedImage?.id, sensitiveMessage);
    setAttachedImage(null);
    setSensitiveMessage(false);
  }

  return (
    <div className="grid gap-4 xl:h-[calc(100vh-116px)] xl:min-h-[640px] xl:grid-cols-[330px_1fr_340px]">
      <section className="max-h-80 overflow-hidden rounded-lg border border-line bg-white shadow-soft xl:max-h-none">
        <div className="border-b border-line p-3">
          <div className="flex items-center gap-2 rounded-md bg-panel px-3 py-2">
            <Search size={16} className="text-zinc-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar chat" />
          </div>
        </div>
        <div className="h-full overflow-y-auto">
          {props.conversations.length === 0 && (
            <div className="p-4 text-sm text-zinc-500">No hay conversaciones reales sincronizadas todavia.</div>
          )}
          {props.conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => props.onSelect(conversation)}
              className={clsx("flex w-full gap-3 border-b border-line p-3 text-left hover:bg-panel", props.selected?.id === conversation.id && "bg-panel")}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink text-sm font-semibold text-white">{(conversation.name || "?").slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{conversation.name}</span>
                  {conversation.unreadCount > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs text-white">{conversation.unreadCount}</span>}
                </span>
                <span className="mt-1 block truncate text-xs text-zinc-500">{conversation.lastMessage || "Sin mensajes guardados"}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-h-[640px] overflow-hidden rounded-lg border border-line bg-white shadow-soft xl:min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{props.selected?.name ?? "Selecciona una conversacion"}</h2>
              <p className="truncate text-xs text-zinc-500">{lead?.status ?? "Sin lead"} - {aiStatus}</p>
            </div>
            {lead && (
              <button
                className="button-secondary"
                onClick={() => props.onUpdateLead(lead.id, { aiEnabled: !lead.aiEnabled })}
                title="Activar o pausar IA para este lead"
              >
                <Bot size={17} />
                {lead.aiEnabled === false ? "Activar IA" : "Pausar IA"}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto bg-[#f6f7f4] p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {props.messages.length === 0 && <p className="rounded-md bg-white px-3 py-2 text-sm text-zinc-500 shadow-sm">No hay mensajes guardados para esta conversacion.</p>}
              {props.messages.map((message) => (
                <div key={message.id} className={clsx("max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm", message.direction === "OUTBOUND" ? "ml-auto bg-pine text-white" : "bg-white text-ink")}>
                  <MessageMediaPreview message={message} allowRetry={Boolean(message.error || message.id === latestMissingMediaId)} onRetry={async () => {
                    try {
                      await props.onRetryMedia(message.id);
                    } catch (error) {
                      props.onError(messageFromError(error));
                    }
                  }} />
                  {message.body && <p>{message.body}</p>}
                  {!message.body && !message.mediaAsset && !message.error && <p>[imagen]</p>}
                  {message.error && <p className={clsx("mt-1 text-xs", message.direction === "OUTBOUND" ? "text-white/80" : "text-coral")}>{message.error}</p>}
                  <div className={clsx("mt-1 flex items-center gap-1 text-[11px]", message.direction === "OUTBOUND" ? "text-white/70" : "text-zinc-400")}>
                    {message.aiGenerated && <WandSparkles size={12} />}
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-line bg-white p-3">
            {attachedImage && (
              <div className="mb-2 flex items-center gap-3 rounded-md border border-line bg-panel p-2">
                <img src={mediaUrl(attachedImage.url)} alt={attachedImage.originalName} className="h-14 w-14 rounded-md object-cover" />
                <p className="min-w-0 flex-1 truncate text-sm">{attachedImage.originalName}</p>
                <button type="button" className="icon-button" title="Quitar imagen" onClick={removeAttachedImage}><X size={16} /></button>
              </div>
            )}
            <label className="mb-2 flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={sensitiveMessage} onChange={(event) => setSensitiveMessage(event.target.checked)} />
              Contenido sensible (requiere mayoria de edad confirmada)
            </label>
            <div className="flex items-end gap-2">
              <label className="icon-button shrink-0 cursor-pointer" title="Adjuntar imagen">
                <Image size={18} />
                <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={!props.selected || uploadingImage} onChange={(event) => void uploadImage(event.target.files?.[0])} />
              </label>
              <textarea
                value={props.composer}
                onChange={(event) => props.setComposer(event.target.value)}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine"
                placeholder="Mensaje"
                disabled={!props.selected}
              />
              <button onClick={sendComposer} className="grid h-10 w-10 place-items-center rounded-md bg-pine text-white disabled:opacity-50" title="Enviar" disabled={!props.selected || (!props.composer.trim() && !attachedImage) || uploadingImage}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-y-auto rounded-lg border border-line bg-white p-4 shadow-soft">
        <h2 className="text-sm font-semibold">Lead</h2>
        {!lead ? (
          <p className="mt-4 rounded-md bg-panel px-3 py-3 text-sm text-zinc-500">Selecciona una conversacion con lead asociado.</p>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <LeadFlag label="Opt-in comercial" active={lead.optInCommercial} />
              <LeadFlag label="Mayor de edad" active={lead.ageConfirmed} />
              <LeadFlag label="Seguimiento" active={lead.followUpAllowed} />
              <LeadFlag label="IA activa" active={lead.aiEnabled !== false} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="button-secondary" onClick={() => props.onUpdateLead(lead.id, { status: "COMPRO" })}>
                <Check size={16} />
                Compro
              </button>
              <button className="button-secondary" onClick={() => props.onUpdateLead(lead.id, { status: "NO_VOLVER_A_ESCRIBIR", followUpAllowed: false, optInCommercial: false, aiEnabled: false })}>
                <ArchiveX size={16} />
                Stop
              </button>
            </div>
            <label className="field-label mt-5">Estado</label>
            <select className="field" value={lead.status} onChange={(event) => props.onUpdateLead(lead.id, { status: event.target.value })}>
              {leadStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <ToggleRow label="Opt-in comercial" checked={lead.optInCommercial} onChange={(value) => props.onUpdateLead(lead.id, { optInCommercial: value })} />
              <ToggleRow label="Mayor de edad confirmado" checked={lead.ageConfirmed} onChange={(value) => props.onUpdateLead(lead.id, { ageConfirmed: value })} />
              <ToggleRow label="Permite seguimiento" checked={lead.followUpAllowed} onChange={(value) => props.onUpdateLead(lead.id, { followUpAllowed: value })} />
            </div>
            <div className="mt-5">
              <label className="field-label">Notas internas</label>
              <textarea className="min-h-28 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
              <button className="button-secondary mt-2" onClick={() => props.onUpdateLead(lead.id, { notes: noteDraft })}>
                <Save size={16} />
                Guardar notas
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MessageMediaPreview({ message, allowRetry, onRetry }: { message: Message; allowRetry: boolean; onRetry: () => Promise<void> }) {
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const canRetry = allowRetry && message.direction === "INBOUND" && (!message.mediaAsset || failed);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
      setFailed(false);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      {message.mediaAsset && !failed && (
        <img
          src={mediaUrl(message.mediaAsset.url)}
          alt={message.mediaAsset.originalName}
          className="mb-2 max-h-64 rounded-md object-contain"
          onError={() => setFailed(true)}
        />
      )}
      {failed && <p className="mb-2 text-xs text-coral">La imagen temporal no esta disponible.</p>}
      {canRetry && (
        <button type="button" className="mb-2 text-xs font-semibold underline disabled:opacity-50" disabled={retrying} onClick={() => void retry()}>
          {retrying ? "Recuperando imagen..." : "Volver a cargar imagen"}
        </button>
      )}
    </>
  );
}

function LeadFlag({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className={clsx("h-2.5 w-2.5 rounded-full", active ? "bg-pine" : "bg-zinc-300")} />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function LeadsView({ leads, search, setSearch, onUpdateLead }: { leads: Lead[]; search: string; setSearch: (value: string) => void; onUpdateLead: (id: string, payload: Record<string, unknown>) => Promise<void> }) {
  const filtered = useMemo(
    () => leads.filter((lead) => `${lead.name} ${lead.username ?? ""} ${lead.status}`.toLowerCase().includes(search.toLowerCase())),
    [leads, search]
  );
  const consentCount = leads.filter((lead) => lead.optInCommercial && lead.followUpAllowed).length;

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex min-w-72 items-center gap-2 rounded-md bg-panel px-3 py-2">
          <Search size={16} className="text-zinc-400" />
          <input className="w-full bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead" />
        </div>
        <div className="text-right text-sm text-zinc-500">
          <p>{filtered.length} leads reales</p>
          <p>{consentCount} con opt-in y seguimiento</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Consentimiento</th>
              <th className="px-4 py-3">Etiquetas</th>
              <th className="px-4 py-3">Ultimo mensaje</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td className="px-4 py-5 text-zinc-500" colSpan={7}>No hay leads reales para mostrar.</td></tr>
            )}
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-medium">{lead.name}</p>
                  <p className="text-xs text-zinc-500">{lead.username ? `@${lead.username}` : "sin username"}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {lead.optInCommercial && <MiniBadge label="Opt-in" />}
                    {lead.ageConfirmed && <MiniBadge label="Edad" />}
                    {lead.followUpAllowed && <MiniBadge label="Follow" />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {lead.tags.map(({ tag }) => <MiniBadge key={tag.name} label={tag.name} color={tag.color} />)}
                  </div>
                </td>
                <td className="max-w-sm truncate px-4 py-3 text-zinc-600">{lead.lastInboundMessage || "-"}</td>
                <td className="px-4 py-3">{formatMoney(lead.totalSpent)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="button-secondary" onClick={() => onUpdateLead(lead.id, { optInCommercial: true, followUpAllowed: true })}>Consentimiento</button>
                    <button className="button-secondary" onClick={() => onUpdateLead(lead.id, { ageConfirmed: true })}>Edad</button>
                    <button className="button-secondary" onClick={() => onUpdateLead(lead.id, { status: "CALIENTE" })}>Caliente</button>
                    <button className="button-secondary" onClick={() => onUpdateLead(lead.id, { status: "NO_VOLVER_A_ESCRIBIR", followUpAllowed: false, optInCommercial: false, aiEnabled: false })}>Stop</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CampaignsView({ campaigns, leads, mediaAssets, systemStatus, onReload, onError }: { campaigns: Campaign[]; leads: Lead[]; mediaAssets: MediaAsset[]; systemStatus: SystemStatus; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    segment: "optin",
    message: "",
    imageId: "",
    link: "",
    startAt: "",
    sendTime: "10:00",
    dailyLimit: "50",
    pauseSeconds: "90",
    sensitive: false
  });
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [attachedImage, setAttachedImage] = useState<MediaAsset | null>(null);
  const selectedSegment = campaignSegments.find((item) => item.value === form.segment) ?? campaignSegments[0];
  const selectedImage = attachedImage?.id === form.imageId ? attachedImage : mediaAssets.find((asset) => asset.id === form.imageId) ?? null;
  const leadCounts = useMemo(() => {
    const optIn = leads.filter((lead) => lead.optInCommercial).length;
    const followUp = leads.filter((lead) => lead.followUpAllowed).length;
    const eligible = leads.filter((lead) => {
      if (!lead.optInCommercial || !lead.followUpAllowed) return false;
      if (excludedCampaignStatuses.includes(lead.status)) return false;
      if (!lead.userWroteFirst && !lead.conversationActive) return false;
      if (selectedSegment.segment.status && lead.status !== selectedSegment.segment.status) return false;
      if (selectedSegment.segment.ageConfirmed && !lead.ageConfirmed) return false;
      if (form.sensitive && !lead.ageConfirmed) return false;
      return true;
    }).length;

    return { total: leads.length, optIn, followUp, eligible };
  }, [form.sensitive, leads, selectedSegment]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) {
      onError("El nombre de la campana debe tener al menos 2 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        description: form.description.trim() || undefined,
        segment: selectedSegment.segment,
        message: form.message,
        imageId: form.imageId || (editingId ? null : undefined),
        link: form.link.trim(),
        startAt: form.startAt ? new Date(form.startAt).toISOString() : (editingId ? null : undefined),
        sendTime: form.sendTime,
        dailyLimit: Number(form.dailyLimit),
        pauseSeconds: Number(form.pauseSeconds),
        sensitive: form.sensitive
      };
      if (editingId) await api.updateCampaign(editingId, payload);
      else await api.createCampaign(payload);
      setEditingId(null);
      setForm((current) => ({ ...current, name: "", description: "", message: "", imageId: "", link: "", startAt: "" }));
      setAttachedImage(null);
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    } finally {
      setSaving(false);
    }
  }

  function editCampaign(campaign: Campaign) {
    const segment = campaign.segment ?? {};
    const segmentKey = campaignSegments.find((item) => {
      return item.segment.status === segment.status && Boolean(item.segment.ageConfirmed) === Boolean(segment.ageConfirmed);
    })?.value ?? "optin";
    setEditingId(campaign.id);
    setAttachedImage(null);
    setForm({
      name: campaign.name,
      description: campaign.description ?? "",
      segment: segmentKey,
      message: campaign.message,
      imageId: campaign.imageId ?? "",
      link: campaign.link ?? "",
      startAt: toLocalDateTimeInput(campaign.startAt),
      sendTime: campaign.sendTime ?? "10:00",
      dailyLimit: String(campaign.dailyLimit),
      pauseSeconds: String(campaign.pauseSeconds),
      sensitive: campaign.sensitive
    });
  }

  async function runAction(action: () => Promise<unknown>) {
    try {
      await action();
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  async function uploadCampaignImage(file: File | undefined) {
    if (!file) return;
    try {
      const asset = await api.uploadMedia(file);
      setAttachedImage(asset);
      setForm((current) => ({ ...current, imageId: asset.id }));
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  async function removeCampaignImage() {
    const uploadedHere = attachedImage?.id === form.imageId ? attachedImage : null;
    try {
      if (uploadedHere) await api.deleteMedia(uploadedHere.id);
      setAttachedImage(null);
      setForm((current) => ({ ...current, imageId: "" }));
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  return (
    <section className="space-y-4">
      <div className={clsx(
        "grid gap-3 rounded-lg border px-4 py-3 text-sm md:grid-cols-3",
        systemStatus.worker.online && systemStatus.telegram.connected ? "border-pine/30 bg-pine/5" : "border-coral/30 bg-coral/5"
      )}>
        <div><span className="text-xs font-semibold uppercase text-zinc-500">Worker</span><p className="mt-1 font-medium">{systemStatus.worker.online ? "Activo y procesando" : "Apagado o sin conexion"}</p></div>
        <div><span className="text-xs font-semibold uppercase text-zinc-500">Telegram</span><p className="mt-1 font-medium">{systemStatus.telegram.connected ? "Cuenta conectada" : `No conectado (${systemStatus.telegram.status})`}</p></div>
        <div><span className="text-xs font-semibold uppercase text-zinc-500">Ultimo proceso</span><p className="mt-1 font-medium">{systemStatus.worker.lastSuccessAt ? new Date(systemStatus.worker.lastSuccessAt).toLocaleString() : "Sin actividad registrada"}</p></div>
        {systemStatus.worker.lastError && <p className="md:col-span-3 text-coral">Error del worker: {systemStatus.worker.lastError}</p>}
        {!systemStatus.worker.online && !systemStatus.worker.lastError && <p className="md:col-span-3 text-coral">El servicio Worker no ha enviado actividad. Debe desplegarse con la misma version del repositorio que la API y la Web.</p>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
      <form onSubmit={submit} className="order-2 rounded-lg border border-line bg-white p-4 shadow-soft xl:order-1">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-pine/10 text-pine"><Send size={18} /></span>
          <h2 className="text-sm font-semibold">{editingId ? "Editar campana" : "Nueva campana permitida"}</h2>
        </div>
        <label className="field-label mt-4">Nombre</label>
        <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} />
        <label className="field-label mt-3">Descripcion</label>
        <input className="field" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <label className="field-label mt-3">Segmento</label>
        <select className="field" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })}>
          {campaignSegments.map((segment) => <option key={segment.value} value={segment.value}>{segment.label}</option>)}
        </select>
        <div className="mt-3 rounded-md border border-line bg-panel p-3 text-sm text-zinc-600">
          <div className="grid grid-cols-2 gap-2">
            <span>Total leads: <strong>{leadCounts.total}</strong></span>
            <span>Opt-in: <strong>{leadCounts.optIn}</strong></span>
            <span>Seguimiento: <strong>{leadCounts.followUp}</strong></span>
            <span>Elegibles: <strong>{leadCounts.eligible}</strong></span>
          </div>
          <p className="mt-2 text-xs">Las campanas no usan todos los chats: solo leads con opt-in, permiso de seguimiento, conversacion valida y sin estado excluido.</p>
        </div>
        <label className="field-label mt-3">Mensaje</label>
        <textarea className="min-h-32 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label>
            <span className="field-label">Imagen opcional</span>
            <select className="field" value={form.imageId} onChange={(event) => setForm({ ...form, imageId: event.target.value })}>
              <option value="">Sin imagen</option>
              {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Inicio programado</span>
            <input className="field" type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} />
          </label>
          <label>
            <span className="field-label">Hora del siguiente dia</span>
            <input className="field" type="time" value={form.sendTime} onChange={(event) => setForm({ ...form, sendTime: event.target.value })} />
          </label>
          <label>
            <span className="field-label">Limite diario</span>
            <input className="field" type="number" min={1} max={500} value={form.dailyLimit} onChange={(event) => setForm({ ...form, dailyLimit: event.target.value })} />
          </label>
          <label>
            <span className="field-label">Pausa segundos</span>
            <input className="field" type="number" min={30} max={3600} value={form.pauseSeconds} onChange={(event) => setForm({ ...form, pauseSeconds: event.target.value })} />
          </label>
        </div>
        <div className="mt-3 rounded-md border border-line p-3">
          {selectedImage ? (
            <div className="flex gap-3">
              <img src={mediaUrl(selectedImage.url)} alt={selectedImage.originalName} className="h-20 w-20 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{selectedImage.originalName}</p>
                <p className="text-xs text-zinc-500">{Math.round(selectedImage.sizeBytes / 1024)} KB</p>
                <button type="button" className="button-secondary mt-2" onClick={removeCampaignImage}>
                  <Trash2 size={16} />
                  Quitar imagen
                </button>
              </div>
            </div>
          ) : (
            <label className="button-secondary inline-flex cursor-pointer">
              <Upload size={16} />
              Subir imagen de campana
              <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadCampaignImage(event.target.files?.[0])} />
            </label>
          )}
        </div>
        <label className="field-label mt-3">Link opcional</label>
        <input className="field" value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} placeholder="https://..." />
        <label className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
          <input type="checkbox" checked={form.sensitive} onChange={(event) => setForm({ ...form, sensitive: event.target.checked })} />
          Requiere mayoria de edad confirmada
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="button-primary" disabled={saving}>
            {editingId ? <Save size={17} /> : <Plus size={17} />}
            {editingId ? "Guardar cambios" : "Crear campana"}
          </button>
          {editingId && (
            <button type="button" className="button-secondary" onClick={() => {
              setEditingId(null);
              setAttachedImage(null);
              setForm((current) => ({ ...current, name: "", description: "", message: "", imageId: "", link: "", startAt: "" }));
            }}>
              <X size={16} />
              Cancelar edicion
            </button>
          )}
        </div>
      </form>

      <div className="order-1 space-y-2 xl:order-2">
        {campaigns.length === 0 && <EmptyState text="No hay campanas reales creadas." />}
        {campaigns.map((campaign) => {
          const progress = campaign.progress ?? {};
          const pending = Number(progress.pending ?? 0);
          const processing = Number(progress.processing ?? 0);
          const sent = Number(progress.sent ?? 0);
          const failed = Number(progress.failed ?? 0);
          const skipped = Number(progress.skipped ?? 0);
          const total = campaign._count?.recipients ?? pending + processing + sent + failed + skipped;
          const completed = sent + failed + skipped;
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
          const canPause = campaign.status === "ACTIVE" || campaign.status === "SCHEDULED";
          const canActivate = campaign.status === "DRAFT" || campaign.status === "PAUSED" || (campaign.status === "FINISHED" && failed > 0);

          return <div key={campaign.id} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{campaign.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{campaign.description || "Sin descripcion"} - {total} destinatarios preparados</p>
              </div>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-panel px-3 py-2 text-sm text-zinc-700">{campaign.message}</p>
            <div className="mt-3">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-600">
                <span>{percent}% completado</span>
                <span>{sent} enviados - {pending + processing} pendientes - {failed} fallidos - {skipped} omitidos</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-100">
                <div className="h-full bg-pine transition-all" style={{ width: `${percent}%` }} />
              </div>
            </div>
            {preview[campaign.id] && <p className="mt-2 text-sm text-pine">{preview[campaign.id]}</p>}
            {campaign.recentErrors && campaign.recentErrors.length > 0 && (
              <details className="mt-3 rounded-md border border-coral/20 bg-coral/5 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-coral">Ver errores de envio ({failed})</summary>
                <div className="mt-2 space-y-2">
                  {campaign.recentErrors.map((item) => (
                    <div key={`${item.lead.id}-${item.lastAttemptAt ?? item.attempts}`} className="border-t border-coral/10 pt-2">
                      <p className="font-medium">{item.lead.name} - {item.attempts} intentos</p>
                      <p className="mt-1 break-words text-xs text-zinc-600">{item.error || "Error sin detalle"}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="button-secondary" disabled={canPause} onClick={() => editCampaign(campaign)}>
                <Save size={16} />
                Editar
              </button>
              <button className="button-secondary" onClick={() => runAction(async () => {
                const result = await api.previewCampaign(campaign.id);
                setPreview((current) => ({ ...current, [campaign.id]: `${result.count} leads elegibles para esta campana.` }));
              })}>
                <Search size={16} />
                Vista previa
              </button>
              <button className="button-secondary" disabled={!canActivate} onClick={() => runAction(() => api.activateCampaign(campaign.id))}>
                <Play size={16} />
                {failed > 0 && campaign.status === "FINISHED" ? "Reintentar fallidos" : "Activar"}
              </button>
              <button className="button-secondary" disabled={!canPause} onClick={() => runAction(() => api.pauseCampaign(campaign.id))}>
                <Pause size={16} />
                Pausar
              </button>
              <button className="button-secondary" disabled={pending === 0} onClick={() => window.confirm("Cancelar todos los envios pendientes de esta campana?") && runAction(() => api.cancelPendingCampaign(campaign.id))}>
                <ArchiveX size={16} />
                Cancelar pendientes
              </button>
              <button className="button-secondary" onClick={() => window.confirm("Eliminar campana?") && runAction(() => api.deleteCampaign(campaign.id))}>
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </div>;
        })}
      </div>
      </div>
    </section>
  );
}

function AutomationsView({ automations, mediaAssets, onReload, onError }: { automations: Automation[]; mediaAssets: MediaAsset[]; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    trigger: "NEW_MESSAGE_RECEIVED",
    delaySeconds: "0",
    action: "SEND_MESSAGE",
    text: "",
    status: "INTERESADO",
    tag: "",
    imageId: "",
    executionLimit: "1",
    sensitive: false,
    allowRepeat: false
  });

  function actionPayload() {
    if (form.action === "CHANGE_STATUS") return { status: form.status };
    if (form.action === "ADD_TAG" || form.action === "REMOVE_TAG") return { tag: form.tag };
    if (form.action === "SEND_IMAGE") return { mediaAssetId: form.imageId };
    if (form.action === "SEND_MESSAGE_IMAGE") return { text: form.text, mediaAssetId: form.imageId };
    return { text: form.text };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = {
        name: form.name.trim(),
        trigger: form.trigger,
        conditions: {},
        delaySeconds: Number(form.delaySeconds),
        action: form.action,
        actionPayload: actionPayload(),
        executionLimit: Number(form.executionLimit),
        segment: {},
        priority: 0,
        sensitive: form.sensitive,
        allowRepeat: form.allowRepeat
      };
      if (editingId) await api.updateAutomation(editingId, payload);
      else await api.createAutomation(payload);
      setEditingId(null);
      setForm((current) => ({ ...current, name: "", text: "", tag: "", imageId: "" }));
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  function editAutomation(automation: Automation) {
    const payload = automation.actionPayload ?? {};
    setEditingId(automation.id);
    setForm({
      name: automation.name,
      trigger: automation.trigger,
      delaySeconds: String(automation.delaySeconds),
      action: automation.action,
      text: String(payload.text ?? ""),
      status: String(payload.status ?? "INTERESADO"),
      tag: String(payload.tag ?? ""),
      imageId: String(payload.mediaAssetId ?? ""),
      executionLimit: String(automation.executionLimit ?? 1),
      sensitive: automation.sensitive,
      allowRepeat: automation.allowRepeat
    });
  }

  async function runAction(action: () => Promise<unknown>) {
    try {
      await action();
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[430px_1fr]">
      <form onSubmit={submit} className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-pine/10 text-pine"><Workflow size={18} /></span>
          <h2 className="text-sm font-semibold">Crear regla</h2>
        </div>
        <label className="field-label mt-4">Nombre</label>
        <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <label className="field-label mt-3">Trigger</label>
        <select className="field" value={form.trigger} onChange={(event) => setForm({ ...form, trigger: event.target.value })}>
          {automationTriggers.map((trigger) => <option key={trigger}>{trigger}</option>)}
        </select>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label>
            <span className="field-label">Delay segundos</span>
            <input className="field" type="number" min={0} value={form.delaySeconds} onChange={(event) => setForm({ ...form, delaySeconds: event.target.value })} />
          </label>
          <label>
            <span className="field-label">Limite ejecucion</span>
            <input className="field" type="number" min={1} value={form.executionLimit} onChange={(event) => setForm({ ...form, executionLimit: event.target.value })} />
          </label>
        </div>
        <label className="field-label mt-3">Accion</label>
        <select className="field" value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })}>
          {automationActions.map((action) => <option key={action}>{action}</option>)}
        </select>
        {(["SEND_MESSAGE", "SEND_MESSAGE_IMAGE", "CREATE_INTERNAL_TASK", "NOTIFY_ADMIN"].includes(form.action)) && (
          <>
            <label className="field-label mt-3">Mensaje</label>
            <textarea className="min-h-28 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} />
          </>
        )}
        {(form.action === "SEND_IMAGE" || form.action === "SEND_MESSAGE_IMAGE") && (
          <>
            <label className="field-label mt-3">Imagen</label>
            <select className="field" value={form.imageId} onChange={(event) => setForm({ ...form, imageId: event.target.value })}>
              <option value="">Selecciona imagen</option>
              {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
            </select>
          </>
        )}
        {form.action === "CHANGE_STATUS" && (
          <>
            <label className="field-label mt-3">Nuevo estado</label>
            <select className="field" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {leadStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </>
        )}
        {(form.action === "ADD_TAG" || form.action === "REMOVE_TAG") && (
          <>
            <label className="field-label mt-3">Etiqueta</label>
            <input className="field" value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} />
          </>
        )}
        <div className="mt-3 grid gap-2">
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <input type="checkbox" checked={form.sensitive} onChange={(event) => setForm({ ...form, sensitive: event.target.checked })} />
            Requiere mayoria de edad si el mensaje es sensible
          </label>
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <input type="checkbox" checked={form.allowRepeat} onChange={(event) => setForm({ ...form, allowRepeat: event.target.checked })} />
            Permitir repetir en el mismo lead
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="button-primary">
            {editingId ? <Save size={17} /> : <Plus size={17} />}
            {editingId ? "Guardar cambios" : "Crear regla"}
          </button>
          {editingId && (
            <button type="button" className="button-secondary" onClick={() => {
              setEditingId(null);
              setForm((current) => ({ ...current, name: "", text: "", tag: "", imageId: "" }));
            }}>
              <X size={16} />
              Cancelar edicion
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {automations.length === 0 && <EmptyState text="No hay automatizaciones reales creadas." />}
        {automations.map((automation) => (
          <div key={automation.id} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{automation.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{automation.trigger} - delay {automation.delaySeconds}s - {automation.action}</p>
                <p className="mt-1 text-xs text-zinc-500">{Number(automation.progress?.executed ?? 0)} ejecutadas - {Number(automation.progress?.scheduled ?? 0)} programadas - {Number(automation.progress?.failed ?? 0)} fallidas</p>
              </div>
              <StatusBadge status={automation.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="button-secondary" onClick={() => editAutomation(automation)}>
                <Save size={16} />
                Editar
              </button>
              <button className="button-secondary" onClick={() => runAction(() => api.updateAutomation(automation.id, { status: automation.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }))}>
                {automation.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}
                {automation.status === "ACTIVE" ? "Pausar" : "Activar"}
              </button>
              <button className="button-secondary" onClick={() => window.confirm("Eliminar automatizacion?") && runAction(() => api.deleteAutomation(automation.id))}>
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
            {automation.recentErrors && automation.recentErrors.length > 0 && (
              <details className="mt-3 rounded-md border border-coral/20 bg-coral/5 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-coral">Ver errores recientes</summary>
                {automation.recentErrors.map((item) => <p key={`${item.lead.id}-${item.createdAt}`} className="mt-2 text-xs text-zinc-600">{item.lead.name}: {item.error || "Error sin detalle"}</p>)}
              </details>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplatesView({ templates, mediaAssets, onReload, onError }: { templates: Template[]; mediaAssets: MediaAsset[]; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "BIENVENIDA", text: "", imageId: "", active: true });

  useEffect(() => {
    const selected = templates.find((template) => template.id === selectedId);
    if (selected) {
      setForm({
        name: selected.name,
        category: selected.category,
        text: selected.text,
        imageId: selected.imageId ?? "",
        active: selected.active
      });
    } else if (!selectedId) {
      setForm({ name: "", category: "BIENVENIDA", text: "", imageId: "", active: true });
    }
  }, [selectedId, templates]);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = { ...form, imageId: form.imageId || null, variables: templateVariables.filter((variable) => form.text.includes(`{{${variable}}}`)) };
      if (selectedId) await api.updateTemplate(selectedId, payload);
      else await api.createTemplate(payload);
      setSelectedId(null);
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  async function remove() {
    if (!selectedId || !window.confirm("Eliminar plantilla?")) return;
    try {
      await api.deleteTemplate(selectedId);
      setSelectedId(null);
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <button className="button-primary" onClick={() => setSelectedId(null)}>
          <Plus size={17} />
          Nueva plantilla
        </button>
        <div className="mt-4 space-y-2">
          {templates.length === 0 && <p className="rounded-md bg-panel px-3 py-3 text-sm text-zinc-500">No hay plantillas guardadas.</p>}
          {templates.map((template) => (
            <button key={template.id} onClick={() => setSelectedId(template.id)} className={clsx("w-full rounded-md border border-line p-3 text-left hover:bg-panel", selectedId === template.id && "bg-panel")}>
              <p className="text-sm font-semibold">{template.name}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{template.text}</p>
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={save} className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="field-label">Nombre</span>
            <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            <span className="field-label">Categoria</span>
            <select className="field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {templateCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
        </div>
        <label className="field-label mt-3">Texto</label>
        <textarea className="mt-2 min-h-64 w-full rounded-md border border-line p-3 text-sm outline-none focus:border-pine" value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} required />
        <label className="field-label mt-3">Imagen opcional</label>
        <select className="field" value={form.imageId} onChange={(event) => setForm({ ...form, imageId: event.target.value })}>
          <option value="">Sin imagen</option>
          {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}
        </select>
        <label className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Plantilla activa
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {templateVariables.map((variable) => (
            <button key={variable} type="button" className="rounded-md bg-panel px-2 py-1 text-xs font-medium text-zinc-600" onClick={() => setForm({ ...form, text: `${form.text} {{${variable}}}` })}>
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="button-primary">
            <Save size={17} />
            {selectedId ? "Guardar cambios" : "Crear plantilla"}
          </button>
          {selectedId && (
            <button type="button" className="button-secondary" onClick={remove}>
              <Trash2 size={17} />
              Eliminar
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function MediaView({ mediaAssets, onReload, onError }: { mediaAssets: MediaAsset[]; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadMedia(file);
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Eliminar imagen?")) return;
    try {
      await api.deleteMedia(id);
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center shadow-soft">
        <Image className="mx-auto text-pine" size={34} />
        <p className="mt-3 text-sm text-zinc-500">Formatos permitidos: jpg, jpeg, png y webp.</p>
        <label className="button-primary mt-4 inline-flex cursor-pointer">
          <Upload size={17} />
          {uploading ? "Subiendo..." : "Subir imagen"}
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mediaAssets.length === 0 && <EmptyState text="No hay imagenes subidas." />}
        {mediaAssets.map((asset) => (
          <div key={asset.id} className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="aspect-[4/3] bg-panel">
              <img src={mediaUrl(asset.url)} alt={asset.originalName} className="h-full w-full object-cover" />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-medium">{asset.originalName}</p>
              <p className="text-xs text-zinc-500">{Math.round(asset.sizeBytes / 1024)} KB - {new Date(asset.createdAt).toLocaleDateString()}</p>
              <button className="button-secondary mt-3" onClick={() => remove(asset.id)}>
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PurchasesView({ leads, purchases, onReload, onError }: { leads: Lead[]; purchases: Purchase[]; onReload: () => Promise<void>; onError: (message: string) => void }) {
  const [form, setForm] = useState({ leadId: "", amount: "", paymentMethod: "", plan: "", notes: "" });

  useEffect(() => {
    if (!form.leadId && leads[0]) setForm((current) => ({ ...current, leadId: leads[0].id }));
  }, [form.leadId, leads]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createPurchase({
        leadId: form.leadId,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        plan: form.plan,
        notes: form.notes || undefined
      });
      setForm((current) => ({ ...current, amount: "", paymentMethod: "", plan: "", notes: "" }));
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  async function update(id: string, status: string) {
    try {
      await api.updatePurchase(id, status);
      await onReload();
    } catch (error) {
      onError(messageFromError(error));
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <label className="field-label">Lead</label>
        <select className="field" value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })} required>
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
        </select>
        <label className="field-label mt-3">Monto</label>
        <input className="field" type="number" min={0} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
        <label className="field-label mt-3">Plan</label>
        <input className="field" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} required />
        <label className="field-label mt-3">Metodo</label>
        <input className="field" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} required />
        <label className="field-label mt-3">Notas</label>
        <textarea className="min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        <button className="button-primary mt-4" disabled={!leads.length}>
          <CircleDollarSign size={17} />
          Registrar
        </button>
      </form>
      <div className="space-y-2">
        {purchases.length === 0 && <EmptyState text="No hay compras registradas." />}
        {purchases.map((purchase) => (
          <div key={purchase.id} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{purchase.lead?.name ?? "Lead"} - {formatMoney(purchase.amount)}</p>
                <p className="mt-1 text-xs text-zinc-500">{purchase.plan} - {purchase.paymentMethod} - {new Date(purchase.createdAt).toLocaleDateString()}</p>
              </div>
              <StatusBadge status={purchase.status} />
            </div>
            {purchase.notes && <p className="mt-3 rounded-md bg-panel px-3 py-2 text-sm text-zinc-600">{purchase.notes}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="button-secondary" onClick={() => update(purchase.id, "CONFIRMADO")}>
                <Check size={16} />
                Confirmar
              </button>
              <button className="button-secondary" onClick={() => update(purchase.id, "RECHAZADO")}>
                <ArchiveX size={16} />
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsView(props: {
  telegram: TelegramStatus;
  setTelegram: (value: TelegramStatus) => void;
  aiConfig: AiConfig;
  systemStatus: SystemStatus;
  onStartQr: () => Promise<void>;
  onReloadAi: () => Promise<void>;
  onReloadAll: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [aiForm, setAiForm] = useState({
    model: "gpt-4.1-mini",
    apiKey: "",
    promptBase: "",
    temperature: "0.4",
    maxTokens: "400",
    maxChars: "700",
    tone: "calido, breve y natural",
    allowedStart: "00:00",
    allowedEnd: "23:59",
    timezone: "America/La_Paz",
    forbiddenWords: "",
    globalEnabled: false
  });
  const [aiTest, setAiTest] = useState("");
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    setAiForm({
      model: String(props.aiConfig.model ?? "gpt-4.1-mini"),
      apiKey: "",
      promptBase: String(props.aiConfig.promptBase ?? ""),
      temperature: String(props.aiConfig.temperature ?? 0.4),
      maxTokens: String(props.aiConfig.maxTokens ?? 400),
      maxChars: String(props.aiConfig.maxChars ?? 700),
      tone: String(props.aiConfig.tone ?? "calido, breve y natural"),
      allowedStart: String(props.aiConfig.allowedHours?.start ?? "00:00"),
      allowedEnd: String(props.aiConfig.allowedHours?.end ?? "23:59"),
      timezone: String(props.aiConfig.allowedHours?.timezone ?? "America/La_Paz"),
      forbiddenWords: Array.isArray(props.aiConfig.forbiddenWords) ? props.aiConfig.forbiddenWords.join(", ") : "",
      globalEnabled: Boolean(props.aiConfig.globalEnabled)
    });
  }, [props.aiConfig]);

  async function saveAi(event: FormEvent) {
    event.preventDefault();
    try {
      await api.updateAiConfig({
        model: aiForm.model,
        apiKey: aiForm.apiKey || undefined,
        promptBase: aiForm.promptBase,
        temperature: Number(aiForm.temperature),
        maxTokens: Number(aiForm.maxTokens),
        maxChars: Number(aiForm.maxChars),
        tone: aiForm.tone,
        allowedHours: { start: aiForm.allowedStart, end: aiForm.allowedEnd, timezone: aiForm.timezone },
        forbiddenWords: aiForm.forbiddenWords.split(",").map((word) => word.trim()).filter(Boolean),
        globalEnabled: aiForm.globalEnabled
      });
      await props.onReloadAi();
    } catch (error) {
      props.onError(messageFromError(error));
    }
  }

  async function testAiConnection() {
    setTestingAi(true);
    setAiTest("");
    try {
      const result = await api.testAi();
      setAiTest(`${result.response} - ${result.model}`);
    } catch (error) {
      props.onError(messageFromError(error));
    } finally {
      setTestingAi(false);
    }
  }

  async function syncTelegram() {
    try {
      await api.syncTelegram(1000);
      await props.onReloadAll();
    } catch (error) {
      props.onError(messageFromError(error));
    }
  }

  async function logoutTelegram() {
    try {
      await api.logoutTelegram();
      props.setTelegram(await api.telegramStatus());
      await props.onReloadAll();
    } catch (error) {
      props.onError(messageFromError(error));
    }
  }

  async function resetCrmData() {
    const confirmText = window.prompt("Esto borra inbox, leads, campanas, compras y colas de prueba. Escribe REINICIAR para continuar.");
    if (confirmText !== "REINICIAR") return;

    try {
      await api.resetTelegramCrm();
      props.setTelegram(await api.telegramStatus());
      await props.onReloadAll();
    } catch (error) {
      props.onError(messageFromError(error));
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <h2 className="text-sm font-semibold">Telegram</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-panel p-2"><span className="text-zinc-500">Worker</span><p className="mt-1 font-semibold">{props.systemStatus.worker.online ? "Activo" : "Sin actividad"}</p></div>
          <div className="rounded-md bg-panel p-2"><span className="text-zinc-500">IA</span><p className="mt-1 font-semibold">{!props.systemStatus.openai.configured ? "Sin API key" : props.systemStatus.openai.enabled ? "Automatica activa" : "Configurada, apagada"}</p></div>
        </div>
        {!props.systemStatus.worker.online && <p className="mt-2 rounded-md bg-coral/10 px-3 py-2 text-xs text-coral">El Worker no esta ejecutando la misma version o no puede conectarse a Neon.</p>}
        {props.systemStatus.openai.lastEvent?.detail && <p className="mt-2 rounded-md bg-panel px-3 py-2 text-xs text-zinc-600">Ultimo evento IA: {props.systemStatus.openai.lastEvent.detail}</p>}
        <div className="mt-4 grid h-44 place-items-center rounded-lg border border-dashed border-line bg-panel">
          {props.telegram.qrCodeDataUrl ? <img src={props.telegram.qrCodeDataUrl} alt="QR Telegram" className="h-40 w-40" /> : <QrCode size={48} className="text-zinc-400" />}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <StatusBadge status={props.telegram.status} />
          <span className="text-xs text-zinc-500">{props.telegram.username ? `@${props.telegram.username}` : "sin usuario conectado"}</span>
        </div>
        <button onClick={props.onStartQr} className="button-primary mt-4 w-full justify-center">
          <QrCode size={17} />
          Generar QR
        </button>
        <button onClick={syncTelegram} className="button-secondary mt-2 w-full justify-center">
          <Inbox size={17} />
          Sincronizar chats
        </button>
        <button onClick={logoutTelegram} className="button-secondary mt-2 w-full justify-center">
          <LogOut size={17} />
          Cancelar QR / desconectar
        </button>
        <button onClick={resetCrmData} className="button-secondary mt-2 w-full justify-center">
          <ArchiveX size={17} />
          Reiniciar datos de prueba
        </button>
      </div>

      <form onSubmit={saveAi} className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          <SettingInput label="Modelo IA" icon={Bot} value={aiForm.model} onChange={(value) => setAiForm({ ...aiForm, model: value })} />
          <SettingInput label="Temperatura" icon={WandSparkles} value={aiForm.temperature} onChange={(value) => setAiForm({ ...aiForm, temperature: value })} type="number" />
          <SettingInput label="Max tokens" icon={CalendarClock} value={aiForm.maxTokens} onChange={(value) => setAiForm({ ...aiForm, maxTokens: value })} type="number" />
          <SettingInput label="Max caracteres" icon={MessageSquareText} value={aiForm.maxChars} onChange={(value) => setAiForm({ ...aiForm, maxChars: value })} type="number" />
          <SettingInput label="Tono" icon={WandSparkles} value={aiForm.tone} onChange={(value) => setAiForm({ ...aiForm, tone: value })} />
          <SettingInput label={props.aiConfig.encryptedApiKey ? "Nueva API key OpenAI" : "API key OpenAI"} icon={KeyRound} value={aiForm.apiKey} onChange={(value) => setAiForm({ ...aiForm, apiKey: value })} type="password" />
          <SettingInput label="Responder desde" icon={CalendarClock} value={aiForm.allowedStart} onChange={(value) => setAiForm({ ...aiForm, allowedStart: value })} type="time" />
          <SettingInput label="Responder hasta" icon={CalendarClock} value={aiForm.allowedEnd} onChange={(value) => setAiForm({ ...aiForm, allowedEnd: value })} type="time" />
          <SettingInput label="Zona horaria" icon={CalendarClock} value={aiForm.timezone} onChange={(value) => setAiForm({ ...aiForm, timezone: value })} />
          <SettingInput label="Palabras prohibidas (separadas por coma)" icon={ArchiveX} value={aiForm.forbiddenWords} onChange={(value) => setAiForm({ ...aiForm, forbiddenWords: value })} />
        </div>
        <label className="mt-4 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
          <input type="checkbox" checked={aiForm.globalEnabled} onChange={(event) => setAiForm({ ...aiForm, globalEnabled: event.target.checked })} />
          IA global activa
        </label>
        <label className="field-label mt-4">Prompt base</label>
        <textarea className="mt-2 min-h-40 w-full rounded-md border border-line p-3 text-sm outline-none focus:border-pine" value={aiForm.promptBase} onChange={(event) => setAiForm({ ...aiForm, promptBase: event.target.value })} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="button-primary">
            <Save size={17} />
            Guardar ajustes IA
          </button>
          <button type="button" className="button-secondary" disabled={testingAi} onClick={testAiConnection}>
            <Activity size={17} />
            {testingAi ? "Probando..." : "Probar conexion IA"}
          </button>
        </div>
        {aiTest && <p className="mt-3 rounded-md bg-pine/10 px-3 py-2 text-sm text-pine">{aiTest}</p>}
      </form>
    </section>
  );
}

function SettingInput({ label, value, onChange, icon: Icon, type = "text" }: { label: string; value: string; onChange: (value: string) => void; icon: IconType; type?: string }) {
  return (
    <label className="block">
      <span className="field-label flex items-center gap-2"><Icon size={15} />{label}</span>
      <input className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)} type={type} />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-line bg-white p-4 text-sm text-zinc-500 shadow-soft">{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    SCHEDULED: "Programada",
    ACTIVE: "Enviando",
    PAUSED: "Pausada",
    FINISHED: "Finalizada",
    PENDING: "Pendiente",
    PROCESSING: "Procesando",
    SENT: "Enviado",
    SKIPPED: "Omitido",
    FAILED: "Fallido",
    CONNECTED: "Conectado",
    DISCONNECTED: "Desconectado",
    QR_PENDING: "Esperando QR",
    EXPIRED: "Expirado",
    CONFIRMADO: "Confirmado",
    RECHAZADO: "Rechazado",
    PENDIENTE: "Pendiente"
  };
  const tone = status.includes("NO_") || status === "FAILED" || status === "ERROR" || status === "RECHAZADO" || status === "EXPIRED"
    ? "bg-coral/10 text-coral"
    : status.includes("ACT") || status === "COMPRO" || status === "CONFIRMADO" || status === "CONNECTED"
      ? "bg-pine/10 text-pine"
      : "bg-amber/10 text-amber";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{labels[status] ?? status.replaceAll("_", " ")}</span>;
}

function MiniBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: color ? `${color}20` : "#eef2ef", color: color ?? "#475569" }}>
      {label}
    </span>
  );
}
