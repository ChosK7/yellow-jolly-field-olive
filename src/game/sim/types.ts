export const SAVE_VERSION = 1;

export type Role = "dev" | "design" | "ops";
export type UpgradeId = "plants" | "coffee" | "monitors" | "desk" | "seal";
export type Phase = "idle" | "commute" | "working" | "break";
export type SpriteId = "lina" | "otto" | "nara";
export type ContractStatus = "offered" | "active";

export type Upgrades = Record<UpgradeId, boolean>;

export interface Employee {
  id: string;
  name: string;
  role: Role;
  skill: number;
  energy: number;
  contractId: string | null;
  phase: Phase;
  phaseTicks: number;
  sprite: SpriteId;
}

export interface Contract {
  id: string;
  client: string;
  title: string;
  detail: string;
  role: Role;
  workTotal: number;
  workDone: number;
  pay: number;
  reputation: number;
  deadlineAt: number;
  status: ContractStatus;
  assigneeId: string | null;
}

export interface LogLine {
  id: number;
  text: string;
}

export interface DayReport {
  day: number;
  earned: number;
  done: number;
  failed: number;
  note: string;
}

export interface Stats {
  done: number;
  failed: number;
  earned: number;
}

export interface GameState {
  version: number;
  money: number;
  reputation: number;
  day: number;
  minute: number;
  speed: 1 | 2;
  pausedByUser: boolean;
  employees: Employee[];
  contracts: Contract[];
  upgrades: Upgrades;
  seq: number;
  logSeq: number;
  log: LogLine[];
  stats: Stats;
  dayReport: DayReport | null;
  dayEarned: number;
  dayDone: number;
  dayFailed: number;
}

export type ActionResult = { ok: true; state: GameState } | { ok: false; reason: string };

export type Preview =
  | { ok: true; employeeId: string; etaMinutes: number }
  | { ok: false; reason: string };
