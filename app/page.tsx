"use client";

import { useEffect, useReducer, useState } from "react";
import { initialState, load, openStake, reducer, singlePoints } from "@/lib/engine/engine";
import type { Action, Card, CompanyId, Lang, State } from "@/lib/engine/types";
import { nt, usd } from "@/lib/fmt";
import { literal } from "@/lib/sample/auto";
import { Drawer, prewarm } from "./ui/Drawer";
import { Bench } from "./ui/Bench";
import { Setup } from "./ui/Setup";

type View = "wall" | "bench" | "setup";

/**
 * Presenter mode, for recording the demo. Press P to start, then the right arrow for each step.
 * Every step puts its line on screen as a caption and performs the matching action on the board,
 * so the words and the screen cannot drift apart.
 */
type Ctx = {
  dispatch: (a: Action) => void;
  setView: (v: View) => void;
  setOpenId: (id: string | null) => void;
};
const STEPS: { say: string; tag?: string; run?: (c: Ctx) => void }[] = [
  // first frame: says what the viewer is about to look at, nothing spoken
  {
    say: "",
    run: (c) => {
      c.setOpenId(null);
      c.setView("wall");
      c.dispatch({ type: "reset", company: "auto", lang: "en" });
    },
  },
  {
    tag: "Why",
    say: "I used to work at my family’s auto parts import business in Taiwan. Every step depended on one or two senior people.",
  },
  {
    tag: "The idea",
    say: "So I broke the whole company into cards. One shipment is ten of them, from reordering to logistics (trucks and forklifts).",
  },
  { tag: "The idea", say: "AI does most of the work on each card. A person decides." },
  {
    tag: "Does it work?",
    say: "Every imported item needs a customs code. The first six digits are the same in the US.",
    run: (c) => {
      c.setView("wall");
      c.setOpenId("a4");
    },
  },
  {
    tag: "Does it work?",
    say: "Asked directly, the model gets 19 percent. Reading past customs rulings, 62, on 300 real cases.",
    run: (c) => {
      c.setOpenId(null);
      c.setView("bench");
    },
  },
  {
    tag: "What the AI does not know",
    say: "A mechanic asks for two plum skewers, a water turtle and a pineapple head. That’s slang for car parts.",
    run: (c) => {
      c.setView("wall");
      c.setOpenId("a0");
    },
  },
  {
    tag: "What the AI does not know",
    say: "The AI doesn’t know the third, and says so.",
    run: (c) => c.dispatch({ type: "escalate", cardId: "a0", why: "“鳳梨頭” is not in the glossary" }),
  },
  {
    tag: "What the AI does not know",
    say: "A senior answers once. It goes into the company brain, and everyone\u2019s assistant can teach it.",
    run: (c) =>
      c.dispatch({
        type: "teach",
        term: "鳳梨頭",
        meaning: "CV joint, the outer end of the drive shaft",
        sku: "BR-CV-5521",
        by: "Chen",
        cardId: "a0",
      }),
  },
  {
    tag: "When something goes wrong",
    say: "A typhoon delays the ship. All the logistics (truck, forklift, crew) are rebooked.",
    run: (c) => {
      c.setOpenId(null);
      c.dispatch({ type: "typhoon" });
    },
  },
  {
    tag: "When something goes wrong",
    say: "Someone quits. His cards move to other people. Nothing stops.",
    run: (c) => c.dispatch({ type: "quit", personId: "jr1" }),
  },
  {
    tag: "Next",
    say: "Today this runs on Claude. Next, a model inside the company, trained on its own cards.",
  },
  {
    tag: "Who wants it",
    say: "The same cards run a grain importer. Chang Chun, an international grain trading company in Taiwan, asked me to build this. Next, I want to bring it to US importers.",
    run: (c) => {
      c.setOpenId(null);
      c.setView("wall");
      c.dispatch({ type: "reset", company: "grain", lang: "en" });
    },
  },
  // last frame: nothing to say, the logic stays on screen
  { say: "" },
];
const MODEL_STEP = STEPS.findIndex((x) => x.tag === "Next");
const END_STEP = STEPS.length - 1;

