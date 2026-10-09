import { LAYOUT, PX, ROOM_URL, SHEET_URL, type RoomKey, type Spot } from "../art.ts";
import { COMMUTE_TICKS } from "../sim/balance.ts";
import { firstName } from "../sim/format.ts";
import type { Employee, GameState } from "../sim/types.ts";

export type ArtBag = {
  roomStart: HTMLImageElement;
  roomDesk: HTMLImageElement;
  lina: HTMLImageElement;
  otto: HTMLImageElement;
  nara: HTMLImageElement;
  props: HTMLImageElement;
};

type Box = { id: string; x: number; y: number; w: number; h: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const boxes: Box[] = [];
const particles: Particle[] = [];
const display = new Map<string, Spot>();
let seenDone = 0;
let armed = false;
let lastDraw = 0;
let shake = 0;

export function resetPresentation(doneCount: number) {
  display.clear();
  particles.length = 0;
  seenDone = doneCount;
  shake = 0;
  armed = true;
  lastDraw = 0;
}

export function hitEmployee(x: number, y: number): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (!box) continue;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return box.id;
  }
  return null;
}

function loadImage(src: string): HTMLImageElement {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  return image;
}

let bag: ArtBag | null = null;

export function getArt(): ArtBag {
  if (!bag) {
    bag = {
      roomStart: loadImage(ROOM_URL.start),
      roomDesk: loadImage(ROOM_URL.desk),
      lina: loadImage(SHEET_URL.lina),
      otto: loadImage(SHEET_URL.otto),
      nara: loadImage(SHEET_URL.nara),
      props: loadImage(SHEET_URL.props),
    };
  }
  return bag;
}

function ready(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return !!image && image.complete && image.naturalWidth > 0;
}

function smoothToward(id: string, target: Spot, dt: number): Spot {
  const prev = display.get(id) ?? target;
  const k = 1 - Math.exp(-dt * 8);
  const next = { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
  display.set(id, next);
  return next;
}

function drawFrame(ctx: CanvasRenderingContext2D, image: HTMLImageElement, frame: number, dx: number, dy: number, size: number) {
  const fw = image.width / 2;
  const fh = image.height / 2;
  const col = frame % 2;
  const row = Math.floor(frame / 2) % 2;
  ctx.drawImage(image, col * fw, row * fh, fw, fh, dx, dy, size, size);
}

function drawProp(ctx: CanvasRenderingContext2D, image: HTMLImageElement, index: number, dx: number, dy: number, size: number) {
  drawFrame(ctx, image, index, dx, dy, size);
}

function spawn(x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * (36 + (i % 3) * 16),
      vy: Math.sin(angle) * (28 + (i % 4) * 10) - 24,
      life: 1,
    });
  }
  shake = 1;
}

