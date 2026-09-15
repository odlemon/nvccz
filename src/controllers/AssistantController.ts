import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { LlmChatService, LlmChatMessage } from "../services/LlmChatService";

const MAX_HISTORY_MESSAGES = 20;
const MAX_PROMPT_LENGTH = 4000;

/**
 * Matanho Assistant — the Home hub's AI panel. Reuses LlmChatService (see its own doc comment:
 * already backs portfolio-application scoring and Suite 06 invoice extraction), configured out of
 * the box via the DeepSeek fallback key in src/config/llmGlobals.ts — no new dependency, no new
 * key to provision. No conversation-thread table exists anywhere in the schema (checked before
 * building this), so history is entirely client-managed: the caller resends the trimmed transcript
 * every turn, same shape as any OpenAI-compatible chat client.
 */
export const assistantController = {
  async chat(req: AuthRequest, res: Response) {
    try {
      const { prompt, history } = req.body;
      const p = String(prompt || "").trim().slice(0, MAX_PROMPT_LENGTH);
      if (!p) {
        res.status(400).json({ success: false, message: "A message is required" });
        return;
      }

      const userName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "there";
      const today = new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const messages: LlmChatMessage[] = [
        {
          role: "system",
          content:
            `You are Matanho Assistant, a helpful AI assistant embedded in the Matanho investment-management ` +
            `platform, talking with ${userName}. Today is ${today}. Answer clearly and concisely — a short ` +
            `paragraph or a brief list, not an essay. You do not have live access to this user's specific ` +
            `tasks, calendar, performance scorecard or documents in this conversation. If asked about those, ` +
            `say so honestly rather than inventing details, and point to the relevant page (My Work, ` +
            `Calendar, Performance, Services) instead.`,
        },
      ];

      const rawHistory: any[] = Array.isArray(history) ? history : [];
      for (const m of rawHistory.slice(-MAX_HISTORY_MESSAGES)) {
        const role = m?.role === "assistant" ? "assistant" : "user";
        const content = String(m?.content || "").trim();
        if (content) messages.push({ role, content });
      }
      messages.push({ role: "user", content: p });

      const reply = await LlmChatService.chatCompletion(messages, { temperature: 0.4, maxTokens: 700 });

      res.status(200).json({ success: true, data: { reply } });
    } catch (error: any) {
      console.error("Error in assistant chat:", error);
      res.status(500).json({
        success: false,
        message: error?.message || "Failed to get a response from the assistant",
      });
    }
  },
};
