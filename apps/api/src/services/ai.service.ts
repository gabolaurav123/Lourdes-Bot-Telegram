import OpenAI from "openai";
import type { Conversation, Lead } from "@prisma/client";
import { containsStopPhrase, DEFAULT_AI_PROMPT, canMessageLead } from "@crm/shared";
import { config } from "../config";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { toInputJson } from "../lib/json";
import { prisma } from "../lib/prisma";

type AllowedHours = { start?: string; end?: string; timezone?: string };

export type AiReplyResult = {
  text: string | null;
  reason?: string;
};

function isWithinAllowedHours(value: unknown) {
  const allowed = (value ?? {}) as AllowedHours;
  if (!allowed.start || !allowed.end) return true;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: allowed.timezone || "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const current = formatter.format(new Date());
  if (allowed.start <= allowed.end) return current >= allowed.start && current <= allowed.end;
  return current >= allowed.start || current <= allowed.end;
}

class AiService {
  private clientFor(apiKey: string) {
    return new OpenAI({ apiKey });
  }

  async getConfig() {
    return prisma.aiConfig.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        model: config.openai.model,
        promptBase: DEFAULT_AI_PROMPT,
        globalEnabled: config.nodeEnv === "development" ? false : config.openai.apiKey.length > 0
      }
    });
  }

  async updateConfig(input: {
    model?: string;
    apiKey?: string;
    promptBase?: string;
    temperature?: number;
    maxTokens?: number;
    tone?: string;
    maxChars?: number;
    allowedHours?: Record<string, unknown>;
    forbiddenWords?: string[];
    globalEnabled?: boolean;
  }) {
    const apiKey = input.apiKey?.trim();
    return prisma.aiConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        model: input.model ?? config.openai.model,
        promptBase: input.promptBase ?? DEFAULT_AI_PROMPT,
        encryptedApiKey: apiKey ? encryptSecret(apiKey) : undefined,
        temperature: input.temperature ?? 0.4,
        maxTokens: input.maxTokens ?? 400,
        tone: input.tone ?? "calido, breve y natural",
        maxChars: input.maxChars ?? 700,
        allowedHours: toInputJson(input.allowedHours ?? {}),
        forbiddenWords: input.forbiddenWords ?? [],
        globalEnabled: input.globalEnabled ?? false
      },
      update: {
        model: input.model,
        promptBase: input.promptBase,
        encryptedApiKey: apiKey ? encryptSecret(apiKey) : undefined,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        tone: input.tone,
        maxChars: input.maxChars,
        allowedHours: input.allowedHours === undefined ? undefined : toInputJson(input.allowedHours),
        forbiddenWords: input.forbiddenWords,
        globalEnabled: input.globalEnabled
      }
    });
  }

  async generateReply(lead: Lead, conversation: Conversation, inboundText: string): Promise<AiReplyResult> {
    const aiConfig = await this.getConfig();
    if (!aiConfig.globalEnabled) return { text: null, reason: "La IA global esta apagada" };
    if (!lead.aiEnabled) return { text: null, reason: "La IA esta pausada para este lead" };
    if (containsStopPhrase(inboundText)) return { text: null, reason: "El usuario solicito detener los mensajes" };
    if (!isWithinAllowedHours(aiConfig.allowedHours)) return { text: null, reason: "Fuera del horario permitido para la IA" };

    const permission = canMessageLead(
      {
        status: lead.status,
        optInCommercial: lead.optInCommercial,
        ageConfirmed: lead.ageConfirmed,
        followUpAllowed: lead.followUpAllowed,
        userWroteFirst: lead.userWroteFirst,
        conversationActive: lead.conversationActive
      },
      "ai_reply"
    );
    if (!permission.allowed) return { text: null, reason: permission.reasons.join(". ") };

    const apiKey = decryptSecret(aiConfig.encryptedApiKey) || config.openai.apiKey;
    if (!apiKey) return { text: null, reason: "No hay una API key de OpenAI configurada" };

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 12
    });

    const forbidden = aiConfig.forbiddenWords.join(", ");
    const system = [
      aiConfig.promptBase,
      `Tono: ${aiConfig.tone}. Maximo ${aiConfig.maxChars} caracteres.`,
      "Reglas obligatorias: no envies contenido sensible si el lead no tiene ageConfirmed=true; si pide no recibir mensajes, responde una sola vez de forma amable y no insistas; no inventes pagos ni promesas.",
      forbidden ? `Palabras prohibidas: ${forbidden}` : ""
    ].filter(Boolean).join("\n");

    const input: OpenAI.Responses.ResponseInput = [
      {
        role: "user",
        content: `Datos del lead: nombre=${lead.name}, username=${lead.username ?? ""}, estado=${lead.status}, optIn=${lead.optInCommercial}, mayorEdad=${lead.ageConfirmed}, seguimiento=${lead.followUpAllowed}.`
      },
      ...history.reverse().map((message) => ({
        role: message.direction === "INBOUND" ? "user" as const : "assistant" as const,
        content: message.body ?? "[imagen]"
      }))
    ];

    if (!input.length || history.length === 0) {
      input.push({ role: "user", content: inboundText });
    }

    const request: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: aiConfig.model,
      instructions: system,
      input,
      max_output_tokens: aiConfig.maxTokens,
      store: false
    };
    if (!aiConfig.model.startsWith("gpt-5") && !aiConfig.model.startsWith("o")) {
      request.temperature = aiConfig.temperature;
    }

    const response = await this.clientFor(apiKey).responses.create(request);

    const text = response.output_text?.trim();
    if (!text) return { text: null, reason: "OpenAI devolvio una respuesta vacia" };

    const lower = text.toLowerCase();
    if (aiConfig.forbiddenWords.some((word) => lower.includes(word.toLowerCase()))) {
      return { text: "Prefiero confirmarte eso manualmente para darte la informacion correcta." };
    }

    return { text: text.slice(0, aiConfig.maxChars) };
  }

  async testConnection() {
    const aiConfig = await this.getConfig();
    const apiKey = decryptSecret(aiConfig.encryptedApiKey) || config.openai.apiKey;
    if (!apiKey) {
      const error = new Error("No hay una API key de OpenAI configurada.");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const response = await this.clientFor(apiKey).responses.create({
      model: aiConfig.model,
      instructions: "Eres una prueba tecnica. Responde de forma muy breve.",
      input: "Responde exactamente: CONEXION_OK",
      max_output_tokens: 30,
      store: false
    });

    return {
      ok: true,
      model: aiConfig.model,
      response: response.output_text?.trim() || "Respuesta recibida sin texto"
    };
  }
}

export const aiService = new AiService();
