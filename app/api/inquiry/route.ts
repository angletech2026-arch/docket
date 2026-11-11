import { chat, hasKey } from "@/lib/llm";

/**
 * A garage used a word that is not in the company glossary.
 * Ask the model what it thinks the word means, and how sure it is.
 * The guess is shown to the person holding the card. It is never used to quote a part.
 */
export async function POST(request: Request) {
  let body: { message?: string; term?: string; known?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const term = (body.term ?? "").trim().slice(0, 40);
  const message = (body.message ?? "").trim().slice(0, 500);
  if (!term) return Response.json({ error: "term is required" }, { status: 400 });

  if (!hasKey()) {
    return Response.json({ meaning: "No model key on this server, so there is no guess.", confidence: "", usedModel: false });
  }
  try {
    const out = await chat(
      [
        {
          role: "system",
          content:
            "You help a Taiwanese auto parts distributor read messages from repair garages. Mechanics in Taiwan use Taiwanese (Hokkien) trade slang for parts, often Japanese loanwords written with whatever Chinese characters sound right. " +
            "You will get one slang term that is NOT in the company's glossary. Say which car part you think it is, in English, in at most 12 words. " +
            'Then say how sure you are: "high", "medium" or "low". Most of this slang is not written down anywhere, so unless you are certain, answer "low". ' +
            'Reply with JSON only: {"meaning": string, "confidence": "high"|"medium"|"low"}.',
        },
        { role: "user", content: `Message from the garage: ${message}\nTerm to explain: ${term}` },
      ],
      { json: true, temperature: 0, maxTokens: 120 },
    );
    const j = JSON.parse(out) as { meaning?: string; confidence?: string };
    const confidence = ["high", "medium", "low"].includes(j.confidence ?? "") ? j.confidence! : "low";
    return Response.json({ meaning: String(j.meaning ?? "").slice(0, 160) || "no answer", confidence, usedModel: true });
  } catch (e) {
    return Response.json({ meaning: `The model call failed: ${(e as Error).message.slice(0, 120)}`, confidence: "", usedModel: false });
  }
}
