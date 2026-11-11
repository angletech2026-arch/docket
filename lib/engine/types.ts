export type Skill =
  | "inquiry"
  | "purchasing"
  | "finance"
  | "customs"
  | "logistics"
  | "warehouse"
  | "gov"
  | "broker"
  | "trucking"
  | "forklift";

export type Person = {
  id: string;
  name: string;
  role: string;
  /** 1 = anyone, 2 = experienced, 3 = owner */
  level: 1 | 2 | 3;
  skills: Skill[];
  /** outside the company: customs broker, trucker, forklift vendor */
  external?: boolean;
  active: boolean;
};

export type CardKind =
  | "inquiry"
  | "order"
  | "shipmode"
  | "fx"
  | "ccc"
  | "broker"
  | "trucking"
  | "forklift"
  | "crew"
  | "putaway"
  | "gov"
  | "quarantine"
  | "foodcheck"
  | "expiry"
  | "shrinkage"
  | "repack";

export type CardStatus = "ready" | "waiting" | "owner" | "done";

export type HistoryEntry = { at: string; text: string };

export type Card = {
  id: string;
  shipmentId: string;
  kind: CardKind;
  /** short stage label printed on the ticket */
  stage: string;
  /** the specific thing to decide, in trade terms */
  title: string;
  /** what the AI already did on this card */
  prepared: string[];
  /** what the person is asked to decide */
  ask: string;
  skill: Skill;
  minLevel: 1 | 2 | 3;
  status: CardStatus;
  assignee: string | null;
  /** NT$ that depends on this decision */
  stake: number;
  /** how the stake was worked out */
  stakeNote: string;
  due: string;
  history: HistoryEntry[];
  /** set when the card just changed hands or content, for a highlight */
  flash?: "moved" | "changed" | "new";
  movedFrom?: string;
};

export type Shipment = {
  id: string;
  title: string;
  sub: string;
  eta: string;
  /** NT$ gross margin expected once everything on this shipment has sold */
  margin: number;
  marginPct: number;
  /** how much of it is already sold, and how long the rest sits in stock */
  sold: string;
};

export type GlossaryEntry = {
  term: string;
  meaning: string;
  sku?: string;
  /** who taught it, or the public source */
  by: string;
};

export type LogEntry = { id: number; text: string; tone?: "event" | "owner" | "plain" };

export type Capability = { label: string; skill: Skill; minLevel: 1 | 2 | 3 };

export type CompanyId = "auto" | "grain";

export type State = {
  company: CompanyId;
  companyName: string;
  companyNote: string;
  today: string;
  people: Person[];
  shipments: Shipment[];
  cards: Card[];
  glossary: GlossaryEntry[];
  capabilities: Capability[];
  log: LogEntry[];
  seq: number;
  typhoon: boolean;
};

export type Action =
  | { type: "reset"; company: CompanyId }
  | { type: "approve"; cardId: string; note?: string }
  | { type: "escalate"; cardId: string; why: string }
  | { type: "teach"; term: string; meaning: string; sku?: string; by: string; cardId: string }
  | { type: "typhoon" }
  | { type: "quit"; personId: string }
  | { type: "setStake"; cardId: string; stake: number; stakeNote: string; prepared?: string[] }
  | { type: "clearFlash" };
