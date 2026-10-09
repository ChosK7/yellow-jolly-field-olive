import { useEffect } from "react";
import { resumeAudio } from "../audio.ts";
import { paintFrame } from "../frame.ts";
import { shouldSimulate } from "../sim/loop-gate.ts";
import { flushSave, getState, runSteps } from "../store.ts";

const STEP = 0.25;

export function useGameLoop(playing: boolean) {
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let drawAcc = 0;
    let simAcc = 0;

    const frame = (now: number) => {
      if (document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = getState();
      if (
        shouldSimulate({
          playing: true,
          hidden: false,
          paused: current.pausedByUser,
          dusk: current.dayReport !== null,
        })
      ) {
        simAcc += dt;
        let steps = 0;
        while (simAcc >= STEP && steps < 4) {
          runSteps(current.speed);
          simAcc -= STEP;
          steps += 1;
        }
      } else {
        simAcc = 0;
      }
      drawAcc += dt;
      if (drawAcc >= 1 / 30) {
        paintFrame(now);
        drawAcc = 0;
      }
      raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        simAcc = 0;
        flushSave();
        return;
      }
      last = performance.now();
      simAcc = 0;
      resumeAudio();
      raf = requestAnimationFrame(frame);
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flushSave);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flushSave);
      flushSave();
    };
  }, [playing]);
}
