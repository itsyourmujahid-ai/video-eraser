"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EraserStage } from "@/components/video-lab/EraserStage";
import { VideoDropzone } from "@/components/video-lab/VideoDropzone";
import { ErrorBanner, ProgressOverlay } from "@/components/image-lab/primitives";
import { Icon } from "@/components/ui/icon";
import { formatBytes } from "@/lib/image/engine";
import { cyan, type Accent } from "@/lib/video/theme";
import {
  buildCleanPlates,
  eraseAndExport,
  formatDuration,
  loadSourceVideo,
  resolveExportSize,
} from "@/lib/video/engine";
import type {
  CleanPatch,
  EraseResult,
  ExportResolution,
  MarkRegion,
  SourceVideo,
} from "@/lib/video/types";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 500;

function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

const RESOLUTIONS: Array<{ value: ExportResolution; label: string }> = [
  { value: "original", label: "Original" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
];

const QUALITIES = [
  { value: "high", label: "High", bitrate: 12_000_000 },
  { value: "balanced", label: "Balanced", bitrate: 6_000_000 },
  { value: "fast", label: "Fast", bitrate: 3_000_000 },
] as const;

type Quality = (typeof QUALITIES)[number]["value"];
type GestureMode = "idle" | "draw" | "move";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function VideoLab() {
  const accent: Accent = cyan;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gestureRef = useRef<{
    mode: GestureMode;
    id: number | null;
    dx: number;
    dy: number;
    x0: number;
    y0: number;
  }>({ mode: "idle", id: null, dx: 0, dy: 0, x0: 0, y0: 0 });
  const regionIdRef = useRef(0);

  const [source, setSource] = useState<SourceVideo | null>(null);
  const [regions, setRegions] = useState<MarkRegion[]>([]);
  const [draft, setDraft] = useState<MarkRegion | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<"original" | "erased" | "result">("original");
  const [result, setResult] = useState<EraseResult | null>(null);
  const [plates, setPlates] = useState<CleanPatch[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState<"plates" | "export" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ExportResolution>("720p");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const sourceUrl = source?.objectUrl ?? "";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (sourceUrl) {
      video.src = sourceUrl;
      video.load();
    }
  }, [sourceUrl, source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= (video.duration || 0) - 0.02) setPlaying(false);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [source]);

  useEffect(() => {
    return () => {
      if (source?.objectUrl) URL.revokeObjectURL(source.objectUrl);
      if (result?.objectUrl) URL.revokeObjectURL(result.objectUrl);
    };
  }, [source, result]);

  const selectRegion = useCallback((id: number | null) => setSelectedId(id), []);

  const deleteRegion = useCallback((id: number) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    setPlates(null);
  }, []);

  const updateRegion = useCallback((id: number, patch: Partial<MarkRegion>) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (selectedId == null) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteRegion(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteRegion]);

  const [appliedResolution, setAppliedResolution] = useState(resolution);
  if (appliedResolution !== resolution) {
    setAppliedResolution(resolution);
    setPlates(null);
  }

  const showErased = useCallback(() => {
    setView("erased");
    if (!source || processing || plates) return;
    setError(null);
    setProcessing(true);
    setStage("plates");
    setProgress(0);
    void (async () => {
      try {
        const size = resolveExportSize(source, resolution);
        const built = await buildCleanPlates(
          source,
          regions,
          size.width,
          size.height,
          (pct) => setProgress(Math.round(pct * 100)),
        );
        setPlates(built);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The erased preview could not be built.");
      } finally {
        setProcessing(false);
        setStage(null);
        setProgress(null);
      }
    })();
  }, [source, regions, resolution, plates, processing]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Please upload a video under ${MAX_FILE_MB} MB.`);
      return;
    }
    try {
      setResult((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return null;
      });
      setSource((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return null;
      });
      setRegions([]);
      setDraft(null);
      setSelectedId(null);
      setView("original");
      setCurrentTime(0);
      setPlaying(false);
      setPlates(null);
      regionIdRef.current = 0;
      const loaded = await loadSourceVideo(file);
      setSource(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The video could not be loaded.");
    }
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handlePointerDown = useCallback(
    (x: number, y: number) => {
      if (processing) return;
      const g = gestureRef.current;
      const hit = [...regions]
        .reverse()
        .find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
      if (hit) {
        g.mode = "move";
        g.id = hit.id;
        g.dx = x - hit.x;
        g.dy = y - hit.y;
        selectRegion(hit.id);
      } else {
        g.mode = "draw";
        g.x0 = x;
        g.y0 = y;
        setDraft({ id: -1, x, y, width: 0, height: 0 });
      }
    },
    [processing, regions, selectRegion],
  );

  const handlePointerMove = useCallback(
    (x: number, y: number) => {
      const g = gestureRef.current;
      if (g.mode === "move" && g.id != null) {
        const target = regions.find((r) => r.id === g.id);
        if (!target) return;
        const nx = clamp01(x - g.dx);
        const ny = clamp01(y - g.dy);
        updateRegion(g.id, {
          x: clamp01(nx),
          y: clamp01(ny),
        });
      } else if (g.mode === "draw") {
        const left = clamp01(Math.min(g.x0, x));
        const top = clamp01(Math.min(g.y0, y));
        setDraft({
          id: -1,
          x: left,
          y: top,
          width: clamp01(Math.abs(x - g.x0)),
          height: clamp01(Math.abs(y - g.y0)),
        });
      }
    },
    [regions, updateRegion],
  );

  const handlePointerUp = useCallback(() => {
    const g = gestureRef.current;
    if (g.mode === "draw") {
      const d = draft;
      if (d && d.width > 0.004 && d.height > 0.004) {
        const id = ++regionIdRef.current;
        setRegions((prev) => [...prev, { id, x: d.x, y: d.y, width: d.width, height: d.height }]);
        setSelectedId(id);
        setPlates(null);
      }
      setDraft(null);
    }
    g.mode = "idle";
    g.id = null;
  }, [draft]);

  const runErase = useCallback(async () => {
    if (!source || processing) return;
    if (!regions.some((r) => r.width > 0.004 && r.height > 0.004)) {
      setError("Draw an eraser region over the logo or watermark first.");
      return;
    }
    setError(null);
    setProcessing(true);
    setProgress(0);
    setStage("plates");
    try {
      const qualityEntry = QUALITIES.find((q) => q.value === quality) ?? QUALITIES[1];
      const output = await eraseAndExport(
        source,
        regions,
        { resolution, bitrate: qualityEntry.bitrate, featherPx: 10 },
        {
          onStage: setStage,
          onProgress: (pct) => setProgress(Math.round(pct * 100)),
        },
      );
      setResult((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return output;
      });
      setView("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setProcessing(false);
      setStage(null);
      setProgress(null);
    }
  }, [source, regions, processing, quality, resolution]);

  const clearRegions = useCallback(() => {
    setRegions([]);
    setDraft(null);
    setSelectedId(null);
    setPlates(null);
    gestureRef.current = { mode: "idle", id: null, dx: 0, dy: 0, x0: 0, y0: 0 };
    setView("original");
  }, []);

  const newVideo = useCallback(() => {
    if (processing) return;
    setResult((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    setSource((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    const video = videoRef.current;
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
    setRegions([]);
    setDraft(null);
    setSelectedId(null);
    setView("original");
    setCurrentTime(0);
    setPlaying(false);
    setError(null);
    setPlates(null);
    regionIdRef.current = 0;
  }, [processing]);

  const download = useCallback(() => {
    if (!result) return;
    const anchor = document.createElement("a");
    anchor.href = result.objectUrl;
    anchor.download = `${source?.baseName ?? "video"}-erased.${result.ext}`;
    anchor.click();
  }, [result, source]);

  const [stageRef, stageWidth] = useContainerWidth<HTMLDivElement>();
  const srcW = source?.width ?? result?.width ?? 16;
  const srcH = source?.height ?? result?.height ?? 9;
  const aspect = srcH > 0 ? srcW / srcH : 16 / 9;
  let displayW = stageWidth || 720;
  let displayH = displayW / aspect;
  if (displayH > 520) {
    displayH = 520;
    displayW = displayH * aspect;
  }

  const duration = source?.duration ?? 0;
  const currentLabel = formatDuration(currentTime);
  const totalLabel = formatDuration(duration);

  const progressLabel =
    stage === "plates" ? "Analysing footage, building clean plates…" : "Exporting — plays back in real time…";
  const progressNote =
    stage === "export" && duration > 0
      ? `Your ${formatDuration(duration)} clip will take roughly the same time to export.`
      : undefined;

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="anim-rise-in relative mb-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
        <div
          aria-hidden
          className={cn(
            "absolute -right-24 -top-28 h-64 w-64 rounded-full bg-gradient-to-br opacity-20 blur-3xl",
            accent.gradient,
          )}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            className={cn(
              "grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-xl",
              accent.gradient,
              accent.glow,
            )}
          >
            <Icon name="video" className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Video Eraser · 100% in-browser
            </p>
            <h1 className="font-display mt-0.5 text-2xl font-bold tracking-tight text-white">
              Video Lab
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Erase logos, watermarks and burned-in text — your clips never leave this device.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live tools
          </span>
        </div>
      </section>

      <video ref={videoRef} muted playsInline preload="auto" className="hidden" />

      {error && (
        <div className="mx-auto mb-6 max-w-3xl">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {!source ? (
        <VideoDropzone onFile={handleFile} accent={accent} disabled={processing} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section className="order-2 min-w-0 lg:order-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{source.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {source.width} × {source.height} · {formatDuration(source.duration)} ·{" "}
                  {formatBytes(source.bytes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {(["original", "erased", "result"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={v === "erased" ? showErased : () => setView(v)}
                    disabled={v === "result" && !result}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      view === v
                        ? "bg-white/[0.1] text-white"
                        : "text-zinc-500 hover:text-zinc-300",
                    )}
                  >
                    {v === "result" && result
                      ? `Result · ${formatBytes(result.blob.size)}`
                      : v}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={stageRef}
              className="relative mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0c14] p-4"
            >
              <EraserStage
                videoRef={videoRef}
                regions={regions}
                draft={draft}
                selectedId={selectedId}
                view={view}
                resultUrl={result?.objectUrl ?? ""}
                patches={plates ?? []}
                featherPx={10}
                accentColor="#22d3ee"
                disabled={processing}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
              {processing && (
                <ProgressOverlay label={progressLabel} pct={progress} note={progressNote} />
              )}
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={processing}
                aria-label={playing ? "Pause preview" : "Play preview"}
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow transition-transform hover:scale-105 disabled:opacity-40",
                  accent.gradient,
                  accent.glow,
                )}
              >
                <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
                <span className="sr-only">{playing ? "Pause preview" : "Play preview"}</span>
              </button>
              <input
                type="range"
                className="dk-range w-full"
                min={0}
                max={duration || 1}
                step={0.01}
                value={currentTime}
                onChange={(event) => seekTo(Number(event.target.value))}
                aria-label="Seek through the video"
              />
              <span className="shrink-0 tabular-nums text-xs font-medium text-zinc-400">
                {currentLabel} / {totalLabel}
              </span>
            </div>

            <p className="mt-2 text-center text-[11px] text-zinc-600">
                {view === "result"
                  ? "Switch back to Original or Erased to adjust regions and export again."
                  : view === "erased"
                    ? "Live preview — the logo is removed and the background re-filled. Switch to Original to tweak regions."
                    : regions.length === 0
                      ? "Drag on the preview to draw a box over the logo or watermark, then open Erased to check it."
                      : "Drag a box to move it · drag outside to draw more · Del removes the selected box."}
              </p>
          </section>

          <aside className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br text-white",
                    accent.gradient,
                  )}
                >
                  <Icon name="eraser" className="h-[18px] w-[18px]" />
                </span>
                <h2 className="font-display text-base font-bold text-white">Logo Eraser</h2>
              </div>

              <div className="mt-5 space-y-6">
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Eraser regions
                    </label>
                    <span className="text-[11px] text-zinc-500">{regions.length}</span>
                  </div>
                  {regions.length > 0 ? (
                    <div className="space-y-1.5">
                      {regions.map((region, index) => {
                        const active = region.id === selectedId;
                        return (
                          <div
                            key={region.id}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                              active
                                ? "border-cyan-400/30 bg-cyan-500/10 text-white"
                                : "border-white/10 bg-white/[0.03] text-zinc-400",
                            )}
                          >
                            {!active && (
                              <button
                                type="button"
                                onClick={() => setSelectedId(region.id)}
                                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                              >
                                <span className="truncate text-[13px] font-medium">
                                  Region {index + 1}
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums opacity-80">
                                  {Math.round(region.width * 100)} ×{" "}
                                  {Math.round(region.height * 100)}%
                                </span>
                              </button>
                            )}
                            {active && (
                              <span className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                                <span className="truncate text-[13px] font-medium">
                                  Region {index + 1}
                                </span>
                                <span className="shrink-0 text-[11px] tabular-nums opacity-80">
                                  {Math.round(region.width * 100)} ×{" "}
                                  {Math.round(region.height * 100)}%
                                </span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteRegion(region.id)}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-300"
                              aria-label={`Delete region ${index + 1}`}
                            >
                              <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[13px] leading-relaxed text-zinc-400">
                      No regions yet. Draw a box on the video where the logo or
                      watermark sits.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Output size
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RESOLUTIONS.map((option) => {
                      const active = option.value === resolution;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setResolution(option.value)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                            active
                              ? "border-transparent bg-gradient-to-br text-white shadow"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200",
                            accent.gradient,
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Bitrate
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUALITIES.map((option) => {
                      const active = option.value === quality;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setQuality(option.value)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                            active
                              ? "border-transparent bg-gradient-to-br text-white shadow"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200",
                            accent.gradient,
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[11px] leading-relaxed text-zinc-500">
                  The app samples the clip, learns the background hidden behind
                  the logo, then re-synthesises it frame by frame on your
                  device — even when the footage behind the logo never moves.
                  Audio is preserved when your browser supports it.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-2 border-t border-white/[0.06] pt-5">
                <button
                  type="button"
                  onClick={runErase}
                  disabled={processing || regions.length === 0}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
                    accent.gradient,
                    accent.glow,
                  )}
                >
                  <Icon name="eraser" className="h-4 w-4" />
                  {processing ? "Working…" : "Erase & export"}
                </button>
                <button
                  type="button"
                  onClick={download}
                  disabled={!result || processing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="download" className="h-4 w-4" />
                  {result ? `Download .${result.ext}` : "Nothing to download yet"}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearRegions}
                    disabled={regions.length === 0 || processing}
                    className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear regions
                  </button>
                  <button
                    type="button"
                    onClick={newVideo}
                    disabled={processing}
                    className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    New video
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}