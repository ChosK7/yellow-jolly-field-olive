import { SHEET_URL } from "../art.ts";
import { firstName } from "../sim/format.ts";
import type { Employee, GameState, SpriteId } from "../sim/types.ts";
import {
  COLS,
  ROWS,
  actorView,
  furniture,
  isWindow,
  type ActorView,
  type Furn,
} from "../world/office-map.ts";

type Spot = { c: number; r: number };
type Box = { id: string; x: number; y: number; w: number; h: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number };
type Paint = { r: number; z: number; run: () => void };
type SheetId = keyof typeof SHEET_URL;

const C = {
  void: "#1c1612",
  floorA: "#e4c28a",
  floorB: "#d7b178",
  grain: "#8d5e34",
  lip: "#a87442",
  wall: "#f4ead6",
  wallShade: "#e2d0b0",
  trim: "#5c3a24",
  window: "#8ec4dc",
  windowDeep: "#5e98b8",
  windowLite: "#f4fbff",
  door: "#6d4328",
  doorLite: "#8d5a34",
  chair: "#2c3d56",
  chairSeat: "#6d84a4",
  chairWood: "#8a5a32",
  printer: "#f6f0e4",
  printerInk: "#3a342c",
  paper: "#fffaf2",
  ink: "#1c1612",
  cream: "#f3e6c8",
  brass: "#e2a322",
  teal: "#1f8a7b",
};

const PIP: Record<SpriteId, string> = {
  lina: C.teal,
  otto: C.brass,
  nara: "#c4543c",
};

const CELL = 128;
const FEET = 119;

const boxes: Box[] = [];
const particles: Particle[] = [];
const display = new Map<string, Spot>();
const sheets = new Map<SheetId, HTMLImageElement>();
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

function follow(id: string, spot: Spot, dt: number, snap: boolean): Spot {
  if (snap) {
    display.set(id, spot);
    return spot;
  }
  const prev = display.get(id) ?? spot;
  const k = 1 - Math.exp(-dt * 9);
  const next = { c: prev.c + (spot.c - prev.c) * k, r: prev.r + (spot.r - prev.r) * k };
  display.set(id, next);
  return next;
}

function sheet(id: SheetId): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let image = sheets.get(id);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = SHEET_URL[id];
    sheets.set(id, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : null;
}

function blit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  index: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  flip: boolean,
) {
  const fw = image.width / 2;
  const fh = image.height / 2;
  const col = index % 2;
  const row = Math.floor(index / 2) % 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(Math.round(dx + dw), Math.round(dy));
    ctx.scale(-1, 1);
    ctx.drawImage(image, col * fw, row * fh, fw, fh, 0, 0, Math.round(dw), Math.round(dh));
  } else {
    ctx.drawImage(image, col * fw, row * fh, fw, fh, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
  }
  ctx.restore();
}

function spawn(x: number, y: number) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * (28 + (i % 3) * 12),
      vy: Math.sin(angle) * (22 + (i % 4) * 8) - 18,
      life: 1,
    });
  }
  shake = 1;
}

function drawShell(ctx: CanvasRenderingContext2D, ox: number, oy: number, tile: number) {
  const x = ox + tile;
  const y = oy + tile;
  const w = tile * (COLS - 2);
  const h = tile * (ROWS - 2);
  ctx.fillStyle = C.floorA;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.floorB;
  const band = Math.max(5, Math.floor(tile * 0.34));
  for (let row = 0, yy = y; yy < y + h; row++, yy += band) {
    if (row % 2 === 0) ctx.fillRect(x, yy, w, Math.min(band, y + h - yy));
  }
  ctx.fillStyle = "rgba(109,67,40,0.2)";
  for (let yy = y + band; yy < y + h; yy += band) ctx.fillRect(x, yy, w, 1);
  ctx.fillStyle = "rgba(255,244,220,0.14)";
  for (let yy = y + 2; yy < y + h; yy += band) ctx.fillRect(x + 2, yy, w - 4, 1);
  for (let c = 0; c < COLS; c++) {
    drawWall(ctx, ox + c * tile, oy, tile, tile, isWindow(c, 0));
    if (c !== 3 && c !== 4) drawWall(ctx, ox + c * tile, oy + (ROWS - 1) * tile, tile, tile, false);
  }
  for (let r = 1; r < ROWS - 1; r++) {
    drawWall(ctx, ox, oy + r * tile, tile, tile, false);
    drawWall(ctx, ox + (COLS - 1) * tile, oy + r * tile, tile, tile, false);
  }
  drawDoor(ctx, ox + 3 * tile, oy + (ROWS - 1) * tile, tile, tile);
  drawDoor(ctx, ox + 4 * tile, oy + (ROWS - 1) * tile, tile, tile);
  ctx.fillStyle = C.trim;
  ctx.fillRect(x, y, w, Math.max(3, Math.floor(tile * 0.08)));
}

