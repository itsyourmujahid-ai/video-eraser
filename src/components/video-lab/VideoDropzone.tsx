"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { Accent } from "@/lib/video/theme";
import { cn } from "@/lib/utils";

export function VideoDropzone({
  onFile,
  accent,
  disabled,
}: {
  onFile: (file: File) => void;
  accent: Accent;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | undefined | null) {
    if (file) onFile(file);
  }

  return (
    <div className="anim-rise-in mx-auto max-w-3xl">
      <div className="grid place-items-center py-10 text-center sm:py-16">
        <div className="glass-panel mb-8 rounded-3xl p-8 text-center sm:p-10">
          <Icon name="video" className="mx-auto h-8 w-8 text-cyan-300" />
          <h1 className="font-display mt-4 text-2xl font-bold text-white sm:text-3xl">
            Video Lab
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
            Erase logos, watermarks and on-screen clutter. Zero uploads — every
            frame is processed right in your browser.
          </p>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (disabled) return;
            handleFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            "glass-panel glass-hover group relative w-full rounded-3xl border-2 border-dashed px-6 py-14 transition-colors sm:py-16",
            dragOver
              ? cn("border-transparent bg-white/[0.06]", accent.glow)
              : "border-white/10 hover:border-white/20",
          )}
        >
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 text-zinc-950 shadow-lg shadow-cyan-500/25 transition-transform duration-300 group-hover:scale-110">
            <Icon name="video" className="h-8 w-8" />
          </span>
          <span className="font-display mt-6 block text-lg font-semibold text-white">
            Drag &amp; drop a video here
          </span>
          <span className="mt-2 block text-sm text-zinc-400">
            …or click to browse your files
          </span>
          <span className="mt-5 inline-flex flex-wrap items-center justify-center gap-2 text-[11px] font-medium text-zinc-500">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
              MP4
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
              WebM
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
              MOV
            </span>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-cyan-300">
              Max 500 MB
            </span>
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}