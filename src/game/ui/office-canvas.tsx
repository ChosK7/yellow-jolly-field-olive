import { useEffect, useRef } from "react";
import { unlockAudio } from "../audio.ts";
import { setPainter } from "../frame.ts";
import { drawOffice, getArt, hitEmployee } from "../render/draw-office.ts";
import { getState } from "../store.ts";

export function OfficeCanvas({
  reduced,
  selectedId,
  onSelect,
}: {
  reduced: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const art = getArt();
    const paint = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      drawOffice(ctx, w, h, getState(), art, now, { reduced, selectedId });
    };
    setPainter(paint);
    paint(performance.now());
    return () => setPainter(null);
  }, [reduced, selectedId]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      aria-label="Escritório. Toque numa pessoa para ver a equipe."
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        unlockAudio();
        const canvas = event.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        const id = hitEmployee(x, y);
        if (id) onSelect(id);
      }}
    />
  );
}
