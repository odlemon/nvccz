//@ts-nocheck
import axios from "axios";
import { logger } from "../utils/logger";

export type LlmChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmChatCompletionOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormatJsonObject?: boolean;
};

/**
 * OpenAI-compatible chat completions client (configurable base URL + API key).
 * Used by portfolio scoring, Suite 06 invoice extraction, and other LLM features.
 */
export function getLlmConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  configured: boolean;
} {
  const baseUrl = (process.env.LLM_API_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY || "";
  const model = process.env.LLM_MODEL || "gpt-4o";
  const timeoutMs = Math.min(120000, Math.max(5000, Number(process.env.LLM_TIMEOUT_MS) || 60000));
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    configured: Boolean(apiKey && apiKey.length > 0),
  };
}

export class LlmChatService {
  /**
   * POST /chat/completions (OpenAI-compatible).
   * Returns assistant message content string or throws.
   */
  static async chatCompletion(
    messages: LlmChatMessage[],
    options?: LlmChatCompletionOptions
  ): Promise<string> {
    const cfg = getLlmConfig();
    if (!cfg.configured) {
      throw new Error(
        "LLM is not configured: set LLM_API_KEY (and optionally LLM_API_BASE_URL, LLM_MODEL) in the environment."
      );
    }

    const model = options?.model ?? cfg.model;
    const url = `${cfg.baseUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000,
    };
    if (options?.responseFormatJsonObject) {
      body.response_format = { type: "json_object" };
    }

    logger.info("LlmChatService: request", { url, model, messageCount: messages.length });

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: cfg.timeoutMs,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      const errMsg =
        response.data?.error?.message || response.data?.message || JSON.stringify(response.data);
      throw new Error(`LLM HTTP ${response.status}: ${errMsg}`);
    }

    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.length) {
      throw new Error("LLM returned empty content");
    }
    return content;
  }
}