export function drawOffice(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameState,
  art: ArtBag,
  now: number,
  options: { reduced: boolean; selectedId: string | null },
) {
  const dt = lastDraw === 0 ? 1 / 30 : Math.min(0.05, (now - lastDraw) / 1000);
  lastDraw = now;
  boxes.length = 0;

  let burst = false;
  if (!armed) seenDone = state.stats.done;
  else if (state.stats.done > seenDone) {
    seenDone = state.stats.done;
    burst = true;
    shake = 1;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PX.floor;
  ctx.fillRect(0, 0, width, height);

  const evolved = state.upgrades.desk && ready(art.roomDesk);
  const room = evolved ? art.roomDesk : art.roomStart;
  const key: RoomKey = evolved ? "desk" : "start";
  const layout = LAYOUT[key];

  if (!ready(room)) return;

  const aspect = room.width / room.height;
  const view = width / height;
  let dw = width;
  let dh = height;
  let ox = 0;
  let oy = 0;
  if (view > aspect) {
    dh = height;
    dw = height * aspect;
    ox = (width - dw) / 2;
  } else {
    dw = width;
    dh = width / aspect;
    oy = (height - dh) / 2;
  }

  const jitter = options.reduced ? 0 : Math.sin(now / 40) * shake * 2;
  shake *= 0.86;
  ctx.save();
  ctx.translate(jitter, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(room, ox, oy, dw, dh);
  ctx.imageSmoothingEnabled = false;

  const propSize = dh * 0.075;
  if (ready(art.props)) {
    if (state.upgrades.coffee) {
      const spot = layout.coffee;
      drawProp(ctx, art.props, 0, ox + spot.x * dw - propSize / 2, oy + spot.y * dh - propSize, propSize);
    }
    if (state.upgrades.plants && !evolved) {
      const spot = layout.plant;
      drawProp(ctx, art.props, 1, ox + spot.x * dw - propSize / 2, oy + spot.y * dh - propSize, propSize);
    }
    if (state.upgrades.monitors && !evolved) {
      const spot = layout.lamp;
      drawProp(ctx, art.props, 3, ox + spot.x * dw - propSize / 2, oy + spot.y * dh - propSize, propSize * 1.15);
    }
  }

  const people = [...state.employees].sort((a, b) => layout[a.sprite].y - layout[b.sprite].y);
  for (const employee of people) {
    drawEmployee(ctx, art, employee, state, layout, ox, oy, dw, dh, now, dt, options);
  }
  if (burst) spawn(ox + dw * 0.5, oy + dh * 0.42);

  if (particles.length > 0 && !options.reduced) {
    ctx.imageSmoothingEnabled = false;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      if (!particle) continue;
      particle.life -= dt * 1.5;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 90 * dt;
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = i % 2 === 0 ? PX.brass : PX.cream;
      ctx.fillRect(particle.x, particle.y, 5, 5);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEmployee(
  ctx: CanvasRenderingContext2D,
  art: ArtBag,
  employee: Employee,
  state: GameState,
  layout: (typeof LAYOUT)[RoomKey],
  ox: number,
  oy: number,
  dw: number,
  dh: number,
  now: number,
  dt: number,
  options: { reduced: boolean; selectedId: string | null },
) {
  const seat = layout[employee.sprite];
  let target = seat;
  if (employee.phase === "break") target = layout.coffee;
  else if (employee.phase === "commute") {
    const t = Math.min(1, employee.phaseTicks / COMMUTE_TICKS);
    target = {
      x: layout.door.x + (seat.x - layout.door.x) * t,
      y: layout.door.y + (seat.y - layout.door.y) * t,
    };
  }
  let pos = options.reduced ? target : smoothToward(employee.id, target, dt);
  if (!options.reduced && (employee.phase === "working" || employee.phase === "idle")) {
    pos = { x: pos.x, y: pos.y + Math.sin(now / 320 + seat.x * 12) * 0.003 };
  }

  const sheet = art[employee.sprite];
  const size = dh * 0.155;
  const dx = ox + pos.x * dw - size / 2;
  const dy = oy + pos.y * dh - size;
  boxes.push({ id: employee.id, x: dx, y: dy, w: size, h: size });

  if (ready(sheet)) {
    const frame = options.reduced
      ? 0
      : employee.phase === "working"
        ? Math.floor(now / 180) % 4
        : employee.phase === "commute"
          ? (Math.floor(now / 140) % 2) * 2
          : employee.phase === "break"
            ? 1
            : 0;
    drawFrame(ctx, sheet, frame, dx, dy, size);
  }

  const contract = state.contracts.find((item) => item.id === employee.contractId);
  if (contract && (employee.phase === "working" || employee.phase === "commute" || employee.phase === "break")) {
    const pct = Math.max(0, Math.min(1, contract.workDone / contract.workTotal));
    const barW = size * 0.62;
    const barX = dx + (size - barW) / 2;
    const barY = dy + size - size * 0.04;
    ctx.fillStyle = PX.track;
    ctx.fillRect(barX, barY, barW, 6);
    ctx.fillStyle = PX.teal;
    ctx.fillRect(barX, barY, barW * pct, 6);
  }

  if (options.selectedId === employee.id) {
    ctx.strokeStyle = PX.brass;
    ctx.lineWidth = 3;
    ctx.strokeRect(dx + 6, dy + 6, size - 12, size - 12);
  }

  ctx.imageSmoothingEnabled = true;
  const label = firstName(employee.name);
  ctx.font = `${Math.max(10, Math.round(dh * 0.022))}px Outfit, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const textW = ctx.measureText(label).width;
  const lx = dx + size / 2;
  const ly = dy - Math.max(14, dh * 0.028);
  ctx.fillStyle = PX.ink;
  ctx.fillRect(lx - textW / 2 - 5, ly, textW + 10, Math.max(16, dh * 0.03));
  ctx.fillStyle = PX.cream;
  ctx.fillText(label, lx, ly + 1);
  ctx.imageSmoothingEnabled = false;
}
