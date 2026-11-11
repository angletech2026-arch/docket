// Time-split benchmark for CCC classification.
//   reference pool = advance rulings dated <= 2017-12-31
//   test set       = seeded random sample of 2018 rulings whose code is still in the current tariff
// Modes: nearest (no model), llm (model alone), rag (model + past rulings + candidate list).
//
//   node scripts/benchmark.mjs --modes nearest
//   node scripts/benchmark.mjs --modes llm,rag --n 300 --concurrency 8      (needs a key in .env.local)
//   flags: --model <id>   --resume (keep predictions already in results.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anthropicChat, DEFAULT_ANTHROPIC_MODEL, usage } from "../lib/anthropic.mjs";
import { createEngine, headingMessages, llmOnlyMessages, parseChoice, parseHeadings, ragMessages, resolveCode } from "../lib/ccc/core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = 20261111;
const CUTOFF = "2018-01-01"; // reference pool is strictly before this date

// --- env / args -------------------------------------------------------------
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt;
};
const N = Number(flag("n", "300"));
const CONC = Number(flag("concurrency", "8"));
const MODES = flag("modes", "nearest").split(",").map((s) => s.trim()).filter(Boolean);
const RESUME = args.includes("--resume");
// reasoning effort for the final choice in rag mode (Claude only): low | medium | high
const EFFORT = flag("effort", "high");
const OPENAI_KEY = process.env.LLM_API_KEY || process.env.GMI_API_KEY || "";
// same choice as lib/llm.ts: Claude when ANTHROPIC_API_KEY is set, else an OpenAI-compatible endpoint
const PROVIDER =
  process.env.LLM_PROVIDER === "openai" && OPENAI_KEY
    ? "openai"
    : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : OPENAI_KEY
        ? "openai"
        : null;
const API_KEY = OPENAI_KEY;
const BASE_URL = (process.env.LLM_BASE_URL || "https://api.gmi-serving.com/v1").replace(/\/+$/, "");
const MODEL = flag(
  "model",
  PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
    : process.env.LLM_MODEL || "meta-llama/Llama-3.3-70B-Instruct"
);

for (const m of MODES) {
  if (!["nearest", "llm", "rag"].includes(m)) {
    console.error(`Unknown mode "${m}". Use nearest, llm, rag.`);
    process.exit(1);
  }
}
if (MODES.some((m) => m !== "nearest") && !PROVIDER) {
  console.error("Modes llm/rag need ANTHROPIC_API_KEY, or LLM_API_KEY / GMI_API_KEY (put it in .env.local).");
  process.exit(1);
}

// --- same call as lib/llm.ts -------------------------------------------------
async function chat(messages, { json = true, maxTokens = 400, effort = "low" } = {}) {
  if (PROVIDER === "anthropic") return anthropicChat(messages, { model: MODEL, maxTokens, effort });
  const body = { model: MODEL, messages, temperature: 0, max_tokens: maxTokens };
  if (json) body.response_format = { type: "json_object" };
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.min(20000, 800 * 2 ** (attempt - 1))));
    let res;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      last = `network error: ${e.message}`;
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    }
    last = `${res.status} ${(await res.text()).slice(0, 200)}`;
    if (res.status === 400 && body.response_format) {
      delete body.response_format;
      continue;
    }
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(last);
}

// --- data -------------------------------------------------------------------
const tariff = JSON.parse(fs.readFileSync(path.join(root, "data", "tariff.json"), "utf8"));
const rulings = JSON.parse(fs.readFileSync(path.join(root, "data", "rulings.json"), "utf8"));
const pool = rulings.filter((r) => r.dt < CUTOFF);
const engine = createEngine(tariff, pool);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const eligible = rulings.filter((r) => r.dt >= CUTOFF && r.cur && r.n.length >= 4);
const rand = mulberry32(SEED);
const shuffled = eligible.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const test = shuffled.slice(0, Math.min(N, shuffled.length));

const outDir = path.join(root, "data", "benchmark");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "testset.json"),
  JSON.stringify(
    test.map((r) => ({ id: r.id, date: r.dt, name: r.n, material: r.m, use: r.u, truth: r.c })),
    null,
    1
  )
);

console.log(`reference pool: ${pool.length} rulings before ${CUTOFF}`);
console.log(`test set: ${test.length} of ${eligible.length} eligible 2018 rulings (seed ${SEED})`);

// --- prediction -------------------------------------------------------------
const toItem = (r) => ({ name: r.n, material: r.m, use: r.u });

