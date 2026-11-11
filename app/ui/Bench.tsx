"use client";

import { useEffect, useState } from "react";

type Mode = { d4: number; d6: number; d8: number; d11: number; invalid: number; n: number };
type Item = {
  id: string;
  name: string;
  truth: string;
  truthZh: string;
  pred: Record<string, string | null | undefined>;
  ok8: Record<string, boolean | undefined>;
};
type Results = {
  missing?: boolean;
  ranAt?: string;
  model?: string;
  models?: Record<string, string>;
  n: number;
  protocol: string;
  modes: Record<string, Mode>;
  items: Item[];
};

const MODES: { key: string; title: string; sub: string }[] = [
  { key: "nearest", title: "Copy the nearest past ruling", sub: "No model. What a keyword search over old rulings gets you." },
  { key: "llm", title: "Ask the model directly", sub: "No retrieval. The model answers from memory." },
  { key: "rag", title: "Model reads past rulings", sub: "What the customs card does: similar rulings and candidate codes go into the prompt." },
];

const fmt = (c?: string | null) =>
  c && c.length === 11 ? `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}.${c.slice(8, 10)}-${c.slice(10)}` : (c ?? "");

export function Bench() {
  const [r, setR] = useState<Results | null>(null);
  useEffect(() => {
    fetch("/api/benchmark")
      .then((x) => x.json())
      .then(setR)
      .catch(() => setR({ missing: true } as Results));
  }, []);

  if (!r) return <div className="page working">loading</div>;
  if (r.missing) return <div className="page">The benchmark has not been run yet. See data/benchmark/README.md.</div>;

  const ran = MODES.filter((m) => r.modes[m.key]);
  const best = [...ran].sort((a, b) => r.modes[b.key].d8 - r.modes[a.key].d8)[0]?.key;
  const p = (a: number, n: number) => `${Math.round((a / n) * 100)}%`;

  return (
    <div className="page">
      <h1>Does the customs card get the code right?</h1>
      <p className="lede">
        {r.n} real Taiwan Customs advance rulings from 2018, picked at random from every kind of goods. The system only
        sees rulings from before 2018. A code counts as right when it matches the one Customs ruled. Eight digits is the
        level that sets the duty rate. Six digits is the international HS level, the same in every country.
      </p>

      <div className="scores">
        {MODES.map((m) => {
          const s = r.modes[m.key];
          return (
            <div key={m.key} className={`score${m.key === best && ran.length > 1 ? " best" : ""}`}>
              <h3>{m.title}</h3>
              <div className="sub">{m.sub}</div>
              {s ? (
                <>
                  <div className="big">
                    {p(s.d8, s.n)}
                    <small>
                      {s.d8} of {s.n} right at 8 digits
                    </small>
                  </div>
                  <div className="digits">
                    <div>
                      <span>4 digits</span>
                      {p(s.d4, s.n)}
                    </div>
                    <div>
                      <span>6 digits</span>
                      {p(s.d6, s.n)}
                    </div>
                    <div>
                      <span>8 digits</span>
                      {p(s.d8, s.n)}
                    </div>
                    <div>
                      <span>all 11</span>
                      {p(s.d11, s.n)}
                    </div>
                  </div>
                  {s.invalid > 0 && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{s.invalid} answers were codes that do not exist</div>}
                </>
              ) : (
                <div className="big">
                  <small style={{ marginLeft: 0 }}>not run yet</small>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="note" style={{ marginBottom: 16 }}>
        {r.protocol}
        {r.models && Object.keys(r.models).length > 0
          ? ` Model: ${[...new Set(Object.values(r.models))].join(", ")}.`
          : r.model
            ? ` Model: ${r.model}.`
            : ""}
        {r.ranAt ? ` Last run ${r.ranAt.slice(0, 16).replace("T", " ")} UTC.` : ""} Numbers on this page are read from
        the run output in data/benchmark/results.json.
      </p>

      <table className="t">
        <thead>
          <tr>
            <th>Declared goods</th>
            <th>Customs ruled</th>
            {ran.map((m) => (
              <th key={m.key}>{m.key === "nearest" ? "Nearest ruling" : m.key === "llm" ? "Model alone" : "Model + rulings"}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.items.slice(0, 60).map((it) => (
            <tr key={it.id}>
              <td lang="zh-Hant" style={{ maxWidth: 360 }}>
                {it.name.slice(0, 70)}
                {it.name.length > 70 ? "…" : ""}
              </td>
              <td>
                <span className="mono">{fmt(it.truth)}</span>
                <div className="faint" lang="zh-Hant">
                  {it.truthZh.slice(0, 26)}
                </div>
              </td>
              {ran.map((m) => (
                <td key={m.key} className="mono">
                  <span className={it.ok8[m.key] ? "yes" : "no"}>{it.ok8[m.key] ? "✓" : "✗"}</span> {fmt(it.pred[m.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="faint" style={{ marginTop: 8 }}>
        First 60 of {r.items.length} shown. The full list is in the repository.
      </p>
    </div>
  );
}
