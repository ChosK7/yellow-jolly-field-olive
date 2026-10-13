import { BREAK_TICKS, COMMUTE_TICKS } from "../sim/balance.ts";
import type { Employee, Upgrades } from "../sim/types.ts";

export const COLS = 8;
export const ROWS = 12;

export type Cell = { c: number; r: number };
export type Dir = "n" | "e" | "s" | "w";
export type Pose = "walk" | "sit" | "stand" | "rest";
export type FurnKind = "desk" | "chair" | "pc" | "printer" | "coffee" | "plant" | "bench" | "seal";

export type Furn = {
  id: string;
  kind: FurnKind;
  c: number;
  r: number;
  blocks: boolean;
  owner?: string;
};

export type ActorView = {
  id: string;
  c: number;
  r: number;
  pose: Pose;
  dir: Dir;
};

const SEAT: Record<string, Cell> = {
  lina: { c: 2, r: 3 },
  otto: { c: 5, r: 3 },
  nara: { c: 3, r: 7 },
};

const HOME: Record<string, Cell> = {
  lina: { c: 2, r: 8 },
  otto: { c: 5, r: 8 },
  nara: { c: 5, r: 9 },
};

const DESK: Record<string, Cell> = {
  lina: { c: 2, r: 2 },
  otto: { c: 5, r: 2 },
  nara: { c: 3, r: 6 },
};

function same(a: Cell, b: Cell): boolean {
  return a.c === b.c && a.r === b.r;
}

function key(c: number, r: number): number {
  return c + r * COLS;
}

export function seatOf(id: string): Cell {
  return SEAT[id] ?? SEAT.lina ?? { c: 2, r: 3 };
}

export function homeOf(id: string): Cell {
  return HOME[id] ?? HOME.lina ?? { c: 2, r: 7 };
}

export function isWall(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  if (r === 0 || c === 0 || c === COLS - 1) return true;
  if (r === ROWS - 1) return !(c === 3 || c === 4);
  return false;
}

export function isWindow(c: number, r: number): boolean {
  return r === 0 && (c === 2 || c === 3 || c === 5);
}

export function isDoor(c: number, r: number): boolean {
  return r === ROWS - 1 && (c === 3 || c === 4);
}

export function furniture(upgrades: Upgrades): Furn[] {
  const items: Furn[] = [
    { id: "desk-lina", kind: "desk", ...DESK.lina!, blocks: true, owner: "lina" },
    { id: "pc-lina", kind: "pc", ...DESK.lina!, blocks: false, owner: "lina" },
    { id: "chair-lina", kind: "chair", ...SEAT.lina!, blocks: false, owner: "lina" },
    { id: "desk-otto", kind: "desk", ...DESK.otto!, blocks: true, owner: "otto" },
    { id: "pc-otto", kind: "pc", ...DESK.otto!, blocks: false, owner: "otto" },
    { id: "chair-otto", kind: "chair", ...SEAT.otto!, blocks: false, owner: "otto" },
    { id: "printer", kind: "printer", c: 6, r: 5, blocks: true },
    { id: "bench", kind: "bench", c: 3, r: 10, blocks: false },
  ];
  if (upgrades.desk) {
    items.push(
      { id: "desk-nara", kind: "desk", ...DESK.nara!, blocks: true, owner: "nara" },
      { id: "pc-nara", kind: "pc", ...DESK.nara!, blocks: false, owner: "nara" },
      { id: "chair-nara", kind: "chair", ...SEAT.nara!, blocks: false, owner: "nara" },
    );
  }
  if (upgrades.coffee) items.push({ id: "coffee", kind: "coffee", c: 1, r: 5, blocks: true });
  if (upgrades.plants) {
    items.push(
      { id: "plant-w", kind: "plant", c: 1, r: 2, blocks: true },
      { id: "plant-e", kind: "plant", c: 6, r: 2, blocks: true },
    );
  }
  if (upgrades.seal) items.push({ id: "seal", kind: "seal", c: 4, r: 0, blocks: false });
  return items;
}

