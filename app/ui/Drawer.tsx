"use client";

import { useEffect, useState, type Dispatch } from "react";
import type { Action, Card, State } from "@/lib/engine/types";
import { nt, pct } from "@/lib/fmt";
import { inquiry, invoice, literal, stock, USD_TWD, type InvoiceLine } from "@/lib/sample/auto";
import recorded from "@/lib/sample/recorded.json";

type Suggestion = {
  code: string;
  formatted: string;
  zh: string;
  en: string;
  duty: string;
  rules: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
  alternatives: { code: string; formatted: string; zh: string; en?: string; duty: string }[];
  similar: { id: string; name: string; code: string; date: string; why: string; codeEn?: string }[];
  source: "llm+rulings" | "nearest-ruling";
  error?: string;
};

type Props = { card: Card; state: State; dispatch: Dispatch<Action>; onClose: () => void };
type Tr = (en: string, zh: string) => string;
const tr = (state: State): Tr => (en, zh) => (state.lang === "zh" ? zh : en);

export function Drawer({ card, state, dispatch, onClose }: Props) {
  const t = tr(state);
  const who = state.people.find((p) => p.id === card.assignee);
  const wide = card.kind === "ccc" && state.company === "auto";
  return (
    <aside className={`drawer${wide ? " wide" : ""}`} role="dialog" aria-label={card.stage}>
      <button className="close" onClick={onClose} aria-label={t("Close", "關閉")}>
        ×
      </button>
      <div className="dr-head">
        <div className="dr-kicker">
          <span>
            {card.shipmentId} · {card.stage}
          </span>
          {card.status === "owner" && <span className="stamp owner">{t("OWNER", "老闆")}</span>}
          {card.status === "done" && <span className="stamp done">{t("DONE", "完成")}</span>}
          {card.status === "waiting" && <span className="stamp waiting">{t("WAITING", "等待")}</span>}
        </div>
        <h2>{card.title}</h2>
        <div className="dr-meta">
          <span>
            {t("With", "在誰手上")} <b>{who?.name ?? t("nobody", "沒有人")}</b>
            {who ? t(`, ${who.role.toLowerCase()}`, `（${who.role}）`) : ""}
          </span>
          <span>
            {t("Due", "期限")} <b>{card.due}</b>
          </span>
          {card.stake > 0 && (
            <span>
              {t("At stake", "押在這個決定上")} <b className="num">{nt(card.stake)}</b>
            </span>
          )}
        </div>
      </div>
      <div className="dr-body">
        {card.kind === "ccc" && state.company === "auto" ? (
          <CccPanel card={card} state={state} dispatch={dispatch} onClose={onClose} />
        ) : card.kind === "inquiry" && state.company === "auto" ? (
          <InquiryPanel card={card} state={state} dispatch={dispatch} onClose={onClose} />
        ) : (
          <GenericPanel card={card} state={state} dispatch={dispatch} onClose={onClose} />
        )}

        <Assistant key={card.id} card={card} state={state} />

        <h4>{t("History", "紀錄")}</h4>
        <ul className="hist">
          {card.history.map((h, i) => (
            <li key={i}>
              <span>{h.at}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function Prepared({ card, t }: { card: Card; t: Tr }) {
  return (
    <>
      <h4>{t("Already done on this card", "這張卡上已經做好的")}</h4>
      <ul className="prep">
        {card.prepared.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </>
  );
}

function StakeNote({ card, t }: { card: Card; t: Tr }) {
  if (!card.stakeNote) return null;
  return (
    <p className="note">
      {card.stake > 0 ? <b className="num">{nt(card.stake)}{t(": ", "：")}</b> : null}
      {card.stakeNote}
    </p>
  );
}

function GenericPanel({ card, state, dispatch, onClose }: Props) {
  const t = tr(state);
  const me = state.people.find((p) => p.id === card.assignee);
  const external = me?.external;
  return (
    <>
      <Prepared card={card} t={t} />
      <StakeNote card={card} t={t} />
      {card.status !== "done" && card.ask && (
        <div className="ask">
          <p>{card.ask}</p>
          {card.status !== "waiting" && (
            <div className="actions">
              <button
                className="btn solid"
                onClick={() => {
                  dispatch({ type: "approve", cardId: card.id });
                  onClose();
                }}
              >
                {external
                  ? t("Mark as done by the partner", "對方已完成")
                  : card.status === "owner"
                    ? t("Owner approves", "老闆核准")
                    : t("Approve", "核准")}
              </button>
              {!external && card.status !== "owner" && (
                <button
                  className="btn"
                  onClick={() =>
                    dispatch({ type: "escalate", cardId: card.id, why: t("not sure about this one", "這張我沒把握") })
                  }
                >
                  {t("I'm not sure, pass it up", "我沒把握，往上交")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The assistant on each card                                         */
/* ------------------------------------------------------------------ */

/**
 * Each person has an assistant on the card they are holding. It teaches from the company brain:
 * what the owner and the senior staff have said about this kind of card.
 */
function Assistant({ card, state }: { card: Card; state: State }) {
  const t = tr(state);
  const zh = state.lang === "zh";
  const holder = state.people.find((p) => p.id === card.assignee);
  const lessons = state.brain.filter((l) => l.kind === card.kind);
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!holder || holder.external || card.status === "done" || card.status === "waiting") return null;

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ(question);
    setBusy(true);
    setA(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lang: state.lang,
          person: `${holder.name}, ${holder.role}`,
          question,
          card: { stage: card.stage, title: card.title, prepared: card.prepared, ask: card.ask, stakeNote: card.stakeNote },
          lessons: lessons.map((l) => ({ text: l.text, by: l.by })),
          seniors: state.people.filter((p) => p.active && !p.external && p.level >= 2).map((p) => `${p.name} (${p.role})`),
        }),
      });
      const j = await r.json();
      setA(j.answer ?? j.error ?? "");
    } catch (e) {
      setA(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const chips = zh
    ? ["這張卡我要檢查什麼？", "做錯會怎樣？", "為什麼是這樣處理？"]
    : ["What should I check on this card?", "What happens if I get it wrong?", "Why is it done this way?"];

  return (
    <div className="assist">
      <h4>
        {zh ? `${holder.name} 的助手` : `${holder.name}${holder.name.endsWith("s") ? "'" : "'s"} assistant`}
        <span>
          {zh
            ? `從公司大腦教你：老闆和老手留下的 ${state.brain.length} 條經驗`
            : `teaches from the company brain: ${state.brain.length} things the owner and the seniors have said`}
        </span>
      </h4>
      {lessons.length === 0 ? (
        <p className="faint">
          {t("Nobody senior has left a note on this kind of card yet.", "這種卡還沒有老手留下經驗。")}
        </p>
      ) : (
        lessons.map((l, i) => (
          <div key={i} className="lesson">
            &ldquo;{l.text}&rdquo;
            <span className="by">{l.by}</span>
          </div>
        ))
      )}
      <div className="chips">
        {chips.map((c) => (
          <button key={c} className="btn small" disabled={busy} onClick={() => ask(c)}>
            {c}
          </button>
        ))}
      </div>
      <form
        className="askrow"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Ask about this card", "問這張卡的事")}
          aria-label={t("Ask about this card", "問這張卡的事")}
        />
        <button className="btn solid" disabled={busy || !q.trim()}>
          {t("Ask", "問")}
        </button>
      </form>
      {busy && <span className="working">{t("looking in the company brain", "正在查公司大腦")}</span>}
      {a && <div className="reply">{a}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Customs codes                                                      */
/* ------------------------------------------------------------------ */

const cccCache = new Map<string, { byLine: Record<string, Suggestion>; llm: boolean }>();
// The sample invoice never changes, so the model's answers for it were recorded once from a live run
// (scripts/record-demo.mjs) and ship with the app. The card opens with them and does not call the model
// again unless someone presses "Ask the model again".
for (const lang of ["en", "zh"] as const) {
  cccCache.set(`a4:${lang}`, recorded.classify[lang] as unknown as { byLine: Record<string, Suggestion>; llm: boolean });
}
const recordedOn = recorded.recordedAt.slice(0, 16).replace("T", " ");

function CccPanel({ card, state, dispatch, onClose }: Props) {
  const t = tr(state);
  const zh = state.lang === "zh";
  const newLines = invoice.lines.filter((l) => !l.onFile);
  const cacheKey = `${card.id}:${state.lang}`;
  const cached = cccCache.get(cacheKey);
  const [res, setRes] = useState<Record<string, Suggestion> | null>(cached?.byLine ?? null);
  const [llm, setLlm] = useState<boolean>(cached?.llm ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (cccCache.has(cacheKey) && run === 0) return;
    let live = true;
    fetch("/api/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lang: state.lang,
        items: newLines.map((l) => ({ name: `${l.nameZh} ${l.nameEn}`, material: l.material, use: l.use })),
      }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as { suggestions: Suggestion[]; llm: boolean };
      })
      .then((j) => {
        if (!live) return;
        const byLine: Record<string, Suggestion> = {};
        newLines.forEach((l, i) => (byLine[l.sku] = j.suggestions[i]));
        cccCache.set(cacheKey, { byLine, llm: j.llm });
        setRes(byLine);
        setLlm(j.llm);
      })
      .catch((e) => live && setErr(String(e.message ?? e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, run]);

  const valueTwd = (l: InvoiceLine) => l.qty * l.unitUsd * USD_TWD;

  // the code actually chosen for a new line: the reviewer's pick, else the suggestion
  const chosen = (l: InvoiceLine) => {
    const s = res?.[l.sku];
    if (!s || s.error) return null;
    const alt = s.alternatives.find((a) => a.code === picked[l.sku]);
    return alt ? { code: alt.code, formatted: alt.formatted, zh: alt.zh, en: alt.en ?? "", duty: alt.duty } : s;
  };

  // how much duty moves between the suggestion and its closest alternatives
  const spread = res
    ? newLines.reduce((sum, l) => {
        const s = res[l.sku];
        if (!s || s.error) return sum;
        const rates = [s.duty, ...s.alternatives.map((a) => a.duty)].map(pct).filter((x): x is number => x !== null);
        if (rates.length < 2) return sum;
        return sum + ((Math.max(...rates) - Math.min(...rates)) / 100) * valueTwd(l);
      }, 0)
    : null;

  useEffect(() => {
    if (spread === null || card.status === "done") return;
    const rounded = Math.round(spread / 100) * 100;
    if (rounded === card.stake) return;
    dispatch({
      type: "setStake",
      cardId: card.id,
      stake: rounded,
      stakeNote: t(
        "Duty on the three new lines, between the suggested code and the closest alternatives",
        "三個新零件的關稅，建議的號列跟最接近的其他號列之間的差額",
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread]);

  const dutyTotal = invoice.lines.reduce((sum, l) => {
    const rate = pct(l.onFile ? l.onFile.duty : (chosen(l)?.duty ?? ""));
    return rate === null ? sum : sum + (rate / 100) * valueTwd(l);
  }, 0);

  const conf = (c: Suggestion["confidence"]) =>
    zh ? { high: "把握高", medium: "把握中等", low: "把握低" }[c] : `${c} confidence`;

  return (
    <>
      <h4>
        {zh ? invoice.supplierZh : invoice.supplier} · {t("invoice", "發票")} {invoice.number} · USD{" "}
        {(86400).toLocaleString("en-US")} {t("at", "匯率")} {USD_TWD.toFixed(2)}
      </h4>
      {!llm && (
        <p className="note warn">
          {t(
            "No model key on this server. The codes below are copied from the nearest past ruling, which is often wrong. Add a key to get real suggestions.",
            "這台伺服器沒有模型的 key。下面的號列只是抄最接近的舊案例，常常是錯的。加上 key 才有真的建議。",
          )}
        </p>
      )}
      {err && (
        <p className="note warn">
          {t("Could not get suggestions:", "拿不到建議：")} {err}{" "}
          <button
            className="btn small"
            onClick={() => {
              setErr(null);
              setRes(null);
              setRun((n) => n + 1);
            }}
          >
            {t("Try again", "再試一次")}
          </button>
        </p>
      )}
      <p className="legend">
        <span className="code">
          <span className="hs6">0000.00</span>
          <span className="nat">.00.00-0</span>
        </span>
        {t(
          "The first six digits are the international HS code, the same six the US uses at the start of its HTS code. The rest are Taiwan's own digits (the full 11 is called a CCC code here). Each country adds its own, and the duty rate hangs on them.",
          "前 6 碼是國際通用的 HS 碼，美國的 HTS 號列開頭也是同樣這 6 碼。後面是台灣自己加的（整串 11 碼在台灣叫 CCC code）。每個國家各加各的，稅率看的就是後面這幾碼。",
        )}
      </p>
      <table className="t">
        <thead>
          <tr>
            <th>{t("Line", "品項")}</th>
            <th>{t("Customs code (Taiwan, 11 digits)", "報關號列（台灣 11 碼）")}</th>
            <th>{t("Why", "理由")}</th>
            <th className="r">{t("Value", "貨值")}</th>
            <th className="r">{t("Duty", "關稅")}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l) => {
            const s = res?.[l.sku];
            const c = chosen(l);
            const rate = pct(l.onFile ? l.onFile.duty : (c?.duty ?? ""));
            return (
              <tr key={l.sku}>
                <td style={{ width: "24%" }}>
                  <div className="mono" style={{ fontWeight: 700 }}>
                    {l.sku}
                  </div>
                  <div>{zh ? l.nameZh : l.nameEn}</div>
                  <div className="faint">
                    {zh ? `${l.nameEn} · ` : ""}
                    {l.qty.toLocaleString("en-US")} {t("pcs", "個")}
                  </div>
                </td>
                <td style={{ width: "22%" }}>
                  {l.onFile ? (
                    <>
                      <Code11 formatted={l.onFile.formatted} />
                      <div className="faint">{zh ? l.onFile.zh : l.onFile.en}</div>
                    </>
                  ) : c ? (
                    <>
                      <Code11 formatted={c.formatted} />
                      <div className="faint">{zh ? c.zh : c.en || c.zh}</div>
                      {s && s.rules.length > 0 && !picked[l.sku] && (
                        <div style={{ marginTop: 3 }}>
                          {s.rules.map((r) => (
                            <span key={r} className="tag gate">
                              {ruleLabel(r, zh)}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : s?.error ? (
                    <span className="no">{s.error}</span>
                  ) : err ? (
                    <span className="faint">{t("no suggestion", "沒有建議")}</span>
                  ) : (
                    <span className="working">{t("reading past rulings", "正在讀海關過去的案例")}</span>
                  )}
                </td>
                <td>
                  {l.onFile ? (
                    l.supersedes ? (
                      <>
                        <span className="tag ok">{t("carried over", "沿用")}</span>
                        {zh ? (
                          <>
                            新料號。原廠 email 說它取代 <b className="mono">{l.supersedes}</b>，是同一種貨，所以沿用原本的號列。
                          </>
                        ) : (
                          <>
                            New part number. The supplier&apos;s email says it replaces{" "}
                            <b className="mono">{l.supersedes}</b>, same goods, so the code on file stays.
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="tag ok">{t("on file", "已有")}</span>
                        {t("Same part as earlier shipments.", "跟之前進過的是同一個料。")}
                      </>
                    )
                  ) : s && !s.error ? (
                    <>
                      <span className={`tag ${s.confidence === "high" ? "hi" : s.confidence === "medium" ? "med" : "lo"}`}>
                        {conf(s.confidence)}
                      </span>
                      <span className="tag">{t("new part", "新零件")}</span>
                      {s.reason}
                      {relevant(s).length === 0 && (
                        <div className="sim">
                          {t(
                            "No past ruling on goods like this. Chosen from the tariff table by description.",
                            "沒有類似貨品的舊案例。這是照稅則表的品名說明選的。",
                          )}
                        </div>
                      )}
                      {relevant(s).length > 0 && (
                        <div className="sim">
                          {t("Past rulings it relied on:", "依據的海關舊案例：")}
                          {relevant(s).map((r) => (
                            <div key={r.id}>
                              <span className="mono">{r.id}</span> ({r.date.slice(0, 4)}){" "}
                              {zh ? `${r.name.slice(0, 44)}${r.name.length > 44 ? "…" : ""}` : `ruled as “${(r.codeEn ?? "").slice(0, 60)}”`} →{" "}
                              <span className="mono">{fmt(r.code)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {s.alternatives.length > 0 && (
                        <div className="alt">
                          {t("Also considered:", "也考慮過：")}{" "}
                          {s.alternatives.map((a) => (
                            <button
                              key={a.code}
                              title={zh ? a.zh : a.en || a.zh}
                              onClick={() => setPicked((p) => ({ ...p, [l.sku]: p[l.sku] === a.code ? "" : a.code }))}
                              style={picked[l.sku] === a.code ? { background: "var(--mark)" } : undefined}
                            >
                              {a.formatted} · {a.duty}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </td>
                <td className="r num">{nt(valueTwd(l))}</td>
                <td className="r num">
                  {rate === null ? (
                    <span className="faint">—</span>
                  ) : (
                    <>
                      {l.onFile ? l.onFile.duty : c?.duty}
                      <br />
                      {nt((rate / 100) * valueTwd(l))}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={3} className="r">
              <b>{t("Duty on this invoice with the codes above", "照上面的號列，這張發票的關稅")}</b>
            </td>
            <td className="r num">{nt(86400 * USD_TWD)}</td>
            <td className="r num">
              <b>{nt(dutyTotal)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {llm && run === 0 && res && (
        <p className="note">
          {t(
            `The three suggestions are the model's answers from a live run recorded ${recordedOn} UTC.`,
            `這三個建議是 ${recordedOn} UTC 那次實際問模型錄下來的答案。`,
          )}{" "}
          <button
            className="btn small"
            onClick={() => {
              setErr(null);
              setRes(null);
              setRun((n) => n + 1);
            }}
          >
            {t("Ask the model again", "重新問模型")}
          </button>
        </p>
      )}
      {spread !== null && spread > 0 && (
        <p className="note">
          <b className="num">{nt(spread)}</b>{" "}
          {t(
            "of duty depends on which code the three new parts get. Duty rates and import rules come from the customs tariff table, never from the model.",
            "的關稅取決於三個新零件報哪個號列。稅率和輸入規定是從海關稅則表查的，不是模型說的。",
          )}
        </p>
      )}
      <p className="note">
        {t(
          "We prepare and check. The broker's licensed staff file the declaration. The person holding this card makes the call on each code, and the broker sees the reasons.",
          "我們負責備齊和核對，報單由報關行有證照的人簽。每個號列由拿這張卡的人決定，報關行看得到理由。",
        )}
      </p>

      {card.status !== "done" && (
        <div className="ask">
          <p>{card.ask}</p>
          <div className="actions">
            <button
              className="btn solid"
              disabled={!res}
              onClick={() => {
                dispatch({ type: "approve", cardId: card.id, note: t("7 codes checked", "7 個號列都核對過") });
                onClose();
              }}
            >
              {t("Codes checked, send to the broker", "號列核對完，送報關行")}
            </button>
            <button
              className="btn"
              onClick={() =>
                dispatch({
                  type: "escalate",
                  cardId: card.id,
                  why: t("not sure about a customs code", "有一個號列沒把握"),
                })
              }
            >
              {t("I'm not sure, pass it up", "我沒把握，往上交")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** "9027.10.00.00-9" with the international six digits set apart from Taiwan's own. */
function Code11({ formatted }: { formatted: string }) {
  return (
    <div className="code">
      <span className="hs6">{formatted.slice(0, 7)}</span>
      <span className="nat">{formatted.slice(7)}</span>
    </div>
  );
}

const RULES: Record<string, [string, string]> = {
  B01: ["B01 plant or animal quarantine", "B01 動植物檢疫"],
  F01: ["F01 border food inspection", "F01 食品查驗"],
};
function ruleLabel(code: string, zh: boolean) {
  const r = RULES[code];
  return r ? r[zh ? 1 : 0] : code;
}

/** Past rulings that actually bear on the answer: same 4-digit heading as the code chosen or an alternative. */
function relevant(s: Suggestion) {
  const headings = new Set([s.code, ...s.alternatives.map((a) => a.code)].map((c) => c.slice(0, 4)));
  return s.similar.filter((r) => headings.has(r.code.slice(0, 4))).slice(0, 3);
}

function fmt(code: string) {
  return code.length === 11
    ? `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6, 8)}.${code.slice(8, 10)}-${code.slice(10)}`
    : code;
}

/* ------------------------------------------------------------------ */
/* Inquiry                                                            */
/* ------------------------------------------------------------------ */

type Guess = { meaning: string; confidence: string; usedModel: boolean } | null;
const guessCache = new Map<string, Guess>();
for (const lang of ["en", "zh"] as const) guessCache.set(`a0:${lang}`, recorded.guess[lang] as Guess);

/**
 * Ask the model for the customs codes and the slang guess ahead of time, so the two cards open
 * with their answers already on them. Used by presenter mode. Same requests the cards make.
 */
export function prewarm(lang: "en" | "zh") {
  const newLines = invoice.lines.filter((l) => !l.onFile);
  if (!cccCache.has(`a4:${lang}`)) {
    fetch("/api/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lang,
        items: newLines.map((l) => ({ name: `${l.nameZh} ${l.nameEn}`, material: l.material, use: l.use })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { suggestions: Suggestion[]; llm: boolean } | null) => {
        if (!j) return;
        const byLine: Record<string, Suggestion> = {};
        newLines.forEach((l, i) => (byLine[l.sku] = j.suggestions[i]));
        cccCache.set(`a4:${lang}`, { byLine, llm: j.llm });
      })
      .catch(() => {});
  }
  if (!guessCache.has(`a0:${lang}`)) {
    fetch("/api/inquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang, message: inquiry.message, term: "鳳梨頭", known: ["水龜", "李仔串"] }),
    })
      .then((r) => r.json())
      .then((j: Guess) => guessCache.set(`a0:${lang}`, j))
      .catch(() => {});
  }
}

function InquiryPanel({ card, state, dispatch, onClose }: Props) {
  const t = tr(state);
  const zh = state.lang === "zh";
  const rows = inquiry.terms.map((term) => {
    const g = state.glossary.find((x) => x.term === term.term);
    const s = g?.sku ? stock[g.sku] : undefined;
    return { ...term, g, s };
  });
  const unknown = rows.filter((r) => !r.g);
  const holder = state.people.find((p) => p.id === card.assignee);
  const asked = card.history.some((h) => /passed it up|往上交給/.test(h.text));
  const senior = holder && holder.level >= 2;

  const cacheKey = `${card.id}:${state.lang}`;
  const [guess, setGuess] = useState<Guess>(guessCache.get(cacheKey) ?? null);
  const [meaning, setMeaning] = useState(
    zh ? "外側等速接頭，在傳動軸靠輪子那一端" : "CV joint, the outer end of the drive shaft",
  );
  const [sku, setSku] = useState("BR-CV-5521");
  const firstUnknown = unknown[0]?.term;

  useEffect(() => {
    if (!firstUnknown || guessCache.has(cacheKey)) return;
    let live = true;
    fetch("/api/inquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lang: state.lang,
        message: inquiry.message,
        term: firstUnknown,
        known: state.glossary.map((g) => g.term),
      }),
    })
      .then((r) => r.json())
      .then((j: Guess) => {
        guessCache.set(cacheKey, j);
        if (live) setGuess(j);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, firstUnknown]);

  const price = (list: number) => Math.round(list * (1 - inquiry.discountPct / 100));
  const allKnown = unknown.length === 0;

  const reply = rows
    .map((r) => {
      if (!r.g || !r.s) return null;
      const name = zh ? r.s.nameZh : r.g.meaning.split(/[.,(]/)[0].trim();
      const p = nt(price(r.s.listTwd));
      if (zh) {
        return r.s.stock >= r.qty
          ? `${r.term}（${name}）${r.qty} 個：有現貨，每個 ${p}。`
          : `${r.term}（${name}）${r.qty} 個：現在沒貨。${r.s.arrivingZh}，每個 ${p}。要先幫您留 ${r.qty} 個嗎？`;
      }
      return r.s.stock >= r.qty
        ? `${r.term} (${name}) ×${r.qty}: in stock, ${p} each.`
        : `${r.term} (${name}) ×${r.qty}: none in stock. ${r.s.arriving}. ${p} each. Hold ${r.qty} for you?`;
    })
    .filter(Boolean)
    .join("\n");

  const confWord = (c: string) => (zh ? ({ high: "把握高", medium: "把握中等", low: "把握低" }[c] ?? c) : `${c} confidence`);

  return (
    <>
      <h4>
        {zh ? inquiry.customerZh : inquiry.customer} · {t("on LINE, the chat app every garage in Taiwan uses", "LINE")} ·{" "}
        {t(`tier ${inquiry.tier}, ${inquiry.discountPct}% off list`, `${inquiry.tier} 級客戶，牌價打 ${100 - inquiry.discountPct} 折`)}
      </h4>
      <p className="bubble-meta">{inquiry.time}</p>
      <div className="bubble" lang="zh-Hant">
        {inquiry.message}
      </div>
      {!zh && (
        <>
          <p className="gloss">Word for word: &ldquo;{inquiry.wordForWord}&rdquo;</p>
          <p className="note">
            Mechanics in Taiwan name parts after what they look like, and they say it in Taiwanese, not Mandarin. A plum
            skewer, a water turtle and a pineapple head are three car parts. None of these words is in a parts catalogue
            or a dictionary, so a new hire cannot look them up. They live in the heads of the senior staff.
          </p>
        </>
      )}

      <h4>{t("What the garage is asking for", "修車廠要的東西")}</h4>
      <table className="t">
        <thead>
          <tr>
            <th>{t("Said", "他說的")}</th>
            <th>{t("Means", "意思")}</th>
            <th>{t("Part", "料號")}</th>
            <th className="r">{t("Stock", "庫存")}</th>
            <th className="r">{t("Price", "價格")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term} className={r.g ? "" : "unknown"}>
              <td>
                <span className="term" lang="zh-Hant">
                  {r.term}
                </span>{" "}
                ×{r.qty}
                {!zh && literal[r.term] && <div className="faint">&ldquo;{literal[r.term]}&rdquo;</div>}
              </td>
              <td>
                {r.g ? (
                  <>
                    {r.g.meaning}
                    <div className="faint">
                      {t("Glossary:", "術語表：")} {r.g.by}
                    </div>
                  </>
                ) : (
                  <>
                    <b>{t("Not in the company glossary.", "公司術語表裡沒有這個詞。")}</b>
                    <div>
                      {guess === null ? (
                        <span className="working">{t("asking the model", "正在問模型")}</span>
                      ) : guess.usedModel ? (
                        <>
                          {t("The model's guess:", "模型猜：")} {guess.meaning}{" "}
                          <span className="tag lo">{confWord(guess.confidence)}</span>
                          <div className="faint">{t("A guess is not used to quote a part.", "用猜的不能拿來報價。")}</div>
                        </>
                      ) : (
                        <span className="faint">{guess.meaning}</span>
                      )}
                    </div>
                  </>
                )}
              </td>
              <td className="mono">{r.g?.sku ?? "?"}</td>
              <td className="r num">{r.s ? r.s.stock : ""}</td>
              <td className="r num">{r.s ? nt(price(r.s.listTwd)) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!allKnown && !asked && (
        <div className="ask">
          <p>{t("One word nobody has written down yet. Ask someone who knows?", "有一個詞還沒有人寫下來過。問懂的人？")}</p>
          <div className="actions">
            <button
              className="btn solid"
              onClick={() =>
                dispatch({
                  type: "escalate",
                  cardId: card.id,
                  why: t(`"${firstUnknown}" is not in the glossary`, `術語表裡沒有「${firstUnknown}」`),
                })
              }
            >
              {t("Pass it up with the question", "帶著問題往上交")}
            </button>
          </div>
        </div>
      )}

      {!allKnown && asked && (
        <div className="teach">
          <label>
            {zh ? (
              <>
                {senior ? `${holder?.name} 回答一次就好。` : "等人回答。"}
                <b lang="zh-Hant">{firstUnknown}</b> 是什麼？
              </>
            ) : (
              <>
                {senior ? `${holder?.name} answers once.` : "Waiting for an answer."} What is{" "}
                <b lang="zh-Hant">{firstUnknown}</b>?
              </>
            )}
          </label>
          <div className="row">
            <input value={meaning} onChange={(e) => setMeaning(e.target.value)} aria-label={t("Meaning", "意思")} />
            <select value={sku} onChange={(e) => setSku(e.target.value)} aria-label={t("Part", "料號")}>
              {Object.values(stock).map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.sku} · {zh ? s.nameZh : s.nameEn}
                </option>
              ))}
            </select>
            <button
              className="btn solid"
              disabled={!meaning.trim()}
              onClick={() =>
                dispatch({
                  type: "teach",
                  term: firstUnknown!,
                  meaning: meaning.trim(),
                  sku,
                  by: holder?.name ?? t("A senior", "老手"),
                  cardId: card.id,
                })
              }
            >
              {t("Save to the glossary", "存進術語表")}
            </button>
          </div>
        </div>
      )}

      {allKnown && (
        <>
          <h4>{t("Reply drafted from stock and this customer's price tier", "照庫存和這個客戶的價格等級擬好的回覆")}</h4>
          <div className="reply">{reply}</div>
          {card.status !== "done" && (
            <div className="ask">
              <p>{card.ask}</p>
              <div className="actions">
                <button
                  className="btn solid"
                  onClick={() => {
                    dispatch({ type: "approve", cardId: card.id, note: t("reply sent on LINE", "已用 LINE 回覆") });
                    onClose();
                  }}
                >
                  {t("Send the reply", "送出回覆")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <StakeNote card={card} t={t} />
    </>
  );
}
