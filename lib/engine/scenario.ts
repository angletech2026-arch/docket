import type { Card, CompanyId, Person, State } from "./types";

/**
 * Sample companies. Every name, quantity and price here is made up for the demo.
 * Customs codes, duty rates and import-rule codes are real and come from data/tariff.json.
 */

const TODAY = "Wed Nov 11";

type Seed = Omit<Card, "history" | "status" | "assignee"> & {
  status?: Card["status"];
  assignee: string | null;
  opened?: string;
};

function card(seed: Seed): Card {
  const { opened, ...rest } = seed;
  return {
    status: "ready",
    ...rest,
    history: [{ at: TODAY, text: opened ?? "Opened by the system" }],
  };
}

function autoParts(): State {
  const people: Person[] = [
    { id: "own", name: "Lin", role: "Owner", level: 3, skills: ["inquiry", "purchasing", "finance", "customs", "logistics", "warehouse", "gov"], active: true },
    { id: "sen", name: "Chen", role: "Senior sales, 18 years", level: 2, skills: ["inquiry", "purchasing", "customs"], active: true },
    { id: "pur", name: "Wang", role: "Purchasing, 9 years", level: 2, skills: ["purchasing", "customs", "finance"], active: true },
    { id: "jr1", name: "Xiao Chen", role: "Sales, 1 year", level: 1, skills: ["inquiry", "customs", "logistics", "gov"], active: true },
    { id: "jr2", name: "Xiao Zhang", role: "New hire, week 1", level: 1, skills: ["inquiry", "customs", "logistics", "gov"], active: true },
    { id: "wh1", name: "A-Guo", role: "Warehouse lead, 12 years", level: 2, skills: ["warehouse", "logistics"], active: true },
    { id: "wh2", name: "Xiao Wu", role: "Warehouse, 2 years", level: 1, skills: ["warehouse"], active: true },
    { id: "acc", name: "Ms. Huang", role: "Accounting, 15 years", level: 2, skills: ["finance", "gov"], active: true },
    { id: "brk", name: "Shun-Da Customs", role: "Licensed customs broker", level: 2, skills: ["broker"], external: true, active: true },
    { id: "trk", name: "A-Ming Trucking", role: "Trucker", level: 1, skills: ["trucking"], external: true, active: true },
    { id: "fkl", name: "Yong-Shun Forklift", role: "Forklift vendor", level: 1, skills: ["forklift"], external: true, active: true },
  ];

  const A = "HB-2611";
  const B = "NW-2607";
  const cards: Card[] = [
    card({
      id: "a0", shipmentId: A, kind: "inquiry", stage: "Inquiry",
      title: "Jian-Hong Garage on LINE: 李仔串 ×2, 水龜 ×1, 鳳梨頭 ×1 for a 2014 Altis",
      prepared: [
        "Read the message and split it into three parts",
        "Two of the three words are in the company glossary",
        "One word is not. The model has a guess but is not sure",
      ],
      ask: "Reply to the garage with stock and price.",
      skill: "inquiry", minLevel: 1, assignee: "jr2",
      stake: 0, stakeNote: "Small order. The cost of a wrong part is a return trip and a garage that stops asking.",
      due: "Today", opened: "Opened from a LINE message at 09:12",
    }),
    card({
      id: "a1", shipmentId: A, kind: "order", stage: "Reorder",
      title: "Stabilizer links: 9 left, 140 sell a month. Add 600 to this shipment",
      prepared: [
        "Stock across three warehouses: 9",
        "Average sales: 140 a month. Sea freight from Germany takes about 45 days",
        "Purchase order for 600 added to the Brenner invoice, already confirmed by email",
      ],
      ask: "Confirm the quantity.",
      skill: "purchasing", minLevel: 2, assignee: "pur",
      stake: 18500, stakeNote: "About six weeks without stock: 210 units × NT$88 margin each",
      due: "Thu Nov 12", opened: "Opened when stock fell under two weeks of sales",
    }),
    card({
      id: "a2", shipmentId: A, kind: "shipmode", stage: "Air or sea",
      title: "40 brake pad sets promised for Nov 14: fly them for NT$38,000 more, or lose a NT$61,000 order",
      prepared: [
        "Dashun Auto Supply needs 40 sets by Sat Nov 14. The vessel lands Nov 16",
        "Air from Frankfurt: 6 days door to door, NT$38,000 over the sea rate for 40 sets",
        "The rest of the 2,400 sets stay on the vessel",
      ],
      ask: "Split the shipment and fly 40 sets?",
      skill: "purchasing", minLevel: 2, assignee: "pur",
      stake: 38000, stakeNote: "Extra air freight NT$38,000, against an order worth NT$61,000",
      due: "Today", opened: "Opened from a customer order with a delivery date before the ETA",
    }),
    card({
      id: "a3", shipmentId: A, kind: "fx", stage: "Payment & FX",
      title: "USD 86,400 due to Brenner. Pay now at 32.10, or on arrival. A 3% move is NT$83,200",
      prepared: [
        "Brenner terms: net 60 after arrival, so the date is ours to choose",
        "USD/TWD today 32.10. Last 30 days: 31.55 to 32.65",
        "Invoice in TWD today: NT$2,773,440. Each 1% move is NT$27,700",
      ],
      ask: "Owner decision: buy the dollars now, or wait.",
      skill: "finance", minLevel: 3, status: "owner", assignee: "own",
      stake: 83200, stakeNote: "3% of NT$2,773,440. Margin on this shipment is NT$568,000",
      due: "Fri Nov 13", opened: "Opened when the supplier invoice arrived",
    }),
    card({
      id: "a4", shipmentId: A, kind: "ccc", stage: "Customs codes",
      title: "Brenner invoice: 7 lines. 4 carry over their code, 3 new parts need one",
      prepared: [
        "Read the invoice attached to the supplier's email",
        "Matched 4 lines to parts already on file, including one revised part number",
        "3 lines are new. Suggested an 11-digit code for each from past customs rulings",
      ],
      ask: "Check each code, then send the packet to the broker.",
      skill: "customs", minLevel: 1, assignee: "jr1",
      stake: 61900, stakeNote: "Duty on the three new lines moves by up to 15 points: 15% of NT$412,806",
      due: "Mon Nov 16", opened: "Opened from the invoice in Brenner's email",
    }),
    card({
      id: "a5", shipmentId: A, kind: "broker", stage: "Broker",
      title: "Packet for Shun-Da Customs: invoice, packing list, 7 codes with reasons",
      prepared: [
        "The broker's licensed staff sign the declaration. We prepare and check",
        "Deadline: 15 days from the day after the vessel arrives, then NT$200 a day",
      ],
      ask: "Waiting for the codes to be confirmed in-house.",
      skill: "broker", minLevel: 1, status: "waiting", assignee: "brk",
      stake: 0, stakeNote: "",
      due: "Mon Nov 16", opened: "Opened with the customs card",
    }),
    card({
      id: "a6", shipmentId: A, kind: "trucking", stage: "Trucking",
      title: "Keelung to WH-B, Tue Nov 17, 09:00. A-Ming Trucking, one 20-foot container",
      prepared: [
        "The broker's usual trucker has the slot",
        "WH-B chosen because 80% of this container is fast-moving stock",
      ],
      ask: "Confirm the pickup time.",
      skill: "logistics", minLevel: 1, assignee: "jr1",
      stake: 0, stakeNote: "",
      due: "Fri Nov 13", opened: "Opened when the vessel ETA was confirmed",
    }),
    card({
      id: "a7", shipmentId: A, kind: "forklift", stage: "Forklift",
      title: "Forklift at WH-B, Tue Nov 17, 10:30–13:30. Yong-Shun: 3-hour minimum, NT$1,500 to cancel late",
      prepared: [
        "WH-B has no forklift of its own, so one is booked per container",
        "Timed 90 minutes after the port pickup",
      ],
      ask: "Confirm the booking.",
      skill: "logistics", minLevel: 1, assignee: "jr1",
      stake: 8400, stakeNote: "If the truck is late: NT$1,500 cancel fee + 3h minimum NT$2,400 + three people idle NT$4,500",
      due: "Fri Nov 13", opened: "Opened with the trucking card",
    }),
    card({
      id: "a8", shipmentId: A, kind: "putaway", stage: "Putaway",
      title: "Brake pads and plugs to WH-B outer bay (ship within 10 days). CV joints to WH-C inner racks",
      prepared: [
        "Outer bay: lines with open orders or more than 300 sold a month",
        "Inner racks: slow lines. They keep for years, so they go where nobody needs to reach",
      ],
      ask: "Follow the plan at unloading.",
      skill: "warehouse", minLevel: 1, assignee: "wh2",
      stake: 0, stakeNote: "",
      due: "Tue Nov 17", opened: "Opened from the packing list",
    }),
    card({
      id: "a9", shipmentId: A, kind: "gov", stage: "Tender",
      title: "County fleet tender, batch 2 of 4 due Fri Nov 20. 60 brake pad sets, cover letter drafted",
      prepared: [
        "Tender deliveries are allowed in batches, so they ride on sea freight",
        "Arrives Tue Nov 17, three working days for inspection and labelling, delivered Fri Nov 20",
        "Cover letter and delivery note drafted in the county's format",
      ],
      ask: "Check the letter and send it with the batch.",
      skill: "gov", minLevel: 1, assignee: "jr1",
      stake: 0, stakeNote: "On time as planned",
      due: "Fri Nov 20", opened: "Opened from the tender delivery schedule",
    }),

    // second shipment, further along
    card({
      id: "b0", shipmentId: B, kind: "fx", stage: "Payment & FX",
      title: "USD 41,200 to Nordwerk paid Nov 3 at 31.82",
      prepared: ["Net 30 terms. Paid early while the rate was near the 30-day low"],
      ask: "", skill: "finance", minLevel: 3, status: "done", assignee: "own",
      stake: 0, stakeNote: "", due: "Nov 3",
    }),
    card({
      id: "b1", shipmentId: B, kind: "ccc", stage: "Customs codes",
      title: "Nordwerk invoice: 5 lines, all carried over from parts on file",
      prepared: ["No new parts on this invoice"],
      ask: "", skill: "customs", minLevel: 1, status: "done", assignee: "sen",
      stake: 0, stakeNote: "", due: "Nov 9",
    }),
    card({
      id: "b2", shipmentId: B, kind: "broker", stage: "Broker",
      title: "Declared Nov 10. Cleared first time, no container inspection",
      prepared: ["Random container inspection was not drawn this time"],
      ask: "", skill: "broker", minLevel: 1, status: "done", assignee: "brk",
      stake: 0, stakeNote: "", due: "Nov 10",
    }),
    card({
      id: "b3", shipmentId: B, kind: "putaway", stage: "Putaway",
      title: "Radiators and shock absorbers to WH-A, Thu Nov 19 morning. WH-A has its own forklift",
      prepared: ["18 radiators sell a month, so they go to the inner racks", "Shock absorbers have 3 open orders, outer bay"],
      ask: "Sign off receiving at the dock.",
      skill: "warehouse", minLevel: 2, assignee: "wh1",
      stake: 0, stakeNote: "", due: "Thu Nov 19",
    }),
  ];

  return {
    company: "auto",
    companyName: "Harbor Auto Parts",
    companyNote: "Sample company. Sole distributor of foreign auto parts brands, selling inside Taiwan. 8 people, 3 warehouses.",
    today: TODAY,
    people,
    shipments: [
      { id: A, title: "Brenner, Germany", sub: "7 invoice lines · USD 86,400 · sea, 20-ft container", eta: "Mon Nov 16", margin: 568000, marginPct: 17 },
      { id: B, title: "Nordwerk, Sweden", sub: "5 invoice lines · USD 41,200 · sea", eta: "Thu Nov 19 at WH-A", margin: 262000, marginPct: 20 },
    ],
    cards,
    glossary: [
      { term: "水龜", meaning: "thermostat (engine cooling). Not the water pump", sku: "BR-TH-3310", by: "repair-trade usage, checked against public sources" },
      { term: "李仔串", meaning: "stabilizer link. Looks like candied fruit on a stick", sku: "BR-SL-0812", by: "repair-trade usage, checked against public sources" },
    ],
    capabilities: [
      { label: "Answer a garage inquiry", skill: "inquiry", minLevel: 1 },
      { label: "Substitutes and price exceptions", skill: "inquiry", minLevel: 2 },
      { label: "Purchase orders to suppliers", skill: "purchasing", minLevel: 2 },
      { label: "Check customs codes", skill: "customs", minLevel: 1 },
      { label: "Book trucks and forklifts", skill: "logistics", minLevel: 1 },
      { label: "Sign off receiving at the dock", skill: "warehouse", minLevel: 2 },
      { label: "Tender paperwork", skill: "gov", minLevel: 1 },
    ],
    log: [{ id: 0, text: "Board opened. 10 cards on HB-2611, 4 on NW-2607.", tone: "plain" }],
    seq: 100,
    typhoon: false,
  };
}