export function blocked(c: number, r: number, upgrades: Upgrades): boolean {
  if (isWall(c, r)) return true;
  return furniture(upgrades).some((item) => item.blocks && item.c === c && item.r === r);
}

export function findPath(from: Cell, to: Cell, upgrades: Upgrades): Cell[] {
  if (same(from, to)) return [from];
  const startKey = key(from.c, from.r);
  const prev = new Map<number, number>();
  prev.set(startKey, -1);
  const queue: Cell[] = [from];
  const steps: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    for (const [dc, dr] of steps) {
      const c = cur.c + dc;
      const r = cur.r + dr;
      const k = key(c, r);
      if (prev.has(k)) continue;
      const dest = c === to.c && r === to.r;
      if (!dest && blocked(c, r, upgrades)) continue;
      prev.set(k, key(cur.c, cur.r));
      if (dest) {
        const out: Cell[] = [];
        let walk: number | undefined = k;
        while (walk !== undefined && walk !== -1) {
          out.push({ c: walk % COLS, r: Math.floor(walk / COLS) });
          walk = prev.get(walk);
        }
        return out.reverse();
      }
      queue.push({ c, r });
    }
  }
  return [from];
}

function restCell(id: string, upgrades: Upgrades): Cell {
  const slot = id === "otto" ? 1 : id === "nara" ? 2 : 0;
  if (upgrades.coffee) return { c: 2 + slot, r: 5 };
  return { c: 2 + slot, r: 10 };
}

function dirOf(a: Cell, b: Cell, fallback: Dir): Dir {
  if (b.c > a.c) return "e";
  if (b.c < a.c) return "w";
  if (b.r > a.r) return "s";
  if (b.r < a.r) return "n";
  return fallback;
}

function along(path: Cell[], t: number, fallback: Dir): { c: number; r: number; dir: Dir } {
  if (path.length === 0) return { c: 0, r: 0, dir: fallback };
  const last = path[path.length - 1] ?? path[0];
  if (!last) return { c: 0, r: 0, dir: fallback };
  if (path.length === 1 || t <= 0) return { ...path[0]!, dir: fallback };
  if (t >= 1) return { ...last, dir: dirOf(path[path.length - 2] ?? last, last, fallback) };
  const dist = t * (path.length - 1);
  const index = Math.floor(dist);
  const frac = dist - index;
  const a = path[index] ?? last;
  const b = path[Math.min(path.length - 1, index + 1)] ?? a;
  return {
    c: a.c + (b.c - a.c) * frac,
    r: a.r + (b.r - a.r) * frac,
    dir: dirOf(a, b, fallback),
  };
}

export function actorView(employee: Employee, upgrades: Upgrades): ActorView {
  const seat = seatOf(employee.id);
  const home = homeOf(employee.id);
  if (employee.phase === "working") {
    return { id: employee.id, ...seat, pose: "sit", dir: "n" };
  }
  if (employee.phase === "commute") {
    const path = findPath(home, seat, upgrades);
    const step = along(path, employee.phaseTicks / COMMUTE_TICKS, "n");
    return { id: employee.id, ...step, pose: "walk" };
  }
  if (employee.phase === "break") {
    const rest = restCell(employee.id, upgrades);
    const t = Math.max(0, Math.min(1, employee.phaseTicks / BREAK_TICKS));
    if (t < 0.34) {
      const step = along(findPath(seat, rest, upgrades), t / 0.34, "s");
      return { id: employee.id, ...step, pose: "walk" };
    }
    if (t < 0.67) return { id: employee.id, ...rest, pose: "rest", dir: "s" };
    const step = along(findPath(rest, seat, upgrades), (t - 0.67) / 0.33, "n");
    return { id: employee.id, ...step, pose: "walk" };
  }
  return { id: employee.id, ...home, pose: "stand", dir: "s" };
}
