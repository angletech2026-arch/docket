import type { Card, CompanyId, Lang, Person, State } from "./types";

/**
 * Sample companies. Every name, quantity and price here is made up for the demo.
 * Customs codes, duty rates and import-rule codes are real and come from data/tariff.json.
 *
 * Each string is written twice, English and Traditional Chinese. The people who would
 * use this board read Chinese, so the Chinese is written for them, not translated word for word.
 */

type T = (en: string, zh: string) => string;
const pick = (lang: Lang): T => (en, zh) => (lang === "zh" ? zh : en);

type Seed = Omit<Card, "history" | "status" | "assignee"> & {
  status?: Card["status"];
  assignee: string | null;
  opened?: string;
};

function autoParts(lang: Lang): State {
  const t = pick(lang);
  const TODAY = t("Wed Nov 11", "11/11（三）");
  const card = (seed: Seed): Card => {
    const { opened, ...rest } = seed;
    return { status: "ready", ...rest, history: [{ at: TODAY, text: opened ?? t("Opened by the system", "系統開出") }] };
  };

  const people: Person[] = [
    { id: "own", name: t("Lin", "林老闆"), role: t("Owner", "老闆"), level: 3, skills: ["inquiry", "purchasing", "finance", "customs", "logistics", "warehouse", "gov"], active: true },
    { id: "sen", name: t("Chen", "陳哥"), role: t("Senior sales, 18 years", "資深業務，18 年"), level: 2, skills: ["inquiry", "purchasing", "customs"], active: true },
    { id: "pur", name: t("Wang", "王姐"), role: t("Purchasing, 9 years", "採購，9 年"), level: 2, skills: ["purchasing", "customs", "finance"], active: true },
    { id: "jr1", name: t("Xiao Chen", "小陳"), role: t("Sales, 1 year", "業務，1 年"), level: 1, skills: ["inquiry", "customs", "logistics", "gov"], active: true },
    { id: "jr2", name: t("Xiao Zhang", "小張"), role: t("New hire, week 1", "新人，第 1 週"), level: 1, skills: ["inquiry", "customs", "logistics", "gov"], active: true },
    { id: "wh1", name: t("A-Guo", "阿國"), role: t("Warehouse lead, 12 years", "倉庫組長，12 年"), level: 2, skills: ["warehouse", "logistics"], active: true },
    { id: "wh2", name: t("Xiao Wu", "小吳"), role: t("Warehouse, 2 years", "倉管，2 年"), level: 1, skills: ["warehouse"], active: true },
    { id: "acc", name: t("Ms. Huang", "黃小姐"), role: t("Accounting, 15 years", "會計，15 年"), level: 2, skills: ["finance", "gov"], active: true },
    { id: "brk", name: t("Shun-Da Customs", "順達報關行"), role: t("Licensed customs broker", "有證照的報關行"), level: 2, skills: ["broker"], external: true, active: true },
    { id: "trk", name: t("A-Ming Trucking", "阿明貨運"), role: t("Trucker", "貨運"), level: 1, skills: ["trucking"], external: true, active: true },
    { id: "fkl", name: t("Yong-Shun Forklift", "永順堆高機"), role: t("Forklift vendor", "堆高機商家"), level: 1, skills: ["forklift"], external: true, active: true },
  ];

  const A = "HB-2611";
  const B = "NW-2607";
  const cards: Card[] = [
    card({
      id: "a0", shipmentId: A, kind: "inquiry", stage: t("Inquiry", "詢價"),
      title: t(
        "A garage asks on LINE for 2 \"plum skewers\", a \"water turtle\" and a \"pineapple head\". That is mechanic slang for three car parts",
        "建宏汽車 LINE 來問：李仔串 ×2、水龜 ×1、鳳梨頭 ×1，2014 年 Altis",
      ),
      prepared: [
        t("Read the message (李仔串 ×2, 水龜 ×1, 鳳梨頭 ×1, for a 2014 Toyota Altis) and split it into three parts", "讀完訊息，拆成三樣零件"),
        t("Two of the three words are in the company glossary", "三個詞裡有兩個在公司術語表裡"),
        t("One word is not. The model has a guess but is not sure", "有一個不在。模型有猜，但沒把握"),
      ],
      ask: t("Reply to the garage with stock and price.", "回覆修車廠庫存和價格。"),
      skill: "inquiry", minLevel: 1, assignee: "jr2",
      stake: 0,
      stakeNote: t(
        "Small order. The cost of a wrong part is a return trip and a garage that stops asking.",
        "單子不大。寄錯零件的代價是來回一趟運費，還有以後不來問的修車廠。",
      ),
      due: t("Today", "今天"), opened: t("Opened from a LINE message at 09:12", "09:12 的 LINE 訊息開出這張卡"),
    }),
    card({
      id: "a1", shipmentId: A, kind: "order", stage: t("Reorder", "補貨"),
      title: t(
        "Stabilizer links: 9 left, 140 sell a month. Add 600 to this shipment",
        "李仔串剩 9 支，一個月賣 140 支。這批加訂 600 支",
      ),
      prepared: [
        t("Stock across three warehouses: 9", "三個倉庫合計庫存：9 支"),
        t("Average sales: 140 a month. Sea freight from Germany takes about 45 days", "平均月銷 140 支。德國海運大約 45 天"),
        t("Purchase order for 600 added to the Brenner invoice, already confirmed by email", "600 支已加進 Brenner 這張發票，對方 email 確認了"),
      ],
      ask: t("Confirm the quantity.", "確認數量。"),
      skill: "purchasing", minLevel: 2, assignee: "pur",
      stake: 18500,
      stakeNote: t("About six weeks without stock: 210 units × NT$88 margin each", "大約缺貨六週：210 支 × 每支毛利 NT$88"),
      due: t("Thu Nov 12", "11/12（四）"), opened: t("Opened when stock fell under two weeks of sales", "庫存低於兩週銷量時開出"),
    }),
    card({
      id: "a2", shipmentId: A, kind: "shipmode", stage: t("Air or sea", "空運還是海運"),
      title: t(
        "40 brake pad sets promised for Nov 14: fly them for NT$38,000 more, or lose a NT$61,000 order",
        "40 組來令片答應 11/14 交：空運多花 NT$38,000，不然丟掉 NT$61,000 的訂單",
      ),
      prepared: [
        t("Dashun Auto Supply needs 40 sets by Sat Nov 14. The vessel lands Nov 16", "大順汽材 11/14（六）前要 40 組。船 11/16 才到"),
        t("Air from Frankfurt: 6 days door to door, NT$38,000 over the sea rate for 40 sets", "法蘭克福空運：門到門 6 天，40 組比海運多 NT$38,000"),
        t("The other 2,360 sets stay on the vessel", "其餘 2,360 組留在船上"),
      ],
      ask: t("Split the shipment and fly 40 sets?", "要不要拆 40 組走空運？"),
      skill: "purchasing", minLevel: 2, assignee: "pur",
      stake: 38000,
      stakeNote: t("Extra air freight NT$38,000, against an order worth NT$61,000", "空運多 NT$38,000，對上一張 NT$61,000 的訂單"),
      due: t("Today", "今天"), opened: t("Opened from a customer order with a delivery date before the ETA", "客戶訂單的交期早於到港日時開出"),
    }),
    card({
      id: "a3", shipmentId: A, kind: "fx", stage: t("Payment & FX", "付款與匯率"),
      title: t(
        "USD 86,400 due to Brenner. Pay now at 32.10, or on arrival. A 3% move is NT$83,200",
        "要付 Brenner USD 86,400。現在 32.10 付，還是貨到再付。差 3% 就是 NT$83,200",
      ),
      prepared: [
        t("Brenner terms: net 60 after arrival, so the date is ours to choose", "Brenner 的條件是貨到後 60 天內付，哪一天付我們可以挑"),
        t("USD/TWD today 32.10. Last 30 days: 31.55 to 32.65", "今天美元 32.10。近 30 天在 31.55 到 32.65 之間"),
        t("Invoice in TWD today: NT$2,773,440. Each 1% move is NT$27,700", "今天付是 NT$2,773,440。每動 1% 是 NT$27,700"),
      ],
      ask: t("Owner decision: buy the dollars now, or wait.", "老闆決定：現在換美金，還是等。"),
      skill: "finance", minLevel: 3, status: "owner", assignee: "own",
      stake: 83200,
      stakeNote: t(
        "3% of NT$2,773,440. The rate is locked in on the day we pay. The margin it eats only shows up months later, as the stock sells",
        "NT$2,773,440 的 3%。匯率在付款那天就定了，被吃掉的毛利要幾個月後庫存賣掉才看得到",
      ),
      due: t("Fri Nov 13", "11/13（五）"), opened: t("Opened when the supplier invoice arrived", "原廠發票寄到時開出"),
    }),
    card({
      id: "a4", shipmentId: A, kind: "ccc", stage: t("Customs codes", "報關號列"),
      title: t(
        "Brenner invoice: 7 lines. 4 carry over their code, 3 new parts need one",
        "Brenner 發票 7 行：4 行沿用舊號列，3 個新零件要對號列",
      ),
      prepared: [
        t("Read the invoice attached to the supplier's email", "讀了原廠 email 附的發票"),
        t("Matched 4 lines to parts already on file, including one revised part number", "4 行對到公司已有的料號，其中 1 行是改版的新料號"),
        t("3 lines are new. Suggested an 11-digit code for each from past customs rulings", "3 行是新零件。每一行都從海關過去的案例提了一個 11 碼號列"),
      ],
      ask: t("Check each code, then send the packet to the broker.", "逐行核對號列，再把資料送給報關行。"),
      skill: "customs", minLevel: 1, assignee: "jr1",
      stake: 61900,
      stakeNote: t(
        "Duty on the three new lines moves by up to 15 points: 15% of NT$412,806",
        "三個新零件的稅率最多差 15 個百分點：NT$412,806 的 15%",
      ),
      due: t("Mon Nov 16", "11/16（一）"), opened: t("Opened from the invoice in Brenner's email", "Brenner email 裡的發票開出"),
    }),
    card({
      id: "a5", shipmentId: A, kind: "broker", stage: t("Broker", "報關行"),
      title: t(
        "Packet for Shun-Da Customs: invoice, packing list, 7 codes with reasons",
        "給順達報關行的資料：發票、裝箱單、7 個號列和理由",
      ),
      prepared: [
        t("The broker's licensed staff sign the declaration. We prepare and check", "報單由報關行的專責報關人員簽證。我們負責備齊和核對"),
        t("Deadline: 15 days from the day after the vessel arrives, then NT$200 a day", "期限：船到港隔天起 15 天內，逾期每天 NT$200"),
      ],
      ask: t("Waiting for the codes to be confirmed in-house.", "等公司內部確認號列。"),
      skill: "broker", minLevel: 1, status: "waiting", assignee: "brk",
      stake: 0, stakeNote: "",
      due: t("Mon Nov 16", "11/16（一）"), opened: t("Opened with the customs card", "跟報關號列卡一起開出"),
    }),
    card({
      id: "a6", shipmentId: A, kind: "trucking", stage: t("Trucking", "貨運"),
      title: t(
        "Keelung to WH-B, Tue Nov 17, 09:00. A-Ming Trucking, one 20-foot container",
        "基隆到 B 倉，11/17（二）09:00。阿明貨運，一只 20 呎櫃",
      ),
      prepared: [
        t("The broker's usual trucker has the slot", "報關行配合的司機已經排好"),
        t("WH-B chosen because 80% of this container is fast-moving stock", "選 B 倉是因為這櫃八成是快出的貨"),
      ],
      ask: t("Confirm the pickup time.", "確認提櫃時間。"),
      skill: "logistics", minLevel: 1, assignee: "jr1",
      stake: 0, stakeNote: "",
      due: t("Fri Nov 13", "11/13（五）"), opened: t("Opened when the vessel ETA was confirmed", "船期確認時開出"),
    }),
    card({
      id: "a7", shipmentId: A, kind: "forklift", stage: t("Forklift", "堆高機"),
      title: t(
        "Forklift at WH-B, Tue Nov 17, 10:30–13:30. Yong-Shun: 3-hour minimum, NT$1,500 to cancel late",
        "B 倉堆高機 11/17（二）10:30–13:30。永順：最少算 3 小時，太晚取消收 NT$1,500",
      ),
      prepared: [
        t("WH-B has no forklift of its own, so one is booked per container", "B 倉沒有自己的堆高機，每一櫃另外叫"),
        t("Timed 90 minutes after the port pickup", "排在港口提櫃後 90 分鐘"),
      ],
      ask: t("Confirm the booking.", "確認預約。"),
      skill: "logistics", minLevel: 1, assignee: "jr1",
      stake: 8400,
      stakeNote: t(
        "If the truck is late: NT$1,500 cancel fee + 3h minimum NT$2,400 + three people idle NT$4,500",
        "貨車晚到的話：取消費 NT$1,500 + 3 小時基本費 NT$2,400 + 三個人空等半天 NT$4,500",
      ),
      due: t("Fri Nov 13", "11/13（五）"), opened: t("Opened with the trucking card", "跟貨運卡一起開出"),
    }),
    card({
      id: "a8", shipmentId: A, kind: "putaway", stage: t("Putaway", "入倉擺放"),
      title: t(
        "Brake pads and plugs to WH-B outer bay (ship within 10 days). CV joints to WH-C inner racks",
        "來令片和火星塞放 B 倉外側（10 天內要出）。等速接頭放 C 倉內側料架",
      ),
      prepared: [
        t("Outer bay: lines with open orders or more than 300 sold a month", "外側：有訂單、或月銷超過 300 的品項"),
        t("Inner racks: slow lines. They keep for years, so they go where nobody needs to reach", "內側：慢賣的品項。放好幾年都能賣，所以放不用常拿的地方"),
      ],
      ask: t("Follow the plan at unloading.", "卸貨時照這個擺。"),
      skill: "warehouse", minLevel: 1, assignee: "wh2",
      stake: 0, stakeNote: "",
      due: t("Tue Nov 17", "11/17（二）"), opened: t("Opened from the packing list", "照裝箱單開出"),
    }),
    card({
      id: "a9", shipmentId: A, kind: "gov", stage: t("Government contract", "標案"),
      title: t(
        "County government fleet contract, delivery 2 of 4 due Fri Nov 20. 60 brake pad sets, cover letter drafted",
        "縣府公務車標案，第 2 批（共 4 批）11/20（五）交。60 組來令片，公文已擬好",
      ),
      prepared: [
        t("Tender deliveries are allowed in batches, so they ride on sea freight", "標案可以分批交，所以走海運"),
        t("Arrives Tue Nov 17, three working days for inspection and labelling, delivered Fri Nov 20", "11/17（二）到倉，驗收貼標 3 個工作天，11/20（五）交貨"),
        t("Cover letter and delivery note drafted in the county's format", "交貨公文和送貨單已照縣府的格式擬好"),
      ],
      ask: t("Check the letter and send it with the batch.", "看過公文，跟這批貨一起送出。"),
      skill: "gov", minLevel: 1, assignee: "jr1",
      stake: 0, stakeNote: t("On time as planned", "照計畫準時"),
      due: t("Fri Nov 20", "11/20（五）"), opened: t("Opened from the tender delivery schedule", "照標案交貨時程開出"),
    }),

    // second shipment, further along
    card({
      id: "b0", shipmentId: B, kind: "fx", stage: t("Payment & FX", "付款與匯率"),
      title: t("USD 41,200 to Nordwerk paid Nov 3 at 31.82", "付 Nordwerk USD 41,200，11/3 以 31.82 付清"),
      prepared: [t("Net 30 terms. Paid early while the rate was near the 30-day low", "條件是貨到 30 天。匯率接近 30 天低點時先付了")],
      ask: "", skill: "finance", minLevel: 3, status: "done", assignee: "own",
      stake: 0, stakeNote: "", due: t("Nov 3", "11/3"),
    }),
    card({
      id: "b1", shipmentId: B, kind: "ccc", stage: t("Customs codes", "報關號列"),
      title: t("Nordwerk invoice: 5 lines, all carried over from parts on file", "Nordwerk 發票 5 行，全部沿用公司已有的號列"),
      prepared: [t("No new parts on this invoice", "這張發票沒有新零件")],
      ask: "", skill: "customs", minLevel: 1, status: "done", assignee: "sen",
      stake: 0, stakeNote: "", due: t("Nov 9", "11/9"),
    }),
    card({
      id: "b2", shipmentId: B, kind: "broker", stage: t("Broker", "報關行"),
      title: t("Declared Nov 10. Cleared first time, no container inspection", "11/10 報關，一次放行，沒有被抽中開櫃"),
      prepared: [t("Random container inspection was not drawn this time", "這次沒有抽到例行開櫃查驗")],
      ask: "", skill: "broker", minLevel: 1, status: "done", assignee: "brk",
      stake: 0, stakeNote: "", due: t("Nov 10", "11/10"),
    }),
    card({
      id: "b3", shipmentId: B, kind: "putaway", stage: t("Putaway", "入倉擺放"),
      title: t(
        "Radiators and shock absorbers to WH-A, Thu Nov 19 morning. WH-A has its own forklift",
        "水箱和避震器進 A 倉，11/19（四）上午。A 倉有自己的堆高機",
      ),
      prepared: [
        t("18 radiators sell a month, so they go to the inner racks", "水箱一個月賣 18 個，放內側料架"),
        t("Shock absorbers have 3 open orders, outer bay", "避震器有 3 張訂單，放外側"),
      ],
      ask: t("Sign off receiving at the dock.", "在碼頭簽收。"),
      skill: "warehouse", minLevel: 2, assignee: "wh1",
      stake: 0, stakeNote: "", due: t("Thu Nov 19", "11/19（四）"),
    }),
  ];

  const publicSource = t("repair-trade usage, checked against public sources", "修車行話，對過公開資料");
  return {
    company: "auto",
    lang,
    companyName: t("Harbor Auto Parts", "港灣汽車零件"),
    companyNote: t(
      "Sample company. Sole distributor of foreign auto parts brands, selling inside Taiwan. 8 people, 3 warehouses.",
      "範例公司。代理多個國外汽車零件品牌，在台灣內銷。8 個人，3 個倉庫。",
    ),
    today: TODAY,
    people,
    shipments: [
      {
        id: A, title: t("Brenner, Germany", "Brenner（德國）"),
        sub: t("7 invoice lines · USD 86,400 · sea, 20-ft container", "發票 7 行 · USD 86,400 · 海運 20 呎櫃"),
        eta: t("Mon Nov 16", "11/16（一）"), margin: 568000, marginPct: 17,
        sold: t(
          "NT$171,000 is on goods already sold: the tender batch and open orders. The rest comes in as stock sells, over 2 to 5 months. Cash out now: NT$2,773,440.",
          "其中 NT$171,000 是已經賣掉的：標案那一批和現有訂單，貨到就出。其餘是壓庫存，2 到 5 個月慢慢賣。現在先付出去的現金：NT$2,773,440。",
        ),
      },
      {
        id: B, title: t("Nordwerk, Sweden", "Nordwerk（瑞典）"),
        sub: t("5 invoice lines · USD 41,200 · sea", "發票 5 行 · USD 41,200 · 海運"),
        eta: t("Thu Nov 19 at WH-A", "11/19（四）進 A 倉"), margin: 262000, marginPct: 20,
        sold: t(
          "3 open orders for shock absorbers ship on arrival. Radiators sell 18 a month, so that margin takes most of a year.",
          "避震器有 3 張訂單，貨到就出。水箱一個月賣 18 個，那部分毛利要大半年才回得來。",
        ),
      },
    ],
    cards,
    glossary: [
      { term: "水龜", meaning: t("thermostat (engine cooling). Not the water pump", "節溫器（引擎冷卻用），不是水幫浦"), sku: "BR-TH-3310", by: publicSource },
      { term: "李仔串", meaning: t("stabilizer link. Looks like candied fruit on a stick", "平衡桿連桿，長得像糖葫蘆"), sku: "BR-SL-0812", by: publicSource },
    ],
    capabilities: [
      { label: t("Answer a garage inquiry", "回覆修車廠詢價"), skill: "inquiry", minLevel: 1 },
      { label: t("Substitutes and price exceptions", "替代料和特價"), skill: "inquiry", minLevel: 2 },
      { label: t("Purchase orders to suppliers", "跟原廠下採購單"), skill: "purchasing", minLevel: 2 },
      { label: t("Check customs codes", "核對報關號列"), skill: "customs", minLevel: 1 },
      { label: t("Book trucks and forklifts", "叫貨車和堆高機"), skill: "logistics", minLevel: 1 },
      { label: t("Sign off receiving at the dock", "碼頭簽收"), skill: "warehouse", minLevel: 2 },
      { label: t("Government contract paperwork", "標案文件"), skill: "gov", minLevel: 1 },
    ],
    log: [{ id: 0, text: t("Board opened. 10 cards on HB-2611, 4 on NW-2607.", "開板。HB-2611 有 10 張卡，NW-2607 有 4 張。"), tone: "plain" }],
    seq: 100,
    typhoon: false,
  };
}

