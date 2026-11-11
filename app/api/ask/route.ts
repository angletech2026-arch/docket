import { chat, hasKey } from "@/lib/llm";

/**
 * The assistant on a card. It answers the person holding the card from two things only:
 * what is on the card, and the lessons the owner and senior staff have left in the company brain.
 * If the answer is in neither, it says so and names who to ask. It does not make up house rules.
 */
type Body = {
  lang?: string;
  person?: string;
  question?: string;
  card?: { stage?: string; title?: string; prepared?: string[]; ask?: string; stakeNote?: string };
  lessons?: { text?: string; by?: string }[];
  seniors?: string[];
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const zh = body.lang === "zh";
  const question = (body.question ?? "").trim().slice(0, 300);
  if (!question) return Response.json({ error: "question is required" }, { status: 400 });
  const lessons = (body.lessons ?? [])
    .filter((l) => l?.text)
    .slice(0, 20)
    .map((l) => `- ${String(l.text).slice(0, 300)} (from ${String(l.by ?? "a senior").slice(0, 60)})`);
  const card = body.card ?? {};
  const cardText = [
    `Stage: ${String(card.stage ?? "").slice(0, 80)}`,
    `What has to be decided: ${String(card.title ?? "").slice(0, 300)}`,
    `Already prepared: ${(card.prepared ?? []).map((p) => String(p).slice(0, 240)).join(" | ")}`,
    `The ask: ${String(card.ask ?? "").slice(0, 200)}`,
    `Money: ${String(card.stakeNote ?? "").slice(0, 240)}`,
  ].join("\n");

  if (!hasKey()) {
    return Response.json({
      answer: zh
        ? "這台伺服器沒有模型的 key。上面列的是老手留下來的原話。"
        : "No model key on this server. What the seniors said is listed above, in their own words.",
      usedModel: false,
    });
  }
  try {
    const answer = await chat(
      [
        {
          role: "system",
          content:
            "You are the personal assistant of one employee at a small trading company in Taiwan. They are holding a work card and are probably new. " +
            "Teach them how to handle this card, using ONLY the CARD and the LESSONS. LESSONS are what the owner and senior staff have said; when you use one, say whose it is. " +
            "If the answer is not in the card or the lessons, say plainly that nobody has written this down yet and name who to ask from SENIORS. Never invent a company rule, a price, a law or a number. " +
            "Answer in at most three short sentences, plain words, no lists. " +
            (zh ? "Answer in Traditional Chinese as used in Taiwan." : "Answer in English."),
        },
        {
          role: "user",
          content: `EMPLOYEE: ${String(body.person ?? "").slice(0, 60)}\n\nCARD\n${cardText}\n\nLESSONS\n${lessons.join("\n") || "(none for this kind of card)"}\n\nSENIORS: ${(body.seniors ?? []).slice(0, 6).join(", ")}\n\nQUESTION: ${question}`,
        },
      ],
      { maxTokens: 400 },
    );
    return Response.json({ answer: answer.trim().slice(0, 900), usedModel: true });
  } catch (e) {
    return Response.json({ answer: `The model call failed: ${(e as Error).message.slice(0, 160)}`, usedModel: false });
  }
}
