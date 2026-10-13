import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankUpgrades } from "../sim/balance.ts";
import { createInitialState, hire, buyUpgrade } from "../sim/engine.ts";
import { actorView, blocked, findPath, furniture, homeOf, seatOf } from "./office-map.ts";

const empty = blankUpgrades();
const grown = { ...empty, desk: true, coffee: true, plants: true, monitors: true, seal: true };

describe("office grid", () => {
  it("keeps desks blocked and chairs walkable", () => {
    for (const upgrades of [empty, grown]) {
      const desks = furniture(upgrades).filter((item) => item.kind === "desk");
      for (const desk of desks) {
        assert.equal(blocked(desk.c, desk.r, upgrades), true);
      }
      const chairs = furniture(upgrades).filter((item) => item.kind === "chair");
      for (const chair of chairs) {
        assert.equal(blocked(chair.c, chair.r, upgrades), false);
      }
    }
    assert.equal(furniture(empty).some((item) => item.owner === "nara"), false);
    assert.equal(furniture(grown).some((item) => item.id === "chair-nara"), true);
  });

  it("walks Lina and Otto to their chairs without crossing furniture", () => {
    const state = createInitialState();
    for (const employee of state.employees) {
      const path = findPath(homeOf(employee.id), seatOf(employee.id), empty);
      assert.ok(path.length > 2);
      for (const cell of path) {
        assert.equal(blocked(cell.c, cell.r, empty), false);
        const desk = furniture(empty).find((item) => item.kind === "desk" && item.c === cell.c && item.r === cell.r);
        assert.equal(desk, undefined);
      }
      assert.equal(path[0]?.c, homeOf(employee.id).c);
      assert.equal(path.at(-1)?.r, seatOf(employee.id).r);
    }
  });

  it("sits a worker on the chair and keeps commuters off the desk", () => {
    const state = createInitialState();
    const lina = state.employees.find((employee) => employee.id === "lina");
    assert.ok(lina);
    const walking = actorView({ ...lina, phase: "commute", phaseTicks: 0 }, empty);
    assert.equal(walking.pose, "walk");
    assert.equal(Math.round(walking.c), homeOf("lina").c);
    const desk = furniture(empty).find((item) => item.id === "desk-lina");
    assert.ok(desk);
    assert.notEqual(Math.round(walking.r), desk.r);
    const working = actorView({ ...lina, phase: "working", phaseTicks: 3 }, empty);
    assert.equal(working.pose, "sit");
    assert.deepEqual({ c: working.c, r: working.r }, seatOf("lina"));
    assert.notEqual(working.r, desk.r);
  });

  it("places Nara on the third chair only after that desk exists", () => {
    let state = { ...createInitialState(), money: 2000 };
    const desk = buyUpgrade(state, "desk");
    assert.equal(desk.ok, true);
    if (!desk.ok) return;
    const hired = hire(desk.state);
    assert.equal(hired.ok, true);
    if (!hired.ok) return;
    state = hired.state;
    const nara = state.employees.find((employee) => employee.id === "nara");
    assert.ok(nara);
    const path = findPath(homeOf("nara"), seatOf("nara"), state.upgrades);
    assert.ok(path.length > 1);
    for (const cell of path) assert.equal(blocked(cell.c, cell.r, state.upgrades), false);
    const seated = actorView({ ...nara, phase: "working" }, state.upgrades);
    assert.equal(seated.pose, "sit");
    assert.deepEqual({ c: seated.c, r: seated.r }, seatOf("nara"));
  });
});
