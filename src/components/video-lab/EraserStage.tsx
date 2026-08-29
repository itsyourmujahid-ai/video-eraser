"use client";

import { useCallback, useEffect, useRef } from "react";

import { applyPatches } from "@/lib/video/engine";
import type { CleanPatch, MarkRegion } from "@/lib/video/types";

interface EraserStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  regions: MarkRegion[];
  draft: MarkRegion | null;
  selectedId: number | null;
  view: "original" | "erased" | "result";
  resultUrl: string;
  patches: CleanPatch[];
  featherPx: number;
  accentColor: string;
  disabled: boolean;
  onPointerDown: (x: number, y: number) => void;
  onPointerMove: (x: number, y: number) => void;
  onPointerUp: () => void;
}

export function EraserStage({
  videoRef,
  regions,
  draft,
  selectedId,
  view,
  resultUrl,
  patches,
  featherPx,
  accentColor,
  disabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: EraserStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);

    if (view === "erased" && patches.length) {
      applyPatches(canvas, patches, featherPx);
    }

    const drawBox = (r: MarkRegion, active: boolean, isDraft: boolean) => {
      const px = r.x * w;
      const py = r.y * h;
      const pw = r.width * w;
      const ph = r.height * h;
      const lw = Math.max(1.5, Math.min(w, h) / 320);
      ctx.save();
      if (isDraft) {
        ctx.setLineDash([7, 6]);
      } else if (active) {
        ctx.setLineDash([]);
      } else {
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.75;
      }
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = active && !isDraft ? lw + 1 : lw;
      ctx.fillStyle = active ? `${accentColor}1f` : `${accentColor}0d`;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeRect(px + lw / 2, py + lw / 2, Math.max(0, pw - lw), Math.max(0, ph - lw));
      if (!isDraft && active) {
        const s = Math.max(7, lw * 3);
        const corners: Array<[number, number]> = [
          [px, py],
          [px + pw - s, py],
          [px, py + ph - s],
          [px + pw - s, py + ph - s],
        ];
        ctx.fillStyle = accentColor;
        for (const [cx, cy] of corners) {
          ctx.fillRect(cx, cy, s, s);
        }
      }
      ctx.restore();
    };

    for (const r of regions) drawBox(r, r.id === selectedId, false);
    if (draft) drawBox(draft, true, true);
  }, [videoRef, regions, draft, selectedId, accentColor, view, patches, featherPx]);

  useEffect(() => {
    if (view === "result") return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (video && video.currentTime !== last) {
        last = video.currentTime;
        draw();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view, videoRef, draw]);

  useEffect(() => {
    if (view === "result") return;
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => draw();
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onLoaded);
    return () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", onLoaded);
    };
  }, [view, videoRef, draw]);

  useEffect(() => {
    if (view !== "result") draw();
  }, [regions, draft, selectedId, view, draw]);

  const toNormalized = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return { x, y };
  };

  if (view === "result" && resultUrl) {
    return (
      <div className="relative flex justify-center">
        <video
          src={resultUrl}
          controls
          playsInline
          className="block max-h-[560px] w-auto max-w-full rounded-lg bg-black"
        />
      </div>
    );
  }

  return (
    <div className="relative flex justify-center">
      <canvas
        ref={canvasRef}
        className="block max-h-[560px] rounded-lg bg-black"
        style={{ width: "auto", maxWidth: "100%", touchAction: "none", cursor: "crosshair" }}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = toNormalized(event);
          onPointerDown(p.x, p.y);
        }}
        onPointerMove={(event) => {
          if (disabled) return;
          const p = toNormalized(event);
          onPointerMove(p.x, p.y);
        }}
        onPointerUp={() => {
          if (disabled) return;
          onPointerUp();
        }}
        onPointerCancel={onPointerUp}
        aria-label="Video preview with eraser regions"
      />
    </div>
  );
}