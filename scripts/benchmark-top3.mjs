// The customs card shows one suggested code and up to two alternatives, and a person picks.
// So the question that matters for the card is also: how often is the right code among the three shown?
// Same 300 held-out 2018 rulings, same pre-2018 reference pool, same prompts as scripts/benchmark.mjs (rag mode).
//
//   node scripts/benchmark-top3.mjs [--concurrency 12] [--model claude-haiku-5-5]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine, headingMessages, parseChoice, parseHeadings, ragMessages, resolveCode } from "../lib/ccc/core.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { anthropicChat, usage } = await import("../lib/anthropic.mjs");

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const CONC = Number(flag("concurrency", "12"));
const MODEL = flag("model", process.env.ANTHROPIC_MODEL || "claude-haiku-5-5");
const CUTOFF = "2018-01-01";

const tariff = JSON.parse(fs.readFileSync(path.join(root, "data", "tariff.json"), "utf8"));
const rulings = JSON.parse(fs.readFileSync(path.join(root, "data", "rulings.json"), "utf8"));
const engine = createEngine(tariff, rulings.filter((r) => r.dt < CUTOFF));
const test = JSON.parse(fs.readFileSync(path.join(root, "data", "benchmark", "testset.json"), "utf8"));

const chat = (messages, opts = {}) => anthropicChat(messages, { model: MODEL, ...opts });

async function shown(t) {
  const item = { name: t.name, material: t.material, use: t.use };
  const sim = engine.similar(item, 10);
  const headings = parseHeadings(await chat(headingMessages(item, sim), { maxTokens: 120 }));
  const cands = engine.candidates(item, sim, { headings });
  const exemplars = engine.exemplars(item, headings, 3);
  const choice = parseChoice(await chat(ragMessages(item, sim, cands, { headings, exemplars }), { effort: "high" }));
  const codes = [];
  for (const raw of [choice.code, ...(choice.alternatives || [])]) {
    const c = resolveCode(raw, cands, engine.byCode) || raw;
    if (c && engine.byCode.has(c) && !codes.includes(c)) codes.push(c);
  }
  return codes.slice(0, 3);
}

const rows = new Array(test.length);
let next = 0;
let done = 0;
let errors = 0;
await Promise.all(
  Array.from({ length: CONC }, async () => {
    for (;;) {
      const i = next++;
      if (i >= test.length) return;
      try {
        rows[i] = await shown(test[i]);
      } catch (e) {
        rows[i] = [];
        if (++errors <= 3) console.error(test[i].id, e.message);
      }
      if (++done % 50 === 0) console.log(`  ${done}/${test.length}`);
    }
  }),
);

const hit = (codes, truth, digits) => codes.some((c) => c.slice(0, digits) === truth.slice(0, digits));
const count = (k, digits) => test.filter((t, i) => hit(rows[i].slice(0, k), t.truth, digits)).length;
const out = {
  ranAt: new Date().toISOString(),
  model: MODEL,
  n: test.length,
  errors,
  note: "top1 = the suggested code. top3 = the suggested code or one of the up to two alternatives the card shows. Same test items and reference pool as results.json. This is a separate run, so top1 can differ by a few items from results.json.",
  top1: { d6: count(1, 6), d8: count(1, 8), d11: count(1, 11) },
  top3: { d6: count(3, 6), d8: count(3, 8), d11: count(3, 11) },
  averageShown: Number((rows.reduce((a, r) => a + r.length, 0) / test.length).toFixed(2)),
  items: test.map((t, i) => ({ id: t.id, truth: t.truth, shown: rows[i] })),
};
fs.writeFileSync(path.join(root, "data", "benchmark", "top3.json"), JSON.stringify(out, null, 1));
const pct = (x) => `${x}/${test.length} (${((x / test.length) * 100).toFixed(1)}%)`;
console.log(`top1  6-digit ${pct(out.top1.d6)} | 8-digit ${pct(out.top1.d8)} | 11-digit ${pct(out.top1.d11)}`);
console.log(`top3  6-digit ${pct(out.top3.d6)} | 8-digit ${pct(out.top3.d8)} | 11-digit ${pct(out.top3.d11)}`);
console.log(`average codes shown per item: ${out.averageShown} | errors ${errors}`);
console.log(`model calls: ${usage.calls}, input tokens: ${usage.input}, output tokens: ${usage.output}`);
