// Server-side CCC code helper: lookup, similar past rulings, and classification.
// Data comes from data/tariff.json and data/rulings.json (see data/SOURCES.md).
// Duty rates and import rule codes always come from the tariff file, never from the model.
import fs from "node:fs";
import path from "node:path";
import { anthropicChat } from "@/lib/anthropic.mjs";
import { chat, hasKey, provider, type ChatMessage } from "@/lib/llm";
import { createEngine, formatCode as fmt, headingMessages, parseChoice, parseHeadings, ragMessages, resolveCode } from "./core.mjs";

export type TariffRow = { code: string; zh: string; en: string; duty: string; rules: string[] };
export type SimilarRuling = { id: string; name: string; code: string; date: string; why: string; codeEn?: string };
export type Suggestion = {
  code: string;
  formatted: string;
  zh: string;
  en: string;
  duty: string;
  rules: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
  alternatives: { code: string; formatted: string; zh: string; en?: string; duty: string }[];
  similar: SimilarRuling[];
  source: "llm+rulings" | "nearest-ruling";
};
export type Item = { name: string; material?: string; use?: string };

type RawTariff = { c: string; zh: string; en: string; d: string; r: string[] };
type RawRuling = { id: string; n: string; m: string; u: string; c: string; why: string; dt: string; cur: boolean };
type Engine = {
  byCode: Map<string, RawTariff>;
  similar: (item: Item, k?: number, opts?: { before?: string; excludeIds?: string[] }) => RawRuling[];
  candidates: (item: Item, sim: RawRuling[], opts?: { cap?: number; headings?: string[] }) => RawTariff[];
  exemplars: (item: Item, headings: string[], per?: number, opts?: { before?: string }) => { heading: string; rulings: RawRuling[] }[];
  closestTariff: (item: Item) => RawTariff | undefined;
  lookup: (code: string) => RawTariff | undefined;
};

let engine: Engine | null = null;

function load(): Engine {
  if (engine) return engine;
  const dir = path.join(process.cwd(), "data");
  const tariff = JSON.parse(fs.readFileSync(path.join(dir, "tariff.json"), "utf8")) as RawTariff[];
  const rulings = JSON.parse(fs.readFileSync(path.join(dir, "rulings.json"), "utf8")) as RawRuling[];
  engine = createEngine(tariff, rulings) as unknown as Engine;
  return engine;
}

const toRow = (t: RawTariff): TariffRow => ({ code: t.c, zh: t.zh, en: t.en, duty: t.d, rules: t.r });
const toSimilar = (r: RawRuling): SimilarRuling => ({ id: r.id, name: r.n, code: r.c, date: r.dt, why: r.why });

export function formatCode(code11: string): string {
  return fmt(code11);
}

export function lookup(code: string): TariffRow | undefined {
  const t = load().lookup(String(code).replace(/\D/g, ""));
  return t ? toRow(t) : undefined;
}

export function similarRulings(item: Item, k = 8, opts: { before?: string; excludeIds?: string[] } = {}): SimilarRuling[] {
  return load().similar(item, k, opts).map(toSimilar);
}

function build(
  t: RawTariff,
  sim: RawRuling[],
  reason: string,
  confidence: Suggestion["confidence"],
  alternatives: RawTariff[],
  source: Suggestion["source"]
): Suggestion {
  return {
    code: t.c,
    formatted: fmt(t.c),
    zh: t.zh,
    en: t.en,
    duty: t.d,
    rules: t.r,
    reason,
    confidence,
    alternatives: alternatives.map((a) => ({ code: a.c, formatted: fmt(a.c), zh: a.zh, en: a.en, duty: a.d })),
    // what Customs called the goods in each cited ruling, in English, for readers who do not read Chinese
    similar: sim.map((r) => ({ ...toSimilar(r), codeEn: lookup(r.c)?.en })),
    source,
  };
}

export async function classify(item: Item, opts: { before?: string; lang?: "en" | "zh" } = {}): Promise<Suggestion> {
  const e = load();
  const sim = e.similar(item, 10, { before: opts.before });
  let cands = e.candidates(item, sim);
  if (cands.length === 0) throw new Error("No candidate codes found for this item");

  const nearest = (note: string): Suggestion => {
    const top = sim[0] ? e.byCode.get(sim[0].c) : undefined;
    const pick = top || e.closestTariff(item) || cands[0];
    const others = cands.filter((c) => c.c !== pick.c).slice(0, 2);
    const reason = top
      ? `${note} Copied from the most similar past ruling (${sim[0].id}, ${sim[0].dt}: ${sim[0].n.slice(0, 60)}). Not reviewed by a model.`
      : `${note} No similar past ruling found; this is only the closest tariff description by wording.`;
    return build(pick, sim, reason, top ? "medium" : "low", others, "nearest-ruling");
  };

  if (!hasKey()) return nearest("No model key configured.");

  try {
    // Pass 1: the model proposes HS headings, so the candidate list also covers what retrieval missed.
    const headings = parseHeadings(await chat(headingMessages(item, sim) as ChatMessage[], { json: true, temperature: 0, maxTokens: 120 }));
    cands = e.candidates(item, sim, { headings });
    // Pass 2: the model picks one code from the list.
    const exemplars = e.exemplars(item, headings, 3, { before: opts.before });
    const messages = ragMessages(item, sim, cands, { headings, exemplars, lang: opts.lang }) as ChatMessage[];
    // The final choice runs at high reasoning effort on Claude, the same setting the benchmark was run with.
    const reply =
      provider() === "anthropic"
        ? await anthropicChat(messages, { effort: "high", maxTokens: 700 })
        : await chat(messages, { json: true, temperature: 0, maxTokens: 700 });
    const choice = parseChoice(reply);
    const code = resolveCode(choice.code, cands, e.byCode);
    if (!code) {
      const fallback = (sim[0] && e.byCode.get(sim[0].c)) || e.closestTariff(item) || cands[0];
      return build(
        fallback,
        sim,
        `The model returned a code that is not in the tariff (${choice.code || "empty"}); showing the closest candidate instead. Needs a human check.`,
        "low",
        cands.filter((c) => c.c !== fallback.c).slice(0, 2),
        "llm+rulings"
      );
    }
    const alts = choice.alternatives
      .map((a: string) => e.byCode.get(resolveCode(a, cands, e.byCode)))
      .filter((a: RawTariff | undefined): a is RawTariff => !!a && a.c !== code)
      .slice(0, 2);
    return build(e.byCode.get(code)!, sim, choice.reason || "No reason given by the model.", choice.confidence as Suggestion["confidence"], alts, "llm+rulings");
  } catch (err) {
    return nearest(`Model call failed (${(err as Error).message.slice(0, 80)}).`);
  }
}
