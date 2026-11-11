import { readFile } from "node:fs/promises";
import path from "node:path";

/** Whatever the last benchmark run wrote. Nothing here is typed in by hand. */
export async function GET() {
  try {
    const dir = path.join(process.cwd(), "data");
    const results = JSON.parse(await readFile(path.join(dir, "benchmark", "results.json"), "utf8"));
    // English for display only: a short gloss of each declared item, and the tariff's own English name for the ruled code
    const glosses: Record<string, string> = await readFile(path.join(dir, "benchmark", "names-en.json"), "utf8")
      .then((t) => JSON.parse(t))
      .catch(() => ({}));
    const tariff: { c: string; en: string }[] = JSON.parse(await readFile(path.join(dir, "tariff.json"), "utf8"));
    const en = new Map(tariff.map((t) => [t.c, t.en]));
    for (const it of results.items as { id: string; truth: string; nameEn?: string; truthEn?: string }[]) {
      it.nameEn = glosses[it.id];
      it.truthEn = en.get(it.truth);
    }
    // how often the right code is among the three the card shows (scripts/benchmark-top3.mjs), if that run exists
    results.top3 = await readFile(path.join(dir, "benchmark", "top3.json"), "utf8")
      .then((t) => {
        const j = JSON.parse(t);
        return { n: j.n, top1: j.top1, top3: j.top3, model: j.model };
      })
      .catch(() => null);
    return Response.json(results);
  } catch {
    return Response.json({ missing: true });
  }
}
