"use client";

import { useEffect, useState, type Dispatch } from "react";
import type { Action, Card, State } from "@/lib/engine/types";
import { nt, pct } from "@/lib/fmt";
import { inquiry, invoice, stock, USD_TWD, type InvoiceLine } from "@/lib/sample/auto";

type Suggestion = {
  code: string;
  formatted: string;
  zh: string;
  en: string;
  duty: string;
  rules: string[];
  reason: string;
  confidence: "high" | "medium" | "low";
  alternatives: { code: string; formatted: string; zh: string; duty: string }[];
  similar: { id: string; name: string; code: string; date: string; why: string }[];
  source: "llm+rulings" | "nearest-ruling";
  error?: string;
};

type Props = { card: Card; state: State; dispatch: Dispatch<Action>; onClose: () => void };

export function Drawer({ card, state, dispatch, onClose }: Props) {
  const who = state.people.find((p) => p.id === card.assignee);
  const wide = card.kind === "ccc" && state.company === "auto";
  return (
    <aside className={`drawer${wide ? " wide" : ""}`} role="dialog" aria-label={card.stage}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="dr-head">
        <div className="dr-kicker">
          <span>
            {card.shipmentId} · {card.stage}
          </span>
          {card.status === "owner" && <span className="stamp owner">OWNER</span>}
          {card.status === "done" && <span className="stamp done">DONE</span>}
          {card.status === "waiting" && <span className="stamp waiting">WAITING</span>}
        </div>
        <h2>{card.title}</h2>
        <div className="dr-meta">
          <span>
            With <b>{who?.name ?? "nobody"}</b>
            {who ? `, ${who.role.toLowerCase()}` : ""}
          </span>
          <span>
            Due <b>{card.due}</b>
          </span>
          {card.stake > 0 && (
            <span>
              At stake <b className="num">{nt(card.stake)}</b>
            </span>
          )}
        </div>
      </div>
      <div className="dr-body">
        {card.kind === "ccc" && state.company === "auto" ? (
          <CccPanel card={card} dispatch={dispatch} onClose={onClose} />
        ) : card.kind === "inquiry" && state.company === "auto" ? (
          <InquiryPanel card={card} state={state} dispatch={dispatch} onClose={onClose} />
        ) : (
          <GenericPanel card={card} state={state} dispatch={dispatch} onClose={onClose} />
        )}

        <h4>History</h4>
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

function Prepared({ card }: { card: Card }) {
  return (
    <>
      <h4>Already done on this card</h4>
      <ul className="prep">
        {card.prepared.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </>
  );
}

function StakeNote({ card }: { card: Card }) {
  if (!card.stakeNote) return null;
  return (
    <p className="note">
      {card.stake > 0 ? <b className="num">{nt(card.stake)}: </b> : null}
      {card.stakeNote}
    </p>
  );
}

function GenericPanel({ card, state, dispatch, onClose }: Props) {
  const me = state.people.find((p) => p.id === card.assignee);
  const external = me?.external;
  return (
    <>
      <Prepared card={card} />
      <StakeNote card={card} />
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
                {external ? "Mark as done by the partner" : card.status === "owner" ? "Owner approves" : "Approve"}
              </button>
              {!external && card.status !== "owner" && (
                <button
                  className="btn"
                  onClick={() => dispatch({ type: "escalate", cardId: card.id, why: "not sure about this one" })}
                >
                  I&apos;m not sure, pass it up
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
/* Customs codes                                                      */
/* ------------------------------------------------------------------ */

const cccCache = new Map<string, { byLine: Record<string, Suggestion>; llm: boolean }>();

function CccPanel({ card, dispatch, onClose }: Omit<Props, "state">) {
  const newLines = invoice.lines.filter((l) => !l.onFile);
  const cached = cccCache.get(card.id);
  const [res, setRes] = useState<Record<string, Suggestion> | null>(cached?.byLine ?? null);
  const [llm, setLlm] = useState<boolean>(cached?.llm ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (cccCache.has(card.id) && run === 0) return;
    let live = true;
    fetch("/api/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
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
        cccCache.set(card.id, { byLine, llm: j.llm });
        setRes(byLine);
        setLlm(j.llm);
      })
      .catch((e) => live && setErr(String(e.message ?? e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, run]);

  const valueTwd = (l: InvoiceLine) => l.qty * l.unitUsd * USD_TWD;

  // the code actually chosen for a new line: the reviewer's pick, else the suggestion
  const chosen = (l: InvoiceLine) => {
    const s = res?.[l.sku];
    if (!s || s.error) return null;
    const alt = s.alternatives.find((a) => a.code === picked[l.sku]);
    return alt ? { code: alt.code, formatted: alt.formatted, zh: alt.zh, duty: alt.duty } : s;
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
      stakeNote: "Duty on the three new lines, between the suggested code and the closest alternatives",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread]);

  const dutyTotal = invoice.lines.reduce((sum, l) => {
    const rate = pct(l.onFile ? l.onFile.duty : (chosen(l)?.duty ?? ""));
    return rate === null ? sum : sum + (rate / 100) * valueTwd(l);
  }, 0);

  return (
    <>
      <h4>
        {invoice.supplier} · invoice {invoice.number} · USD {(86400).toLocaleString("en-US")} at {USD_TWD.toFixed(2)}
      </h4>
      {!llm && (
        <p className="note warn">
          No model key on this server. The codes below are copied from the nearest past ruling, which is often wrong.
          Add a key to get real suggestions.
        </p>
      )}
      {err && (
        <p className="note warn">
          Could not get suggestions: {err}{" "}
          <button
            className="btn small"
            onClick={() => {
              setErr(null);
              setRes(null);
              setRun((n) => n + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}
      <table className="t">
        <thead>
          <tr>
            <th>Line</th>
            <th>Customs code (11 digits)</th>
            <th>Why</th>
            <th className="r">Value</th>
            <th className="r">Duty</th>
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
                  <div>{l.nameEn}</div>
                  <div className="faint">
                    {l.nameZh} · {l.qty.toLocaleString("en-US")} pcs
                  </div>
                </td>
                <td style={{ width: "22%" }}>
                  {l.onFile ? (
                    <>
                      <div className="code">{l.onFile.formatted}</div>
                      <div className="faint">{l.onFile.zh}</div>
                    </>
                  ) : c ? (
                    <>
                      <div className="code">{c.formatted}</div>
                      <div className="faint">{c.zh}</div>
                      {s && s.rules.length > 0 && !picked[l.sku] && (
                        <div style={{ marginTop: 3 }}>
                          {s.rules.map((r) => (
                            <span key={r} className="tag gate">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : s?.error ? (
                    <span className="no">{s.error}</span>
                  ) : err ? (
                    <span className="faint">no suggestion</span>
                  ) : (
                    <span className="working">reading past rulings</span>
                  )}
                </td>
                <td>
                  {l.onFile ? (
                    l.supersedes ? (
                      <>
                        <span className="tag ok">carried over</span>
                        New part number. The supplier&apos;s email says it replaces <b className="mono">{l.supersedes}</b>,
                        same goods, so the code on file stays.
                      </>
                    ) : (
                      <>
                        <span className="tag ok">on file</span>
                        Same part as earlier shipments.
                      </>
                    )
                  ) : s && !s.error ? (
                    <>
                      <span className={`tag ${s.confidence === "high" ? "hi" : s.confidence === "medium" ? "med" : "lo"}`}>
                        {s.confidence} confidence
                      </span>
                      <span className="tag">new part</span>
                      {s.reason}
                      {relevant(s).length === 0 && (
                        <div className="sim">No past ruling on goods like this. Chosen from the tariff table by description.</div>
                      )}
                      {relevant(s).length > 0 && (
                        <div className="sim">
                          Past rulings it relied on:
                          {relevant(s).map((r) => (
                            <div key={r.id}>
                              <span className="mono">{r.id}</span> ({r.date.slice(0, 4)}) {r.name.slice(0, 44)}
                              {r.name.length > 44 ? "…" : ""} → <span className="mono">{fmt(r.code)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {s.alternatives.length > 0 && (
                        <div className="alt">
                          Also considered:{" "}
                          {s.alternatives.map((a) => (
                            <button
                              key={a.code}
                              title={a.zh}
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
              <b>Duty on this invoice with the codes above</b>
            </td>
            <td className="r num">{nt(86400 * USD_TWD)}</td>
            <td className="r num">
              <b>{nt(dutyTotal)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {spread !== null && spread > 0 && (
        <p className="note">
          <b className="num">{nt(spread)}</b> of duty depends on which code the three new parts get. Duty rates and
          import rules come from the customs tariff table, never from the model.
        </p>
      )}
      <p className="note">
        We prepare and check. The broker&apos;s licensed staff file the declaration. The person holding this card makes
        the call on each code, and the broker sees the reasons.
      </p>

      {card.status !== "done" && (
        <div className="ask">
          <p>{card.ask}</p>
          <div className="actions">
            <button
              className="btn solid"
              disabled={!res}
              onClick={() => {
                dispatch({ type: "approve", cardId: card.id, note: "7 codes checked" });
                onClose();
              }}
            >
              Codes checked, send to the broker
            </button>
            <button
              className="btn"
              onClick={() => dispatch({ type: "escalate", cardId: card.id, why: "not sure about a customs code" })}
            >
              I&apos;m not sure, pass it up
            </button>
          </div>
        </div>
      )}
    </>
  );
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

function InquiryPanel({ card, state, dispatch, onClose }: Props) {
  const rows = inquiry.terms.map((t) => {
    const g = state.glossary.find((x) => x.term === t.term);
    const s = g?.sku ? stock[g.sku] : undefined;
    return { ...t, g, s };
  });
  const unknown = rows.filter((r) => !r.g);
  const holder = state.people.find((p) => p.id === card.assignee);
  const asked = card.history.some((h) => h.text.includes("passed it up"));
  const senior = holder && holder.level >= 2;

  const [guess, setGuess] = useState<Guess>(guessCache.get(card.id) ?? null);
  const [meaning, setMeaning] = useState("CV joint, the outer end of the drive shaft");
  const [sku, setSku] = useState("BR-CV-5521");
  const firstUnknown = unknown[0]?.term;

  useEffect(() => {
    if (!firstUnknown || guessCache.has(card.id)) return;
    let live = true;
    fetch("/api/inquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: inquiry.message, term: firstUnknown, known: state.glossary.map((g) => g.term) }),
    })
      .then((r) => r.json())
      .then((j: Guess) => {
        guessCache.set(card.id, j);
        if (live) setGuess(j);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, firstUnknown]);

  const price = (list: number) => Math.round(list * (1 - inquiry.discountPct / 100));
  const allKnown = unknown.length === 0;

  const reply = rows
    .map((r) => {
      if (!r.g || !r.s) return null;
      const name = r.g.meaning.split(/[.,(]/)[0].trim();
      return r.s.stock >= r.qty
        ? `${r.term} (${name}) ×${r.qty}: in stock, ${nt(price(r.s.listTwd))} each.`
        : `${r.term} (${name}) ×${r.qty}: none in stock. ${r.s.arriving}. ${nt(price(r.s.listTwd))} each. Hold ${r.qty} for you?`;
    })
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <h4>
        {inquiry.customer} · {inquiry.channel} · tier {inquiry.tier}, {inquiry.discountPct}% off list
      </h4>
      <p className="bubble-meta">{inquiry.time}</p>
      <div className="bubble" lang="zh-Hant">
        {inquiry.message}
      </div>

      <h4>What the garage is asking for</h4>
      <table className="t">
        <thead>
          <tr>
            <th>Said</th>
            <th>Means</th>
            <th>Part</th>
            <th className="r">Stock</th>
            <th className="r">Price</th>
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
              </td>
              <td>
                {r.g ? (
                  <>
                    {r.g.meaning}
                    <div className="faint">Glossary: {r.g.by}</div>
                  </>
                ) : (
                  <>
                    <b>Not in the company glossary.</b>
                    <div>
                      {guess === null ? (
                        <span className="working">asking the model</span>
                      ) : guess.usedModel ? (
                        <>
                          The model&apos;s guess: {guess.meaning} <span className="tag lo">{guess.confidence} confidence</span>
                          <div className="faint">A guess is not used to quote a part.</div>
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
          <p>One word nobody has written down yet. Ask someone who knows?</p>
          <div className="actions">
            <button
              className="btn solid"
              onClick={() =>
                dispatch({ type: "escalate", cardId: card.id, why: `"${firstUnknown}" is not in the glossary` })
              }
            >
              Pass it up with the question
            </button>
          </div>
        </div>
      )}

      {!allKnown && asked && (
        <div className="teach">
          <label>
            {senior ? `${holder?.name} answers once.` : "Waiting for an answer."} What is{" "}
            <b lang="zh-Hant">{firstUnknown}</b>?
          </label>
          <div className="row">
            <input value={meaning} onChange={(e) => setMeaning(e.target.value)} aria-label="Meaning" />
            <select value={sku} onChange={(e) => setSku(e.target.value)} aria-label="Part">
              {Object.values(stock).map((s) => (
                <option key={s.sku} value={s.sku}>
                  {s.sku} · {s.nameEn}
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
                  by: holder?.name ?? "A senior",
                  cardId: card.id,
                })
              }
            >
              Save to the glossary
            </button>
          </div>
        </div>
      )}

      {allKnown && (
        <>
          <h4>Reply drafted from stock and this customer&apos;s price tier</h4>
          <div className="reply">{reply}</div>
          {card.status !== "done" && (
            <div className="ask">
              <p>{card.ask}</p>
              <div className="actions">
                <button
                  className="btn solid"
                  onClick={() => {
                    dispatch({ type: "approve", cardId: card.id, note: "reply sent on LINE" });
                    onClose();
                  }}
                >
                  Send the reply
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <StakeNote card={card} />
    </>
  );
}
