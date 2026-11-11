"use client";

import { useRef, useState } from "react";
import type { CompanyId, Lang } from "@/lib/engine/types";

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

const PRESETS: { id: CompanyId; label: [string, string]; text: [string, string] }[] = [
  {
    id: "auto",
    label: ["Use the auto parts distributor's words", "用汽車零件代理商的話"],
    text: [
      "We are the sole distributor for several foreign auto parts brands and we sell inside Taiwan. It starts with stock: what to order, what we have, what will sell next. Everything with the suppliers goes by email. Government tenders can be delivered in batches so they go by sea, urgent customer orders go by air. We pay in US dollars, and a 2.5 to 3.5 percent move matters when the margin is 15 to 20 percent. Old suppliers let us pay after arrival, some want everything up front. When goods land, every item needs a customs code. We used to match them by hand one by one, and when the supplier revises a part number we match again. A customs broker files for us and their trucker brings the container to one of our three warehouses. Arrival times slip with the weather, so the forklift we hire and our crew end up waiting. In the warehouse the fast lines go out front and the slow ones in the back. Then we ship to garages and parts shops, and government orders mean a lot of letters back and forth. Garages ask on LINE with a photo or with mechanic slang new staff do not know.",
      "我們是好幾個國外汽車零件品牌的總代理，做台灣內銷。第一關是庫存：要訂什麼、現在有什麼、之後會賣什麼。跟國外幾乎都用 email。政府的案子可以分批交，所以走海運；客戶比較急的訂單就走空運。我們付美金，毛利 15 到 20%，匯率動個 2.5 到 3.5% 影響就很大。配合久的原廠可以貨到再慢慢付，有些要先全額付清。貨到港之後，每一項都要報一個號列，以前是手動一個一個對，原廠改版料號變了又要重對一次。我們都跟報關行配合，報關行找配合的司機把櫃子送到我們三個倉庫其中一個。因為天氣，到倉庫的時間常常差很多，我們叫的堆高機和人就在那邊等。倉庫裡先出的放外面，慢慢賣的放裡面。然後出貨給修車廠和零件行，政府的案子公文一來一往很花時間。修車廠會用 LINE 傳一張照片，或是講師傅才懂的術語來問，新人聽不懂。",
    ],
  },
  {
    id: "grain",
    label: ["Use the grain importer's words", "用雜糧進口商的話"],
    text: [
      "We import beans and grains in bulk and sell inside Taiwan. Margins are thinner than in auto parts, so the dollar rate matters even more, and some suppliers want full payment before loading. Because it is food, there are more checks at the port than for ordinary goods. The same bean comes from different countries, mung beans from Australia and from elsewhere, and customers order by origin, so lots have to stay apart. Everything has a best-before date and loses a little weight: out of 10 tons about 1 kilo cannot be used. The older lot has to go out first. Sometimes we open the sacks and repack into the weight the customer wants.",
      "我們大宗進口豆類和穀物，做台灣內銷。毛利比汽車零件低，所以匯率影響更大，有些供應商要裝船前全額付清。因為是食物，到港要過的關比一般貨多。同一種豆有不同產地，綠豆有澳洲來的也有其他地方來的，客戶會指定產地，所以要分開放。每一批都有保存期限，放著也會有耗損，10 公噸大概有 1 公斤不能用。舊的那一批要先出。有時候還要拆開來，重新包成客戶要的重量。",
    ],
  },
];

type Rec = { start: () => void; stop: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void };

