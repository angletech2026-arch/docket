import { classify, type Item, type Suggestion } from "@/lib/ccc";
import { hasKey } from "@/lib/llm";

const MAX_ITEMS = 40;
const CONCURRENCY = 4;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const lang = (body as { lang?: string })?.lang === "zh" ? "zh" : "en";
  const raw = (body as { items?: unknown })?.items;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ error: "Expected {items: [{name, material?, use?}]}" }, { status: 400 });
  }
  if (raw.length > MAX_ITEMS) {
    return Response.json({ error: `At most ${MAX_ITEMS} items per request` }, { status: 400 });
  }
  const items: Item[] = [];
  for (const it of raw) {
    const name = typeof (it as Item)?.name === "string" ? (it as Item).name.trim().slice(0, 500) : "";
    if (!name) return Response.json({ error: "Every item needs a non-empty name" }, { status: 400 });
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined);
    items.push({ name, material: str((it as Item).material), use: str((it as Item).use) });
  }

  const suggestions: (Suggestion | { error: string })[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        suggestions[i] = await classify(items[i], { lang });
      } catch (e) {
        suggestions[i] = { error: (e as Error).message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

  return Response.json({ suggestions, llm: hasKey() });
}