export default function Home() {
  const [state, dispatch] = useReducer(reducer, "auto" as CompanyId, initialState);
  const [view, setView] = useState<View>("wall");
  const [openId, setOpenId] = useState<string | null>(null);
  const [quitPick, setQuitPick] = useState("jr1");
  const [present, setPresent] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const go = (n: number) => {
        const next = Math.max(0, Math.min(STEPS.length - 1, n));
        setStep(next);
        STEPS[next].run?.({ dispatch, setView, setOpenId });
      };
      if (!present) {
        if (e.key === "p" || e.key === "P") {
          setPresent(true);
          prewarm("en");
          go(0);
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(step + 1);
      } else if (e.key === "ArrowLeft") {
        setStep(Math.max(0, step - 1));
      } else if (e.key === "r" || e.key === "R") {
        go(0);
      } else if (e.key === "Escape") {
        setPresent(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, step]);
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

      {present && step === MODEL_STEP && (
        <div className="capnote">
          <div className="row">
            <span>Today</span>
            <b>Claude, hosted</b>
          </div>
          <div className="row">
            <span>Next</span>
            <b>A model inside the company, trained on its own cards</b>
          </div>
          <p>
            Every decision made on a card, and every answer a senior gives, is a training example that never leaves the
            building.
          </p>
        </div>
      )}
      {present && step === END_STEP && (
        <div className="endcard">
          <div className="inner">
            <div className="brand">DOCKET</div>
            <ol>
              <li>The know-how goes on the card, not in one person&apos;s head.</li>
              <li>AI does most of the work on each card. A person decides.</li>
              <li>Each person has an assistant that teaches from the company brain: what the founder and the seniors know.</li>
              <li>When someone is out, the card moves. The work does not stop.</li>
              <li>Every decision on a card becomes training data for the company&apos;s own model.</li>
            </ol>
            <p className="mono">github.com/angletech2026-arch/docket</p>
          </div>
        </div>
      )}
      {present && step === 0 && (
        <div className="endcard">
          <div className="inner">
            <div className="brand">DOCKET</div>
            <p className="big">
              A small import company runs on what a few senior people know. When one of them is out, that step stops.
            </p>
            <p className="big">
              Docket puts that know-how on cards. AI does most of the work on each card, and anyone can pick it up.
            </p>
            <p className="mono">You are about to see one shipment at an 8-person auto parts importer in Taiwan.</p>
          </div>
        </div>
      )}
      {present && STEPS[step].say && (
        <div className="cap">
          {STEPS[step].tag && <span className="captag">{STEPS[step].tag}</span>}
          {STEPS[step].say}
        </div>
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
              {state.lang === "en" && literal[g.term] ? <i>&ldquo;{literal[g.term]}&rdquo; </i> : null}
              {g.meaning}
              <span className="by">{g.by}</span>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>{t("Company brain", "公司大腦")}</h3>
        <p className="faint" style={{ fontSize: 11.5, marginBottom: 4 }}>
          {t(
            "What the owner and the seniors have said. Every person's assistant teaches from it.",
            "老闆和老手說過的話。每個人的助手都從這裡教。",
          )}
        </p>
        {Object.entries(
          state.brain.reduce<Record<string, number>>((acc, l) => {
            const who = l.by.split(/[,（]/)[0].trim();
            acc[who] = (acc[who] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([who, n]) => (
          <div key={who} className="brainrow">
            <span>{who}</span>
            <b>{n}</b>
          </div>
        ))}
      </section>

      <section>
        <h3>{t("Where the model runs", "模型跑在哪裡")}</h3>
        <div className="spof">
          <span>{t("Today", "現在")}</span>
          <span>{t("Claude, hosted", "Claude，雲端")}</span>
        </div>
        <div className="spof">
          <span>{t("Next", "接下來")}</span>
          <span style={{ textAlign: "right" }}>
            {t("A model inside the company, trained on its own cards", "公司自己機器上的模型，用自己的卡片訓練")}
          </span>
        </div>
        <p className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
          {t(
            "Every decision made on a card, and every answer a senior gives, is a training example that never leaves the building.",
            "卡片上做過的每個決定、老手回答過的每一句，都是訓練資料，而且不會離開公司。",
          )}
        </p>
      </section>

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
