// Claude through the official Anthropic SDK. Shared by lib/llm.ts (the app) and scripts/benchmark.mjs.
// Reads ANTHROPIC_API_KEY from the environment. Model: ANTHROPIC_MODEL, default claude-opus-5-5.
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Running token totals for this process, so the benchmark can report what it spent. */
export const usage = { calls: 0, input: 0, output: 0 };

let client;
let fallbacksOk = true;

/**
 * @param {{role: "system"|"user"|"assistant", content: string}[]} messages
 * @param {{model?: string, effort?: "low"|"medium"|"high"|"xhigh"|"max", maxTokens?: number}} [opts]
 * @returns {Promise<string>} the text of the reply
 */
export async function anthropicChat(messages, opts = {}) {
  client ??= new Anthropic({ maxRetries: 6 });
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const params = {
    model: opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    // thinking is always on for this model and counts toward max_tokens, so leave room
    max_tokens: Math.max(opts.maxTokens ?? 0, 8000),
    messages: messages.filter((m) => m.role !== "system"),
    // these are short classification and drafting calls; low effort keeps them quick
    output_config: { effort: opts.effort ?? "low" },
  };
  if (system) params.system = system;

  let res;
  if (fallbacksOk) {
    try {
      // if a safety classifier declines, let the API re-run the request on its default fallback model
      res = await client.beta.messages.create({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError) || !/fallback|beta/i.test(String(e.message))) throw e;
      fallbacksOk = false;
    }
  }
  res ??= await client.messages.create(params);

  usage.calls += 1;
  usage.input += res.usage?.input_tokens ?? 0;
  usage.output += res.usage?.output_tokens ?? 0;

  if (res.stop_reason === "refusal") {
    throw new Error(`The model declined this request (${res.stop_details?.category ?? "no category"}).`);
  }
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}
