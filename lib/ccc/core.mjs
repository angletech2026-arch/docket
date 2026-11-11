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
   * For each heading the model shortlisted, the past rulings Customs placed under that heading that
   * read most like this item. Lets the model compare "what Customs put in 8481" against "what it put in 9032".
   */
  function exemplars(item, headings, per = 3, opts = {}) {
    const before = opts.before || null;
    const out = [];
    for (const h of headings || []) {
      if (!/^\d{4}$/.test(h)) continue;
      const hits = search(rIdx(), itemText(item), per, (i) => {
        const r = rulings[i];
        return r.cur && r.c.startsWith(h) && (!before || r.dt < before);
      });
      out.push({ heading: h, rulings: hits.map((x) => rulings[x.i]) });
    }
    return out;
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
    const cap = opts.cap || 360;
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
    // every line under a shortlisted heading, so the right line is on the list whenever the heading is
    for (const h of heads) for (const t of (byPrefix4.get(h) || []).slice(0, 110)) add(t);
    for (const h of search(tIdx(), [item.name, item.use].filter(Boolean).join(" "), 12)) add(tariff[h.i]);
    return out.sort((x, y) => (x.c < y.c ? -1 : 1));
  }

  /** Closest tariff line by wording alone (last-resort fallback). */
  function closestTariff(item) {
    const h = search(tIdx(), [item.name, item.use].filter(Boolean).join(" "), 1)[0];
    return h ? tariff[h.i] : undefined;
  }

  return { byCode, similar, exemplars, candidates, closestTariff, lookup: (c) => byCode.get(c) };
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

Return JSON with the 3 to 5 headings that could apply, most likely first: {"headings": ["<4 digits>", "<4 digits>", "<4 digits>"]}`,
    },
  ];
}

/** Parse the first-pass reply into up to five 4-digit headings. */
export function parseHeadings(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/(?<!\d)(\d{2})\.?(\d{2})(?!\d)/g)) {
    const h = m[1] + m[2];
    if (!out.includes(h)) out.push(h);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Prompt for "model + past rulings": the model must choose from the candidate list.
 * `extra.headings` is the first-pass shortlist and `extra.exemplars` the rulings Customs placed under each of
 * those headings. The candidate list is printed heading by heading, each block followed by its rulings, so the
 * model decides the heading first and the line second.
 */
export function ragMessages(item, sim, cands, extra = {}) {
  const shortlist = (extra.headings || []).filter((h) => /^\d{4}$/.test(h));
  const exByHead = new Map((extra.exemplars || []).map((e) => [e.heading, e.rulings]));
  const line = (t) => `${t.c} | ${clip(t.zh, 70)} | ${clip(t.en, 90)} | duty ${t.d || "n/a"}`;
  const ruling = (r) =>
    `  - [${r.dt}] ${clip(r.n, 110)}${r.u ? ` | use: ${clip(r.u, 90)}` : ""} => ${r.c}. ${clip(r.why, 200)}`;

  const byHead = new Map();
  for (const t of cands) {
    const h = t.c.slice(0, 4);
    if (!byHead.has(h)) byHead.set(h, []);
    byHead.get(h).push(t);
  }
  const order = [...shortlist.filter((h) => byHead.has(h)), ...[...byHead.keys()].filter((h) => !shortlist.includes(h))];
  const blocks = order
    .map((h) => {
      const ex = exByHead.get(h) || [];
      return (
        `HEADING ${h}${shortlist.includes(h) ? " (on your first-pass shortlist)" : ""}\n` +
        byHead.get(h).map(line).join("\n") +
        (ex.length ? `\n  Goods Customs has ruled into heading ${h}:\n${ex.map(ruling).join("\n")}` : "")
      );
    })
    .join("\n\n");
  const lexical = sim.slice(0, 6).map(ruling).join("\n");

  return [
    {
      role: "system",
      content:
        "You classify imported goods under Taiwan's 11-digit CCC code (貨品分類號列). " +
        "Work in two steps. First decide the 4-digit heading under the General Interpretative Rules: by what the goods are and their principal function, " +
        "by the wording of the headings, and remembering that a part or accessory specifically named in its own heading goes there and not under a general parts heading, " +
        "and that parts suitable solely or principally for one machine go with that machine unless excluded. Then pick the one line under that heading that fits best; " +
        'use an "other" line only when no specific line fits. ' +
        "The candidate list is grouped by heading. Under some headings you are shown goods Taiwan Customs has ruled into that heading; compare the goods at hand with them. " +
        "A past ruling counts as evidence only when its goods are the same kind of thing with the same function. The rulings listed as wording matches were found by text similarity and are often different goods; ignore those that are. " +
        "Pick exactly one code from the candidate list. Reply with JSON only.",
    },
    {
      role: "user",
      content:
        `GOODS\n${describeItem(item)}\n\n` +
        `CANDIDATE CODES BY HEADING (code | Chinese | English | duty)\n${blocks}\n\n` +
        `PAST RULINGS WHOSE WORDING IS CLOSEST (may be different goods)\n${lexical || "(none found)"}\n\n` +
        `Return JSON with the keys in this order: {"analysis": "<two or three sentences: what the goods are, which heading and why not the nearest rival heading, which line>", "code": "<11 digits from the list>", "reason": "<one sentence in ${extra.lang === "zh" ? "Traditional Chinese as used in Taiwan" : "English"}>", "confidence": "high" | "medium" | "low", "alternatives": ["<code>", "<code>"]}`,
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