function grain(): State {
  const people: Person[] = [
    { id: "own", name: "Owner", role: "Second generation, took over this year", level: 3, skills: ["purchasing", "finance", "customs", "logistics", "warehouse", "gov", "inquiry"], active: true },
    { id: "buy", name: "Uncle Hsu", role: "Buyer, 26 years", level: 2, skills: ["purchasing", "customs", "inquiry"], active: true },
    { id: "ops", name: "Pei-Shan", role: "Operations, 3 years", level: 1, skills: ["customs", "logistics", "gov", "inquiry"], active: true },
    { id: "new", name: "Yu-Ting", role: "New hire, month 1", level: 1, skills: ["customs", "logistics", "gov", "inquiry"], active: true },
    { id: "wh1", name: "A-Tsai", role: "Warehouse lead, 20 years", level: 2, skills: ["warehouse", "logistics"], active: true },
    { id: "wh2", name: "Kevin", role: "Warehouse, 1 year", level: 1, skills: ["warehouse"], active: true },
    { id: "acc", name: "Ms. Lai", role: "Accounting", level: 2, skills: ["finance", "gov"], active: true },
    { id: "brk", name: "Customs broker", role: "Licensed customs broker", level: 2, skills: ["broker"], external: true, active: true },
  ];
  const G = "MB-1118";
  const cards: Card[] = [
    card({
      id: "g1", shipmentId: G, kind: "fx", stage: "Payment & FX",
      title: "USD 31,200 for 24 t of mung beans, paid in full before loading. A 3% move is NT$30,000",
      prepared: [
        "This supplier wants 100% before shipment, so there is no waiting for a better rate",
        "Margin on this lot is NT$80,000. A 3% move in the dollar is more than a third of it",
      ],
      ask: "Owner decision: buy the dollars today?",
      skill: "finance", minLevel: 3, status: "owner", assignee: "own",
      stake: 30000, stakeNote: "3% of NT$1,001,520. Margin on this lot: NT$80,000",
      due: "Thu Nov 12", opened: "Opened when the proforma invoice arrived",
    }),
    card({
      id: "g2", shipmentId: G, kind: "ccc", stage: "Customs codes",
      title: "Dried mung beans, for food: 0713.31.10.90-0, duty 20%, import rules B01 and F01",
      prepared: [
        "The old code 0713.31.10.00-9 was retired on Aug 15, 2023. The part list still had it",
        "Food use and planting seed are now separate codes with different rules",
        "B01 and F01 on this code open the two cards to the right",
      ],
      ask: "Confirm the code and the use (food, not seed, not feed).",
      skill: "customs", minLevel: 1, assignee: "ops",
      stake: 200300, stakeNote: "Duty at 20% of NT$1,001,520. A wrong code or use changes the rate and the checks",
      due: "Mon Nov 16", opened: "Opened from the proforma invoice",
    }),
    card({
      id: "g3", shipmentId: G, kind: "quarantine", stage: "Plant quarantine",
      title: "B01: original phytosanitary certificate from Australia. Do not open or move the bags before release",
      prepared: [
        "Apply to the quarantine branch at the port on arrival",
        "The original certificate must travel with the documents. A scan is not accepted",
        "Supplier emailed a scan on Nov 6. The original is with the courier",
      ],
      ask: "Confirm the original has arrived before the vessel does.",
      skill: "customs", minLevel: 1, assignee: "new",
      stake: 1001500, stakeNote: "No certificate, no release: the lot is returned or destroyed at our cost",
      due: "Tue Nov 17", opened: "Opened because the customs code carries rule B01",
    }),
    card({
      id: "g4", shipmentId: G, kind: "foodcheck", stage: "Food inspection",
      title: "F01: border food inspection. Pesticide residue is the usual reason a lot fails",
      prepared: [
        "Application can go in up to 15 days before arrival",
        "Supplier's residue test report requested and attached",
        "If it fails, the whole lot is returned or destroyed",
      ],
      ask: "File the inspection application.",
      skill: "customs", minLevel: 1, assignee: "ops",
      stake: 1001500, stakeNote: "The whole lot, NT$1,001,520, plus return freight",
      due: "Thu Nov 12", opened: "Opened because the customs code carries rule F01",
    }),
    card({
      id: "g5", shipmentId: G, kind: "putaway", stage: "Storage",
      title: "Keep the Australian lot apart from the Myanmar lot. Bay 3, on pallets, off the wall",
      prepared: [
        "Same product, different origin, different price. Customers order by origin",
        "Bay 3 is dry and next to the repacking line",
      ],
      ask: "Follow the plan at unloading.",
      skill: "warehouse", minLevel: 1, assignee: "wh2",
      stake: 0, stakeNote: "", due: "Fri Nov 20", opened: "Opened from the packing list",
    }),
    card({
      id: "g6", shipmentId: G, kind: "expiry", stage: "First out",
      title: "Myanmar lot MB-0903, 6.2 t, best before Mar 2027. Ship it before any of the new lot",
      prepared: [
        "Three open orders do not name an origin. They are filled from MB-0903 first",
        "At the current pace MB-0903 is gone by late January",
      ],
      ask: "Approve the pick order.",
      skill: "warehouse", minLevel: 2, assignee: "wh1",
      stake: 297600, stakeNote: "6.2 t × NT$48 a kg if it runs past its date",
      due: "Today", opened: "Opened when a new lot of the same product was booked",
    }),
    card({
      id: "g7", shipmentId: G, kind: "shrinkage", stage: "Shrinkage",
      title: "Book 2.4 kg of unusable beans on 24 t, so the count matches what is on the floor",
      prepared: [
        "House rate: about 1 kg in every 10 t is unusable",
        "Entered as a loss at receiving, not found later at stocktake",
      ],
      ask: "Confirm after unloading, with the real weight.",
      skill: "warehouse", minLevel: 1, assignee: "wh2",
      stake: 0, stakeNote: "", due: "Fri Nov 20", opened: "Opened with the storage card",
    }),
    card({
      id: "g8", shipmentId: G, kind: "repack", stage: "Repack",
      title: "Retail order: repack 2 t into 1 kg bags, 2,000 bags, Australian origin on the label",
      prepared: [
        "Customer wants 1 kg bags. We receive 25 kg sacks",
        "Line booked for Mon Nov 23, after release and one day of rest",
        "Label text drafted with origin and best-before date",
      ],
      ask: "Confirm the line booking.",
      skill: "logistics", minLevel: 1, assignee: "new",
      stake: 0, stakeNote: "", due: "Mon Nov 23", opened: "Opened from a customer order",
    }),
  ];
  return {
    company: "grain",
    companyName: "Grain importer",
    companyNote: "Sample company. Imports beans and grains in bulk, repacks and sells inside Taiwan.",
    today: TODAY,
    people,
    shipments: [
      { id: G, title: "Mung beans, Australia", sub: "24 t · USD 31,200 · sea, Taichung port", eta: "Wed Nov 18", margin: 80000, marginPct: 8 },
    ],
    cards,
    glossary: [],
    capabilities: [
      { label: "Buy from overseas suppliers", skill: "purchasing", minLevel: 2 },
      { label: "Customs, quarantine and food inspection papers", skill: "customs", minLevel: 1 },
      { label: "Decide which lot ships first", skill: "warehouse", minLevel: 2 },
      { label: "Book trucks and the repacking line", skill: "logistics", minLevel: 1 },
    ],
    log: [{ id: 0, text: "Board opened. 8 cards on MB-1118.", tone: "plain" }],
    seq: 100,
    typhoon: false,
  };
}

export function buildScenario(company: CompanyId): State {
  return company === "grain" ? grain() : autoParts();
}
