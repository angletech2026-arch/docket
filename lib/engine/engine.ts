import type { Action, Card, Lang, Person, State } from "./types";
import { buildScenario } from "./scenario";

export function initialState(company: State["company"] = "auto", lang: Lang = "en"): State {
  return buildScenario(company, lang);
}

const OPEN: Card["status"][] = ["ready", "owner"];

/** Pick the English or the Chinese wording for the board's language. */
const say = (state: State, en: string, zh: string) => (state.lang === "zh" ? zh : en);

export function load(state: State, personId: string): number {
  return state.cards.filter((c) => c.assignee === personId && OPEN.includes(c.status)).length;
}

export function eligible(state: State, card: Pick<Card, "skill" | "minLevel">): Person[] {
  return state.people.filter(
    (p) => p.active && p.skills.includes(card.skill) && p.level >= card.minLevel,
  );
}

/** Least loaded eligible person. Ties go to the more junior person, so seniors stay free. */
function pick(state: State, card: Card, exclude?: string): Person | null {
  const pool = eligible(state, card).filter((p) => p.id !== exclude);
  if (!pool.length) return null;
  return [...pool].sort((a, b) => load(state, a.id) - load(state, b.id) || a.level - b.level)[0];
}

function stamp(state: State): string {
  return state.today;
}

function log(state: State, text: string, tone: "event" | "owner" | "plain" = "plain"): State {
  const seq = state.seq + 1;
  return { ...state, seq, log: [{ id: seq, text, tone }, ...state.log].slice(0, 40) };
}

function nameOf(state: State, id: string | null): string {
  return state.people.find((p) => p.id === id)?.name ?? say(state, "nobody", "沒有人");
}

