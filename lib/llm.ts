// Minimal OpenAI-compatible chat client (works against GMI Cloud, OpenAI, or any compatible endpoint).
// Env: LLM_API_KEY or GMI_API_KEY; LLM_BASE_URL (default GMI Cloud); LLM_MODEL.
// scripts/benchmark.mjs carries the same call in plain JS; keep the two in sync.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatOptions = { model?: string; temperature?: number; json?: boolean; maxTokens?: number };

const DEFAULT_BASE_URL = "https://api.gmi-serving.com/v1";
const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

const apiKey = () => process.env.LLM_API_KEY || process.env.GMI_API_KEY || "";
export const baseUrl = () => (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
export const modelName = () => process.env.LLM_MODEL || DEFAULT_MODEL;

export function hasKey(): boolean {
  return apiKey().length > 0;
}

export function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (!hasKey()) throw new Error("No LLM API key set (LLM_API_KEY or GMI_API_KEY)");
  const body: Record<string, unknown> = {
    model: opts.model || modelName(),
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 600,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastError = `network error: ${(e as Error).message}`;
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      return opts.json ? stripFences(text) : text;
    }
    const snippet = (await res.text()).slice(0, 300);
    lastError = `LLM request failed: ${res.status} ${snippet}`;
    // Some endpoints reject response_format; retry once without it.
    if (res.status === 400 && body.response_format) {
      delete body.response_format;
      continue;
    }
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(lastError);
}
