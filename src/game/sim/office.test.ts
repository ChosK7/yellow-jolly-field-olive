import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIRE_COST, UPGRADE_CATALOG, contractPayout, productionPerTick } from "./balance.ts";
import {
  absoluteMinute,
  acceptContract,
  assignOptions,
  buyUpgrade,
  createInitialState,
  hire,
  previewAccept,
  startNextDay,
  tick,
} from "./engine.ts";
import { shouldSimulate } from "./loop-gate.ts";
import { hydrate, parseSave, serialize } from "./save.ts";
import type { GameState } from "./types.ts";

function devOffer(state: GameState) {
  const contract = state.contracts.find((item) => item.role === "dev" && item.status === "offered");
  assert.ok(contract);
  return contract;
}

describe("contract cycle", () => {
  it("accepts a contract, works it, and pays the office", () => {
    let state = createInitialState();
    const contract = devOffer(state);
    const pay = contract.pay;
    const rep = contract.reputation;
    state = {
      ...state,
      contracts: state.contracts.map((item) =>
        item.id === contract.id
          ? { ...item, workTotal: 16, deadlineAt: absoluteMinute(state.day, 18 * 60) }
          : item,
      ),
    };
    const accepted = acceptContract(state, contract.id);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    state = accepted.state;
    const lina = state.employees.find((employee) => employee.id === "lina");
    assert.equal(lina?.phase, "commute");
    assert.equal(lina?.contractId, contract.id);

    for (let i = 0; i < 5; i++) state = tick(state);
    assert.equal(state.employees.find((employee) => employee.id === "lina")?.phase, "commute");
    state = tick(state);
    assert.equal(state.employees.find((employee) => employee.id === "lina")?.phase, "working");
    assert.equal(state.contracts.find((item) => item.id === contract.id)?.workDone ?? 0, 0);

    const before = state.contracts.find((item) => item.id === contract.id)?.workDone ?? 0;
    state = tick(state);
    const after = state.contracts.find((item) => item.id === contract.id)?.workDone ?? 0;
    assert.ok(after > before);

    let guard = 0;
    while (state.contracts.some((item) => item.id === contract.id) && guard < 400) {
      state = tick(state);
      guard++;
    }
    assert.ok(guard < 400);
    assert.equal(state.dayReport, null);
    assert.equal(state.stats.done, 1);
    assert.equal(state.money, 90 + pay);
    assert.equal(state.reputation, 8 + rep);
    assert.equal(state.employees.find((employee) => employee.id === "lina")?.contractId, null);
    assert.equal(state.employees.find((employee) => employee.id === "lina")?.phase, "idle");
  });

  it("refuses a second dev contract while Lina is busy", () => {
    let state = createInitialState();
    const first = devOffer(state);
    const accepted = acceptContract(state, first.id);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    state = accepted.state;
    const extra = { ...first, id: "extra", status: "offered" as const, assigneeId: null, workDone: 0 };
    state = { ...state, contracts: [...state.contracts, extra] };
    const again = acceptContract(state, "extra");
    assert.equal(again.ok, false);
  });

  it("fails a contract that misses the deadline", () => {
    let state = createInitialState();
    const contract = devOffer(state);
    const accepted = acceptContract(state, contract.id);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    state = accepted.state;
    const now = absoluteMinute(state.day, state.minute);
    state = {
      ...state,
      contracts: state.contracts.map((item) =>
        item.id === contract.id ? { ...item, deadlineAt: now + 1, workTotal: 9999 } : item,
      ),
    };
    state = tick(state);
    assert.equal(state.stats.failed, 1);
    assert.equal(state.reputation, 0);
    assert.equal(state.employees.find((employee) => employee.id === "lina")?.contractId, null);
    assert.equal(
      state.contracts.some((item) => item.id === contract.id),
      false,
    );
  });

  it("rejects an offer that cannot fit the deadline", () => {
    const state = createInitialState();
    const contract = devOffer(state);
    const tight = {
      ...state,
      minute: 17 * 60,
      contracts: state.contracts.map((item) =>
        item.id === contract.id ? { ...item, deadlineAt: absoluteMinute(state.day, 18 * 60), workTotal: 80 } : item,
      ),
    };
    const preview = previewAccept(tight, contract.id);
    assert.equal(preview.ok, false);
  });

  it("asks who takes the job when two people of the same role are free", () => {
    const state = createInitialState();
    const contract = devOffer(state);
    const withLia = {
      ...state,
      employees: [
        ...state.employees,
        {
          id: "lia",
          name: "Lia Souza",
          role: "dev" as const,
          skill: 3.2,
          energy: 80,
          contractId: null,
          phase: "idle" as const,
          phaseTicks: 0,
          sprite: "lina" as const,
        },
      ],
    };
    const options = assignOptions(withLia, contract.id);
    assert.equal(options.ok, true);
    if (!options.ok) return;
    assert.equal(options.options.length, 2);
    assert.equal(acceptContract(withLia, contract.id).ok, false);
    const accepted = acceptContract(withLia, contract.id, "lia");
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.state.employees.find((employee) => employee.id === "lia")?.phase, "commute");
    assert.equal(accepted.state.contracts.find((item) => item.id === contract.id)?.assigneeId, "lia");
    assert.equal(accepted.state.employees.find((employee) => employee.id === "lina")?.contractId, null);
  });
});

