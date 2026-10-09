import { useSyncExternalStore } from "react";
import { acceptContract, buyUpgrade, createInitialState, hire, startNextDay, tick } from "./sim/engine.ts";
import { clearStorage, loadFromStorage, saveToStorage } from "./sim/save.ts";
import type { ActionResult, GameState, UpgradeId } from "./sim/types.ts";

let state: GameState = createInitialState();
let savedAtBoot = false;
let booted = false;
let mode: "local" | "memoria" = "local";
let timer = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist(immediate: boolean) {
  if (typeof window === "undefined") return;
  window.clearTimeout(timer);
  if (immediate) {
    mode = saveToStorage(state);
    return;
  }
  timer = window.setTimeout(() => {
    mode = saveToStorage(state);
  }, 800);
}

function commit(next: GameState) {
  const notable =
    next.money !== state.money ||
    next.day !== state.day ||
    next.stats !== state.stats ||
    next.upgrades !== state.upgrades ||
    next.employees.length !== state.employees.length ||
    next.pausedByUser !== state.pausedByUser ||
    next.dayReport !== state.dayReport;
  state = next;
  emit();
  persist(notable);
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): GameState {
  return state;
}

export function boot() {
  if (booted) return;
  booted = true;
  const loaded = loadFromStorage();
  if (loaded) {
    state = loaded;
    savedAtBoot = true;
    mode = "local";
  }
}

export function hadSave(): boolean {
  return savedAtBoot;
}

export function storageLabel(): string {
  return mode === "local" ? "Salvo neste aparelho" : "Só nesta sessão";
}

export function useGame(): GameState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function beginFresh() {
  clearStorage();
  state = createInitialState();
  mode = saveToStorage(state);
  emit();
}

export function accept(id: string): ActionResult {
  const result = acceptContract(state, id);
  if (result.ok) commit(result.state);
  return result;
}

export function buy(id: UpgradeId): ActionResult {
  const result = buyUpgrade(state, id);
  if (result.ok) commit(result.state);
  return result;
}

export function employ(): ActionResult {
  const result = hire(state);
  if (result.ok) commit(result.state);
  return result;
}

export function nextDay() {
  const next = startNextDay(state);
  if (next !== state) commit(next);
}

export function togglePause() {
  commit({ ...state, pausedByUser: !state.pausedByUser });
}

export function toggleSpeed() {
  commit({ ...state, speed: state.speed === 1 ? 2 : 1 });
}

export function runSteps(count: number) {
  let next = state;
  for (let i = 0; i < count; i++) {
    const stepped = tick(next);
    if (stepped === next) break;
    next = stepped;
  }
  if (next !== state) commit(next);
}

export function flushSave() {
  if (typeof window === "undefined") return;
  window.clearTimeout(timer);
  mode = saveToStorage(state);
}