function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number, windowed: boolean) {
  ctx.fillStyle = C.wallShade;
  ctx.fillRect(x, y, tw, th);
  ctx.fillStyle = C.wall;
  ctx.fillRect(x + 1, y + 1, tw - 2, Math.floor(th * 0.62));
  const rail = Math.floor(th * 0.58);
  ctx.fillStyle = C.trim;
  ctx.fillRect(x, y + rail, tw, Math.max(2, Math.floor(th * 0.06)));
  ctx.fillStyle = "#c9a27a";
  ctx.fillRect(x + 2, y + rail + 3, tw - 4, Math.floor(th * 0.22));
  ctx.fillStyle = C.trim;
  ctx.fillRect(x + 3, y + rail + 5, tw - 6, 1);
  if (!windowed) return;
  const wx = x + Math.floor(tw * 0.14);
  const wy = y + Math.floor(th * 0.1);
  const ww = Math.floor(tw * 0.72);
  const wh = Math.floor(th * 0.42);
  ctx.fillStyle = C.trim;
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
  ctx.fillStyle = C.windowDeep;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = C.window;
  ctx.fillRect(wx + 2, wy + 2, ww - 4, Math.floor(wh * 0.55));
  ctx.fillStyle = C.trim;
  ctx.fillRect(wx + Math.floor(ww / 2) - 1, wy, 2, wh);
  ctx.fillRect(wx, wy + Math.floor(wh / 2), ww, 2);
  ctx.fillStyle = C.windowLite;
  ctx.fillRect(wx + 3, wy + 3, Math.max(2, Math.floor(ww * 0.18)), Math.max(2, Math.floor(wh * 0.22)));
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number) {
  ctx.fillStyle = C.trim;
  ctx.fillRect(x + Math.floor(tw * 0.1), y, Math.floor(tw * 0.8), th);
  ctx.fillStyle = C.door;
  const dx = x + Math.floor(tw * 0.18);
  const dw = Math.floor(tw * 0.64);
  ctx.fillRect(dx, y + 2, dw, th - 2);
  ctx.fillStyle = C.doorLite;
  ctx.fillRect(dx + 3, y + Math.floor(th * 0.12), dw - 6, Math.floor(th * 0.28));
  ctx.fillRect(dx + 3, y + Math.floor(th * 0.48), dw - 6, Math.floor(th * 0.28));
  ctx.fillStyle = C.brass;
  ctx.fillRect(dx + dw - 7, y + Math.floor(th * 0.52), 3, 3);
}

function propBox(index: number, tw: number): { dw: number; dh: number; foot: number; lift: number } {
  if (index === 2) return { dw: tw * 1.75, dh: tw * 1.75, foot: 111, lift: tw * 0.12 };
  if (index === 3) return { dw: tw * 0.9, dh: tw * 1.7, foot: 118, lift: 0 };
  if (index === 1) return { dw: tw * 1.25, dh: tw * 1.4, foot: 107, lift: 0 };
  return { dw: tw * 1.15, dh: tw * 1.25, foot: 104, lift: 0 };
}

function drawProp(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, tw: number, th: number) {
  const image = sheet("props");
  const box = propBox(index, tw);
  const left = x + (tw - box.dw) / 2;
  const top = y + th - (box.foot / CELL) * box.dh - box.lift;
  if (!image) return;
  blit(ctx, image, index, left, top, box.dw, box.dh, false);
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number) {
  const s = Math.max(2, Math.floor(tw / 14));
  const w = s * 12;
  const h = s * 12;
  const left = x + Math.floor((tw - w) / 2);
  const top = y + Math.floor(th * 0.28);
  ctx.fillStyle = C.chair;
  ctx.fillRect(left + s, top, w - s * 2, s * 4);
  ctx.fillRect(left, top + s * 3, w, s * 3);
  ctx.fillStyle = C.chairSeat;
  ctx.fillRect(left + s, top + s * 4, w - s * 2, s * 2);
  ctx.fillStyle = C.chairWood;
  ctx.fillRect(left + s, top + s * 7, s, s * 4);
  ctx.fillRect(left + w - s * 2, top + s * 7, s, s * 4);
  ctx.fillStyle = C.cream;
  ctx.fillRect(left + s * 2, top + s, s, s);
}

