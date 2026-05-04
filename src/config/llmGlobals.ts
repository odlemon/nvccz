/**
 * Default LLM credentials (OpenAI-compatible `POST …/v1/chat/completions`).
 *
 * Used when `LLM_API_KEY` is not set in the environment — portfolio application
 * shortlisting (`ChatGPTService` → `LlmChatService`), Suite 06 invoice extraction, etc.
 *
 * To use OpenAI (or another host) instead, set `LLM_API_KEY` (and optionally
 * `LLM_API_BASE_URL`, `LLM_MODEL`) in the environment; those override these defaults.
 *
 * **Rotate this key** before any production deploy that exposes the repo; treat as test/UAT.
 */
export const LLM_GLOBAL_DEFAULTS = {
  apiKey: "sk-7304b429a9dc4272bc0ab3a81bff65a0",
  apiBaseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
} as const;
