/**
 * Sample supplier invoice and customer inquiry for the auto parts company.
 * Part numbers, quantities and prices are made up.
 * The four codes "on file" are real and were checked against data/tariff.json.
 */

export const USD_TWD = 32.1;

export type InvoiceLine = {
  sku: string;
  nameEn: string;
  nameZh: string;
  material: string;
  use: string;
  qty: number;
  unitUsd: number;
  /** code already on the company's part list */
  onFile?: { code: string; formatted: string; zh: string; duty: string };
  /** this part number replaces an older one for the same goods */
  supersedes?: string;
};

export const invoice: { supplier: string; supplierZh: string; number: string; date: string; lines: InvoiceLine[] } = {
  supplier: "Brenner GmbH (sample supplier)",
  supplierZh: "Brenner GmbH（範例供應商）",
  number: "BR-INV-118204",
  date: "2026-11-04",
  lines: [
    {
      sku: "BR-0451-203A",
      nameEn: "Brake pad set, front, disc brake (rev. A, low-dust compound)",
      nameZh: "前煞車來令片組（A 版）",
      material: "friction material bonded to steel backing plate",
      use: "disc brake pads for passenger cars",
      qty: 2400,
      unitUsd: 19.1,
      supersedes: "BR-0451-203",
      onFile: { code: "87083091003", formatted: "8708.30.91.00-3", zh: "已裝配之煞車襯裏（來令）", duty: "15%" },
    },
    {
      sku: "BR-SL-0812",
      nameEn: "Stabilizer link, front",
      nameZh: "前穩定桿連桿",
      material: "steel rod with two ball joints",
      use: "connects the anti-roll bar to the suspension strut of a passenger car",
      qty: 600,
      unitUsd: 8.9,
      onFile: { code: "87088090003", formatted: "8708.80.90.00-3", zh: "懸吊系統之零件與附件", duty: "15%" },
    },
    {
      sku: "BR-3397-WB6",
      nameEn: "Wiper blade, flat, 600 mm",
      nameZh: "軟骨雨刷片 600mm",
      material: "rubber blade on spring steel",
      use: "replacement blade for windscreen wipers",
      qty: 2000,
      unitUsd: 5.6,
      onFile: { code: "85129040008", formatted: "8512.90.40.00-8", zh: "擋風板刮刷器、去霜器及去霧器之零件", duty: "5%" },
    },
    {
      sku: "BR-0242-SP4",
      nameEn: "Spark plug, iridium",
      nameZh: "銥合金火星塞",
      material: "ceramic insulator, nickel shell, iridium electrode",
      use: "ignition of petrol engines",
      qty: 2325,
      unitUsd: 4.8,
      onFile: { code: "85111000004", formatted: "8511.10.00.00-4", zh: "火星塞", duty: "7.5%" },
    },
    {
      sku: "BR-OS-9001",
      nameEn: "Oxygen sensor, upstream, 4-wire, zirconia",
      nameZh: "含氧感知器",
      material: "氧化鋯陶瓷感測元件、不鏽鋼外殼、含線束 zirconia ceramic element, stainless steel housing, wiring harness",
      use: "量測汽車引擎排氣中的含氧量，訊號送至引擎控制電腦 measures oxygen in the exhaust gas of a passenger car engine",
      qty: 200,
      unitUsd: 31,
    },
    {
      sku: "BR-TH-3310",
      nameEn: "Thermostat, engine cooling, 82°C, with gasket",
      nameZh: "引擎節溫器（含墊片）",
      material: "黃銅與不鏽鋼閥體、感溫蠟元件 brass and stainless steel valve, wax element",
      use: "依水溫自動開閉汽車引擎冷卻水路 opens and closes the coolant circuit of a passenger car engine by temperature",
      qty: 300,
      unitUsd: 9.5,
    },
    {
      sku: "BR-CV-5521",
      nameEn: "Constant velocity joint, outer, with boot kit",
      nameZh: "傳動軸外側等速萬向接頭（含防塵套）",
      material: "鍛造鋼製、橡膠防塵套 forged steel, rubber boot",
      use: "前輪驅動小客車傳動軸上的接頭，將動力傳到輪轂 joint on the drive shaft of a front-wheel-drive passenger car",
      qty: 100,
      unitUsd: 38.1,
    },
  ],
};

export const invoiceTotalUsd = invoice.lines.reduce((a, l) => a + l.qty * l.unitUsd, 0);

export type StockRow = {
  sku: string;
  nameEn: string;
  nameZh: string;
  stock: number;
  listTwd: number;
  arriving: string;
  arrivingZh: string;
};

export const stock: Record<string, StockRow> = {
  "BR-SL-0812": { sku: "BR-SL-0812", nameEn: "Stabilizer link, front", nameZh: "前平衡桿連桿", stock: 9, listTwd: 520, arriving: "600 more on HB-2611", arrivingZh: "HB-2611 這批還有 600 支會到" },
  "BR-TH-3310": { sku: "BR-TH-3310", nameEn: "Thermostat, engine cooling", nameZh: "引擎節溫器", stock: 0, listTwd: 640, arriving: "300 on HB-2611, first shipment of this part", arrivingZh: "HB-2611 這批會到 300 顆，是第一次進這個料" },
  "BR-CV-5521": { sku: "BR-CV-5521", nameEn: "CV joint, outer", nameZh: "外側等速接頭", stock: 0, listTwd: 2450, arriving: "100 on HB-2611, first shipment of this part", arrivingZh: "HB-2611 這批會到 100 顆，是第一次進這個料" },
};

export const inquiry = {
  customer: "Jian-Hong Garage",
  customerZh: "建宏汽車",
  tier: "A",
  discountPct: 12,
  channel: "LINE",
  time: "09:12",
  message: "老闆 Altis 14年的 李仔串前面兩支 水龜一顆 還有鳳梨頭一顆 有貨嗎 明天要",
  /** terms as they appear in the message, with quantity */
  terms: [
    { term: "李仔串", qty: 2 },
    { term: "水龜", qty: 1 },
    { term: "鳳梨頭", qty: 1 },
  ],
};
