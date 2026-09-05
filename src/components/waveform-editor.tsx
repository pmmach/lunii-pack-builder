"use client";

import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WaveformEditorProps {
  peaks: number[];
  durationSeconds: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

export function WaveformEditor({
  peaks,
  durationSeconds,
  start,
  end,
  onChange,
}: WaveformEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(durationSeconds || 1, 0.1);

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#14b8a6",
      progressColor: "#0d9488",
      cursorWidth: 0,
      height: 96,
      normalize: true,
      peaks: [peaks],
      duration,
      interact: false,
    });
    return () => {
      ws.destroy();
    };
  }, [peaks, duration]);

  const startPct = Math.min(100, Math.max(0, (start / duration) * 100));
  const endPct = Math.min(100, Math.max(0, (end / duration) * 100));

  return (
    <div className="space-y-3">
      <div className="relative rounded-md border p-2">
        <div
          ref={containerRef}
          role="img"
          aria-label="Forme d'onde de l'épisode"
        />
        <div
          className="pointer-events-none absolute inset-y-2 left-2 right-2 overflow-hidden rounded"
          aria-hidden
        >
          <div
            className="bg-accent/25 absolute inset-y-0"
            style={{
              left: `${startPct}%`,
              width: `${Math.max(0, endPct - startPct)}%`,
            }}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="trim-start">Début (secondes)</Label>
          <Input
            id="trim-start"
            type="number"
            min={0}
            max={duration}
            step={0.1}
            value={Number(start.toFixed(1))}
            className="min-h-11"
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              onChange(Math.min(Math.max(0, next), end - 0.1), end);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trim-end">Fin (secondes)</Label>
          <Input
            id="trim-end"
            type="number"
            min={0}
            max={duration}
            step={0.1}
            value={Number(end.toFixed(1))}
            className="min-h-11"
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              onChange(start, Math.max(Math.min(duration, next), start + 0.1));
            }}
          />
        </div>
      </div>
    </div>
  );
}
