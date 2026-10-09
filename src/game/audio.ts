let ctx: AudioContext | null = null;
let muted = false;

export function loadMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    muted = localStorage.getItem("office-story-mute") === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem("office-story-mute", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export function blip(kind: "ok" | "fail" | "tap") {
  if (muted || !ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = kind === "fail" ? 170 : kind === "ok" ? 540 : 320;
  gain.gain.value = 0.035;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.start(now);
  osc.stop(now + 0.13);
}