function drawPrinter(ctx: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number) {
  const s = Math.max(2, Math.floor(tw / 16));
  const left = x + Math.floor(tw * 0.12);
  const top = y + Math.floor(th * 0.28);
  ctx.fillStyle = C.printerInk;
  ctx.fillRect(left, top + s * 2, s * 12, s * 7);
  ctx.fillStyle = C.printer;
  ctx.fillRect(left + s, top + s * 3, s * 10, s * 4);
  ctx.fillStyle = C.paper;
  ctx.fillRect(left + s * 3, top, s * 6, s * 3);
  ctx.fillStyle = C.teal;
  ctx.fillRect(left + s * 9, top + s * 4, s, s);
  ctx.fillStyle = C.grain;
  ctx.fillRect(left + s, top + s * 8, s * 2, s * 2);
  ctx.fillRect(left + s * 9, top + s * 8, s * 2, s * 2);
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number) {
  ctx.fillStyle = C.door;
  ctx.fillRect(x + 3, y + Math.floor(th * 0.55), tw - 6, Math.floor(th * 0.14));
  ctx.fillStyle = C.trim;
  ctx.fillRect(x + 5, y + Math.floor(th * 0.68), 3, Math.floor(th * 0.16));
  ctx.fillRect(x + tw - 8, y + Math.floor(th * 0.68), 3, Math.floor(th * 0.16));
}

function drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, tw: number, th: number) {
  const w = Math.floor(tw * 0.42);
  const h = Math.floor(th * 0.28);
  const left = x + Math.floor((tw - w) / 2);
  const top = y + Math.floor(th * 0.22);
  ctx.fillStyle = C.trim;
  ctx.fillRect(left - 1, top - 1, w + 2, h + 2);
  ctx.fillStyle = C.brass;
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = C.ink;
  ctx.fillRect(left + Math.floor(w * 0.35), top + Math.floor(h * 0.28), Math.floor(w * 0.3), Math.floor(h * 0.44));
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  employee: Employee,
  view: ActorView,
  spot: Spot,
  ox: number,
  oy: number,
  tw: number,
  th: number,
  now: number,
  selected: boolean,
  progress: number | null,
  reduced: boolean,
) {
  const image = sheet(employee.sprite);
  const seated = view.pose === "sit";
  const step = Math.floor(now / 180);
  const frameIndex = seated ? 2 : view.pose === "walk" ? (step % 2 === 0 ? 1 : 3) : view.pose === "rest" ? 1 : 0;
  const content = seated ? 97 : 108;
  const want = seated ? tw * 1.08 : tw * 2.05;
  const scale = want / content;
  const dw = CELL * scale;
  const dh = CELL * scale;
  const feetX = ox + (spot.c + 0.5) * tw;
  const footFrac = seated ? 0.98 : view.pose === "rest" ? 0.78 : 0.96;
  const bob = !reduced && view.pose === "walk" ? (step % 2 === 0 ? -Math.max(1, Math.round(tw * 0.04)) : 0) : 0;
  const feetY = oy + (spot.r + footFrac) * th + bob;
  const left = feetX - dw / 2;
  const top = feetY - FEET * scale;
  ctx.fillStyle = "rgba(28,22,18,0.28)";
  ctx.fillRect(feetX - tw * 0.22, feetY - Math.max(2, tw * 0.04), tw * 0.44, Math.max(3, tw * 0.07));
  if (image) blit(ctx, image, frameIndex, left, top, dw, dh, view.dir === "w");

  const hitW = dw * 0.5;
  const hitH = content * scale;
  const hitX = feetX - hitW / 2;
  const hitY = top + (FEET - content) * scale;
  boxes.push({ id: employee.id, x: hitX, y: hitY, w: hitW, h: hitH });

  if (selected) {
    ctx.strokeStyle = C.cream;
    ctx.lineWidth = 2;
    ctx.strokeRect(hitX - 2, hitY - 2, hitW + 4, hitH + 4);
    ctx.fillStyle = C.ink;
    const label = firstName(employee.name);
    ctx.font = `${Math.max(11, Math.round(tw * 0.28))}px Outfit, sans-serif`;
    const width = ctx.measureText(label).width + 8;
    const lx = feetX - width / 2;
    const ly = hitY - Math.round(tw * 0.36);
    ctx.fillRect(lx, ly, width, Math.round(tw * 0.32));
    ctx.fillStyle = C.cream;
    ctx.fillText(label, lx + 4, ly + Math.round(tw * 0.24));
  }

  ctx.fillStyle = PIP[employee.sprite];
  ctx.fillRect(feetX - tw * 0.08, hitY - tw * 0.16, tw * 0.16, Math.max(3, tw * 0.06));

  if (progress !== null && seated) {
    const bw = tw * 0.7;
    const bx = feetX - bw / 2;
    const by = hitY - tw * 0.28;
    const bh = Math.max(3, Math.round(tw * 0.07));
    ctx.fillStyle = C.ink;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = C.teal;
    ctx.fillRect(bx, by, Math.max(0, bw * progress), bh);
  }
}

