import { EXCLUDED_LEAD_STATUSES, STOP_PHRASES } from "./constants";

export type LeadSafetySnapshot = {
  status: string;
  optInCommercial: boolean;
  ageConfirmed: boolean;
  followUpAllowed: boolean;
  userWroteFirst: boolean;
  conversationActive: boolean;
};

export type SendIntent = "manual_reply" | "ai_reply" | "follow_up" | "campaign";

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function containsStopPhrase(message: string, stopPhrases: readonly string[] = STOP_PHRASES) {
  const normalized = normalizeText(message);
  return stopPhrases.some((phrase) => {
    const p = normalizeText(phrase);
    return normalized === p || normalized.includes(p);
  });
}

export function isLeadExcluded(lead: Pick<LeadSafetySnapshot, "status">) {
  return EXCLUDED_LEAD_STATUSES.includes(lead.status as (typeof EXCLUDED_LEAD_STATUSES)[number]);
}

export function canMessageLead(
  lead: LeadSafetySnapshot,
  intent: SendIntent,
  options: { sensitive?: boolean; commercial?: boolean } = {}
) {
  const reasons: string[] = [];

  if (isLeadExcluded(lead)) reasons.push("Lead excluido por estado");
  if (!lead.userWroteFirst && !lead.conversationActive) reasons.push("El usuario no inicio una conversacion valida");

  if (intent === "campaign" && !lead.optInCommercial) {
    reasons.push("La campana requiere opt-in comercial");
  }

  if ((intent === "follow_up" || options.commercial) && !lead.followUpAllowed) {
    reasons.push("El lead no dio permiso de seguimiento");
  }

  if (options.sensitive && !lead.ageConfirmed) {
    reasons.push("Falta confirmacion de mayoria de edad");
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}

export function interpolateTemplate(text: string, variables: Record<string, string | number | null | undefined>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
