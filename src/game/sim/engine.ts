import {
  BREAK_AT,
  BREAK_TICKS,
  COMMUTE_TICKS,
  FAIL_REP,
  HIRE_COST,
  MINUTES_PER_TICK,
  START_MONEY,
  WORK_END,
  WORK_START,
  blankUpgrades,
  contractPayout,
  deskCount,
  energyDrainPerTick,
  productionPerTick,
  UPGRADE_CATALOG,
} from "./balance.ts";
import { firstName, formatMoney } from "./format.ts";
import type {
  ActionResult,
  Contract,
  Employee,
  GameState,
  Preview,
  Role,
  UpgradeId,
} from "./types.ts";
import { SAVE_VERSION } from "./types.ts";

interface Template {
  role: Role;
  client: string;
  title: string;
  detail: string;
  work: number;
  pay: number;
  rep: number;
  due: 0 | 1;
}

const TEMPLATES: Template[] = [
  {
    role: "dev",
    client: "Padaria Sol",
    title: "Cardápio no celular",
    detail: "O pão do dia, o preço, e um botão de encomenda. Sem firula.",
    work: 20,
    pay: 210,
    rep: 6,
    due: 0,
  },
  {
    role: "dev",
    client: "Clínica Norte",
    title: "Agenda de consultas",
    detail: "Encaixar horário sem a recepção perder o fio.",
    work: 30,
    pay: 320,
    rep: 10,
    due: 1,
  },
  {
    role: "dev",
    client: "Horta da Vila",
    title: "Cesta por assinatura",
    detail: "A pessoa escolhe a cesta e paga sem ir à feira.",
    work: 24,
    pay: 260,
    rep: 8,
    due: 0,
  },
  {
    role: "design",
    client: "Estúdio Lume",
    title: "Marca da feira",
    detail: "Um carimbo que caiba num banner de rua e numa sacola.",
    work: 18,
    pay: 200,
    rep: 8,
    due: 0,
  },
  {
    role: "design",
    client: "Rádio Barco",
    title: "Capa da semana",
    detail: "A grade precisa chamar, não parecer edital.",
    work: 16,
    pay: 180,
    rep: 7,
    due: 0,
  },
  {
    role: "design",
    client: "Livraria Beco",
    title: "Vitrine de outono",
    detail: "A vitrine troca de pele. A loja continua a mesma.",
    work: 22,
    pay: 240,
    rep: 9,
    due: 1,
  },
  {
    role: "ops",
    client: "Oficina 12",
    title: "Controle de estoque",
    detail: "Peça que entra, peça que sai, sem caderno rasurado.",
    work: 20,
    pay: 230,
    rep: 8,
    due: 0,
  },
  {
    role: "ops",
    client: "Café Miúdo",
    title: "Escala da semana",
    detail: "Quem abre, quem fecha, ninguém em dobro no domingo.",
    work: 14,
    pay: 160,
    rep: 6,
    due: 0,
  },
  {
    role: "ops",
    client: "Feira da Vila",
    title: "Fluxo dos boxes",
    detail: "Os produtores entram antes do sol esquentar.",
    work: 18,
    pay: 190,
    rep: 7,
    due: 1,
  },
];

const LINA: Employee = {
  id: "lina",
  name: "Lina Costa",
  role: "dev",
  skill: 4.6,
  energy: 100,
  contractId: null,
  phase: "idle",
  phaseTicks: 0,
  sprite: "lina",
};

const OTTO: Employee = {
  id: "otto",
  name: "Otto Ferreira",
  role: "design",
  skill: 4.2,
  energy: 100,
  contractId: null,
  phase: "idle",
  phaseTicks: 0,
  sprite: "otto",
};