async function predict(mode, r) {
  const item = toItem(r);
  if (mode === "nearest") return engine.similar(item, 1)[0]?.c || "";
  if (mode === "llm") return parseChoice(await chat(llmOnlyMessages(item))).code;
  // Same two passes as lib/ccc classify(): headings first, then pick from the candidate list.
  const sim = engine.similar(item, 10);
  const headings = parseHeadings(await chat(headingMessages(item, sim), { maxTokens: 120 }));
  const cands = engine.candidates(item, sim, { headings });
  // the engine is built on the pre-cutoff pool only, so these exemplars cannot include a 2018 ruling
  const exemplars = engine.exemplars(item, headings, 3);
  const raw = parseChoice(await chat(ragMessages(item, sim, cands, { headings, exemplars }), { effort: EFFORT })).code;
  return resolveCode(raw, cands, engine.byCode) || raw;
}

async function runMode(mode, previous) {
  const preds = new Array(test.length).fill("");
  let next = 0;
  let done = 0;
  let errors = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= test.length) return;
      const kept = RESUME ? previous.get(test[i].id)?.pred?.[mode] : "";
      if (kept) preds[i] = kept;
      else {
        try {
          preds[i] = await predict(mode, test[i]);
        } catch (e) {
          errors++;
          if (errors <= 3) console.error(`  [${mode}] ${test[i].id}: ${e.message}`);
        }
      }
      if (++done % 50 === 0) console.log(`  [${mode}] ${done}/${test.length}`);
    }
  };
  await Promise.all(Array.from({ length: mode === "nearest" ? 1 : CONC }, worker));
  return { preds, errors };
}

function score(preds, errors) {
  const m = { d4: 0, d6: 0, d8: 0, d11: 0, invalid: 0, errors, n: test.length };
  preds.forEach((p, i) => {
    const t = test[i].c;
    if (!p || !engine.byCode.has(p)) m.invalid++;
    if (p && p.slice(0, 4) === t.slice(0, 4)) m.d4++;
    if (p && p.length >= 6 && p.slice(0, 6) === t.slice(0, 6)) m.d6++;
    if (p && p.length >= 8 && p.slice(0, 8) === t.slice(0, 8)) m.d8++;
    if (p === t) m.d11++;
  });
  return m;
}

// --- run and merge ----------------------------------------------------------
const resultsPath = path.join(outDir, "results.json");
let existing = null;
if (fs.existsSync(resultsPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  } catch {
    existing = null;
  }
}
const sameSet =
  existing && Array.isArray(existing.items) && existing.items.length === test.length && existing.items.every((it, i) => it.id === test[i].id);
const previous = new Map(sameSet ? existing.items.map((it) => [it.id, it]) : []);
const out = {
  ranAt: new Date().toISOString(),
  model: MODEL,
  models: sameSet && existing.models ? { ...existing.models } : {},
  n: test.length,
  protocol:
    `Time split. Reference pool: ${pool.length} Taiwan Customs advance rulings dated before ${CUTOFF}. ` +
    `Test set: ${test.length} rulings from 2018 (random sample, seed ${SEED}) whose ruled code still exists in the current tariff. ` +
    `Truth is the code Customs ruled. Scores are exact prefix matches at 4, 6, 8 and all 11 digits.`,
  modes: sameSet && existing.modes ? { ...existing.modes } : {},
  items: test.map((r) => {
    const old = previous.get(r.id);
    return {
      id: r.id,
      name: r.n,
      truth: r.c,
      truthZh: engine.byCode.get(r.c)?.zh || "",
      pred: old?.pred ? { ...old.pred } : {},
      ok8: old?.ok8 ? { ...old.ok8 } : {},
    };
  }),
};

for (const mode of MODES) {
  const started = Date.now();
  const { preds, errors } = await runMode(mode, previous);
  out.modes[mode] = score(preds, errors);
  if (mode !== "nearest") out.models[mode] = MODEL;
  preds.forEach((p, i) => {
    out.items[i].pred[mode] = p;
    out.items[i].ok8[mode] = !!p && p.slice(0, 8) === test[i].c.slice(0, 8);
  });
  fs.writeFileSync(resultsPath, JSON.stringify(out, null, 1));
  const m = out.modes[mode];
  const pct = (x) => `${x}/${m.n} (${((100 * x) / m.n).toFixed(1)}%)`;
  console.log(
    `${mode.padEnd(8)} 4-digit ${pct(m.d4)} | 6-digit ${pct(m.d6)} | 8-digit ${pct(m.d8)} | 11-digit ${pct(m.d11)} | invalid ${m.invalid} | errors ${m.errors} | ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
}
console.log(`wrote ${path.relative(root, resultsPath)}`);
if (!MODES.includes("llm") || !MODES.includes("rag")) {
  console.log("To run the model modes once a key is in .env.local:  node scripts/benchmark.mjs --modes llm,rag --n 300 --concurrency 8 --resume");
}

process.on("exit", () => {
  if (usage.calls > 0) {
    console.log(`model calls: ${usage.calls}, input tokens: ${usage.input}, output tokens: ${usage.output}`);
  }
});