describe("office evolution", () => {
  it("spends money on an upgrade once", () => {
    const rich = { ...createInitialState(), money: 500 };
    const bought = buyUpgrade(rich, "coffee");
    assert.equal(bought.ok, true);
    if (!bought.ok) return;
    assert.equal(bought.state.upgrades.coffee, true);
    assert.equal(bought.state.money, 500 - UPGRADE_CATALOG.coffee.cost);
    assert.equal(buyUpgrade(bought.state, "coffee").ok, false);
    assert.equal(buyUpgrade(createInitialState(), "plants").ok, false);
  });

  it("opens an operations seat only after the third desk", () => {
    let state = { ...createInitialState(), money: 2000 };
    assert.equal(hire(state).ok, false);
    const desk = buyUpgrade(state, "desk");
    assert.equal(desk.ok, true);
    if (!desk.ok) return;
    const hired = hire(desk.state);
    assert.equal(hired.ok, true);
    if (!hired.ok) return;
    state = hired.state;
    assert.equal(state.employees.length, 3);
    assert.equal(state.money, 2000 - UPGRADE_CATALOG.desk.cost - HIRE_COST);
    assert.equal(hire(state).ok, false);
    const ops = state.contracts.find((contract) => contract.role === "ops");
    assert.ok(ops);
    const accepted = acceptContract(state, ops.id);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.state.employees.find((employee) => employee.id === "nara")?.phase, "commute");
  });

  it("pays more after the house seal", () => {
    assert.equal(contractPayout(200, false), 200);
    assert.equal(contractPayout(200, true), 230);
    const employee = createInitialState().employees[0];
    assert.ok(employee);
    const plain = productionPerTick(employee, createInitialState().upgrades);
    const boosted = productionPerTick(employee, { ...createInitialState().upgrades, monitors: true, plants: true });
    assert.ok(Math.abs(boosted / plain - 1.25 * 1.08) < 1e-9);
  });
});

describe("days and saves", () => {
  it("closes the day and carries a long contract into the next morning", () => {
    let state = createInitialState();
    const contract = devOffer(state);
    const accepted = acceptContract(state, contract.id);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    state = accepted.state;
    state = {
      ...state,
      contracts: state.contracts.map((item) =>
        item.id === contract.id
          ? { ...item, deadlineAt: absoluteMinute(state.day + 1, 18 * 60), workTotal: 9999 }
          : item,
      ),
    };
    let guard = 0;
    while (!state.dayReport && guard < 400) {
      state = tick(state);
      guard++;
    }
    assert.ok(state.dayReport);
    assert.equal(state.minute, 18 * 60);
    assert.equal(state.contracts.some((item) => item.id === contract.id), true);
    const frozen = tick(state);
    assert.equal(frozen, state);
    const doneBefore = state.contracts.find((item) => item.id === contract.id)?.workDone ?? 0;
    state = startNextDay(state);
    assert.equal(state.day, 2);
    assert.equal(state.dayReport, null);
    assert.equal(state.contracts.filter((item) => item.status === "offered").length, 3);
    state = tick(state);
    const doneAfter = state.contracts.find((item) => item.id === contract.id)?.workDone ?? 0;
    assert.ok(doneAfter > doneBefore);
  });

  it("round-trips a save and migrates a missing version", () => {
    const state = createInitialState();
    const back = parseSave(serialize(state));
    assert.ok(back);
    assert.equal(back?.money, state.money);
    assert.equal(back?.employees.length, 2);
    const raw = JSON.parse(serialize(state)) as { version?: number };
    delete raw.version;
    const migrated = hydrate(raw);
    assert.equal(migrated?.version, 1);
    assert.equal(migrated?.employees[0]?.id, "lina");
    assert.equal(parseSave("{"), null);
    assert.equal(hydrate({ version: 1, money: "nope" }), null);
  });
});

describe("background pause", () => {
  it("does not simulate while hidden, paused, or at dusk", () => {
    assert.equal(shouldSimulate({ playing: true, hidden: false, paused: false, dusk: false }), true);
    assert.equal(shouldSimulate({ playing: true, hidden: true, paused: false, dusk: false }), false);
    assert.equal(shouldSimulate({ playing: true, hidden: false, paused: true, dusk: false }), false);
    assert.equal(shouldSimulate({ playing: true, hidden: false, paused: false, dusk: true }), false);
    assert.equal(shouldSimulate({ playing: false, hidden: false, paused: false, dusk: false }), false);
  });
});
