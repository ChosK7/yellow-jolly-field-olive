import type { Employee, Role, UpgradeId, Upgrades } from "./types.ts";

export const MINUTES_PER_TICK = 2;
export const WORK_START = 9 * 60;
export const WORK_END = 18 * 60;
export const COMMUTE_TICKS = 6;
export const BREAK_TICKS = 8;
export const BREAK_AT = 22;
export const FAIL_REP = 8;
export const START_MONEY = 90;
export const HIRE_COST = 180;

export const ROLE_LABEL: Record<Role, string> = {
  dev: "Desenvolvimento",
  design: "Design",
  ops: "Operações",
};

export const UPGRADE_LIST: UpgradeId[] = ["plants", "coffee", "monitors", "desk", "seal"];

export const UPGRADE_CATALOG: Record<UpgradeId, { name: string; cost: number; blurb: string }> = {
  plants: {
    name: "Plantas e luz",
    cost: 150,
    blurb: "O foco sobe um pouco. A sala deixa de parecer depósito.",
  },
  coffee: {
    name: "Cafeteira",
    cost: 200,
    blurb: "O cansaço cai e a pausa devolve mais energia.",
  },
  monitors: {
    name: "Monitores novos",
    cost: 280,
    blurb: "Todo mundo produz 25% mais.",
  },
  desk: {
    name: "Terceira mesa",
    cost: 340,
    blurb: "A sala se reorganiza e abre vaga para mais uma pessoa.",
  },
  seal: {
    name: "Selo da casa",
    cost: 460,
    blurb: "O escritório já assina o trabalho. Entregas pagam 15% a mais.",
  },
};

export function blankUpgrades(): Upgrades {
  return { plants: false, coffee: false, monitors: false, desk: false, seal: false };
}

export function deskCount(upgrades: Upgrades): number {
  return upgrades.desk ? 3 : 2;
}

export function contractPayout(pay: number, seal: boolean): number {
  return seal ? Math.round(pay * 1.15) : pay;
}

export function energyDrainPerTick(coffee: boolean): number {
  return (coffee ? 0.11 : 0.26) * MINUTES_PER_TICK;
}

export function productionPerTick(employee: Employee, upgrades: Upgrades): number {
  const hours = MINUTES_PER_TICK / 60;
  const energy = Math.max(0, Math.min(100, employee.energy));
  const energyFactor = 0.5 + 0.5 * (energy / 100);
  const monitor = upgrades.monitors ? 1.25 : 1;
  const plants = upgrades.plants ? 1.08 : 1;
  return employee.skill * hours * energyFactor * monitor * plants;
}

export function officeLine(upgrades: Upgrades): string {
  if (upgrades.desk && upgrades.seal) return "Três mesas, e um nome que o cliente já reconhece.";
  if (upgrades.desk) return "A terceira mesa abriu o canto de baixo.";
  if (upgrades.coffee || upgrades.plants || upgrades.monitors) {
    return "A sala começa a parecer de vocês.";
  }
  return "Uma sala, duas mesas, luz de fim de tarde.";
}

export function activeEffects(upgrades: Upgrades): string[] {
  const fx: string[] = [];
  if (upgrades.coffee) fx.push("Cansaço menor");
  if (upgrades.monitors) fx.push("Produção +25%");
  if (upgrades.plants) fx.push("Foco +8%");
  if (upgrades.seal) fx.push("Pagamento +15%");
  if (upgrades.desk) fx.push("Três mesas");
  return fx;
}
