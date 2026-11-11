// Records the model's answers for the two demo cards, so the cards open with them already there.
// The answers are real model output from this run. The card says so and offers to ask again live.
//
//   npm run dev        (in another terminal, with a key in .env.local)
//   node scripts/record-demo.mjs [http://localhost:3000]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://localhost:3000";

// the three new parts on the sample invoice, exactly as the customs card sends them (lib/sample/auto.ts)
const lines = [
  {
    sku: "BR-OS-9001",
    name: "含氧感知器 Oxygen sensor, upstream, 4-wire, zirconia",
    material: "氧化鋯陶瓷感測元件、不鏽鋼外殼、含線束 zirconia ceramic element, stainless steel housing, wiring harness",
    use: "量測汽車引擎排氣中的含氧量，訊號送至引擎控制電腦 measures oxygen in the exhaust gas of a passenger car engine",
  },
  {
    sku: "BR-TH-3310",
    name: "引擎節溫器（含墊片） Thermostat, engine cooling, 82°C, with gasket",
    material: "黃銅與不鏽鋼閥體、感溫蠟元件 brass and stainless steel valve, wax element",
    use: "依水溫自動開閉汽車引擎冷卻水路 opens and closes the coolant circuit of a passenger car engine by temperature",
  },
  {
    sku: "BR-CV-5521",
    name: "傳動軸外側等速萬向接頭（含防塵套） Constant velocity joint, outer, with boot kit",
    material: "鍛造鋼製、橡膠防塵套 forged steel, rubber boot",
    use: "前輪驅動小客車傳動軸上的接頭，將動力傳到輪轂 joint on the drive shaft of a front-wheel-drive passenger car",
  },
];

const post = async (p, body) => {
  const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${p} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const out = { recordedAt: new Date().toISOString(), classify: {}, guess: {} };
for (const lang of ["en", "zh"]) {
  const c = await post("/api/classify", { lang, items: lines.map(({ name, material, use }) => ({ name, material, use })) });
  if (!c.llm) throw new Error("No model key on the server. Refusing to record nearest-ruling fallbacks as model answers.");
  const byLine = {};
  lines.forEach((l, i) => (byLine[l.sku] = c.suggestions[i]));
  out.classify[lang] = { byLine, llm: true };
  out.guess[lang] = await post("/api/inquiry", {
    lang,
    message: "老闆 Altis 14年的 李仔串前面兩支 水龜一顆 還有鳳梨頭一顆 有貨嗎 明天要",
    term: "鳳梨頭",
    known: ["水龜", "李仔串"],
  });
  if (!out.guess[lang].usedModel) throw new Error("The slang guess did not come from the model.");
  console.log(lang, "recorded:", lines.map((l) => `${l.sku} ${byLine[l.sku].formatted}`).join(", "), "| guess:", out.guess[lang].meaning);
}
fs.writeFileSync(path.join(root, "lib", "sample", "recorded.json"), JSON.stringify(out, null, 1));
console.log("wrote lib/sample/recorded.json");