const NARA: Employee = {
  id: "nara",
  name: "Nara Mendes",
  role: "ops",
  skill: 4,
  energy: 100,
  contractId: null,
  phase: "idle",
  phaseTicks: 0,
  sprite: "nara",
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function absoluteMinute(day: number, minute: number): number {
  return (day - 1) * 1440 + minute;
}

function pushLog(state: GameState, text: string): Pick<GameState, "log" | "logSeq"> {
  const logSeq = state.logSeq + 1;
  return { logSeq, log: [{ id: logSeq, text }, ...state.log].slice(0, 8) };
}

function makeOffers(day: number, seqStart: number, reputation: number): { contracts: Contract[]; seq: number } {
  const rand = mulberry32(day * 997 + 13);
  let seq = seqStart;
  const scale = 1 + Math.max(0, reputation - 8) * 0.012;
  const contracts: Contract[] = [];
  const roles: Role[] = ["dev", "design", "ops"];
  for (const role of roles) {
    const pool = TEMPLATES.filter((item) => item.role === role);
    const pick = pool[Math.floor(rand() * pool.length)] ?? pool[0];
    if (!pick) continue;
    contracts.push({
      id: `c${seq++}`,
      client: pick.client,
      title: pick.title,
      detail: pick.detail,
      role,
      workTotal: pick.work,
      workDone: 0,
      pay: Math.round(pick.pay * scale),
      reputation: pick.rep,
      deadlineAt: absoluteMinute(day + pick.due, WORK_END),
      status: "offered",
      assigneeId: null,
    });
  }
  return { contracts, seq };
}

export function createInitialState(): GameState {
  const made = makeOffers(1, 1, 8);
  return {
    version: SAVE_VERSION,
    money: START_MONEY,
    reputation: 8,
    day: 1,
    minute: WORK_START,
    speed: 1,
    pausedByUser: false,
    employees: [{ ...LINA }, { ...OTTO }],
    contracts: made.contracts,
    upgrades: blankUpgrades(),
    seq: made.seq,
    logSeq: 1,
    log: [{ id: 1, text: "O quadro abriu. Escolha um contrato para a manhã." }],
    stats: { done: 0, failed: 0, earned: 0 },
    dayReport: null,
    dayEarned: 0,
    dayDone: 0,
    dayFailed: 0,
  };
}

function applyWork(state: GameState): GameState {
  const employees = state.employees.map((employee) => ({ ...employee }));
  const contracts = state.contracts.map((contract) => ({ ...contract }));
  let money = state.money;
  let reputation = state.reputation;
  let dayEarned = state.dayEarned;
  let dayDone = state.dayDone;
  let stats = state.stats;
  let log = state.log;
  let logSeq = state.logSeq;
  const removed = new Set<string>();
  const coffee = state.upgrades.coffee;

  const note = (text: string) => {
    logSeq += 1;
    log = [{ id: logSeq, text }, ...log].slice(0, 8);
  };

  for (const employee of employees) {
    if (employee.phase === "commute") {
      employee.phaseTicks += 1;
      if (employee.phaseTicks >= COMMUTE_TICKS) {
        employee.phase = "working";
        employee.phaseTicks = 0;
      }
      continue;
    }

    if (employee.phase === "break") {
      employee.phaseTicks += 1;
      if (employee.phaseTicks >= BREAK_TICKS) {
        employee.energy = Math.min(100, employee.energy + (coffee ? 40 : 26));
        employee.phase = employee.contractId ? "working" : "idle";
        employee.phaseTicks = 0;
      }
      continue;
    }

    if (employee.phase === "working" && employee.contractId) {
      const contract = contracts.find((item) => item.id === employee.contractId && item.status === "active");
      if (!contract) {
        employee.phase = "idle";
        employee.contractId = null;
        employee.phaseTicks = 0;
        continue;
      }
      if (employee.energy <= BREAK_AT) {
        employee.phase = "break";
        employee.phaseTicks = 0;
        continue;
      }
      contract.workDone = Math.min(contract.workTotal, contract.workDone + productionPerTick(employee, state.upgrades));
      employee.energy = Math.max(0, employee.energy - energyDrainPerTick(coffee));
      if (contract.workDone >= contract.workTotal - 1e-6) {
        const pay = contractPayout(contract.pay, state.upgrades.seal);
        money += pay;
        reputation += contract.reputation;
        dayEarned += pay;
        dayDone += 1;
        stats = { done: stats.done + 1, failed: stats.failed, earned: stats.earned + pay };
        note(`${firstName(employee.name)} entregou ${contract.title}. +${formatMoney(pay)}.`);
        removed.add(contract.id);
        employee.contractId = null;
        employee.phase = "idle";
        employee.phaseTicks = 0;
      }
      continue;
    }

    employee.energy = Math.min(100, employee.energy + 0.12 * MINUTES_PER_TICK);
  }

  return {
    ...state,
    employees,
    contracts: contracts.filter((contract) => !removed.has(contract.id)),
    money,
    reputation,
    dayEarned,
    dayDone,
    stats,
    log,
    logSeq,
  };
}

function resolveDeadlines(state: GameState): GameState {
  const now = absoluteMinute(state.day, state.minute);
  const doomed = state.contracts.filter((contract) => contract.status === "active" && now >= contract.deadlineAt);
  if (doomed.length === 0) return state;
  const drop = new Set(doomed.map((contract) => contract.id));
  let reputation = state.reputation;
  let dayFailed = state.dayFailed;
  let stats = state.stats;
  let log = state.log;
  let logSeq = state.logSeq;
  for (const contract of doomed) {
    reputation = Math.max(0, reputation - FAIL_REP);
    dayFailed += 1;
    stats = { ...stats, failed: stats.failed + 1 };
    logSeq += 1;
    log = [{ id: logSeq, text: `${contract.client} estourou o prazo: ${contract.title}.` }, ...log].slice(0, 8);
  }
  return {
    ...state,
    reputation,
    dayFailed,
    stats,
    log,
    logSeq,
    contracts: state.contracts.filter((contract) => !drop.has(contract.id)),
    employees: state.employees.map((employee) =>
      employee.contractId && drop.has(employee.contractId)
        ? { ...employee, contractId: null, phase: "idle", phaseTicks: 0 }
        : employee,
    ),
  };
}

function closeDay(state: GameState): GameState {
  if (state.dayReport) return state;
  const note =
    state.dayDone === 0 && state.dayFailed === 0
      ? "Dia quieto. O quadro segue de pé."
      : state.dayDone === 0
        ? "Nenhuma entrega. O prazo cobrou o atraso."
        : state.dayFailed === 0
          ? "O dia fechou no azul."
          : "Teve entrega e teve atraso.";
  const logged = pushLog(state, "Expediente encerrado.");
  return {
    ...state,
    ...logged,
    minute: WORK_END,
    contracts: state.contracts.filter((contract) => contract.status === "active"),
    employees: state.employees.map((employee) => ({ ...employee, phase: "idle", phaseTicks: 0 })),
    dayReport: {
      day: state.day,
      earned: state.dayEarned,
      done: state.dayDone,
      failed: state.dayFailed,
      note,
    },
  };
}

export function tick(state: GameState): GameState {
  if (state.dayReport) return state;
  if (state.minute < WORK_START || state.minute >= WORK_END) return state;
  let next = applyWork(state);
  next = { ...next, minute: next.minute + MINUTES_PER_TICK };
  next = resolveDeadlines(next);
  if (next.minute >= WORK_END) next = closeDay(next);
  return next;
}

export function previewAccept(state: GameState, contractId: string): Preview {
  if (state.dayReport) return { ok: false, reason: "O expediente acabou. Abra o dia seguinte." };
  const contract = state.contracts.find((item) => item.id === contractId);
  if (!contract || contract.status !== "offered") return { ok: false, reason: "Esse contrato não está no quadro." };
  const roster = state.employees.filter((employee) => employee.role === contract.role);
  if (roster.length === 0) {
    return {
      ok: false,
      reason:
        contract.role === "ops"
          ? "Falta alguém de operações. A terceira mesa abre essa vaga."
          : "Ninguém com essa função na equipe.",
    };
  }
  const free = roster.find((employee) => employee.contractId === null);
  const lead = roster[0]?.name ?? "A equipe";
  if (!free) {
    const female = lead.startsWith("Lina") || lead.startsWith("Nara");
    return { ok: false, reason: `${firstName(lead)} já está ocupad${female ? "a" : "o"}.` };
  }
  const optimistic = { ...free, energy: Math.max(free.energy, 70) };
  const per = productionPerTick(optimistic, state.upgrades);
  const remain = Math.max(0, contract.workTotal - contract.workDone);
  const workTicks = per > 0 ? Math.ceil(remain / per) : 9999;
  const etaTicks = workTicks + COMMUTE_TICKS;
  const finishAt = absoluteMinute(state.day, state.minute) + etaTicks * MINUTES_PER_TICK;
  if (finishAt > contract.deadlineAt) return { ok: false, reason: "Não cabe no prazo com quem está livre." };
  return { ok: true, employeeId: free.id, etaMinutes: etaTicks * MINUTES_PER_TICK };
}

export function acceptContract(state: GameState, contractId: string): ActionResult {
  const preview = previewAccept(state, contractId);
  if (!preview.ok) return preview;
  const contract = state.contracts.find((item) => item.id === contractId);
  const employee = state.employees.find((item) => item.id === preview.employeeId);
  if (!contract || !employee) return { ok: false, reason: "Não deu para atribuir." };
  const logged = pushLog(state, `${firstName(employee.name)} pegou ${contract.title}.`);
  return {
    ok: true,
    state: {
      ...state,
      ...logged,
      employees: state.employees.map((item) =>
        item.id === employee.id ? { ...item, contractId, phase: "commute", phaseTicks: 0 } : item,
      ),
      contracts: state.contracts.map((item) =>
        item.id === contractId ? { ...item, status: "active", assigneeId: employee.id } : item,
      ),
    },
  };
}

export function buyUpgrade(state: GameState, id: UpgradeId): ActionResult {
  if (state.upgrades[id]) return { ok: false, reason: "Isso já faz parte do escritório." };
  const item = UPGRADE_CATALOG[id];
  if (state.money < item.cost) return { ok: false, reason: "Caixa curto para essa compra." };
  const logged = pushLog(state, `${item.name} entrou no escritório.`);
  return {
    ok: true,
    state: {
      ...state,
      ...logged,
      money: state.money - item.cost,
      upgrades: { ...state.upgrades, [id]: true },
    },
  };
}

export function hire(state: GameState): ActionResult {
  if (state.employees.some((employee) => employee.id === "nara")) {
    return { ok: false, reason: "A equipe já está completa." };
  }
  if (!state.upgrades.desk) return { ok: false, reason: "A terceira mesa ainda não existe." };
  if (state.employees.length >= deskCount(state.upgrades)) return { ok: false, reason: "Não há mesa livre." };
  if (state.money < HIRE_COST) return { ok: false, reason: "Caixa curto para contratar." };
  const logged = pushLog(state, "Nara Mendes sentou na mesa nova.");
  return {
    ok: true,
    state: {
      ...state,
      ...logged,
      money: state.money - HIRE_COST,
      employees: [...state.employees, { ...NARA }],
    },
  };
}

export function startNextDay(state: GameState): GameState {
  if (!state.dayReport) return state;
  const day = state.day + 1;
  const made = makeOffers(day, state.seq, state.reputation);
  const logged = pushLog(state, `Dia ${day}. Quadro novo na parede.`);
  return {
    ...state,
    ...logged,
    day,
    minute: WORK_START,
    dayReport: null,
    dayEarned: 0,
    dayDone: 0,
    dayFailed: 0,
    seq: made.seq,
    contracts: [...state.contracts.filter((contract) => contract.status === "active"), ...made.contracts],
    employees: state.employees.map((employee) => ({
      ...employee,
      energy: 100,
      phase: employee.contractId ? "working" : "idle",
      phaseTicks: 0,
    })),
  };
}
