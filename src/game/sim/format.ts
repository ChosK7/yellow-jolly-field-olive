export function formatClock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = ((minute % 60) + 60) % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}R$ ${abs}`;
}

export function formatDeadline(day: number, absolute: number): string {
  const dueDay = Math.floor(absolute / 1440) + 1;
  const minute = ((absolute % 1440) + 1440) % 1440;
  const clock = formatClock(minute);
  if (dueDay === day) return `hoje ${clock}`;
  if (dueDay === day + 1) return `amanhã ${clock}`;
  return `dia ${dueDay}, ${clock}`;
}

export function formatEta(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `cerca de ${m} min`;
  if (m === 0) return `cerca de ${h}h`;
  return `cerca de ${h}h${String(m).padStart(2, "0")}`;
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}
