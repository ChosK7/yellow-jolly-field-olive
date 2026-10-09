let painter: ((now: number) => void) | null = null;

export function setPainter(fn: ((now: number) => void) | null) {
  painter = fn;
}

export function paintFrame(now: number) {
  painter?.(now);
}
