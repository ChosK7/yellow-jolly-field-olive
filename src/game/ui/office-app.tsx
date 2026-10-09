import { Briefcase, Lamp, Pause, Play, Users, Volume2, VolumeX } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { blip, isMuted, loadMuted, setMuted, unlockAudio } from "../audio.ts";
import { resetPresentation } from "../render/draw-office.ts";
import {
  UPGRADE_LIST,
  UPGRADE_CATALOG,
  HIRE_COST,
  ROLE_LABEL,
  activeEffects,
  deskCount,
  officeLine,
} from "../sim/balance.ts";
import { previewAccept } from "../sim/engine.ts";
import { formatClock, formatDeadline, formatEta, formatMoney, firstName } from "../sim/format.ts";
import type { Contract, Employee, UpgradeId } from "../sim/types.ts";
import { accept, beginFresh, buy, employ, getState, hadSave, nextDay, storageLabel, togglePause, toggleSpeed, useGame } from "../store.ts";
import { OfficeCanvas } from "./office-canvas.tsx";
import { useGameLoop } from "./use-loop.ts";

type Tab = "contracts" | "team" | "office";

const primaryBtn = "flex h-12 w-full items-center justify-center rounded-xl bg-ink px-4 font-medium text-cream";
const ghostBtn = "flex h-12 w-full items-center justify-center rounded-xl bg-cream-deep px-4 font-medium text-ink";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function roleClass(role: Contract["role"]) {
  if (role === "dev") return "bg-teal";
  if (role === "design") return "bg-brass";
  return "bg-coral";
}

function statusLine(employee: Employee, contracts: Contract[]): string {
  if (employee.phase === "commute") return "A caminho da mesa";
  if (employee.phase === "break") return "Pausa para o café";
  if (employee.phase === "working") {
    const job = contracts.find((contract) => contract.id === employee.contractId);
    return job ? `Trabalhando em ${job.title}` : "Trabalhando";
  }
  return "Livre";
}