export function Setup({ lang, onOpenBoard }: { lang: Lang; onOpenBoard: (c: CompanyId) => void }) {
  const zh = lang === "zh";
  const t = (en: string, z: string) => (zh ? z : en);
  const i = zh ? 1 : 0;
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
        body: JSON.stringify({ text, lang }),
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
      setErr(t("This browser has no speech input. Type or paste instead.", "這個瀏覽器不支援語音輸入，請用打字或貼上。"));
      return;
    }
    const r = new Ctor();
    r.lang = zh ? "zh-TW" : "en-US";
    r.continuous = true;
    r.interimResults = false;
    const base = text ? text.trimEnd() + " " : "";
    r.onresult = (e) => {
      const said = Array.from(e.results)
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

  const whoWord = (w: string) =>
    zh ? ({ anyone: "誰都能接", experienced: "要有經驗", owner: "老闆", "outside partner": "外部夥伴" }[w] ?? w) : w;

  return (
    <div className="page">
      <h1>{t("Set up a company by describing it", "用講的把公司流程建起來")}</h1>
      <p className="lede">
        {t(
          "No forms and no flowchart. The owner says how the business runs, in their own words. The cards come out of that. Rules are only attached from a short list we checked against the Customs Act and the tariff table.",
          "不用填表，不用畫流程圖。老闆用自己的話講生意怎麼跑，卡片就從這段話長出來。法規只會從一份我們對過關稅法和稅則表的清單裡掛上去。",
        )}
      </p>
      <div className="setup">
        <div>
          <div className="actions" style={{ marginBottom: 8 }}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="btn small"
                onClick={() => {
                  setText(p.text[i]);
                  setPreset(p.id);
                  setFlow(null);
                }}
              >
                {p.label[i]}
              </button>
            ))}
            <button className={`btn small${listening ? " red" : ""}`} onClick={speak}>
              {listening ? t("Stop listening", "停止") : t("Speak", "用講的")}
            </button>
          </div>
          <textarea
            className="in"
            value={text}
            placeholder={t(
              "How does your business run, from the first order to the last delivery?",
              "你的生意從第一張訂單到最後一次交貨，是怎麼跑的？",
            )}
            onChange={(e) => {
              setText(e.target.value);
              setPreset(null);
            }}
          />
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn solid" disabled={busy || text.trim().length < 40} onClick={build}>
              {busy ? t("Reading", "讀取中") : t("Build the cards", "長出卡片")}
            </button>
            {busy && <span className="working">{t("turning it into cards", "正在變成卡片")}</span>}
          </div>
          {err && <p className="note warn">{err}</p>}
        </div>

        <div>
          {!flow && !busy && (
            <p className="faint">{t("The chain of cards for one shipment will appear here.", "一批貨會經過的卡片會出現在這裡。")}</p>
          )}
          {flow && (
            <>
              <div className="flow">
                {flow.cards.map((c, n) => (
                  <div key={n} className="st" style={{ animationDelay: `${n * 90}ms` }}>
                    <div className="hd">
                      <span>
                        {String(n + 1).padStart(2, "0")} · {whoWord(c.who)}
                      </span>
                      {c.money && <span>{c.money}</span>}
                    </div>
                    <div className="nm">{c.name}</div>
                    {c.ai_prepares && (
                      <div className="ai">
                        {t("Already done:", "已經做好：")} {c.ai_prepares}
                      </div>
                    )}
                    {c.person_decides && (
                      <div className="ai">
                        {t("Person decides:", "人來決定：")} {c.person_decides}
                      </div>
                    )}
                    {c.rule && (
                      <div className="rule">
                        {t("Rule:", "法規：")} {c.rule}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {flow.not_mentioned.length > 0 && (
                <div className="missing">
                  <b>{t("You did not mention:", "你沒有提到：")}</b>
                  <ul>
                    {flow.not_mentioned.map((m, n) => (
                      <li key={n}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="actions" style={{ marginTop: 12 }}>
                {preset && (
                  <button className="btn solid" onClick={() => onOpenBoard(preset)}>
                    {t("Open this company's board", "打開這家公司的卡片牆")}
                  </button>
                )}
                <span className="faint" style={{ fontSize: 12 }}>
                  {zh
                    ? `卡片是 ${flow.model ?? "模型"} 照左邊這段話寫的。卡片牆用的是範例資料。`
                    : `Cards written by ${flow.model ?? "the model"} from the text on the left. The board uses sample data.`}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
