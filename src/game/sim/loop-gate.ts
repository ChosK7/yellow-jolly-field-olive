/** False when the app is backgrounded, the player paused, or the day is waiting to close. */
export function shouldSimulate(flags: {
  playing: boolean;
  hidden: boolean;
  paused: boolean;
  dusk: boolean;
}): boolean {
  return flags.playing && !flags.hidden && !flags.paused && !flags.dusk;
}
