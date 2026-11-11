import { chat, hasKey, modelName } from "@/lib/llm";

/**
 * The owner describes how the business runs, in their own words.
 * The model turns that into a chain of cards. Rules may only be cited from FACTS,
 * which are the things we checked against the Customs Act and the tariff table.
 */
const FACTS = [
  "F1. Every line on an import declaration needs an 11-digit CCC code. The code sets the duty rate and which import rules apply.",
  "F2. Customs Act art. 16: the import declaration is due within 15 days, counted from the day after the vessel or aircraft arrives. Art. 73: NT$200 a day after that.",
  "F3. Customs Act art. 22: a declaration filed through a customs broker must be reviewed and signed by the broker's licensed staff. The importer prepares and checks.",
  "F4. Import rule B01 (plants and plant products): original phytosanitary certificate from the exporting country, apply for quarantine on arrival, goods may not be opened or moved before release.",
  "F5. Import rule F01 (food): border food inspection. The application can be filed up to 15 days before arrival. A lot that fails is returned or destroyed.",
  "F6. Dried mung beans for food: code 0713.31.10.90-0, duty 20%, import rules B01 and F01. The code was split from an older one on 2023-08-15.",
  "F7. Assembled brake linings for motor vehicles: code 8708.30.91.00-3, duty 15%, no special import rule.",
];

const SYSTEM = `You set up a work board for a small trading company in Taiwan. The owner describes the business in their own words. Turn it into the chain of cards one shipment goes through, in order, from the first trigger to the last.

Each card is one decision a person makes. For each card give:
- "name": 2-4 words, the trade's own words.
- "trigger": what makes this card appear (an email, an arrival notice, stock falling, a date).
- "ai_prepares": one sentence, concrete, what is already done on the card before a person opens it. Use details the owner gave.
- "person_decides": one sentence, the call a person makes.
- "who": one of "anyone", "experienced", "owner", "outside partner".
- "money": one short phrase for what money depends on this card, using the owner's own figures where given, else null.
- "rule": cite ONE fact from FACTS by its text (shortened) if it clearly applies to this card, else null. Never cite a rule that is not in FACTS.

Then "not_mentioned": 2-4 things a company like this normally has to handle that the owner did not talk about (for example collecting payment, returns, insurance, stock counts). Short phrases.

Keep to what the owner said. Do not invent steps the description does not support. 6 to 10 cards.
Reply with JSON only: {"company": string, "cards": [...], "not_mentioned": [...]}.

FACTS:
${FACTS.join("\n")}`;

export async function POST(request: Request) {
  let body: { text?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const text = (body.text ?? "").trim().slice(0, 4000);
  if (text.length < 40) return Response.json({ error: "Describe the business in a few sentences first." }, { status: 400 });
  if (!hasKey()) return Response.json({ error: "No model key on this server." }, { status: 503 });
  const language =
    body.lang === "zh"
      ? "Write every value in Traditional Chinese as used in Taiwan, in the plain words a trading company owner would use. Keep the \"who\" field as one of the four English values. Keep customs codes, percentages and rule codes such as B01 exactly as given."
      : "Write every value in English.";

  try {
    const out = await chat(
      [
        { role: "system", content: `${SYSTEM}

${language}` },
        { role: "user", content: text },
      ],
      { json: true, temperature: 0.2, maxTokens: 1800 },
    );
    const j = JSON.parse(out) as { company?: string; cards?: unknown[]; not_mentioned?: unknown[] };
    const str = (v: unknown, n = 240) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
    const cards = (Array.isArray(j.cards) ? j.cards : []).slice(0, 12).map((c) => {
      const o = c as Record<string, unknown>;
      return {
        name: str(o.name, 60) ?? "Card",
        trigger: str(o.trigger),
        ai_prepares: str(o.ai_prepares, 320),
        person_decides: str(o.person_decides, 240),
        who: str(o.who, 20) ?? "anyone",
        money: str(o.money, 160),
        rule: str(o.rule, 240),
      };
    });
    return Response.json({
      company: str(j.company, 80) ?? "",
      cards,
      not_mentioned: (Array.isArray(j.not_mentioned) ? j.not_mentioned : []).map((x) => str(x, 120)).filter(Boolean).slice(0, 5),
      model: modelName(),
    });
  } catch (e) {
    return Response.json({ error: `The model call failed: ${(e as Error).message.slice(0, 200)}` }, { status: 502 });
  }
}
