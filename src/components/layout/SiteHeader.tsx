import Link from "next/link";

import { Icon } from "@/components/ui/icon";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070910]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-zinc-950 shadow-lg shadow-cyan-500/20 transition-transform group-hover:scale-105">
            <Icon name="eraser" className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="font-display block text-[15px] font-bold tracking-tight text-white">
              Video Eraser
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Logo &amp; watermark remover
            </span>
          </span>
        </Link>
        <span className="hidden items-center gap-1.5 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 sm:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
          100% in-browser
        </span>
      </div>
    </header>
  );
}