export function OfficeApp({ ready = true }: { ready?: boolean }) {
  const state = useGame();
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [officeNote, setOfficeNote] = useState<string | null>(null);
  const [teamNote, setTeamNote] = useState<string | null>(null);
  const doneSeen = useRef<number | null>(null);
  const failSeen = useRef<number | null>(null);

  useGameLoop(playing);

  useEffect(() => {
    setMutedState(loadMuted());
  }, []);

  useEffect(() => {
    if (!playing) return;
    resetPresentation(getState().stats.done);
    doneSeen.current = getState().stats.done;
    failSeen.current = getState().stats.failed;
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    if (doneSeen.current === null) {
      doneSeen.current = state.stats.done;
      return;
    }
    if (state.stats.done > doneSeen.current) blip("ok");
    doneSeen.current = state.stats.done;
  }, [playing, state.stats.done]);

  useEffect(() => {
    if (!playing) return;
    if (failSeen.current === null) {
      failSeen.current = state.stats.failed;
      return;
    }
    if (state.stats.failed > failSeen.current) blip("fail");
    failSeen.current = state.stats.failed;
  }, [playing, state.stats.failed]);

  useEffect(() => {
    if (!playing) return;
    const onVis = () => {
      if (document.hidden) return;
      const current = getState();
      if (current.pausedByUser || current.dayReport) return;
      setToast("Expediente retomado");
      window.setTimeout(() => setToast(null), 1400);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      event.preventDefault();
      togglePause();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, [playing]);

  const startFresh = () => {
    beginFresh();
    setTab("contracts");
    setPlaying(true);
    unlockAudio();
  };

  const continueGame = () => {
    setTab(getState().dayReport ? null : "contracts");
    setPlaying(true);
    unlockAudio();
  };

  if (!playing) {
    return (
      <main className="stage">
        <section className="phone">
          <img src="/office/room-start.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-ink/45" />
          <div className="safe-top relative mt-auto px-4 pb-6">
            <div className="rounded-2xl bg-cream px-5 py-5 text-ink">
              <p className="text-sm tracking-wide text-walnut">Estúdio</p>
              <h1 className="display text-5xl leading-none">Office Story</h1>
              <p className="mt-3 text-base leading-snug text-walnut">
                O quadro abre de manhã. Alguém senta e entrega. O lugar muda.
              </p>
              <div className="mt-5 grid gap-2">
                {ready && hadSave() ? (
                  <>
                    <button className={primaryBtn} data-testid="continue" onClick={continueGame}>
                      Continuar expediente
                    </button>
                    <button className={ghostBtn} data-testid="new-game" onClick={startFresh}>
                      Começar do zero
                    </button>
                  </>
                ) : (
                  <button className={primaryBtn} data-testid="new-game" onClick={startFresh}>
                    Começar o dia
                  </button>
                )}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-walnut">
                Prévia jogável no navegador, em tela vertical. O motor do jogo é separado da tela. Este
                ambiente não gera o aplicativo de loja para Android ou iOS.
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const offers = state.contracts.filter((contract) => contract.status === "offered").length;
  const latest = state.log[0]?.text ?? "";

  return (
    <main className="stage" onPointerDown={() => unlockAudio()}>
      <section className="phone" data-testid="office-root">
        <header className="safe-top bg-cream px-4 pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="display text-2xl leading-none">Office Story</p>
              <p className="nums mt-1 text-sm text-walnut" data-testid="clock">
                Dia {state.day} · {formatClock(state.minute)}
              </p>
            </div>
            <div className="text-right">
              <p className="nums display text-2xl leading-none" data-testid="money">
                {formatMoney(state.money)}
              </p>
              <p className="nums mt-1 text-sm text-walnut">Rep {state.reputation}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-cream-deep text-sm" onClick={togglePause} data-testid="pause">
              {state.pausedByUser ? <Play className="size-4" /> : <Pause className="size-4" />}
              {state.pausedByUser ? "Retomar" : "Pausar"}
            </button>
            <button className="nums flex h-11 w-14 items-center justify-center rounded-xl bg-cream-deep text-sm" onClick={toggleSpeed} data-testid="speed">
              {state.speed}×
            </button>
            <button
              className="flex h-11 w-12 items-center justify-center rounded-xl bg-cream-deep"
              aria-label={muted ? "Ligar som" : "Silenciar"}
              onClick={() => {
                const next = !isMuted();
                setMuted(next);
                setMutedState(next);
              }}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>
        </header>

        <div className="viewport">
          <OfficeCanvas
            reduced={reduced}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setTab("team");
            }}
          />
          {toast ? (
            <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-sm text-cream">
              {toast}
            </p>
          ) : null}
          {state.pausedByUser ? (
            <div className="absolute inset-0 grid place-items-center bg-ink/40 px-6">
              <div className="w-full rounded-2xl bg-cream px-5 py-4 text-center">
                <p className="display text-3xl">Relógio parado</p>
                <p className="mt-1 text-sm text-walnut">O expediente não anda enquanto você lê.</p>
                <button className={`${primaryBtn} mt-4`} onClick={togglePause}>
                  Retomar
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <p className="truncate bg-ink px-4 py-2 text-sm text-cream" aria-live="polite">
          {latest}
        </p>

        {tab ? (
          <section className="sheet-scroll border-t border-walnut/15 bg-cream px-4 pt-3" data-testid={`sheet-${tab}`}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-cream-deep" />
            {tab === "contracts" ? <Contracts state={state} /> : null}
            {tab === "team" ? (
              <Team
                state={state}
                selectedId={selectedId}
                note={teamNote}
                onHire={() => {
                  const result = employ();
                  setTeamNote(result.ok ? null : result.reason);
                  if (result.ok) blip("tap");
                }}
              />
            ) : null}
            {tab === "office" ? (
              <Office
                state={state}
                note={officeNote}
                onBuy={(id) => {
                  const result = buy(id);
                  setOfficeNote(result.ok ? null : result.reason);
                  if (result.ok) blip("tap");
                  else blip("fail");
                }}
              />
            ) : null}
          </section>
        ) : null}

        <nav className="safe-bottom grid grid-cols-3 border-t border-walnut/15 bg-cream">
          <TabButton
            label="Contratos"
            testId="tab-contracts"
            active={tab === "contracts"}
            badge={offers}
            icon={<Briefcase className="size-5" />}
            onClick={() => setTab(tab === "contracts" ? null : "contracts")}
          />
          <TabButton
            label="Equipe"
            testId="tab-team"
            active={tab === "team"}
            icon={<Users className="size-5" />}
            onClick={() => setTab(tab === "team" ? null : "team")}
          />
          <TabButton
            label="Escritório"
            testId="tab-office"
            active={tab === "office"}
            icon={<Lamp className="size-5" />}
            onClick={() => setTab(tab === "office" ? null : "office")}
          />
        </nav>

        {state.dayReport ? (
          <div className="absolute inset-0 z-10 flex items-end bg-ink/55 px-4 pb-8">
            <div className="safe-bottom w-full rounded-2xl bg-cream px-5 py-5">
              <p className="text-sm text-walnut">Fim do expediente</p>
              <h2 className="display text-4xl leading-none">Dia {state.dayReport.day}</h2>
              <p className="nums mt-3 text-lg">{formatMoney(state.dayReport.earned)} entrou hoje</p>
              <p className="text-sm text-walnut">
                {state.dayReport.done} {state.dayReport.done === 1 ? "entrega" : "entregas"} · {state.dayReport.failed}{" "}
                {state.dayReport.failed === 1 ? "atraso" : "atrasos"}
              </p>
              <p className="mt-2 text-sm">{state.dayReport.note}</p>
              <button className={`${primaryBtn} mt-4`} data-testid="next-day" onClick={() => nextDay()}>
                Abrir o dia seguinte
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function TabButton({
  label,
  active,
  icon,
  badge,
  testId,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  badge?: number;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${active ? "text-ink" : "text-walnut"}`}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
    >
      {icon}
      {label}
      {badge ? (
        <span className="nums absolute top-1 right-6 grid min-h-5 min-w-5 place-items-center rounded-full bg-brass px-1 text-xs text-ink">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Contracts({ state }: { state: ReturnType<typeof useGame> }) {
  const list = [...state.contracts].sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
  if (list.length === 0) {
    return <p className="pb-4 text-sm text-walnut">O quadro está limpo.</p>;
  }
  return (
    <div className="grid gap-3 pb-4">
      {list.map((contract) => {
        const preview = contract.status === "offered" ? previewAccept(state, contract.id) : null;
        const pct = Math.round((contract.workDone / contract.workTotal) * 100);
        const owner = state.employees.find((employee) => employee.id === contract.assigneeId);
        return (
          <article key={contract.id} className="rounded-xl bg-cream-deep/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="display text-xl leading-tight">{contract.client}</h3>
              <span className="flex items-center gap-2 text-xs text-walnut">
                <span className={`size-2 rounded-full ${roleClass(contract.role)}`} />
                {ROLE_LABEL[contract.role]}
              </span>
            </div>
            <p className="mt-1 font-medium">{contract.title}</p>
            <p className="mt-1 text-sm leading-snug text-walnut">{contract.detail}</p>
            <div className="nums mt-2 flex justify-between text-sm">
              <span>{formatMoney(contract.pay)}</span>
              <span>{formatDeadline(state.day, contract.deadlineAt)}</span>
            </div>
            {contract.status === "active" ? (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-walnut">
                  <span>{owner ? firstName(owner.name) : "Em andamento"}</span>
                  <span className="nums">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-cream">
                  <div className="h-full bg-teal" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <button
                  className={primaryBtn}
                  data-testid={`accept-${contract.id}`}
                  disabled={!preview?.ok}
                  onClick={() => {
                    const result = accept(contract.id);
                    if (result.ok) blip("tap");
                  }}
                >
                  Aceitar
                </button>
                {preview?.ok ? (
                  <p className="mt-2 text-xs text-walnut">Cabe {formatEta(preview.etaMinutes)}.</p>
                ) : (
                  <p className="mt-2 text-xs text-coral">{preview?.reason}</p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Team({
  state,
  selectedId,
  note,
  onHire,
}: {
  state: ReturnType<typeof useGame>;
  selectedId: string | null;
  note: string | null;
  onHire: () => void;
}) {
  const hired = state.employees.some((employee) => employee.id === "nara");
  return (
    <div className="grid gap-3 pb-4">
      {state.employees.map((employee) => (
        <article
          key={employee.id}
          className={`rounded-xl p-3 ${selectedId === employee.id ? "bg-cream-deep" : "bg-cream-deep/50"}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="display text-xl">{employee.name}</h3>
            <span className="text-xs text-walnut">{ROLE_LABEL[employee.role]}</span>
          </div>
          <p className="mt-1 text-sm">{statusLine(employee, state.contracts)}</p>
          <div className="mt-2">
            <div className="mb-1 flex justify-between text-xs text-walnut">
              <span>Energia</span>
              <span className="nums">{Math.round(employee.energy)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-cream">
              <div className="h-full bg-brass" style={{ width: `${Math.max(0, Math.min(100, employee.energy))}%` }} />
            </div>
          </div>
        </article>
      ))}
      {!hired ? (
        <div className="rounded-xl border border-walnut/15 p-3">
          <h3 className="display text-xl">Vaga</h3>
          <p className="mt-1 text-sm text-walnut">Nara Mendes, operações. {formatMoney(HIRE_COST)}.</p>
          <button className={`${primaryBtn} mt-3`} data-testid="hire" disabled={!state.upgrades.desk || state.money < HIRE_COST} onClick={onHire}>
            Contratar Nara
          </button>
          <p className="mt-2 text-xs text-walnut">
            {state.upgrades.desk
              ? state.money < HIRE_COST
                ? "Caixa curto para contratar."
                : `Mesas: ${state.employees.length}/${deskCount(state.upgrades)}.`
              : "A terceira mesa abre essa vaga."}
          </p>
          {note ? <p className="mt-1 text-xs text-coral">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function Office({
  state,
  note,
  onBuy,
}: {
  state: ReturnType<typeof useGame>;
  note: string | null;
  onBuy: (id: UpgradeId) => void;
}) {
  const effects = activeEffects(state.upgrades);
  return (
    <div className="grid gap-3 pb-4">
      <p className="text-sm leading-snug">{officeLine(state.upgrades)}</p>
      <p className="text-xs text-walnut">{effects.length > 0 ? effects.join(" · ") : "Nenhum melhoramento ainda."}</p>
      {UPGRADE_LIST.map((id) => {
        const item = UPGRADE_CATALOG[id];
        const owned = state.upgrades[id];
        return (
          <article key={id} className="rounded-xl bg-cream-deep/50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="display text-xl">{item.name}</h3>
              <span className="nums text-sm">{owned ? "No escritório" : formatMoney(item.cost)}</span>
            </div>
            <p className="mt-1 text-sm text-walnut">{item.blurb}</p>
            {owned ? null : (
              <button className={`${primaryBtn} mt-3`} data-testid={`buy-${id}`} disabled={state.money < item.cost} onClick={() => onBuy(id)}>
                Comprar
              </button>
            )}
          </article>
        );
      })}
      {note ? <p className="text-xs text-coral">{note}</p> : null}
      <p className="text-xs text-walnut">{storageLabel()} · funciona sem rede.</p>
    </div>
  );
}
