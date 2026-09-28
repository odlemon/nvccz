import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { LlmChatService, LlmChatMessage } from "../services/LlmChatService";
import {
  buildAssistantContext,
  ASSISTANT_SOURCE_LABELS,
  AssistantScope,
  AssistantSourceId,
} from "../services/AssistantContextService";

const MAX_HISTORY_MESSAGES = 20;
const MAX_PROMPT_LENGTH = 4000;
const VALID_SCOPES: AssistantScope[] = ["All connected work", "My work only", "People and knowledge"];

/**
 * Matanho Assistant — the Home hub's AI panel. Reuses LlmChatService (see its own doc comment:
 * already backs portfolio-application scoring and Suite 06 invoice extraction), configured out of
 * the box via the DeepSeek fallback key in src/config/llmGlobals.ts — no new dependency, no new
 * key to provision. No conversation-thread table exists anywhere in the schema (checked before
 * building this), so history is entirely client-managed: the caller resends the trimmed transcript
 * every turn, same shape as any OpenAI-compatible chat client.
 *
 * `scope`/`sources` (both optional) let the caller narrow which of the five real data sources
 * (My Work/Calendar/Forums/News/People) get fetched and injected as context — see
 * AssistantContextService.buildAssistantContext for the actual queries and the scope->source
 * mapping. Matches the composer's scope dropdown and the sidebar's per-source toggles in the
 * frontend runtime exactly.
 */
export const assistantController = {
  async chat(req: AuthRequest, res: Response) {
    try {
      const { prompt, history, scope, sources } = req.body;
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

      const resolvedScope: AssistantScope = VALID_SCOPES.includes(scope) ? scope : "All connected work";
      const context = await buildAssistantContext(req.user.id, resolvedScope, sources);

      const usedLabels = context.sourcesUsed.map((id: AssistantSourceId) => ASSISTANT_SOURCE_LABELS[id]);
      const emptyLabels = context.enabledEmpty.map((id: AssistantSourceId) => ASSISTANT_SOURCE_LABELS[id]);
      const accessParts: string[] = [];
      if (usedLabels.length) {
        accessParts.push(
          `You have live, permission-scoped access to the following real Matanho data for this user, provided ` +
            `below as context: ${usedLabels.join(", ")}. Use it to answer specifically rather than generically, ` +
            `and don't invent details beyond what's given.`
        );
      }
      if (emptyLabels.length) {
        // Enabled but nothing came back — a real, useful answer ("you have no open tasks right
        // now"), not the same as lacking access to it.
        accessParts.push(`You checked ${emptyLabels.join(", ")} and there is currently nothing there for this user.`);
      }
      if (!usedLabels.length && !emptyLabels.length) {
        accessParts.push(
          `You do not have live access to this user's specific tasks, calendar, performance scorecard, forums, ` +
            `news or documents in this conversation (no data sources are currently connected in the panel's ` +
            `context settings).`
        );
      }
      accessParts.push(
        `You do NOT have access to performance scorecards, documents, or anything not explicitly listed above ` +
          `— say so honestly if asked about those, and point to the relevant page (My Work, Calendar, ` +
          `Performance, Forums, News, Services) instead.`
      );
      const accessNote = accessParts.join(" ");

      const messages: LlmChatMessage[] = [
        {
          role: "system",
          content:
            `You are Matanho Assistant, a helpful AI assistant embedded in the Matanho investment-management ` +
            `platform, talking with ${userName}. Today is ${today}. Answer clearly and concisely — a short ` +
            `paragraph or a brief list, not an essay. Reply in plain text only — no markdown ` +
            `formatting (no **bold**, no # headings, no [links](url)), since the panel displays ` +
            `your reply as plain text. ${accessNote}`,
        },
      ];
      if (context.text) {
        messages.push({ role: "system", content: `Live Matanho data (permission-scoped to this user):\n\n${context.text}` });
      }

      const rawHistory: any[] = Array.isArray(history) ? history : [];
      for (const m of rawHistory.slice(-MAX_HISTORY_MESSAGES)) {
        const role = m?.role === "assistant" ? "assistant" : "user";
        const content = String(m?.content || "").trim();
        if (content) messages.push({ role, content });
      }
      messages.push({ role: "user", content: p });

      const reply = await LlmChatService.chatCompletion(messages, { temperature: 0.4, maxTokens: 700 });

      res.status(200).json({
        success: true,
        data: {
          reply,
          sourcesUsed: context.sourcesUsed.map((id: AssistantSourceId) => ASSISTANT_SOURCE_LABELS[id]),
        },
      });
    } catch (error: any) {
      console.error("Error in assistant chat:", error);
      res.status(500).json({
        success: false,
        message: error?.message || "Failed to get a response from the assistant",
      });
    }
  },
};
