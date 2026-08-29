export interface Accent {
  text: string;
  bg: string;
  border: string;
  ring: string;
  gradient: string;
  glow: string;
  dot: string;
}

export const cyan: Accent = {
  text: "text-cyan-300",
  bg: "bg-cyan-500/10",
  border: "border-cyan-400/25",
  ring: "ring-cyan-400/30",
  gradient: "from-cyan-400 to-sky-500",
  glow: "shadow-cyan-500/15",
  dot: "bg-cyan-400",
};