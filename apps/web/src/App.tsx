import { useEffect, useMemo, useState } from "react";
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
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tags,
  UserRoundCheck,
  UsersRound,
  WandSparkles,
  Workflow
} from "lucide-react";
import { api, demoConversations, demoLeads, demoMessages, demoStats, getToken, setToken, type StatMap } from "./lib/api";
import { StatCard } from "./components/StatCard";

type Section = "dashboard" | "inbox" | "leads" | "campaigns" | "automations" | "templates" | "media" | "purchases" | "settings";

const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
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

export function App() {
  const [tokenReady, setTokenReady] = useState(Boolean(getToken()));
  const [section, setSection] = useState<Section>("dashboard");
  const [stats, setStats] = useState<StatMap>(demoStats);
  const [leads, setLeads] = useState(demoLeads);
  const [conversations, setConversations] = useState(demoConversations);
  const [messages, setMessages] = useState(demoMessages);
  const [selectedConversation, setSelectedConversation] = useState(demoConversations[0]);
  const [telegram, setTelegram] = useState<{ status: string; qrCodeDataUrl?: string | null; username?: string | null }>({ status: "DISCONNECTED" });
  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!tokenReady) return;
    void Promise.all([
      api.dashboard().then(setStats),
      api.leads().then(setLeads),
      api.conversations().then((items) => {
        setConversations(items);
        setSelectedConversation(items[0] ?? demoConversations[0]);
      }),
      api.telegramStatus().then(setTelegram)
    ]);
  }, [tokenReady]);

  useEffect(() => {
    if (!selectedConversation?.id) return;
    void api.messages(selectedConversation.id).then(setMessages);
  }, [selectedConversation?.id]);

  if (!tokenReady) return <Login onReady={() => setTokenReady(true)} />;

  return (
    <div className="min-h-screen bg-panel text-ink">
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
            <button className="grid h-9 w-9 place-items-center rounded-md border border-line lg:hidden">
              <LayoutDashboard size={18} />
            </button>
            <div>
              <h1 className="text-lg font-semibold">{sections.find((item) => item.id === section)?.label}</h1>
              <p className="text-xs text-zinc-500">{telegram.status === "CONNECTED" ? `Telegram @${telegram.username ?? "conectado"}` : `Telegram ${telegram.status.toLowerCase()}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSection("settings")} className="icon-button" title="Ajustes">
              <Settings size={18} />
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("crm_token");
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
          {section === "dashboard" && <Dashboard stats={stats} telegram={telegram} onStartQr={async () => setTelegram(await api.startQr())} />}
          {section === "inbox" && (
            <InboxView
              conversations={conversations}
              selected={selectedConversation}
              onSelect={setSelectedConversation}
              messages={messages}
              composer={composer}
              setComposer={setComposer}
              onSend={async () => {
                if (!composer.trim()) return;
                setMessages((items) => [...items, { id: crypto.randomUUID(), direction: "OUTBOUND", body: composer, createdAt: new Date().toISOString() }]);
                await api.sendMessage(selectedConversation.id, composer).catch(() => undefined);
                setComposer("");
              }}
            />
          )}
          {section === "leads" && <LeadsView leads={leads} search={search} setSearch={setSearch} />}
          {section === "campaigns" && <CampaignsView />}
          {section === "automations" && <AutomationsView />}
          {section === "templates" && <TemplatesView />}
          {section === "media" && <MediaView />}
          {section === "purchases" && <PurchasesView leads={leads} />}
          {section === "settings" && <SettingsView telegram={telegram} setTelegram={setTelegram} />}
        </div>
      </main>
    </div>
  );
}

function Login({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState("owner@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login(email, password);
      setToken(result.token);
      onReady();
    } catch {
      if (email && password) {
        setToken("demo-token");
        onReady();
        return;
      }
      setError("No se pudo iniciar sesion");
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
            <p className="text-xs text-zinc-500">Owner / Admin / Vendedor / Soporte</p>
          </div>
        </div>
        <label className="field-label">Email</label>
        <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        <label className="field-label mt-3">Contrasena</label>
        <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
        {error && <p className="mt-3 text-sm text-coral">{error}</p>}
        <button className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-pine text-sm font-semibold text-white">
          <KeyRound size={17} />
          Entrar
        </button>
      </form>
    </main>
  );
}

function Dashboard({ stats, telegram, onStartQr }: { stats: StatMap; telegram: { status: string; qrCodeDataUrl?: string | null }; onStartQr: () => Promise<void> }) {
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
            <h2 className="text-sm font-semibold">Embudo comercial</h2>
            <Activity size={18} className="text-pine" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {["Nuevo", "Interesado", "Caliente", "Compro"].map((label, index) => (
              <div key={label} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <ChevronRight size={16} className="text-zinc-400" />
                </div>
                <div className="mt-4 h-2 rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-pine" style={{ width: `${78 - index * 14}%` }} />
                </div>
                <p className="mt-2 text-xs text-zinc-500">{Math.max(8, 42 - index * 9)} leads</p>
              </div>
            ))}
          </div>
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
              <span className={clsx("rounded-md px-2 py-1 text-xs font-semibold", telegram.status === "CONNECTED" ? "bg-pine/10 text-pine" : "bg-amber/10 text-amber")}>
                {telegram.status}
              </span>
              <div className="mt-4 flex gap-2">
                <button onClick={onStartQr} className="button-primary">
                  <QrCode size={17} />
                  Conectar
                </button>
                <button className="button-secondary">
                  <Pause size={17} />
                  Pausar IA
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InboxView(props: {
  conversations: typeof demoConversations;
  selected: typeof demoConversations[number];
  onSelect: (conversation: typeof demoConversations[number]) => void;
  messages: typeof demoMessages;
  composer: string;
  setComposer: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="grid h-[calc(100vh-116px)] min-h-[640px] gap-4 xl:grid-cols-[330px_1fr_340px]">
      <section className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        <div className="border-b border-line p-3">
          <div className="flex items-center gap-2 rounded-md bg-panel px-3 py-2">
            <Search size={16} className="text-zinc-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar chat" />
          </div>
        </div>
        <div className="h-full overflow-y-auto">
          {props.conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => props.onSelect(conversation)}
              className={clsx("flex w-full gap-3 border-b border-line p-3 text-left hover:bg-panel", props.selected?.id === conversation.id && "bg-panel")}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink text-sm font-semibold text-white">{conversation.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{conversation.name}</span>
                  {conversation.unreadCount > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs text-white">{conversation.unreadCount}</span>}
                </span>
                <span className="mt-1 block truncate text-xs text-zinc-500">{conversation.lastMessage}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <div>
              <h2 className="text-sm font-semibold">{props.selected?.name}</h2>
              <p className="text-xs text-zinc-500">{props.selected?.lead?.status ?? "Sin lead"}</p>
            </div>
            <div className="flex gap-2">
              <button className="icon-button" title="IA">
                <Bot size={17} />
              </button>
              <button className="icon-button" title="Etiquetas">
                <Tags size={17} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#f6f7f4] p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {props.messages.map((message) => (
                <div key={message.id} className={clsx("max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm", message.direction === "OUTBOUND" ? "ml-auto bg-pine text-white" : "bg-white text-ink")}>
                  <p>{message.body}</p>
                  <div className={clsx("mt-1 flex items-center gap-1 text-[11px]", message.direction === "OUTBOUND" ? "text-white/70" : "text-zinc-400")}>
                    {message.aiGenerated && <WandSparkles size={12} />}
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-line bg-white p-3">
            <div className="flex items-end gap-2">
              <button className="icon-button" title="Imagen">
                <Image size={18} />
              </button>
              <textarea
                value={props.composer}
                onChange={(event) => props.setComposer(event.target.value)}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine"
                placeholder="Mensaje"
              />
              <button onClick={props.onSend} className="grid h-10 w-10 place-items-center rounded-md bg-pine text-white" title="Enviar">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-y-auto rounded-lg border border-line bg-white p-4 shadow-soft">
        <h2 className="text-sm font-semibold">Lead</h2>
        <div className="mt-4 space-y-3">
          <LeadFlag label="Opt-in comercial" active={Boolean(props.selected?.lead?.optInCommercial)} />
          <LeadFlag label="Mayor de edad" active={Boolean(props.selected?.lead?.ageConfirmed)} />
          <LeadFlag label="Seguimiento" active={Boolean(props.selected?.lead?.followUpAllowed)} />
          <LeadFlag label="IA activa" active={props.selected?.lead?.status !== "NO_VOLVER_A_ESCRIBIR"} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="button-secondary">
            <Check size={16} />
            Compro
          </button>
          <button className="button-secondary">
            <ArchiveX size={16} />
            Stop
          </button>
        </div>
        <div className="mt-5">
          <label className="field-label">Notas internas</label>
          <textarea className="min-h-28 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-pine" defaultValue="Pidio precio. Pendiente confirmar plan." />
        </div>
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Proximas automatizaciones</h3>
          <div className="mt-2 space-y-2">
            <QueueItem title="Seguimiento 24h" time="Manana 10:00" />
            <QueueItem title="Confirmacion de edad" time="Pendiente" />
          </div>
        </div>
      </section>
    </div>
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

function QueueItem({ title, time }: { title: string; time: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-panel px-3 py-2">
      <span className="text-sm">{title}</span>
      <span className="text-xs text-zinc-500">{time}</span>
    </div>
  );
}

function LeadsView({ leads, search, setSearch }: { leads: typeof demoLeads; search: string; setSearch: (value: string) => void }) {
  const filtered = useMemo(
    () => leads.filter((lead) => `${lead.name} ${lead.username} ${lead.status}`.toLowerCase().includes(search.toLowerCase())),
    [leads, search]
  );

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex min-w-72 items-center gap-2 rounded-md bg-panel px-3 py-2">
          <Search size={16} className="text-zinc-400" />
          <input className="w-full bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead" />
        </div>
        <button className="button-primary">
          <Plus size={17} />
          Lead
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Consentimiento</th>
              <th className="px-4 py-3">Etiquetas</th>
              <th className="px-4 py-3">Ultimo mensaje</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-medium">{lead.name}</p>
                  <p className="text-xs text-zinc-500">@{lead.username}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {lead.optInCommercial && <MiniBadge label="Opt-in" />}
                    {lead.ageConfirmed && <MiniBadge label="Edad" />}
                    {lead.followUpAllowed && <MiniBadge label="Follow" />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {lead.tags.map(({ tag }) => <MiniBadge key={tag.name} label={tag.name} color={tag.color} />)}
                  </div>
                </td>
                <td className="max-w-sm truncate px-4 py-3 text-zinc-600">{lead.lastInboundMessage}</td>
                <td className="px-4 py-3">${lead.totalSpent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CampaignsView() {
  return (
    <TwoColumn title="Campanas opt-in" icon={Send} action="Nueva campana">
      <BuilderPanel
        rows={[
          ["Segmento", "Leads con opt-in + exclusiones obligatorias"],
          ["Limite diario", "50 mensajes"],
          ["Pausa", "90 segundos"],
          ["Vista previa", "88 destinatarios elegibles"]
        ]}
      />
      <ListPanel
        items={[
          ["Precio julio", "ACTIVA", "Opt-in, edad confirmada"],
          ["Post compra", "PROGRAMADA", "Compradores"],
          ["Reactivacion suave", "BORRADOR", "Interesados sin compra"]
        ]}
      />
    </TwoColumn>
  );
}

function AutomationsView() {
  return (
    <TwoColumn title="Automatizaciones" icon={Workflow} action="Crear regla">
      <BuilderPanel
        rows={[
          ["Trigger", "Lead recibio precio y no respondio"],
          ["Delay", "24 horas"],
          ["Accion", "Enviar mensaje"],
          ["Seguridad", "Stop, edad y seguimiento"]
        ]}
      />
      <ListPanel
        items={[
          ["Seguimiento 24h", "ACTIVA", "1 ejecucion por lead"],
          ["Seguimiento 48h", "ACTIVA", "No compradores"],
          ["Stop handler", "ACTIVA", "Detiene IA y colas"]
        ]}
      />
    </TwoColumn>
  );
}

function TemplatesView() {
  const templates = [
    ["Confirmacion de edad", "Hola :) antes de pasarte la info, me confirmas que eres mayor de edad?"],
    ["Seguimiento 24h", "Hola :) te escribo solo para saber si todavia querias la info."],
    ["Precio", "Te paso las opciones disponibles."],
    ["Stop", "Listo, no te volvere a escribir por este tema."]
  ];
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <button className="button-primary">
          <Plus size={17} />
          Plantilla
        </button>
        <div className="mt-4 space-y-2">
          {templates.map(([name, text]) => (
            <button key={name} className="w-full rounded-md border border-line p-3 text-left hover:bg-panel">
              <p className="text-sm font-semibold">{name}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{text}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <label className="field-label">Texto</label>
        <textarea className="mt-2 min-h-64 w-full rounded-md border border-line p-3 text-sm outline-none focus:border-pine" defaultValue={templates[0][1]} />
        <div className="mt-4 flex flex-wrap gap-2">
          {["{{nombre}}", "{{username}}", "{{precio}}", "{{plan}}", "{{link_pago}}", "{{fecha}}"].map((variable) => <MiniBadge key={variable} label={variable} />)}
        </div>
      </div>
    </section>
  );
}

function MediaView() {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center shadow-soft">
        <Image className="mx-auto text-pine" size={34} />
        <div className="mt-4 flex justify-center gap-2">
          <button className="button-primary">
            <Plus size={17} />
            Subir imagen
          </button>
          <button className="button-secondary">
            <ArchiveX size={17} />
            Quitar
          </button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="aspect-[4/3] bg-gradient-to-br from-zinc-100 via-emerald-50 to-amber-50" />
            <div className="p-3">
              <p className="text-sm font-medium">media-{item}.webp</p>
              <p className="text-xs text-zinc-500">Usada en campana y plantilla</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PurchasesView({ leads }: { leads: typeof demoLeads }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <form className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <label className="field-label">Lead</label>
        <select className="field">
          {leads.map((lead) => <option key={lead.id}>{lead.name}</option>)}
        </select>
        <label className="field-label mt-3">Monto</label>
        <input className="field" type="number" defaultValue={49} />
        <label className="field-label mt-3">Plan</label>
        <input className="field" defaultValue="Mensual" />
        <label className="field-label mt-3">Metodo</label>
        <input className="field" defaultValue="Transferencia" />
        <button className="button-primary mt-4">
          <CircleDollarSign size={17} />
          Registrar
        </button>
      </form>
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <ListPanel
          items={[
            ["Valeria S.", "CONFIRMADO", "$120 - VIP"],
            ["Leo M.", "PENDIENTE", "$49 - Mensual"],
            ["Ana P.", "CONFIRMADO", "$79 - Trimestral"]
          ]}
        />
      </div>
    </section>
  );
}

function SettingsView({ telegram, setTelegram }: { telegram: { status: string; qrCodeDataUrl?: string | null }; setTelegram: (value: { status: string; qrCodeDataUrl?: string | null }) => void }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <h2 className="text-sm font-semibold">Telegram</h2>
        <div className="mt-4 grid h-44 place-items-center rounded-lg border border-dashed border-line bg-panel">
          {telegram.qrCodeDataUrl ? <img src={telegram.qrCodeDataUrl} alt="QR Telegram" className="h-40 w-40" /> : <QrCode size={48} className="text-zinc-400" />}
        </div>
        <button onClick={async () => setTelegram(await api.startQr())} className="button-primary mt-4 w-full justify-center">
          <QrCode size={17} />
          Generar QR
        </button>
      </div>
      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          <SettingField label="Modelo IA" value="gpt-4.1-mini" icon={Bot} />
          <SettingField label="Temperatura" value="0.4" icon={WandSparkles} />
          <SettingField label="Horario" value="09:00 - 20:00" icon={CalendarClock} />
          <SettingField label="Link de pago" value="https://example.com/pay" icon={CircleDollarSign} />
        </div>
        <label className="field-label mt-4">Prompt base</label>
        <textarea className="mt-2 min-h-40 w-full rounded-md border border-line p-3 text-sm outline-none focus:border-pine" defaultValue="Eres un asistente de ventas por Telegram. Responde breve, calido y natural. Respeta stop, opt-in y mayoria de edad." />
      </div>
    </section>
  );
}

function SettingField({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Bot }) {
  return (
    <label className="block">
      <span className="field-label flex items-center gap-2"><Icon size={15} />{label}</span>
      <input className="field mt-2" defaultValue={value} />
    </label>
  );
}

function TwoColumn({ title, icon: Icon, action, children }: { title: string; icon: typeof Send; action: string; children: React.ReactNode }) {
  const content = Array.isArray(children) ? children : [children];
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-pine/10 text-pine"><Icon size={18} /></span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <button className="button-primary">
          <Plus size={17} />
          {action}
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        {content}
      </div>
    </section>
  );
}

function BuilderPanel({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <label className="field-label">{label}</label>
            <div className="mt-1 rounded-md border border-line px-3 py-2 text-sm">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="button-primary"><Play size={17} />Activar</button>
        <button className="button-secondary"><Pause size={17} />Pausar</button>
      </div>
    </div>
  );
}

function ListPanel({ items }: { items: [string, string, string][] }) {
  return (
    <div className="space-y-2">
      {items.map(([title, status, detail]) => (
        <div key={title} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-4 shadow-soft">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs text-zinc-500">{detail}</p>
          </div>
          <StatusBadge status={status} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status.includes("NO_") || status === "FAILED" || status === "ERROR" ? "bg-coral/10 text-coral" : status.includes("ACT") || status === "COMPRO" || status === "CONFIRMADO" ? "bg-pine/10 text-pine" : "bg-amber/10 text-amber";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}

function MiniBadge({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: color ? `${color}20` : "#eef2ef", color: color ?? "#475569" }}>
      {label}
    </span>
  );
}
