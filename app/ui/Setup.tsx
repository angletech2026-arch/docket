"use client";

import { useRef, useState } from "react";
import type { CompanyId } from "@/lib/engine/types";

type FlowCard = {
  name: string;
  trigger: string | null;
  ai_prepares: string | null;
  person_decides: string | null;
  who: string;
  money: string | null;
  rule: string | null;
};
type Flow = { company: string; cards: FlowCard[]; not_mentioned: string[]; model?: string };

const PRESETS: { id: CompanyId; label: string; text: string }[] = [
  {
    id: "auto",
    label: "Auto parts distributor",
    text:
      "We are the sole distributor for several foreign auto parts brands and we sell inside Taiwan. It starts with stock: what to order, what we have, what will sell next. Everything with the suppliers goes by email. Government tenders can be delivered in batches so they go by sea, urgent customer orders go by air. We pay in US dollars, and a 2.5 to 3.5 percent move matters when the margin is 15 to 20 percent. Old suppliers let us pay after arrival, some want everything up front. When goods land, every item needs a customs code. We used to match them by hand one by one, and when the supplier revises a part number we match again. A customs broker files for us and their trucker brings the container to one of our three warehouses. Arrival times slip with the weather, so the forklift we hire and our crew end up waiting. In the warehouse the fast lines go out front and the slow ones in the back. Then we ship to garages and parts shops, and government orders mean a lot of letters back and forth. Garages ask on LINE with a photo or with mechanic slang new staff do not know.",
  },
  {
    id: "grain",
    label: "Grain importer",
    text:
      "We import beans and grains in bulk and sell inside Taiwan. Margins are thinner than in auto parts, so the dollar rate matters even more, and some suppliers want full payment before loading. Because it is food, there are more checks at the port than for ordinary goods. The same bean comes from different countries, mung beans from Australia and from elsewhere, and customers order by origin, so lots have to stay apart. Everything has a best-before date and loses a little weight: out of 10 tons about 1 kilo cannot be used. The older lot has to go out first. Sometimes we open the sacks and repack into the weight the customer wants.",
  },
];

type Rec = { start: () => void; stop: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void };

export function Setup({ onOpenBoard }: { onOpenBoard: (c: CompanyId) => void }) {
  const [text, setText] = useState("");
  const [preset, setPreset] = useState<CompanyId | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);

  const build = async () => {
    setBusy(true);
    setErr(null);
    setFlow(null);
    try {
      const r = await fetch("/api/flow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setFlow(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const speak = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      setErr("This browser has no speech input. Type or paste instead.");
      return;
    }
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = false;
    const base = text ? text.trimEnd() + " " : "";
    let said = "";
    r.onresult = (e) => {
      said = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      setText(base + said);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setPreset(null);
    setListening(true);
    r.start();
  };

  return (
    <div className="page">
      <h1>Set up a company by describing it</h1>
      <p className="lede">
        No forms and no flowchart. The owner says how the business runs, in their own words. The cards come out of that.
        Rules are only attached from a short list we checked against the Customs Act and the tariff table.
      </p>
      <div className="setup">
        <div>
          <div className="actions" style={{ marginBottom: 8 }}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="btn small"
                onClick={() => {
                  setText(p.text);
                  setPreset(p.id);
                  setFlow(null);
                }}
              >
                Use the {p.label.toLowerCase()}&apos;s words
              </button>
            ))}
            <button className={`btn small${listening ? " red" : ""}`} onClick={speak}>
              {listening ? "Stop listening" : "Speak"}
            </button>
          </div>
          <textarea
            className="in"
            value={text}
            placeholder="How does your business run, from the first order to the last delivery?"
            onChange={(e) => {
              setText(e.target.value);
              setPreset(null);
            }}
          />
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn solid" disabled={busy || text.trim().length < 40} onClick={build}>
              {busy ? "Reading" : "Build the cards"}
            </button>
            {busy && <span className="working">turning it into cards</span>}
          </div>
          {err && <p className="note warn">{err}</p>}
        </div>

        <div>
          {!flow && !busy && <p className="faint">The chain of cards for one shipment will appear here.</p>}
          {flow && (
            <>
              <div className="flow">
                {flow.cards.map((c, i) => (
                  <div key={i} className="st" style={{ animationDelay: `${i * 90}ms` }}>
                    <div className="hd">
                      <span>
                        {String(i + 1).padStart(2, "0")} · {c.who}
                      </span>
                      {c.money && <span>{c.money}</span>}
                    </div>
                    <div className="nm">{c.name}</div>
                    {c.ai_prepares && <div className="ai">Already done: {c.ai_prepares}</div>}
                    {c.person_decides && <div className="ai">Person decides: {c.person_decides}</div>}
                    {c.rule && <div className="rule">Rule: {c.rule}</div>}
                  </div>
                ))}
              </div>
              {flow.not_mentioned.length > 0 && (
                <div className="missing">
                  <b>You did not mention:</b>
                  <ul>
                    {flow.not_mentioned.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="actions" style={{ marginTop: 12 }}>
                {preset && (
                  <button className="btn solid" onClick={() => onOpenBoard(preset)}>
                    Open this company&apos;s board
                  </button>
                )}
                <span className="faint" style={{ fontSize: 12 }}>
                  Cards written by {flow.model ?? "the model"} from the text on the left. The board uses sample data.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
