import type { Lead } from "@prisma/client";
import { canMessageLead, type SendIntent } from "@crm/shared";

export function assertCanMessageLead(
  lead: Pick<Lead, "status" | "optInCommercial" | "ageConfirmed" | "followUpAllowed" | "userWroteFirst" | "conversationActive">,
  intent: SendIntent,
  options: { sensitive?: boolean; commercial?: boolean } = {}
) {
  const result = canMessageLead(
    {
      status: lead.status,
      optInCommercial: lead.optInCommercial,
      ageConfirmed: lead.ageConfirmed,
      followUpAllowed: lead.followUpAllowed,
      userWroteFirst: lead.userWroteFirst,
      conversationActive: lead.conversationActive
    },
    intent,
    options
  );

  if (!result.allowed) {
    const error = new Error(result.reasons.join("; "));
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
}