export function drawOffice(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameState,
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

  const tile = Math.max(8, Math.min(Math.floor(width / COLS), Math.floor(height / ROWS)));
  const gridW = tile * COLS;
  const gridH = tile * ROWS;
  const ox = Math.floor((width - gridW) / 2);
  const oy = Math.floor((height - gridH) / 2);
  const jitter = options.reduced ? 0 : Math.sin(now / 40) * shake * 1.5;
  shake *= 0.86;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(jitter, 0);

  drawShell(ctx, ox, oy, tile);

  const queue: Paint[] = [];
  for (const item of furniture(state.upgrades)) {
    if (item.kind === "pc") continue;
    const x = ox + item.c * tile;
    const y = oy + item.r * tile;
    queue.push({
      r: item.r + (item.kind === "desk" ? 0 : 0.05),
      z: item.kind === "chair" ? 1 : 2,
      run: () => paintFurn(ctx, item, x, y, tile, tile),
    });
  }
  if (state.upgrades.monitors) {
    const x = ox + 6 * tile;
    const y = oy + 1 * tile;
    queue.push({ r: 1.1, z: 2, run: () => drawProp(ctx, 3, x, y, tile, tile) });
  }

  const people = state.employees.map((employee) => {
    const view = actorView(employee, state.upgrades);
    const snap = options.reduced || view.pose === "sit";
    const spot = follow(employee.id, { c: view.c, r: view.r }, dt, snap);
    return { employee, view, spot };
  });

  for (const person of people) {
    const contract = state.contracts.find((item) => item.id === person.employee.contractId && item.status === "active");
    const progress = contract ? Math.max(0, Math.min(1, contract.workDone / contract.workTotal)) : null;
    queue.push({
      r: person.spot.r + 0.2,
      z: 3,
      run: () =>
        drawActor(
          ctx,
          person.employee,
          person.view,
          person.spot,
          ox,
          oy,
          tile,
          tile,
          now,
          options.selectedId === person.employee.id,
          progress,
          options.reduced,
        ),
    });
  }

  queue.sort((a, b) => a.r - b.r || a.z - b.z);
  for (const item of queue) item.run();

  if (burst) spawn(ox + tile * 4, oy + tile * 5);
  if (particles.length > 0 && !options.reduced) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      if (!particle) continue;
      particle.life -= dt * 1.6;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 80 * dt;
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = i % 2 === 0 ? C.brass : C.cream;
      ctx.fillRect(particle.x, particle.y, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function paintFurn(ctx: CanvasRenderingContext2D, item: Furn, x: number, y: number, tw: number, th: number) {
  if (item.kind === "desk") drawProp(ctx, 2, x, y, tw, th);
  else if (item.kind === "plant") drawProp(ctx, 1, x, y, tw, th);
  else if (item.kind === "coffee") drawProp(ctx, 0, x, y, tw, th);
  else if (item.kind === "chair") drawChair(ctx, x, y, tw, th);
  else if (item.kind === "printer") drawPrinter(ctx, x, y, tw, th);
  else if (item.kind === "bench") drawBench(ctx, x, y, tw, th);
  else if (item.kind === "seal") drawSeal(ctx, x, y, tw, th);
}