function grain(lang: Lang): State {
  const t = pick(lang);
  const TODAY = t("Wed Nov 11", "11/11（三）");
  const card = (seed: Seed): Card => {
    const { opened, ...rest } = seed;
    return { status: "ready", ...rest, history: [{ at: TODAY, text: opened ?? t("Opened by the system", "系統開出") }] };
  };
  const people: Person[] = [
    { id: "own", name: t("Owner", "老闆"), role: t("Second generation, took over this year", "二代，今年接手"), level: 3, skills: ["purchasing", "finance", "customs", "logistics", "warehouse", "gov", "inquiry"], active: true },
    { id: "buy", name: t("Uncle Hsu", "許叔"), role: t("Buyer, 26 years", "採購，26 年"), level: 2, skills: ["purchasing", "customs", "inquiry"], active: true },
    { id: "ops", name: t("Pei-Shan", "佩珊"), role: t("Operations, 3 years", "營運，3 年"), level: 1, skills: ["customs", "logistics", "gov", "inquiry"], active: true },
    { id: "new", name: t("Yu-Ting", "郁婷"), role: t("New hire, month 1", "新人，第 1 個月"), level: 1, skills: ["customs", "logistics", "gov", "inquiry"], active: true },
    { id: "wh1", name: t("A-Tsai", "阿財"), role: t("Warehouse lead, 20 years", "倉庫組長，20 年"), level: 2, skills: ["warehouse", "logistics"], active: true },
    { id: "wh2", name: "Kevin", role: t("Warehouse, 1 year", "倉管，1 年"), level: 1, skills: ["warehouse"], active: true },
    { id: "acc", name: t("Ms. Lai", "賴小姐"), role: t("Accounting", "會計"), level: 2, skills: ["finance", "gov"], active: true },
    { id: "brk", name: t("Customs broker", "報關行"), role: t("Licensed customs broker", "有證照的報關行"), level: 2, skills: ["broker"], external: true, active: true },
  ];
  const G = "MB-1118";
  const cards: Card[] = [
    card({
      id: "g1", shipmentId: G, kind: "fx", stage: t("Payment & FX", "付款與匯率"),
      title: t(
        "USD 31,200 for 24 t of mung beans, paid in full before loading. A 3% move is NT$30,000",
        "24 公噸綠豆 USD 31,200，裝船前要全額付清。差 3% 就是 NT$30,000",
      ),
      prepared: [
        t("This supplier wants 100% before shipment, so there is no waiting for a better rate", "這家供應商要裝船前付清，沒辦法等匯率"),
        t("Margin on this lot is NT$80,000. A 3% move in the dollar is more than a third of it", "這批毛利 NT$80,000。美金動 3% 就超過三分之一"),
      ],
      ask: t("Owner decision: buy the dollars today?", "老闆決定：今天換美金嗎？"),
      skill: "finance", minLevel: 3, status: "owner", assignee: "own",
      stake: 30000, stakeNote: t("3% of NT$1,001,520. Margin on this lot: NT$80,000", "NT$1,001,520 的 3%。這批毛利 NT$80,000"),
      due: t("Thu Nov 12", "11/12（四）"), opened: t("Opened when the proforma invoice arrived", "預估發票寄到時開出"),
    }),
    card({
      id: "g2", shipmentId: G, kind: "ccc", stage: t("Customs codes", "報關號列"),
      title: t(
        "Dried mung beans, for food: 0713.31.10.90-0, duty 20%, import rules B01 and F01",
        "食用乾綠豆：0713.31.10.90-0，稅率 20%，輸入規定 B01、F01",
      ),
      prepared: [
        t("The old code 0713.31.10.00-9 was retired on Aug 15, 2023. The part list still had it", "舊號列 0713.31.10.00-9 在 2023/8/15 停用，料號表上還是舊的"),
        t("Food use and planting seed are now separate codes with different rules", "食用和種植用現在是不同的號列，規定也不同"),
        t("B01 and F01 on this code open the two cards to the right", "這個號列帶 B01 和 F01，所以右邊多開了兩張卡"),
      ],
      ask: t("Confirm the code and the use (food, not seed, not feed).", "確認號列和用途（食用，不是種子，不是飼料）。"),
      skill: "customs", minLevel: 1, assignee: "ops",
      stake: 200300,
      stakeNote: t(
        "Duty at 20% of NT$1,001,520. A wrong code or use changes the rate and the checks",
        "NT$1,001,520 的 20% 關稅。號列或用途報錯，稅率和要過的關都會變",
      ),
      due: t("Mon Nov 16", "11/16（一）"), opened: t("Opened from the proforma invoice", "照預估發票開出"),
    }),
    card({
      id: "g3", shipmentId: G, kind: "quarantine", stage: t("Plant quarantine", "植物檢疫"),
      title: t(
        "B01: original phytosanitary certificate from Australia. Do not open or move the bags before release",
        "B01：澳洲的植物檢疫證明書正本。放行前不能拆包、不能移動",
      ),
      prepared: [
        t("Apply to the quarantine branch at the port on arrival", "到港時向港口的檢疫分署申請"),
        t("The original certificate must travel with the documents. A scan is not accepted", "正本要跟著文件走，掃描檔不收"),
        t("Supplier emailed a scan on Nov 6. The original is with the courier", "供應商 11/6 寄了掃描檔，正本還在快遞路上"),
      ],
      ask: t("Confirm the original has arrived before the vessel does.", "確認正本比船早到。"),
      skill: "customs", minLevel: 1, assignee: "new",
      stake: 1001500,
      stakeNote: t("No certificate, no release: the lot is returned or destroyed at our cost", "沒有證明書就不放行：整批退運或銷毀，費用我們出"),
      due: t("Tue Nov 17", "11/17（二）"), opened: t("Opened because the customs code carries rule B01", "因為號列帶 B01 規定而開出"),
    }),
    card({
      id: "g4", shipmentId: G, kind: "foodcheck", stage: t("Food inspection", "食品查驗"),
      title: t(
        "F01: border food inspection. Pesticide residue is the usual reason a lot fails",
        "F01：邊境食品查驗。農藥殘留是最常見的不合格原因",
      ),
      prepared: [
        t("Application can go in up to 15 days before arrival", "到港前 15 天內就可以先申請"),
        t("Supplier's residue test report requested and attached", "供應商的殘留檢驗報告已經要到並附上"),
        t("If it fails, the whole lot is returned or destroyed", "不合格的話整批退運或銷毀"),
      ],
      ask: t("File the inspection application.", "送出查驗申請。"),
      skill: "customs", minLevel: 1, assignee: "ops",
      stake: 1001500, stakeNote: t("The whole lot, NT$1,001,520, plus return freight", "整批貨 NT$1,001,520，再加退運運費"),
      due: t("Thu Nov 12", "11/12（四）"), opened: t("Opened because the customs code carries rule F01", "因為號列帶 F01 規定而開出"),
    }),
    card({
      id: "g5", shipmentId: G, kind: "putaway", stage: t("Storage", "存放"),
      title: t(
        "Keep the Australian lot apart from the Myanmar lot. Bay 3, on pallets, off the wall",
        "澳洲這批跟緬甸那批分開放。3 號區，放棧板上，不靠牆",
      ),
      prepared: [
        t("Same product, different origin, different price. Customers order by origin", "同一種豆，產地不同價錢就不同。客戶是指定產地訂的"),
        t("Bay 3 is dry and next to the repacking line", "3 號區乾燥，就在分裝線旁邊"),
      ],
      ask: t("Follow the plan at unloading.", "卸貨時照這個擺。"),
      skill: "warehouse", minLevel: 1, assignee: "wh2",
      stake: 0, stakeNote: "", due: t("Fri Nov 20", "11/20（五）"), opened: t("Opened from the packing list", "照裝箱單開出"),
    }),
    card({
      id: "g6", shipmentId: G, kind: "expiry", stage: t("First out", "先進先出"),
      title: t(
        "Myanmar lot MB-0903, 6.2 t, best before Mar 2027. Ship it before any of the new lot",
        "緬甸批 MB-0903 還有 6.2 公噸，保存期限到 2027 年 3 月。新貨之前先出它",
      ),
      prepared: [
        t("Three open orders do not name an origin. They are filled from MB-0903 first", "有三張訂單沒指定產地，先用 MB-0903 出"),
        t("At the current pace MB-0903 is gone by late January", "照現在的速度，MB-0903 一月底出完"),
      ],
      ask: t("Approve the pick order.", "核准出貨順序。"),
      skill: "warehouse", minLevel: 2, assignee: "wh1",
      stake: 297600, stakeNote: t("6.2 t × NT$48 a kg if it runs past its date", "過期的話是 6.2 公噸 × 每公斤 NT$48"),
      due: t("Today", "今天"), opened: t("Opened when a new lot of the same product was booked", "同品項的新貨訂下來時開出"),
    }),
    card({
      id: "g7", shipmentId: G, kind: "shrinkage", stage: t("Shrinkage", "耗損"),
      title: t(
        "Book 2.4 kg of unusable beans on 24 t, so the count matches what is on the floor",
        "24 公噸先認列 2.4 公斤不能用的，帳上的數字才會跟現場一樣",
      ),
      prepared: [
        t("House rate: about 1 kg in every 10 t is unusable", "公司的經驗值：每 10 公噸大約有 1 公斤不能用"),
        t("Entered as a loss at receiving, not found later at stocktake", "入庫時就認列，不要等盤點才發現"),
      ],
      ask: t("Confirm after unloading, with the real weight.", "卸貨後用實際重量確認。"),
      skill: "warehouse", minLevel: 1, assignee: "wh2",
      stake: 0, stakeNote: "", due: t("Fri Nov 20", "11/20（五）"), opened: t("Opened with the storage card", "跟存放卡一起開出"),
    }),
    card({
      id: "g8", shipmentId: G, kind: "repack", stage: t("Repack", "分裝"),
      title: t(
        "Retail order: repack 2 t into 1 kg bags, 2,000 bags, Australian origin on the label",
        "零售訂單：2 公噸分裝成 1 公斤包，2,000 包，標示澳洲產",
      ),
      prepared: [
        t("Customer wants 1 kg bags. We receive 25 kg sacks", "客戶要 1 公斤包，我們進來是 25 公斤一袋"),
        t("Line booked for Mon Nov 23, after release and one day of rest", "分裝線訂在 11/23（一），放行後先靜置一天"),
        t("Label text drafted with origin and best-before date", "標籤文字已擬好，有產地和保存期限"),
      ],
      ask: t("Confirm the line booking.", "確認分裝線的時間。"),
      skill: "logistics", minLevel: 1, assignee: "new",
      stake: 0, stakeNote: "", due: t("Mon Nov 23", "11/23（一）"), opened: t("Opened from a customer order", "照客戶訂單開出"),
    }),
  ];
  return {
    company: "grain",
    lang,
    companyName: t("Grain importer", "雜糧進口商"),
    companyNote: t(
      "Sample company. Imports beans and grains in bulk, repacks and sells inside Taiwan.",
      "範例公司。大宗進口豆類和穀物，分裝後在台灣內銷。",
    ),
    today: TODAY,
    people,
    shipments: [
      {
        id: G, title: t("Mung beans, Australia", "綠豆（澳洲）"),
        sub: t("24 t · USD 31,200 · sea, Taichung port", "24 公噸 · USD 31,200 · 海運，台中港"),
        eta: t("Wed Nov 18", "11/18（三）"), margin: 80000, marginPct: 8,
        sold: t(
          "2 t is already ordered for retail repacking. The other 22 t sells over about three months, and has to be gone before its best-before date.",
          "其中 2 公噸已經被訂走要分裝。其餘 22 公噸大約三個月賣完，而且要趕在保存期限前賣掉。",
        ),
      },
    ],
    cards,
    glossary: [],
    capabilities: [
      { label: t("Buy from overseas suppliers", "跟國外供應商採購"), skill: "purchasing", minLevel: 2 },
      { label: t("Customs, quarantine and food inspection papers", "報關、檢疫、食品查驗文件"), skill: "customs", minLevel: 1 },
      { label: t("Decide which lot ships first", "決定哪一批先出"), skill: "warehouse", minLevel: 2 },
      { label: t("Book trucks and the repacking line", "叫貨車和排分裝線"), skill: "logistics", minLevel: 1 },
    ],
    log: [{ id: 0, text: t("Board opened. 8 cards on MB-1118.", "開板。MB-1118 有 8 張卡。"), tone: "plain" }],
    seq: 100,
    typhoon: false,
  };
}

export function buildScenario(company: CompanyId, lang: Lang = "en"): State {
  return company === "grain" ? grain(lang) : autoParts(lang);
}
