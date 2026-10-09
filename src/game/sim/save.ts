import { blankUpgrades } from "./balance.ts";
import type { Contract, Employee, GameState, LogLine, Phase, Role, SpriteId, Stats, Upgrades } from "./types.ts";
import { SAVE_VERSION } from "./types.ts";

const KEY = "office-story-save";
const BAK = "office-story-save-bak";

const ROLES = new Set<Role>(["dev", "design", "ops"]);
const PHASES = new Set<Phase>(["idle", "commute", "working", "break"]);
const SPRITES = new Set<SpriteId>(["lina", "otto", "nara"]);

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const copy = { ...(raw as Record<string, unknown>) };
  if (copy.version == null) copy.version = SAVE_VERSION;
  return copy;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseEmployee(value: unknown): Employee | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Partial<Employee>;
  if (typeof e.id !== "string" || typeof e.name !== "string") return null;
  if (!ROLES.has(e.role as Role) || !PHASES.has(e.phase as Phase) || !SPRITES.has(e.sprite as SpriteId)) return null;
  if (typeof e.skill !== "number") return null;
  return {
    id: e.id,
    name: e.name,
    role: e.role as Role,
    skill: e.skill,
    energy: num(e.energy, 100),
    contractId: typeof e.contractId === "string" ? e.contractId : null,
    phase: e.phase as Phase,
    phaseTicks: num(e.phaseTicks, 0),
    sprite: e.sprite as SpriteId,
  };
}

function parseContract(value: unknown): Contract | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<Contract>;
  if (typeof c.id !== "string" || typeof c.client !== "string" || typeof c.title !== "string") return null;
  if (!ROLES.has(c.role as Role)) return null;
  if (c.status !== "offered" && c.status !== "active") return null;
  if (typeof c.workTotal !== "number" || typeof c.pay !== "number" || typeof c.deadlineAt !== "number") return null;
  return {
    id: c.id,
    client: c.client,
    title: c.title,
    detail: typeof c.detail === "string" ? c.detail : "",
    role: c.role as Role,
    workTotal: c.workTotal,
    workDone: num(c.workDone, 0),
    pay: c.pay,
    reputation: num(c.reputation, 0),
    deadlineAt: c.deadlineAt,
    status: c.status,
    assigneeId: typeof c.assigneeId === "string" ? c.assigneeId : null,
  };
}

function parseUpgrades(value: unknown): Upgrades {
  const base = blankUpgrades();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<Upgrades>;
  (Object.keys(base) as (keyof Upgrades)[]).forEach((key) => {
    base[key] = raw[key] === true;
  });
  return base;
}

function parseLog(value: unknown): { log: LogLine[]; logSeq: number } {
  if (!Array.isArray(value)) return { log: [], logSeq: 0 };
  const log: LogLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const line = item as Partial<LogLine>;
    if (typeof line.text !== "string") continue;
    log.push({ id: num(line.id, log.length + 1), text: line.text });
    if (log.length >= 8) break;
  }
  const logSeq = log.reduce((max, line) => Math.max(max, line.id), 0);
  return { log, logSeq };
}

export function hydrate(raw: unknown): GameState | null {
  const migrated = migrate(raw);
  if (!migrated || typeof migrated !== "object") return null;
  const o = migrated as Partial<GameState>;
  if (o.version !== SAVE_VERSION) return null;
  if (!Array.isArray(o.employees)) return null;
  const employees = o.employees.map(parseEmployee);
  if (employees.some((employee) => employee === null) || employees.length < 2 || employees.length > 3) return null;
  const contracts = Array.isArray(o.contracts)
    ? o.contracts.map(parseContract).filter((contract): contract is Contract => contract !== null)
    : [];
  const statsRaw = (o.stats ?? {}) as Partial<Stats>;
  const logged = parseLog(o.log);
  const minute = Math.max(0, Math.min(1439, Math.round(num(o.minute, 9 * 60))));
  let dayReport = null;
  if (o.dayReport && typeof o.dayReport === "object") {
    const report = o.dayReport;
    dayReport = {
      day: num(report.day, num(o.day, 1)),
      earned: num(report.earned, 0),
      done: num(report.done, 0),
      failed: num(report.failed, 0),
      note: typeof report.note === "string" ? report.note : "",
    };
  }
  return {
    version: SAVE_VERSION,
    money: num(o.money, 0),
    reputation: Math.max(0, num(o.reputation, 0)),
    day: Math.max(1, Math.round(num(o.day, 1))),
    minute,
    speed: o.speed === 2 ? 2 : 1,
    pausedByUser: o.pausedByUser === true,
    employees: employees as Employee[],
    contracts,
    upgrades: parseUpgrades(o.upgrades),
    seq: Math.max(1, Math.round(num(o.seq, 1))),
    logSeq: Math.max(logged.logSeq, num(o.logSeq, logged.logSeq)),
    log: logged.log,
    stats: {
      done: num(statsRaw.done, 0),
      failed: num(statsRaw.failed, 0),
      earned: num(statsRaw.earned, 0),
    },
    dayReport,
    dayEarned: num(o.dayEarned, 0),
    dayDone: num(o.dayDone, 0),
    dayFailed: num(o.dayFailed, 0),
  };
}

export function parseSave(text: string): GameState | null {
  try {
    return hydrate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function loadFromStorage(): GameState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const primary = localStorage.getItem(KEY);
    if (primary) {
      const parsed = parseSave(primary);
      if (parsed) return parsed;
    }
    const backup = localStorage.getItem(BAK);
    if (backup) return parseSave(backup);
    return null;
  } catch {
    return null;
  }
}

export function saveToStorage(state: GameState): "local" | "memoria" {
  if (typeof localStorage === "undefined") return "memoria";
  try {
    const prev = localStorage.getItem(KEY);
    if (prev) localStorage.setItem(BAK, prev);
    localStorage.setItem(KEY, serialize(state));
    return "local";
  } catch {
    return "memoria";
  }
}

export function clearStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BAK);
  } catch {
    /* private mode */
  }
}