function owner(state: State): Person {
  return state.people.find((p) => p.level === 3)!;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return buildScenario(action.company, action.lang ?? state.lang);

    case "clearFlash":
      return {
        ...state,
        cards: state.cards.map((c) => (c.flash ? { ...c, flash: undefined } : c)),
      };

    case "approve": {
      const card = state.cards.find((c) => c.id === action.cardId);
      if (!card) return state;
      const who = nameOf(state, card.assignee);
      let next: State = {
        ...state,
        cards: state.cards.map((c) =>
          c.id === card.id
            ? {
                ...c,
                status: "done",
                history: [
                  ...c.history,
                  {
                    at: stamp(state),
                    text: say(
                      state,
                      `${who} approved${action.note ? `: ${action.note}` : ""}`,
                      `${who} 核准${action.note ? `：${action.note}` : ""}`,
                    ),
                  },
                ],
              }
            : c,
        ),
      };
      next = log(
        next,
        say(state, `${who} closed "${card.stage}" on ${card.shipmentId}`, `${who} 完成了 ${card.shipmentId} 的「${card.stage}」`),
      );
      // a closed customs card releases the broker packet that was waiting on it
      if (card.kind === "ccc") {
        next = {
          ...next,
          cards: next.cards.map((c) =>
            c.shipmentId === card.shipmentId && c.kind === "broker" && c.status === "waiting"
              ? {
                  ...c,
                  status: "ready",
                  flash: "changed",
                  history: [
                    ...c.history,
                    {
                      at: stamp(state),
                      text: say(
                        state,
                        "Codes confirmed in-house, packet sent to the licensed broker",
                        "公司內部確認了號列，資料已送給報關行",
                      ),
                    },
                  ],
                }
              : c,
          ),
        };
        next = log(
          next,
          say(state, `Packet for ${card.shipmentId} sent to the customs broker to file`, `${card.shipmentId} 的資料已送給報關行報關`),
        );
      }
      return next;
    }

    case "escalate": {
      const card = state.cards.find((c) => c.id === action.cardId);
      if (!card) return state;
      const from = card.assignee;
      // go one level up within the same skill; if nobody, the owner takes it
      const up = state.people
        .filter(
          (p) =>
            p.active &&
            p.id !== from &&
            p.skills.includes(card.skill) &&
            p.level > (state.people.find((x) => x.id === from)?.level ?? 1),
        )
        .sort((a, b) => a.level - b.level || load(state, a.id) - load(state, b.id))[0];
      const target = up ?? owner(state);
      let next: State = {
        ...state,
        cards: state.cards.map((c) =>
          c.id === card.id
            ? {
                ...c,
                assignee: target.id,
                status: target.level === 3 ? "owner" : "ready",
                flash: "moved",
                movedFrom: nameOf(state, from),
                history: [
                  ...c.history,
                  {
                    at: stamp(state),
                    // "passed it up" / "往上交給" is how the inquiry card knows it has been asked
                    text: say(
                      state,
                      `${nameOf(state, from)} passed it up to ${target.name}: ${action.why}`,
                      `${nameOf(state, from)} 往上交給 ${target.name}：${action.why}`,
                    ),
                  },
                ],
              }
            : c,
        ),
      };
      next = log(
        next,
        say(state, `"${card.stage}" went up to ${target.name}: ${action.why}`, `「${card.stage}」往上交給 ${target.name}：${action.why}`),
        "owner",
      );
      return next;
    }

    case "teach": {
      const by = `${action.by}, ${state.today}`;
      const exists = state.glossary.some((g) => g.term === action.term);
      const glossary = exists
        ? state.glossary.map((g) =>
            g.term === action.term ? { ...g, meaning: action.meaning, sku: action.sku, by } : g,
          )
        : [...state.glossary, { term: action.term, meaning: action.meaning, sku: action.sku, by }];
      // the card goes back to whoever asked, now that the answer is on it
      const asker = state.people.find(
        (p) => p.active && p.name === state.cards.find((c) => c.id === action.cardId)?.movedFrom,
      );
      let next: State = {
        ...state,
        glossary,
        cards: state.cards.map((c) =>
          c.id === action.cardId
            ? {
                ...c,
                assignee: asker ? asker.id : c.assignee,
                status: asker ? "ready" : c.status,
                movedFrom: undefined,
                flash: "changed",
                history: [
                  ...c.history,
                  {
                    at: stamp(state),
                    text: say(
                      state,
                      `${action.by} answered once: ${action.term} = ${action.meaning}. Saved to the company glossary.`,
                      `${action.by} 回答了一次：${action.term} = ${action.meaning}。已存進公司術語表。`,
                    ),
                  },
                ],
              }
            : c,
        ),
      };
      next = log(
        next,
        say(
          state,
          `${action.by} taught the company "${action.term}". Every card will know it from now on.`,
          `${action.by} 教會公司「${action.term}」。以後每一張卡都認得。`,
        ),
        "event",
      );
      return next;
    }

    case "setStake":
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.cardId
            ? {
                ...c,
                stake: action.stake,
                stakeNote: action.stakeNote,
                prepared: action.prepared ?? c.prepared,
              }
            : c,
        ),
      };

    case "quit": {
      const person = state.people.find((p) => p.id === action.personId);
      if (!person || !person.active) return state;
      let next: State = {
        ...state,
        people: state.people.map((p) => (p.id === person.id ? { ...p, active: false } : p)),
      };
      next = log(next, say(state, `${person.name} left the company today`, `${person.name} 今天離職了`), "event");
      const theirs = next.cards.filter((c) => c.assignee === person.id && OPEN.includes(c.status));
      for (const card of theirs) {
        const to = pick(next, card, person.id) ?? owner(next);
        next = {
          ...next,
          cards: next.cards.map((c) =>
            c.id === card.id
              ? {
                  ...c,
                  assignee: to.id,
                  status: to.level === 3 && c.minLevel < 3 ? "owner" : c.status,
                  flash: "moved",
                  movedFrom: person.name,
                  history: [
                    ...c.history,
                    {
                      at: stamp(next),
                      text: say(
                        state,
                        `${person.name} left. Reassigned to ${to.name}. Everything prepared so far stays on the card.`,
                        `${person.name} 離職。改由 ${to.name} 接手。之前準備好的東西都還在卡片上。`,
                      ),
                    },
                  ],
                }
              : c,
          ),
        };
        next = log(
          next,
          say(
            state,
            `"${card.stage}" on ${card.shipmentId}: ${person.name} → ${to.name}`,
            `${card.shipmentId} 的「${card.stage}」：${person.name} → ${to.name}`,
          ),
        );
      }
      return next;
    }

    case "typhoon": {
      if (state.typhoon || state.company !== "auto") return state;
      const sid = "HB-2611";
      let next: State = {
        ...state,
        typhoon: true,
        shipments: state.shipments.map((s) =>
          s.id === sid
            ? { ...s, late: true, eta: say(state, "Wed Nov 18 (was Mon Nov 16)", "11/18（三）（原本 11/16（一））") }
            : s,
        ),
      };
      next = log(
        next,
        say(
          state,
          "Typhoon warning: the vessel for HB-2611 berths two days late, Wed Nov 18",
          "颱風警報：HB-2611 的船晚兩天靠港，11/18（三）",
        ),
        "event",
      );

      const patch = (kind: Card["kind"], fn: (c: Card) => Card) => {
        next = {
          ...next,
          cards: next.cards.map((c) => (c.shipmentId === sid && c.kind === kind ? fn(c) : c)),
        };
      };

      patch("trucking", (c) => ({
        ...c,
        title: say(
          state,
          "Truck moved to Thu Nov 19, 09:00. A-Ming Trucking has the new slot",
          "貨車改到 11/19（四）09:00。阿明貨運已排新時段",
        ),
        prepared: [
          say(state, "Old slot Tue Nov 17 released", "原本 11/17（二）的時段已取消"),
          say(
            state,
            "New pickup at Keelung set for Thu Nov 19, 09:00, one day after the vessel berths",
            "基隆提櫃改到 11/19（四）09:00，船靠港的隔天",
          ),
          say(state, "Message to A-Ming Trucking drafted and waiting to send", "給阿明貨運的訊息已擬好，等送出"),
        ],
        ask: say(state, "Send the rebooking to the trucker?", "把改期通知送給貨運？"),
        flash: "changed",
        history: [...c.history, { at: stamp(next), text: say(state, "Vessel two days late. Truck rebooked.", "船晚兩天。貨車已改期。") }],
      }));
      patch("forklift", (c) => ({
        ...c,
        title: say(
          state,
          "Forklift moved to Thu Nov 19, 10:30. Changed more than 24h ahead, no cancel fee",
          "堆高機改到 11/19（四）10:30。提前超過 24 小時改，不收取消費",
        ),
        prepared: [
          say(
            state,
            "Yong-Shun charges NT$1,500 to cancel inside 24h and bills a 3-hour minimum",
            "永順 24 小時內取消要收 NT$1,500，而且最少算 3 小時",
          ),
          say(state, "Moved now, so neither applies", "現在就改，兩樣都不用付"),
          say(
            state,
            "New slot 10:30–13:30 at WH-B, timed 90 minutes after pickup at the port",
            "新時段 10:30–13:30 在 B 倉，排在港口提櫃後 90 分鐘",
          ),
        ],
        ask: say(state, "Confirm the new forklift slot?", "確認堆高機的新時段？"),
        stake: 8400,
        stakeNote: say(
          state,
          "NT$1,500 cancel fee + 3h minimum NT$2,400 + three people idle half a day NT$4,500",
          "取消費 NT$1,500 + 3 小時基本費 NT$2,400 + 三個人空等半天 NT$4,500",
        ),
        flash: "changed",
        history: [
          ...c.history,
          {
            at: stamp(next),
            text: say(
              state,
              "Vessel two days late. Forklift slot moved before the cancel window.",
              "船晚兩天。趕在要收取消費之前把堆高機改期了。",
            ),
          },
        ],
      }));

      const seq = next.seq + 1;
      const crewCard: Card = {
        id: `c${seq}`,
        shipmentId: sid,
        kind: "crew",
        stage: say(state, "Crew", "卸貨人力"),
        title: say(
          state,
          "Tuesday unloading shift released. Three people needed Thu Nov 19 at WH-B",
          "週二的卸貨班取消。11/19（四）B 倉要三個人",
        ),
        prepared: [
          say(state, "A-Guo, Xiao Wu and one temp were booked for Tue Nov 17", "阿國、小吳和一位臨時工原本排在 11/17（二）"),
          say(
            state,
            "Thursday already has the Nordwerk container at WH-A in the morning",
            "週四上午 A 倉本來就有 Nordwerk 那一櫃",
          ),
          say(
            state,
            "Suggested: unload HB-2611 at 10:30 at WH-B after WH-A is done",
            "建議：A 倉卸完之後，10:30 到 B 倉卸 HB-2611",
          ),
        ],
        ask: say(state, "Approve the Thursday roster?", "核准週四的班表？"),
        skill: "warehouse",
        minLevel: 2,
        status: "ready",
        assignee: null,
        stake: 4500,
        stakeNote: say(state, "Three people for half a day if the shift is not moved", "班沒改的話，三個人空等半天"),
        due: say(state, "Thu Nov 12", "11/12（四）"),
        history: [{ at: stamp(next), text: say(state, "Opened by the delay", "因為延誤而開出") }],
        flash: "new",
      };
      const crewTo = pick(next, crewCard);
      crewCard.assignee = crewTo?.id ?? owner(next).id;
      next = { ...next, seq, cards: [...next.cards, crewCard] };
      next = log(
        next,
        say(
          state,
          "Truck, forklift and unloading crew for HB-2611 rebooked to Thu Nov 19",
          "HB-2611 的貨車、堆高機和卸貨人力都改到 11/19（四）",
        ),
      );

      patch("gov", (c) => ({
        ...c,
        title: say(
          state,
          "County fleet tender, batch 2 due Fri Nov 20. Goods reach the warehouse Thu Nov 19. It will miss",
          "縣府公務車標案第 2 批 11/20（五）要交。貨 11/19（四）才到倉。趕不上",
        ),
        prepared: [
          say(
            state,
            "Batch 2 needs 3 working days after arrival for inspection and labelling, so earliest delivery is Tue Nov 24",
            "第 2 批到貨後要 3 個工作天驗收貼標，最快 11/24（二）才能交",
          ),
          say(
            state,
            "Contract penalty: 0.1% of NT$1,200,000 per day late = NT$1,200 a day, and a late mark on the vendor record",
            "合約罰則：每逾期一天罰 NT$1,200,000 的千分之一，也就是一天 NT$1,200，廠商紀錄還會記一筆逾期",
          ),
          say(
            state,
            "Option A: ask the county for an extension citing the typhoon. The letter is drafted",
            "做法 A：以颱風為由跟縣府申請展延。公文已擬好",
          ),
          say(state, "Option B: air-freight the 60 units for batch 2, about NT$52,000", "做法 B：第 2 批的 60 組改走空運，大約 NT$52,000"),
        ],
        ask: say(
          state,
          "Owner decision: ask for the extension, or pay for air freight?",
          "老闆決定：申請展延，還是花錢走空運？",
        ),
        stake: 52000,
        stakeNote: say(
          state,
          "Air freight for 60 units NT$52,000, against NT$1,200 a day late plus a late mark on the vendor record",
          "60 組空運 NT$52,000，對上逾期一天 NT$1,200 加上一筆逾期紀錄",
        ),
        status: "owner",
        assignee: owner(next).id,
        movedFrom: nameOf(next, c.assignee),
        flash: "moved",
        history: [
          ...c.history,
          {
            at: stamp(next),
            text: say(
              state,
              `The delay makes batch 2 late. Taken off ${nameOf(next, c.assignee)} and sent to the owner.`,
              `延誤讓第 2 批趕不上。從 ${nameOf(next, c.assignee)} 手上收回，交給老闆。`,
            ),
          },
        ],
      }));
      next = log(
        next,
        say(
          state,
          "One order will miss its deadline because of the delay. Sent to the owner.",
          "有一張單因為延誤會趕不上交期。已交給老闆。",
        ),
        "owner",
      );
      return next;
    }
  }
}

/** Things only one active person in the company can take. */
export function singlePoints(state: State): { label: string; who: string }[] {
  const out: { label: string; who: string }[] = [];
  for (const cap of state.capabilities) {
    const pool = state.people.filter(
      // the owner can do anything, so the owner does not count as cover
      (p) => p.active && !p.external && p.level < 3 && p.skills.includes(cap.skill) && p.level >= cap.minLevel,
    );
    if (pool.length === 1) out.push({ label: cap.label, who: pool[0].name });
    if (pool.length === 0) out.push({ label: cap.label, who: say(state, "nobody", "沒有人") });
  }
  return out;
}

export function openStake(state: State, shipmentId: string): { total: number; count: number } {
  const open = state.cards.filter(
    (c) => c.shipmentId === shipmentId && c.status !== "done" && c.stake > 0,
  );
  return { total: open.reduce((a, c) => a + c.stake, 0), count: open.length };
}
