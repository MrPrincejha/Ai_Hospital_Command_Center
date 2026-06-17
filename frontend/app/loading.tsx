// frontend/app/loading.tsx
/**
 * AI Hospital Command Center — App Router Loading UI
 * ===================================================
 * Shown by Next.js while the root page segment is loading.
 * Matches the command-center aesthetic.
 */

import { HeartPulse } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-6">
      {/* Logo mark */}
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
          <HeartPulse size={28} className="text-cyan-400" />
        </div>
        {/* Ping ring */}
        <div className="absolute inset-0 rounded-2xl border border-cyan-400/30 animate-ping" />
      </div>

      <div className="text-center space-y-1">
        <p className="font-display text-xs font-bold text-ink-primary tracking-widest uppercase">
          AI Hospital Command Center
        </p>
        <p className="font-display text-[10px] text-ink-muted tracking-widest uppercase">
          Initialising systems…
        </p>
      </div>

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-cyan-500/50 animate-pulse"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
