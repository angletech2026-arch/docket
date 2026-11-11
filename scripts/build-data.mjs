// Turns the two Taiwan customs open-data CSVs into compact JSON used by the app.
// Usage: node scripts/build-data.mjs   (GOV_DATA_DIR overrides the input folder)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = process.env.GOV_DATA_DIR || "D:/dev/c0mpiled-prep/gov-data";
const outDir = path.join(root, "data");

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (s, cap = 400) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > cap ? t.slice(0, cap) : t;
};

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // --- tariff -------------------------------------------------------------
  const tariffRows = parseCSV(fs.readFileSync(path.join(srcDir, "customs-tariff-rates.csv"), "utf8")).slice(1);
  const tariff = [];
  for (const r of tariffRows) {
    if (r.length < 10 || !/^\d{11}$/.test(r[0])) continue;
    tariff.push({
      c: r[0],
      zh: clean(r[1], 300),
      en: clean(r[2], 300),
      d: clean(r[3], 60),
      r: clean(r[9], 80).split(" ").filter(Boolean),
    });
  }
  const current = new Set(tariff.map((t) => t.c));
  fs.writeFileSync(path.join(outDir, "tariff.json"), JSON.stringify(tariff));

  // --- advance rulings ----------------------------------------------------
  const rulingRows = parseCSV(fs.readFileSync(path.join(srcDir, "customs-advance-rulings.csv"), "utf8")).slice(1);
  const rulings = [];
  const seen = new Map();
  let skipped = 0;
  for (const r of rulingRows) {
    if (r.length < 12 || !/^\d{11}$/.test(r[1])) {
      skipped++;
      continue;
    }
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(r[9] || "");
    if (!m) {
      skipped++;
      continue;
    }
    const base = clean(r[8], 40) || "NO-ID";
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    rulings.push({
      id: n === 1 ? base : `${base}#${n}`,
      n: clean(r[5]),
      m: clean(r[6]),
      u: clean(r[7]),
      c: r[1],
      why: clean(r[0]),
      dt: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
      cur: current.has(r[1]),
    });
  }
  fs.writeFileSync(path.join(outDir, "rulings.json"), JSON.stringify(rulings));

  const size = (f) => (fs.statSync(path.join(outDir, f)).size / 1024 / 1024).toFixed(2) + " MB";
  console.log(`tariff.json   ${tariff.length} codes   ${size("tariff.json")}`);
  console.log(
    `rulings.json  ${rulings.length} rulings (${rulings.filter((x) => x.cur).length} with a code still in the current tariff, ${skipped} rows skipped)   ${size("rulings.json")}`
  );
  const byYear = {};
  for (const x of rulings) byYear[x.dt.slice(0, 4)] = (byYear[x.dt.slice(0, 4)] || 0) + 1;
  console.log("rulings by year", JSON.stringify(byYear));
  for (const c of ["87083091003", "07133110900"]) {
    const t = tariff.find((x) => x.c === c);
    console.log("check", c, t ? `${t.zh} | ${t.d} | ${JSON.stringify(t.r)}` : "MISSING");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
