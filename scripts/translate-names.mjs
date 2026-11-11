// Short English glosses for the test items shown on the "Customs code test" page.
// The rulings are in Chinese, so a reader who does not read Chinese cannot tell what the goods are.
// This only affects what is displayed. It plays no part in the benchmark itself.
//
//   node scripts/translate-names.mjs            (first 60 items, the ones the page shows)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { anthropicChat } = await import("../lib/anthropic.mjs");

const N = Number(process.argv[2] ?? 60);
const results = JSON.parse(fs.readFileSync(path.join(root, "data", "benchmark", "results.json"), "utf8"));
const items = results.items.slice(0, N);
const outPath = path.join(root, "data", "benchmark", "names-en.json");
const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};

const todo = items.filter((it) => !out[it.id]);
for (let i = 0; i < todo.length; i += 20) {
  const batch = todo.slice(i, i + 20);
  const text = await anthropicChat(
    [
      {
        role: "system",
        content:
          "You translate goods descriptions from Taiwan customs rulings into plain English for a reader who does not read Chinese. " +
          "For each line give what the goods are in at most 10 words. Drop model numbers, sizes and voltages. Do not add anything that is not in the original. " +
          'Reply with JSON only: {"<id>": "<english>", ...}.',
      },
      { role: "user", content: batch.map((it) => `${it.id}: ${it.name}`).join("\n") },
    ],
    { model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", maxTokens: 4000 },
  );
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  const j = JSON.parse(text.slice(a, b + 1));
  for (const it of batch) if (typeof j[it.id] === "string") out[it.id] = j[it.id].trim();
  console.log(`translated ${Math.min(i + 20, todo.length)}/${todo.length}`);
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`wrote ${Object.keys(out).length} glosses to data/benchmark/names-en.json`);
