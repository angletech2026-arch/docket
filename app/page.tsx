"use client";

import { useEffect, useReducer, useState } from "react";
import { initialState, load, openStake, reducer, singlePoints } from "@/lib/engine/engine";
import type { Card, CompanyId, State } from "@/lib/engine/types";
import { nt } from "@/lib/fmt";
import { Drawer } from "./ui/Drawer";
import { Bench } from "./ui/Bench";
import { Setup } from "./ui/Setup";

type View = "wall" | "bench" | "setup";

export default function Home() {
  const [state, dispatch] = useReducer(reducer, "auto" as CompanyId, initialState);
  const [view, setView] = useState<View>("wall");
  const [openId, setOpenId] = useState<string | null>(null);
  const [quitPick, setQuitPick] = useState("jr1");

  // highlights fade after a few seconds
  const flashing = state.cards.some((c) => c.flash);
  useEffect(() => {
    if (!flashing) return;
    const t = setTimeout(() => dispatch({ type: "clearFlash" }), 6000);
    return () => clearTimeout(t);
  }, [flashing, state.seq]);

  const open = state.cards.find((c) => c.id === openId) ?? null;
  const staff = state.people.filter((p) => !p.external);
  const quitChoices = staff.filter((p) => p.active && p.level < 3);
  const quitTarget = quitChoices.some((p) => p.id === quitPick) ? quitPick : quitChoices[0]?.id;

  const switchCompany = (c: CompanyId) => {
    setOpenId(null);
    dispatch({ type: "reset", company: c });
    setView("wall");
  };

  return (
    <>
      <header className="top">
        <div className="brand">
          DOCKET<small>the work stays on the card</small>
        </div>
        <nav className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={view === "wall"} onClick={() => setView("wall")}>
            Wall
          </button>
          <button className="tab" role="tab" aria-selected={view === "bench"} onClick={() => setView("bench")}>
            Customs code test
          </button>
          <button className="tab" role="tab" aria-selected={view === "setup"} onClick={() => setView("setup")}>
            Set up a company
          </button>
        </nav>
        <div className="spacer" />
        {view === "wall" && (
          <>
            <div className="seg" aria-label="Company">
              <button aria-pressed={state.company === "auto"} onClick={() => switchCompany("auto")}>
                Auto parts
              </button>
              <button aria-pressed={state.company === "grain"} onClick={() => switchCompany("grain")}>
                Grain
              </button>
            </div>
            {state.company === "auto" && (
              <button className="btn" disabled={state.typhoon} onClick={() => dispatch({ type: "typhoon" })}>
                Typhoon delays the ship
              </button>
            )}
            <span className="seg">
              <select
                value={quitTarget}
                onChange={(e) => setQuitPick(e.target.value)}
                style={{ border: "none", background: "var(--sheet)", font: "inherit", fontSize: 13, padding: "0 6px" }}
                aria-label="Who quits"
              >
                {quitChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button onClick={() => quitTarget && dispatch({ type: "quit", personId: quitTarget })}>quits today</button>
            </span>
            <button className="btn" onClick={() => switchCompany(state.company)}>
              Reset
            </button>
          </>
        )}
      </header>

      {view === "bench" && <Bench />}
      {view === "setup" && <Setup onOpenBoard={switchCompany} />}

      {view === "wall" && (
        <main className="wrap">
          <div>
            <div className="company">
              <h1>{state.companyName}</h1>
              <p>
                {state.companyNote} Today is {state.today}.
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
  const s = state.shipments.find((x) => x.id === shipmentId)!;
  const cards = state.cards.filter((c) => c.shipmentId === shipmentId);
  const { total, count } = openStake(state, shipmentId);
  const pct = Math.min(100, Math.round((total / s.margin) * 100));
  const late = /was/.test(s.eta);
  return (
    <section className="ship">
      <div className="ship-head">
        <div>
          <span className="ship-id">{s.id}</span>
          <span className="ship-title">{s.title}</span>
          <div className="ship-sub">{s.sub}</div>
          <div className={`ship-eta${late ? " late" : ""}`}>ETA {s.eta}</div>
        </div>
        <div className="money">
          <div className="line1">
            Margin on this shipment <span className="num">{nt(s.margin)}</span> ({s.marginPct}%)
          </div>
          {count > 0 ? (
            <>
              <div className="line2">
                <b>{nt(total)}</b> depends on {count} open decision{count > 1 ? "s" : ""}
              </div>
              <div className="bar" title={`${pct}% of the margin`}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            <div className="line2">Nothing open that moves the margin</div>
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
  const who = state.people.find((p) => p.id === card.assignee);
  const cls = ["tk", card.status, card.flash ? `flash-${card.flash}` : ""].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={() => onOpen(card.id)}>
      <div className="tk-top">
        <span>
          <span className="n">{String(index).padStart(2, "0")}</span>
          {card.stage}
        </span>
        {card.status === "owner" && <span className="stamp owner">OWNER</span>}
        {card.status === "done" && <span className="stamp done">DONE</span>}
        {card.status === "waiting" && <span className="stamp waiting">WAITING</span>}
        {card.status === "ready" && card.flash === "new" && <span className="stamp new">NEW</span>}
      </div>
      <div className="tk-title">{card.title}</div>
      <div className="tk-foot">
        <span className={`who${who?.external ? " ext" : ""}`}>
          <span className="dot" />
          {card.flash === "moved" && card.movedFrom && <span className="from">{card.movedFrom}</span>}
          {who?.name ?? "Unassigned"}
        </span>
        {card.status !== "done" && (
          <span className={`stake${card.stake ? "" : " zero"}`}>{card.stake ? nt(card.stake) : "—"}</span>
        )}
      </div>
    </button>
  );
}

function Side({ state }: { state: State }) {
  const staff = state.people.filter((p) => !p.external);
  const partners = state.people.filter((p) => p.external);
  const spof = singlePoints(state);
  return (
    <aside className="side">
      <section>
        <h3>People · open cards</h3>
        {staff.map((p) => {
          const n = load(state, p.id);
          return (
            <div key={p.id} className={`person${p.active ? "" : " gone"}`}>
              <span className="nm">{p.name}</span>
              <span className="rl">{p.role}</span>
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
            <span className="rl">{p.role} · outside the company</span>
          </div>
        ))}
      </section>

      <section>
        <h3>Only one person can do this</h3>
        {spof.length === 0 && <p className="faint">Every kind of card has at least two people who can take it.</p>}
        {spof.map((s) => (
          <div key={s.label} className="spof">
            <span>{s.label}</span>
            <b>{s.who}</b>
          </div>
        ))}
      </section>

      {state.glossary.length > 0 && (
        <section>
          <h3>Company glossary</h3>
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
        <h3>What just happened</h3>
        {state.log.slice(0, 12).map((l) => (
          <div key={l.id} className={`logline ${l.tone ?? ""}`}>
            {l.text}
          </div>
        ))}
      </section>
    </aside>
  );
}
