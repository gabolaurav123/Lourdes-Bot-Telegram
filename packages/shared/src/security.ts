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
  const normalized = normalizeText(message)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stopPhrases.some((phrase) => {
    const p = normalizeText(phrase);
    if (p === "no") return normalized === p;
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return normalized === p || new RegExp(`(^|\\s)${escaped}($|\\s)`).test(normalized);
  });
}

export function isLegacyFalseStop(message: string, stopPhrases: readonly string[] = STOP_PHRASES) {
  const normalized = normalizeText(message);
  if (!normalized || containsStopPhrase(message, stopPhrases)) return false;

  return stopPhrases.some((phrase) => normalized.includes(normalizeText(phrase)));
}

export function asksForAdultConfirmation(message: string) {
  const normalized = normalizeText(message);
  return normalized.includes("mayor de edad") || normalized.includes("18 anos") || normalized.includes("+18");
}

export function confirmsAdultAge(message: string, previousMessage = "") {
  const normalized = normalizeText(message)
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(no soy|soy menor|no tengo)\b/.test(normalized)) return false;
  if (/\b(soy|confirmo que soy|claro que soy) mayor de edad\b/.test(normalized)) return true;
  if (/\bsoy (\+?18|adult[oa])\b/.test(normalized)) return true;
  if (/\btengo (1[89]|[2-9][0-9]) anos\b/.test(normalized)) return true;

  const shortConfirmation = ["si", "confirmo", "claro", "correcto", "si confirmo"].includes(normalized);
  return shortConfirmation && asksForAdultConfirmation(previousMessage);
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
    reasons.push("La campaña requiere opt-in comercial");
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
