"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/engine/types";

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

const MODES: { key: string; title: [string, string]; sub: [string, string]; col: [string, string] }[] = [
  {
    key: "nearest",
    title: ["Copy the nearest past ruling", "只抄最接近的舊案例"],
    sub: ["No model. What a keyword search over old rulings gets you.", "不用模型。在舊案例裡用關鍵字搜尋能做到的程度。"],
    col: ["Nearest ruling", "抄舊案例"],
  },
  {
    key: "llm",
    title: ["Ask the model directly", "直接問模型"],
    sub: ["No retrieval. The model answers from memory.", "不給它看資料，模型憑記憶回答。"],
    col: ["Model alone", "只問模型"],
  },
  {
    key: "rag",
    title: ["Model reads past rulings", "模型先讀舊案例"],
    sub: [
      "What the customs card does: similar rulings and candidate codes go into the prompt.",
      "報關號列卡的做法：把類似的舊案例和候選號列一起給模型。",
    ],
    col: ["Model + rulings", "模型＋舊案例"],
  },
];

const fmt = (c?: string | null) =>
  c && c.length === 11 ? `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}.${c.slice(8, 10)}-${c.slice(10)}` : (c ?? "");

export function Bench({ lang }: { lang: Lang }) {
  const zh = lang === "zh";
  const t = (en: string, z: string) => (zh ? z : en);
  const i = zh ? 1 : 0;
  const [r, setR] = useState<Results | null>(null);
  useEffect(() => {
    fetch("/api/benchmark")
      .then((x) => x.json())
      .then(setR)
      .catch(() => setR({ missing: true } as Results));
  }, []);

  if (!r) return <div className="page working">{t("loading", "讀取中")}</div>;
  if (r.missing)
    return (
      <div className="page">
        {t("The benchmark has not been run yet. See data/benchmark/README.md.", "實驗還沒跑。見 data/benchmark/README.md。")}
      </div>
    );

  const ran = MODES.filter((m) => r.modes[m.key]);
  const best = [...ran].sort((a, b) => r.modes[b.key].d8 - r.modes[a.key].d8)[0]?.key;
  const p = (a: number, n: number) => `${Math.round((a / n) * 100)}%`;
  const models = r.models && Object.keys(r.models).length > 0 ? [...new Set(Object.values(r.models))].join(", ") : r.model;

  return (
    <div className="page">
      <h1>{t("Does the customs card get the code right?", "報關號列卡對得準嗎？")}</h1>
      <p className="lede">
        {zh
          ? `${r.n} 筆 2018 年台灣海關的稅則預先審核案例，從所有貨品裡隨機抽的。系統只看得到 2018 年以前的案例。跟海關核定的號列一樣才算對。8 碼是決定稅率的那一層。6 碼是國際通用的 HS 碼，每個國家都一樣。`
          : `${r.n} real Taiwan Customs advance rulings from 2018, picked at random from every kind of goods. The system only sees rulings from before 2018. A code counts as right when it matches the one Customs ruled. Eight digits is the level that sets the duty rate. Six digits is the international HS level, the same in every country.`}
      </p>

      <div className="scores">
        {MODES.map((m) => {
          const s = r.modes[m.key];
          return (
            <div key={m.key} className={`score${m.key === best && ran.length > 1 ? " best" : ""}`}>
              <h3>{m.title[i]}</h3>
              <div className="sub">{m.sub[i]}</div>
              {s ? (
                <>
                  <div className="big">
                    {p(s.d8, s.n)}
                    <small>{zh ? `${s.n} 題裡 8 碼對 ${s.d8} 題` : `${s.d8} of ${s.n} right at 8 digits`}</small>
                  </div>
                  <div className="digits">
                    <div>
                      <span>{t("4 digits", "4 碼")}</span>
                      {p(s.d4, s.n)}
                    </div>
                    <div>
                      <span>{t("6 digits", "6 碼")}</span>
                      {p(s.d6, s.n)}
                    </div>
                    <div>
                      <span>{t("8 digits", "8 碼")}</span>
                      {p(s.d8, s.n)}
                    </div>
                    <div>
                      <span>{t("all 11", "11 碼")}</span>
                      {p(s.d11, s.n)}
                    </div>
                  </div>
                  {s.invalid > 0 && (
                    <div className="no" style={{ fontSize: 12, marginTop: 6 }}>
                      {zh ? `有 ${s.invalid} 題寫出來的號列根本不存在` : `${s.invalid} answers were codes that do not exist`}
                    </div>
                  )}
                </>
              ) : (
                <div className="big">
                  <small style={{ marginLeft: 0 }}>{t("not run yet", "還沒跑")}</small>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="note" style={{ marginBottom: 16 }}>
        {zh
          ? `做法：用時間切開。參考資料只用 2018 年以前的案例，考題是 2018 年的案例，所以系統不可能看過答案。${models ? `模型：${models}。` : ""}${r.ranAt ? `最後一次跑：${r.ranAt.slice(0, 16).replace("T", " ")} UTC。` : ""}這一頁的數字是從實驗的輸出檔 data/benchmark/results.json 讀出來的。`
          : `${r.protocol}${models ? ` Model: ${models}.` : ""}${r.ranAt ? ` Last run ${r.ranAt.slice(0, 16).replace("T", " ")} UTC.` : ""} Numbers on this page are read from the run output in data/benchmark/results.json.`}
      </p>

      <table className="t">
        <thead>
          <tr>
            <th>{t("Declared goods", "申報的貨品")}</th>
            <th>{t("Customs ruled", "海關核定")}</th>
            {ran.map((m) => (
              <th key={m.key}>{m.col[i]}</th>
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
        {zh
          ? `這裡顯示前 60 題，全部 ${r.items.length} 題在 repo 裡。`
          : `First 60 of ${r.items.length} shown. The full list is in the repository.`}
      </p>
    </div>
  );
}
