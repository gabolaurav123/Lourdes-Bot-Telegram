export const Roles = ["OWNER", "ADMIN", "VENDEDOR", "SOPORTE"] as const;

export const LeadStatuses = [
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
] as const;

export const ConversationTypes = ["PRIVATE", "GROUP", "CHANNEL"] as const;

export const STOP_PHRASES = [
  "no",
  "no gracias",
  "stop",
  "cancelar",
  "no me escribas",
  "no quiero",
  "no estoy interesado",
  "no me interesa",
  "basta",
  "dejame",
  "remove",
  "unsubscribe"
] as const;

export const EXCLUDED_LEAD_STATUSES = [
  "NO_VOLVER_A_ESCRIBIR",
  "NO_INTERESADO",
  "BLOQUEADO",
  "ERROR"
] as const;

export const LEGACY_DEFAULT_AI_PROMPT =
  "Eres un asistente de ventas por Telegram. Tu trabajo es responder de forma breve, calida y natural a personas que escriben interesadas en contenido privado. No debes presionar demasiado. Debes guiar a la persona hacia la informacion, precios y compra. Antes de mostrar informacion sensible, confirma que la persona es mayor de edad. Si la persona dice que no le interesa o pide no recibir mas mensajes, responde amablemente y marca el lead como NO_VOLVER_A_ESCRIBIR. Nunca insistas despues de una negativa clara. Usa el historial del lead para no repetir respuestas. Si el usuario parece interesado, ofrece el siguiente paso de forma simple.";

export const DEFAULT_AI_PROMPT =
  "Eres un asistente de ventas por Telegram. La persona acaba de escribir porque quiere informacion, asi que responde directamente a su consulta y guia la conversacion hacia precios, planes, pago y compra. Se breve, calido y natural. No pidas permiso para responder, no preguntes si acepta recibir mensajes y no inicies formularios de consentimiento. No preguntes la edad para dar informacion comercial normal, precios, planes o formas de pago. Usa el historial para no repetir preguntas ni respuestas. Si la persona no esta interesada o pide no recibir mas mensajes, despidete amablemente y no insistas.";

export const INITIAL_TEMPLATES = [
  {
    name: "Confirmacion de edad",
    category: "CONFIRMACION_EDAD",
    text: "Hola :) antes de pasarte la info, me confirmas que eres mayor de edad?"
  },
  {
    name: "Seguimiento 24h",
    category: "SEGUIMIENTO_24H",
    text: "Hola :) te escribo solo para saber si todavia querias la info. Si ya no te interesa, no pasa nada."
  },
  {
    name: "Precio",
    category: "PRECIO",
    text: "Te paso las opciones disponibles. Puedes elegir el acceso que prefieras y te explico como entrar."
  },
  {
    name: "No interesado",
    category: "NO_INTERESADO",
    text: "Tranqui, no pasa nada :) No te vuelvo a escribir por esto."
  },
  {
    name: "Stop",
    category: "STOP",
    text: "Listo, no te volvere a escribir por este tema."
  }
] as const;

export const TEMPLATE_VARIABLES = [
  "nombre",
  "username",
  "precio",
  "plan",
  "link_pago",
  "link_bot",
  "fecha",
  "fuente"
] as const;

export const PERMISSIONS_BY_ROLE = {
  OWNER: ["*"],
  ADMIN: [
    "settings:manage",
    "campaigns:manage",
    "automations:manage",
    "ai:manage",
    "inbox:respond",
    "leads:manage",
    "media:manage",
    "purchases:manage"
  ],
  VENDEDOR: ["inbox:respond", "leads:manage", "purchases:manage", "media:read"],
  SOPORTE: ["inbox:respond_assigned", "leads:read", "media:read"]
} as const;
