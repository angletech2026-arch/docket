// Shared classification core. Plain ESM so both the Next server (lib/ccc/index.ts)
// and the node benchmark (scripts/benchmark.mjs) run exactly the same retrieval,
// candidate building and prompt.

/** "87083091003" -> "8708.30.91.00-3" */
export function formatCode(code) {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length !== 11) return String(code || "");
  return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}.${c.slice(8, 10)}-${c.slice(10)}`;
}

const CJK = /[㐀-鿿豈-﫿]/;

/** CJK character bigrams + lowercase latin/digit word tokens. */
export function tokenize(text) {
  const s = String(text || "").normalize("NFKC").toLowerCase();
  const out = [];
  let latin = "";
  let run = "";
  const flushLatin = () => {
    if (latin.length >= 2) out.push(latin);
    latin = "";
  };
  const flushRun = () => {
    if (run.length === 1) out.push(run);
    else for (let i = 0; i + 1 < run.length; i++) out.push(run[i] + run[i + 1]);
    run = "";
  };
  for (const ch of s) {
    if (CJK.test(ch)) {
      flushLatin();
      run += ch;
    } else if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      flushRun();
      latin += ch;
    } else {
      flushLatin();
      flushRun();
    }
  }
  flushLatin();
  flushRun();
  return out;
}

/** BM25 index over an array of strings. */
export function buildIndex(texts) {
  const postings = new Map();
  const len = new Float32Array(texts.length);
  let total = 0;
  for (let i = 0; i < texts.length; i++) {
    const toks = tokenize(texts[i]);
    len[i] = toks.length;
    total += toks.length;
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [t, f] of tf) {
      let p = postings.get(t);
      if (!p) postings.set(t, (p = []));
      p.push(i, f);
    }
  }
  return { postings, len, avg: texts.length ? total / texts.length : 0, n: texts.length };
}

/** Top-k BM25 hits. `accept(docIndex)` filters documents (date cut-off, exclusions). */
export function search(index, queryText, k = 8, accept) {
  const K1 = 1.2;
  const B = 0.75;
  const scores = new Map();
  const seen = new Set();
  for (const t of tokenize(queryText)) {
    if (seen.has(t)) continue;
    seen.add(t);
    const p = index.postings.get(t);
    if (!p) continue;
    const df = p.length / 2;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    for (let j = 0; j < p.length; j += 2) {
      const d = p[j];
      const f = p[j + 1];
      const s = (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.len[d]) / (index.avg || 1)));
      scores.set(d, (scores.get(d) || 0) + s);
    }
  }
  const hits = [];
  for (const [i, score] of scores) if (!accept || accept(i)) hits.push({ i, score });
  hits.sort((a, b) => b.score - a.score || a.i - b.i);
  return hits.slice(0, k);
}

const itemText = (it) => [it.name, it.name, it.material, it.use].filter(Boolean).join(" ");

/**
 * tariff: [{c, zh, en, d, r}]   rulings: [{id, n, m, u, c, why, dt, cur}]
 * Returns the retrieval engine used by both the app and the benchmark.
 */
export function createEngine(tariff, rulings) {
  const byCode = new Map(tariff.map((t) => [t.c, t]));
  const byPrefix6 = new Map();
  for (const t of tariff) {
    const k = t.c.slice(0, 6);
    let a = byPrefix6.get(k);
    if (!a) byPrefix6.set(k, (a = []));
    a.push(t);
  }
  const byPrefix4 = new Map();
  for (const t of tariff) {
    const k = t.c.slice(0, 4);
    let a = byPrefix4.get(k);
    if (!a) byPrefix4.set(k, (a = []));
    a.push(t);
  }
  let rulingIndex = null;
  let tariffIndex = null;
  const rIdx = () => (rulingIndex ||= buildIndex(rulings.map((r) => `${r.n} ${r.n} ${r.m} ${r.u}`)));
  const tIdx = () => (tariffIndex ||= buildIndex(tariff.map((t) => `${t.zh} ${t.en}`)));

  /** Similar past rulings whose code still exists in the current tariff. */
  function similar(item, k = 8, opts = {}) {
    const exclude = opts.excludeIds ? new Set(opts.excludeIds) : null;
    const before = opts.before || null;
    const hits = search(rIdx(), itemText(item), k, (i) => {
      const r = rulings[i];
      if (!r.cur) return false;
      if (before && !(r.dt < before)) return false;
      if (exclude && exclude.has(r.id)) return false;
      return true;
    });
    return hits.map((h) => ({ ...rulings[h.i], score: h.score }));
  }

  /**
   * Candidate codes the model chooses from:
   *  1. codes of the similar past rulings,
   *  2. every code under the 4-digit headings those rulings point to, plus any `headings`
   *     proposed by the model in the first pass,
   *  3. lexical hits on the tariff descriptions.
   * Returned sorted by code so each heading reads as one block.
   */
  function candidates(item, sim, opts = {}) {
    const cap = opts.cap || 140;
    const out = [];
    const seen = new Set();
    const add = (t) => {
      if (t && !seen.has(t.c) && out.length < cap) {
        seen.add(t.c);
        out.push(t);
      }
    };
    for (const r of sim) add(byCode.get(r.c));
    const heads = [];
    for (const h of opts.headings || []) if (/^\d{4}$/.test(h) && !heads.includes(h)) heads.push(h);
    for (const r of sim) if (heads.length < (opts.headings ? opts.headings.length : 0) + 3 && !heads.includes(r.c.slice(0, 4))) heads.push(r.c.slice(0, 4));
    for (const h of heads) for (const t of (byPrefix4.get(h) || []).slice(0, 45)) add(t);
    for (const h of search(tIdx(), [item.name, item.use].filter(Boolean).join(" "), 12)) add(tariff[h.i]);
    return out.sort((x, y) => (x.c < y.c ? -1 : 1));
  }

  /** Closest tariff line by wording alone (last-resort fallback). */
  function closestTariff(item) {
    const h = search(tIdx(), [item.name, item.use].filter(Boolean).join(" "), 1)[0];
    return h ? tariff[h.i] : undefined;
  }

  return { byCode, similar, candidates, closestTariff, lookup: (c) => byCode.get(c) };
}

const clip = (s, n) => {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

const describeItem = (it) =>
  [`Declared name: ${it.name}`, it.material ? `Material / composition: ${it.material}` : "", it.use ? `Function / use: ${it.use}` : ""]
    .filter(Boolean)
    .join("\n");

/** First pass: ask the model which 4-digit HS headings could apply, so the candidate list covers them. */
export function headingMessages(item, sim) {
  const hints = sim
    .slice(0, 5)
    .map((r) => `- ${clip(r.n, 80)} -> heading ${r.c.slice(0, 4)}`)
    .join("\n");
  return [
    {
      role: "system",
      content:
        "You are a customs classification specialist. Given imported goods, name the Harmonized System 4-digit headings that could apply, most likely first. " +
        "Think about what the goods are, what they are made of and their principal function; parts specifically named elsewhere do not go under a general parts heading. Reply with JSON only.",
    },
    {
      role: "user",
      content: `GOODS
