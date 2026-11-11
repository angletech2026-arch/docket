import { readFile } from "node:fs/promises";
import path from "node:path";

/** Whatever the last benchmark run wrote. Nothing here is typed in by hand. */
export async function GET() {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "benchmark", "results.json"), "utf8");
    return new Response(raw, { headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ missing: true });
  }
}
