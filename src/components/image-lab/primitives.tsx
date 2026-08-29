"use client";

import { Icon } from "@/components/ui/icon";
import type { Accent } from "@/lib/video/theme";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-medium text-zinc-300">{label}</label>
        {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function RangeInput({
  value,
  min,
  max,
  step,
  onChange,
  format,
  accent,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  accent: Accent;
}) {
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn("dk-range w-full")}
      />
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
        <span>{format ? format(min) : min}</span>
        <span className={cn("font-semibold", accent.text)}>
          {format ? format(value) : value}
        </span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

export function SelectChips({
  options,
  value,
  onChange,
  accent,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  accent: Accent;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? cn("border-transparent bg-gradient-to-br text-white shadow", accent.gradient)
                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="anim-pop-in flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-500/20">
        <Icon name="close" className="h-3.5 w-3.5 text-red-300" />
      </span>
      <p className="flex-1 text-sm leading-relaxed text-red-200">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs font-medium text-red-300/80 underline-offset-2 hover:text-red-200 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}

export function ProgressOverlay({
  label,
  pct,
  note,
}: {
  label: string;
  pct: number | null;
  note?: string;
}) {
  return (
    <div className="anim-fade-in absolute inset-0 z-10 grid place-items-center rounded-2xl bg-[#070910]/70 backdrop-blur-sm">
      <div className="glass-panel w-[min(92%,340px)] rounded-2xl p-6 text-center">
        <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        <p className="mt-4 text-sm font-semibold text-white">{label}</p>
        {pct !== null && (
          <>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">{pct}%</p>
          </>
        )}
        {note && <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{note}</p>}
      </div>
    </div>
  );
}

export function CheckerboardImage({
  url,
  alt,
  width,
  height,
  className,
}: {
  url: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  const style: React.CSSProperties = {
    backgroundImage:
      "linear-gradient(45deg, #1a1f2e 25%, transparent 25%), linear-gradient(-45deg, #1a1f2e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1f2e 75%), linear-gradient(-45deg, transparent 75%, #1a1f2e 75%)",
    backgroundSize: "24px 24px",
    backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
    backgroundColor: "#11141f",
    width,
    height,
  };
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={style} />;
}