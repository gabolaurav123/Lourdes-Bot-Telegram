import OpenAI from "openai";
import type { Conversation, Lead, Prisma } from "@prisma/client";
import { containsStopPhrase, DEFAULT_AI_PROMPT, LEGACY_DEFAULT_AI_PROMPT, canMessageLead } from "@crm/shared";
import { config } from "../config";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { toInputJson } from "../lib/json";
import { prisma } from "../lib/prisma";

type AllowedHours = { start?: string; end?: string; timezone?: string };
const LOW_COST_MODELS = ["gpt-4.1-nano", "gpt-4.1-mini"] as const;
const DEFAULT_MODEL = "gpt-4.1-nano";
const MAX_PROMPT_CHARS = 12_000;

function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function lowCostModel(value: string | undefined) {
  const model = value?.trim();
  return LOW_COST_MODELS.includes(model as (typeof LOW_COST_MODELS)[number]) ? model! : DEFAULT_MODEL;
}

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
  private activeApiCalls = 0;

  private clientFor(apiKey: string) {
    return new OpenAI({ apiKey });
  }

  async getConfig() {
    const aiConfig = await prisma.aiConfig.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        model: lowCostModel(config.openai.model),
        promptBase: DEFAULT_AI_PROMPT,
        maxTokens: 120,
        maxChars: 350,
        dailyReplyLimit: 30,
        historyMessages: 4,
        globalEnabled: config.nodeEnv === "development" ? false : config.openai.apiKey.length > 0
      }
    });
    const data: Prisma.AiConfigUpdateInput = {};
    if (!aiConfig.promptBase.trim() || aiConfig.promptBase.trim() === LEGACY_DEFAULT_AI_PROMPT) data.promptBase = DEFAULT_AI_PROMPT;
    if (!LOW_COST_MODELS.includes(aiConfig.model as (typeof LOW_COST_MODELS)[number])) data.model = DEFAULT_MODEL;
    if (aiConfig.maxTokens > 160 || aiConfig.maxTokens < 30) data.maxTokens = 120;
    if (aiConfig.maxChars > 400 || aiConfig.maxChars < 120) data.maxChars = 350;
    if (aiConfig.dailyReplyLimit > 200 || aiConfig.dailyReplyLimit < 1) data.dailyReplyLimit = 30;
    if (aiConfig.historyMessages > 6 || aiConfig.historyMessages < 1) data.historyMessages = 4;
    return Object.keys(data).length
      ? prisma.aiConfig.update({ where: { id: aiConfig.id }, data })
      : aiConfig;
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
    dailyReplyLimit?: number;
    historyMessages?: number;
  }) {
    const apiKey = input.apiKey?.trim();
    const promptBase = input.promptBase?.trim() || undefined;
    if (input.model && !LOW_COST_MODELS.includes(input.model.trim() as (typeof LOW_COST_MODELS)[number])) {
      const error = new Error("Usa gpt-4.1-nano o gpt-4.1-mini para mantener controlado el costo.");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    const model = input.model === undefined ? undefined : lowCostModel(input.model);
    const maxTokens = input.maxTokens === undefined ? undefined : clamp(input.maxTokens, 30, 160, 120);
    const maxChars = input.maxChars === undefined ? undefined : clamp(input.maxChars, 120, 400, 350);
    const dailyReplyLimit = input.dailyReplyLimit === undefined ? undefined : clamp(input.dailyReplyLimit, 1, 200, 30);
    const historyMessages = input.historyMessages === undefined ? undefined : clamp(input.historyMessages, 1, 6, 4);
    return prisma.aiConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        model: model ?? DEFAULT_MODEL,
        promptBase: promptBase ?? DEFAULT_AI_PROMPT,
        encryptedApiKey: apiKey ? encryptSecret(apiKey) : undefined,
        temperature: input.temperature ?? 0.4,
        maxTokens: maxTokens ?? 120,
        tone: input.tone ?? "calido, breve y natural",
        maxChars: maxChars ?? 350,
        dailyReplyLimit: dailyReplyLimit ?? 30,
        historyMessages: historyMessages ?? 4,
        allowedHours: toInputJson(input.allowedHours ?? {}),
        forbiddenWords: input.forbiddenWords ?? [],
        globalEnabled: input.globalEnabled ?? false
      },
      update: {
        model,
        promptBase,
        encryptedApiKey: apiKey ? encryptSecret(apiKey) : undefined,
        temperature: input.temperature,
        maxTokens,
        tone: input.tone,
        maxChars,
        dailyReplyLimit,
        historyMessages,
        allowedHours: input.allowedHours === undefined ? undefined : toInputJson(input.allowedHours),
        forbiddenWords: input.forbiddenWords,
        globalEnabled: input.globalEnabled
      }
    });
  }

  async getUsageLast24Hours(dailyLimit = 30) {
    const logs = await prisma.auditLog.findMany({
      where: {
        action: "AI_API_CALL",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      select: { metadata: true }
    });
    const totals = logs.reduce((result, log) => {
      const metadata = log.metadata as Record<string, unknown>;
      result.inputTokens += Number(metadata.inputTokens ?? 0);
      result.outputTokens += Number(metadata.outputTokens ?? 0);
      result.totalTokens += Number(metadata.totalTokens ?? 0);
      return result;
    }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    return {
      calls: logs.length,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - logs.length),
      ...totals
    };
  }

  private async recordUsage(response: OpenAI.Responses.Response, model: string, purpose: "reply" | "test") {
    const usage = response.usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
    await prisma.auditLog.create({
      data: {
        action: "AI_API_CALL",
        entityType: "OpenAI",
        metadata: {
          model,
          purpose,
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0
        }
      }
    });
  }

  async setGlobalEnabled(enabled: boolean) {
    const aiConfig = await this.getConfig();
    const apiKey = decryptSecret(aiConfig.encryptedApiKey) || config.openai.apiKey;
    if (enabled && !apiKey) {
      const error = new Error("Guarda una API key de OpenAI antes de activar las respuestas automaticas.");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
    return prisma.aiConfig.update({
      where: { id: aiConfig.id },
      data: { globalEnabled: enabled }
    });
  }

  async generateReply(lead: Lead, conversation: Conversation, inboundText: string): Promise<AiReplyResult> {
    const aiConfig = await this.getConfig();
    if (!aiConfig.globalEnabled) return { text: null, reason: "La IA global esta apagada" };
    if (!lead.aiEnabled) return { text: null, reason: "La IA esta pausada para este lead" };
    if (conversation.type !== "PRIVATE") return { text: null, reason: "La IA automatica solo responde chats privados" };
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

    const usage = await this.getUsageLast24Hours(aiConfig.dailyReplyLimit);
    if (usage.calls + this.activeApiCalls >= usage.limit) {
      return { text: null, reason: `Limite diario de IA alcanzado (${usage.limit} respuestas en 24 horas)` };
    }

    const history = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        OR: [
          { direction: "INBOUND" },
          { direction: "OUTBOUND", status: "SENT" }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: aiConfig.historyMessages
    });

    const forbidden = aiConfig.forbiddenWords.join(", ");
    const system = [
      aiConfig.promptBase.slice(0, MAX_PROMPT_CHARS),
      `Tono: ${aiConfig.tone}. Maximo ${aiConfig.maxChars} caracteres.`,
      `Contexto de seguridad: edadConfirmada=${lead.ageConfirmed}. Esto no es una instruccion para preguntar la edad. Responde directamente sobre precios, planes, pago y cualquier informacion comercial normal. Solo si el proximo mensaje fuera a incluir contenido sensible y edadConfirmada=false, pide la confirmacion una sola vez y de forma breve. Nunca pidas opt-in ni permiso de seguimiento dentro de una respuesta a un mensaje entrante.`,
      "Reglas obligatorias: no envies contenido sensible si edadConfirmada=false; si pide no recibir mensajes, responde una sola vez de forma amable y no insistas; no inventes pagos, enlaces ni promesas.",
      forbidden ? `Palabras prohibidas: ${forbidden}` : ""
    ].filter(Boolean).join("\n");

    const input: OpenAI.Responses.ResponseInput = [
      {
        role: "user",
        content: `Datos utiles del lead: nombre=${lead.name}, username=${lead.username ?? ""}, estado=${lead.status}. Sigue el prompt base y responde al ultimo mensaje sin repetir preguntas ya contestadas.`
      },
      ...history.reverse().map((message) => ({
        role: message.direction === "INBOUND" ? "user" as const : "assistant" as const,
        content: (message.body ?? "[imagen]").slice(0, 700)
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

    this.activeApiCalls += 1;
    let response: OpenAI.Responses.Response;
    try {
      response = await this.clientFor(apiKey).responses.create(request);
      await this.recordUsage(response, aiConfig.model, "reply");
    } finally {
      this.activeApiCalls -= 1;
    }

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

    const usage = await this.getUsageLast24Hours(aiConfig.dailyReplyLimit);
    if (usage.calls + this.activeApiCalls >= usage.limit) {
      const error = new Error(`Limite diario de IA alcanzado (${usage.limit} llamadas en 24 horas).`);
      (error as Error & { status?: number }).status = 429;
      throw error;
    }

    this.activeApiCalls += 1;
    let response: OpenAI.Responses.Response;
    try {
      response = await this.clientFor(apiKey).responses.create({
        model: aiConfig.model,
        instructions: "Eres una prueba tecnica. Responde de forma muy breve.",
        input: "Responde exactamente: CONEXION_OK",
        max_output_tokens: 15,
        store: false
      });
      await this.recordUsage(response, aiConfig.model, "test");
    } finally {
      this.activeApiCalls -= 1;
    }

    return {
      ok: true,
      model: aiConfig.model,
      response: response.output_text?.trim() || "Respuesta recibida sin texto"
    };
  }
}

export const aiService = new AiService();