${describeItem(item)}

HEADINGS OF SIMILAR PAST RULINGS (hints, may be wrong)
${hints || "(none)"}

Return JSON: {"headings": ["<4 digits>", "<4 digits>", "<4 digits>"]}`,
    },
  ];
}

/** Parse the first-pass reply into up to four 4-digit headings. */
export function parseHeadings(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/(?<!\d)(\d{2})\.?(\d{2})(?!\d)/g)) {
    const h = m[1] + m[2];
    if (!out.includes(h)) out.push(h);
    if (out.length >= 4) break;
  }
  return out;
}

/** Prompt for "model + past rulings": the model must choose from the candidate list. */
export function ragMessages(item, sim, cands) {
  const rulings = sim
    .map(
      (r, i) =>
        `${i + 1}. [${r.dt}] ${clip(r.n, 120)}${r.u ? ` | use: ${clip(r.u, 100)}` : ""}\n   ruled ${r.c} — ${clip(r.why, 220)}`
    )
    .join("\n");
  const list = cands.map((t) => `${t.c} | ${clip(t.zh, 70)} | ${clip(t.en, 90)} | duty ${t.d || "n/a"}`).join("\n");
  return [
    {
      role: "system",
      content:
        "You classify imported goods under Taiwan's 11-digit CCC code (貨品分類號列). " +
        "You are given the goods, similar past advance rulings by Taiwan Customs, and a candidate list. " +
        "Pick exactly one code from the candidate list. Follow the General Interpretative Rules: classify by what the goods are and their principal function; " +
        "a part that is specifically named in another heading goes there, not under the general parts heading. " +
        "Past rulings on near-identical goods are strong evidence. Reply with JSON only.",
    },
    {
      role: "user",
      content:
        `GOODS\n${describeItem(item)}\n\n` +
        `SIMILAR PAST RULINGS\n${rulings || "(none found)"}\n\n` +
        `CANDIDATE CODES (code | Chinese | English | duty)\n${list}\n\n` +
        `Return JSON: {"code": "<11 digits from the list>", "reason": "<one sentence in English>", "confidence": "high" | "medium" | "low", "alternatives": ["<code>", "<code>"]}`,
    },
  ];
}

/** Prompt for "model alone": no retrieval, no candidate list. */
export function llmOnlyMessages(item) {
  return [
    {
      role: "system",
      content:
        "You classify imported goods under Taiwan's 11-digit CCC code (貨品分類號列: 8-digit tariff number + 2 statistical digits + 1 check digit). Reply with JSON only.",
    },
    {
      role: "user",
      content: `GOODS\n${describeItem(item)}\n\nReturn JSON: {"code": "<11 digits>", "reason": "<one sentence in English>"}`,
    },
  ];
}

/** Parse a model reply. Returns {code, reason, confidence, alternatives}; code may be "" if unusable. */
export function parseChoice(text) {
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  let obj = null;
  if (a >= 0 && b > a) {
    try {
      obj = JSON.parse(t.slice(a, b + 1));
    } catch {
      obj = null;
    }
  }
  const digits = (v) => String(v ?? "").replace(/\D/g, "");
  if (!obj) {
    const m = /\d{4}\.?\d{2}\.?\d{2}\.?\d{2}-?\d/.exec(t);
    return { code: m ? digits(m[0]) : "", reason: "", confidence: "low", alternatives: [] };
  }
  const conf = ["high", "medium", "low"].includes(String(obj.confidence).toLowerCase()) ? String(obj.confidence).toLowerCase() : "medium";
  return {
    code: digits(obj.code),
    reason: String(obj.reason || "").trim(),
    confidence: conf,
    alternatives: Array.isArray(obj.alternatives) ? obj.alternatives.map(digits).filter(Boolean) : [],
  };
}

/** Snap a model-returned code onto a real one: exact, else unique candidate sharing the first 10 / 8 digits. */
export function resolveCode(code, cands, byCode) {
  if (byCode.has(code)) return code;
  for (const n of [10, 8]) {
    if (code.length >= n) {
      const m = cands.filter((t) => t.c.startsWith(code.slice(0, n)));
      if (m.length === 1) return m[0].c;
    }
  }
  return "";
}
