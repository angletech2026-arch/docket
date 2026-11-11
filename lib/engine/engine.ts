import type { Action, Card, Person, State } from "./types";
import { buildScenario } from "./scenario";

export function initialState(company: State["company"] = "auto"): State {
  return buildScenario(company);
}

const OPEN: Card["status"][] = ["ready", "owner"];

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
  return state.people.find((p) => p.id === id)?.name ?? "nobody";
}

function owner(state: State): Person {
  return state.people.find((p) => p.level === 3)!;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return buildScenario(action.company);

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
                  { at: stamp(state), text: `${who} approved${action.note ? `: ${action.note}` : ""}` },
                ],
              }
            : c,
        ),
      };
      next = log(next, `${who} closed "${card.stage}" on ${card.shipmentId}`);
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
                    { at: stamp(state), text: "Codes confirmed in-house, packet sent to the licensed broker" },
                  ],
                }
              : c,
          ),
        };
        next = log(next, `Packet for ${card.shipmentId} sent to the customs broker to file`);
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
                    text: `${nameOf(state, from)} passed it up to ${target.name}: ${action.why}`,
                  },
                ],
              }
            : c,
        ),
      };
      next = log(next, `"${card.stage}" went up to ${target.name}: ${action.why}`, "owner");
      return next;
    }

    case "teach": {
      const exists = state.glossary.some((g) => g.term === action.term);
      const glossary = exists
        ? state.glossary.map((g) =>
            g.term === action.term
              ? { ...g, meaning: action.meaning, sku: action.sku, by: `${action.by}, ${state.today}` }
              : g,
          )
        : [...state.glossary, { term: action.term, meaning: action.meaning, sku: action.sku, by: `${action.by}, ${state.today}` }];
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
                    text: `${action.by} answered once: ${action.term} = ${action.meaning}. Saved to the company glossary.`,
                  },
                ],
              }
            : c,
        ),
      };
      next = log(next, `${action.by} taught the company "${action.term}". Every card will know it from now on.`, "event");
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
      next = log(next, `${person.name} left the company today`, "event");
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
                      text: `${person.name} left. Reassigned to ${to.name}. Everything prepared so far stays on the card.`,
                    },
                  ],
                }
              : c,
          ),
        };
        next = log(next, `"${card.stage}" on ${card.shipmentId}: ${person.name} → ${to.name}`);
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
          s.id === sid ? { ...s, eta: "Wed Nov 18 (was Mon Nov 16)" } : s,
        ),
      };
      next = log(next, "Typhoon warning: the vessel for HB-2611 berths two days late, Wed Nov 18", "event");

      const patch = (kind: Card["kind"], fn: (c: Card) => Card) => {
        next = {
          ...next,
          cards: next.cards.map((c) => (c.shipmentId === sid && c.kind === kind ? fn(c) : c)),
        };
      };

      patch("trucking", (c) => ({
        ...c,
        title: "Truck moved to Thu Nov 19, 09:00. A-Ming Trucking has the new slot",
        prepared: [
          "Old slot Tue Nov 17 released",
          "New pickup at Keelung set for Thu Nov 19, 09:00, one day after the vessel berths",
          "Message to A-Ming Trucking drafted and waiting to send",
        ],
        ask: "Send the rebooking to the trucker?",
        flash: "changed",
        history: [...c.history, { at: stamp(next), text: "Vessel two days late. Truck rebooked." }],
      }));
      patch("forklift", (c) => ({
        ...c,
        title: "Forklift moved to Thu Nov 19, 10:30. Changed more than 24h ahead, no cancel fee",
        prepared: [
          "Yong-Shun charges NT$1,500 to cancel inside 24h and bills a 3-hour minimum",
          "Moved now, so neither applies",
          "New slot 10:30–13:30 at WH-B, timed 90 minutes after pickup at the port",
        ],
        ask: "Confirm the new forklift slot?",
        stake: 8400,
        stakeNote: "NT$1,500 cancel fee + 3h minimum NT$2,400 + three people idle half a day NT$4,500",
        flash: "changed",
        history: [...c.history, { at: stamp(next), text: "Vessel two days late. Forklift slot moved before the cancel window." }],
      }));

      const seq = next.seq + 1;
      const crewCard: Card = {
        id: `c${seq}`,
        shipmentId: sid,
        kind: "crew",
        stage: "Crew",
        title: "Tuesday unloading shift released. Three people needed Thu Nov 19 at WH-B",
        prepared: [
          "A-Guo, Xiao Wu and one temp were booked for Tue Nov 17",
          "Thursday already has the Nordwerk container at WH-A in the morning",
          "Suggested: unload HB-2611 at 10:30 at WH-B after WH-A is done",
        ],
        ask: "Approve the Thursday roster?",
        skill: "warehouse",
        minLevel: 2,
        status: "ready",
        assignee: null,
        stake: 4500,
        stakeNote: "Three people for half a day if the shift is not moved",
        due: "Thu Nov 12",
        history: [{ at: stamp(next), text: "Opened by the delay" }],
        flash: "new",
      };
      const crewTo = pick(next, crewCard);
      crewCard.assignee = crewTo?.id ?? owner(next).id;
      next = { ...next, seq, cards: [...next.cards, crewCard] };
      next = log(next, `Truck, forklift and unloading crew for HB-2611 rebooked to Thu Nov 19`);

      patch("gov", (c) => ({
        ...c,
        title: "County fleet tender, batch 2 due Fri Nov 20. Goods reach the warehouse Thu Nov 19. It will miss",
        prepared: [
          "Batch 2 needs 3 working days after arrival for inspection and labelling, so earliest delivery is Tue Nov 24",
          "Contract penalty: 0.1% of NT$1,200,000 per day late = NT$1,200 a day, and a late mark on the vendor record",
          "Option A: ask the county for an extension citing the typhoon. The letter is drafted",
          "Option B: air-freight the 60 units for batch 2, about NT$52,000",
        ],
        ask: "Owner decision: ask for the extension, or pay for air freight?",
        stake: 52000,
        stakeNote: "Air freight for 60 units NT$52,000, against NT$1,200 a day late plus a late mark on the vendor record",
        status: "owner",
        assignee: owner(next).id,
        movedFrom: nameOf(next, c.assignee),
        flash: "moved",
        history: [
          ...c.history,
          {
            at: stamp(next),
            text: `The delay makes batch 2 late. Taken off ${nameOf(next, c.assignee)} and sent to the owner.`,
          },
        ],
      }));
      next = log(next, "One order will miss its deadline because of the delay. Sent to the owner.", "owner");
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
    if (pool.length === 0) out.push({ label: cap.label, who: "nobody" });
  }
  return out;
}

export function openStake(state: State, shipmentId: string): { total: number; count: number } {
  const open = state.cards.filter(
    (c) => c.shipmentId === shipmentId && c.status !== "done" && c.stake > 0,
  );
  return { total: open.reduce((a, c) => a + c.stake, 0), count: open.length };
}
