"use client";

import { useEffect, useReducer, useState } from "react";
import { initialState, load, openStake, reducer, singlePoints } from "@/lib/engine/engine";
import type { Card, CompanyId, Lang, State } from "@/lib/engine/types";
import { nt, usd } from "@/lib/fmt";
import { Drawer } from "./ui/Drawer";
import { Bench } from "./ui/Bench";
import { Setup } from "./ui/Setup";

type View = "wall" | "bench" | "setup";

export default function Home() {
  const [state, dispatch] = useReducer(reducer, "auto" as CompanyId, initialState);
  const [view, setView] = useState<View>("wall");
  const [openId, setOpenId] = useState<string | null>(null);
  const [quitPick, setQuitPick] = useState("jr1");
  const lang = state.lang;
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

  // highlights fade after a few seconds
  const flashing = state.cards.some((c) => c.flash);
  useEffect(() => {
    if (!flashing) return;
    const timer = setTimeout(() => dispatch({ type: "clearFlash" }), 6000);
    return () => clearTimeout(timer);
  }, [flashing, state.seq]);

  const open = state.cards.find((c) => c.id === openId) ?? null;
  const staff = state.people.filter((p) => !p.external);
  const quitChoices = staff.filter((p) => p.active && p.level < 3);
  const quitTarget = quitChoices.some((p) => p.id === quitPick) ? quitPick : quitChoices[0]?.id;

  const switchCompany = (c: CompanyId, l: Lang = lang) => {
    setOpenId(null);
    dispatch({ type: "reset", company: c, lang: l });
    setView("wall");
  };
  const switchLang = (l: Lang) => {
    setOpenId(null);
    dispatch({ type: "reset", company: state.company, lang: l });
  };

  return (
    <>
      <header className="top">
        <div className="brand">
          DOCKET<small>{t("the work stays on the card", "工作留在卡片上")}</small>
        </div>
        <nav className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={view === "wall"} onClick={() => setView("wall")}>
            {t("Wall", "卡片牆")}
          </button>
          <button className="tab" role="tab" aria-selected={view === "bench"} onClick={() => setView("bench")}>
            {t("Customs code test", "號列準確率")}
          </button>
          <button className="tab" role="tab" aria-selected={view === "setup"} onClick={() => setView("setup")}>
            {t("Set up a company", "建立公司流程")}
          </button>
        </nav>
        <div className="spacer" />
        {view === "wall" && (
          <>
            <div className="seg" aria-label={t("Company", "公司")}>
              <button aria-pressed={state.company === "auto"} onClick={() => switchCompany("auto")}>
                {t("Auto parts", "汽車零件")}
              </button>
              <button aria-pressed={state.company === "grain"} onClick={() => switchCompany("grain")}>
                {t("Grain", "雜糧")}
              </button>
            </div>
            {state.company === "auto" && (
              <button className="btn" disabled={state.typhoon} onClick={() => dispatch({ type: "typhoon" })}>
                {t("Typhoon delays the ship", "颱風，船晚到")}
              </button>
            )}
            <span className="seg">
              <select
                value={quitTarget}
                onChange={(e) => setQuitPick(e.target.value)}
                style={{ border: "none", background: "var(--sheet)", font: "inherit", fontSize: 13, padding: "0 6px" }}
                aria-label={t("Who quits", "誰離職")}
              >
                {quitChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button onClick={() => quitTarget && dispatch({ type: "quit", personId: quitTarget })}>
                {t("quits today", "今天離職")}
              </button>
            </span>
            <button className="btn" onClick={() => switchCompany(state.company)}>
              {t("Reset", "重設")}
            </button>
          </>
        )}
        <div className="seg" aria-label="Language">
          <button aria-pressed={lang === "en"} onClick={() => switchLang("en")}>
            EN
          </button>
          <button aria-pressed={lang === "zh"} onClick={() => switchLang("zh")}>
            中文
          </button>
        </div>
      </header>

      {view === "bench" && <Bench lang={lang} />}
      {view === "setup" && <Setup lang={lang} onOpenBoard={switchCompany} />}

      {view === "wall" && (
        <main className="wrap">
          <div>
            <div className="company">
              <h1>{state.companyName}</h1>
              <p>
                {state.companyNote} {t(`Today is ${state.today}.`, `今天是 ${state.today}。`)}
              </p>
            </div>
            {state.shipments.map((s) => (
              <ShipmentLane key={s.id} state={state} shipmentId={s.id} onOpen={setOpenId} />
            ))}
          </div>
          <Side state={state} />
        </main>
      )}

      {open && (
        <>
          <div className="scrim" onClick={() => setOpenId(null)} />
          <Drawer card={open} state={state} dispatch={dispatch} onClose={() => setOpenId(null)} />
        </>
      )}
    </>
  );
}

function ShipmentLane({ state, shipmentId, onOpen }: { state: State; shipmentId: string; onOpen: (id: string) => void }) {
  const t = (en: string, zh: string) => (state.lang === "zh" ? zh : en);
  const s = state.shipments.find((x) => x.id === shipmentId)!;
  const cards = state.cards.filter((c) => c.shipmentId === shipmentId);
  const { total, count } = openStake(state, shipmentId);
  const pct = Math.min(100, Math.round((total / s.margin) * 100));
  return (
    <section className="ship">
      <div className="ship-head">
        <div>
          <span className="ship-id">{s.id}</span>
          <span className="ship-title">{s.title}</span>
          <div className="ship-sub">{s.sub}</div>
          <div className={`ship-eta${s.late ? " late" : ""}`}>
            {t("ETA", "到港")} {s.eta}
          </div>
          <div className="ship-sold">{s.sold}</div>
        </div>
        <div className="money">
          <div className="line1">
            {t("Expected margin once it has all sold", "全部賣完後的預計毛利")} <span className="num">{nt(s.margin)}</span>
            {state.lang === "en" && <span className="usd">≈ {usd(s.margin)}</span>} ({s.marginPct}%)
          </div>
          {count > 0 ? (
            <>
              <div className="line2">
                {state.lang === "zh" ? (
                  <>
                    其中 <b>{nt(total)}</b> 取決於 {count} 個還沒做的決定
                  </>
                ) : (
                  <>
                    <b>{nt(total)}</b>
                    <span className="usd">≈ {usd(total)}</span> depends on {count} open decision{count > 1 ? "s" : ""}
                  </>
                )}
              </div>
              <div className="bar" title={t(`${pct}% of the margin`, `毛利的 ${pct}%`)}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            <div className="line2">{t("Nothing open that moves the margin", "沒有會影響毛利的決定還開著")}</div>
          )}
        </div>
      </div>
      <div className="chain">
        {cards.map((c, i) => (
          <Ticket key={c.id} card={c} index={i + 1} state={state} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function Ticket({ card, index, state, onOpen }: { card: Card; index: number; state: State; onOpen: (id: string) => void }) {
  const t = (en: string, zh: string) => (state.lang === "zh" ? zh : en);
  const who = state.people.find((p) => p.id === card.assignee);
  const cls = ["tk", card.status, card.flash ? `flash-${card.flash}` : ""].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={() => onOpen(card.id)}>
      <div className="tk-top">
        <span>
          <span className="n">{String(index).padStart(2, "0")}</span>
          {card.stage}
        </span>
        {card.status === "owner" && <span className="stamp owner">{t("OWNER", "老闆")}</span>}
        {card.status === "done" && <span className="stamp done">{t("DONE", "完成")}</span>}
        {card.status === "waiting" && <span className="stamp waiting">{t("WAITING", "等待")}</span>}
        {card.status === "ready" && card.flash === "new" && <span className="stamp new">{t("NEW", "新卡")}</span>}
      </div>
      <div className="tk-title">{card.title}</div>
      <div className="tk-foot">
        <span className={`who${who?.external ? " ext" : ""}`}>
          <span className="dot" />
          {card.flash === "moved" && card.movedFrom && <span className="from">{card.movedFrom}</span>}
          {who?.name ?? t("Unassigned", "未分派")}
        </span>
        {card.status !== "done" && (
          <span className={`stake${card.stake ? "" : " zero"}`}>{card.stake ? nt(card.stake) : "—"}</span>
        )}
      </div>
    </button>
  );
}

function Side({ state }: { state: State }) {
  const t = (en: string, zh: string) => (state.lang === "zh" ? zh : en);
  const staff = state.people.filter((p) => !p.external);
  const partners = state.people.filter((p) => p.external);
  const spof = singlePoints(state);
  return (
    <aside className="side">
      <section>
        <h3>{t("People · open cards", "人 · 手上的卡")}</h3>
        {staff.map((p) => {
          const n = load(state, p.id);
          return (
            <div key={p.id} className={`person${p.active ? "" : " gone"}`}>
              <span className="nm">{p.name}</span>
              <span className="rl">
                {p.role}
                {!p.active && <span className="left"> · {t("left today", "今天離職")}</span>}
              </span>
              <span className="ld">
                {Array.from({ length: n }).map((_, i) => (
                  <i key={i} className="pip" />
                ))}
                <span className="cnt">{n}</span>
              </span>
            </div>
          );
        })}
        {partners.map((p) => (
          <div key={p.id} className="person">
            <span className="nm">{p.name}</span>
            <span className="rl">
              {p.role} · {t("outside the company", "公司外面")}
            </span>
          </div>
        ))}
      </section>

      <section>
        <h3>{t("Only one person can do this", "只有一個人會做")}</h3>
        {spof.length === 0 && (
          <p className="faint">
            {t("Every kind of card has at least two people who can take it.", "每一種卡都至少有兩個人能接。")}
          </p>
        )}
        {spof.map((s) => (
          <div key={s.label} className="spof">
            <span>{s.label}</span>
            <b>{s.who}</b>
          </div>
        ))}
      </section>

      {state.glossary.length > 0 && (
        <section>
          <h3>{t("Company glossary", "公司術語表")}</h3>
          {state.glossary.map((g) => (
            <div key={g.term} className="gl">
              <span className="t">{g.term}</span>
              {g.meaning}
              <span className="by">{g.by}</span>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>{t("What just happened", "剛剛發生的事")}</h3>
        {state.log.slice(0, 12).map((l) => (
          <div key={l.id} className={`logline ${l.tone ?? ""}`}>
            {l.text}
          </div>
        ))}
      </section>
    </aside>
  );
}
