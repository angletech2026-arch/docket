// One chat() for the whole app, two ways to reach a model.
//
//  1. Claude, through the official Anthropic SDK. Used when ANTHROPIC_API_KEY is set.
//     Model: ANTHROPIC_MODEL, default claude-opus-5-5.
//  2. Any OpenAI-compatible endpoint. Used when LLM_API_KEY (or GMI_API_KEY) is set.
//     LLM_BASE_URL and LLM_MODEL choose the server and model. This is also the path for a model
//     running inside the company: local servers such as Ollama and vLLM speak this protocol,
//     so pointing LLM_BASE_URL at one is the planned production setup. Not tested yet.
//
// LLM_PROVIDER=anthropic|openai forces one when both kinds of key are present.
// scripts/benchmark.mjs makes the same two calls in plain JS; keep them in sync.

import { anthropicChat, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.mjs";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatOptions = { model?: string; temperature?: number; json?: boolean; maxTokens?: number };

const DEFAULT_BASE_URL = "https://api.gmi-serving.com/v1";
const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

const openaiKey = () => process.env.LLM_API_KEY || process.env.GMI_API_KEY || "";
const anthropicKey = () => process.env.ANTHROPIC_API_KEY || "";

export function provider(): "anthropic" | "openai" | null {
  const forced = process.env.LLM_PROVIDER;
  if (forced === "anthropic" && anthropicKey()) return "anthropic";
  if (forced === "openai" && openaiKey()) return "openai";
  if (anthropicKey()) return "anthropic";
  if (openaiKey()) return "openai";
  return null;
}

export const baseUrl = () => (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
export const modelName = () =>
  provider() === "anthropic"
    ? process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
    : process.env.LLM_MODEL || DEFAULT_MODEL;

export function hasKey(): boolean {
  return provider() !== null;
}

/** Strip code fences, and if the model wrapped the object in prose, keep just the object. */
export function stripFences(text: string): string {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (t.startsWith("{") || t.startsWith("[")) return t;
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const which = provider();
  if (!which) throw new Error("No model key set (ANTHROPIC_API_KEY, or LLM_API_KEY / GMI_API_KEY)");

  if (which === "anthropic") {
    // Current Claude models take no temperature, so opts.temperature is not sent on this path.
    const text = await anthropicChat(messages, { model: opts.model, maxTokens: opts.maxTokens });
    return opts.json ? stripFences(text) : text;
  }

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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey()}` },
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
