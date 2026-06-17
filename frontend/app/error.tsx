// frontend/app/error.tsx
/**
 * AI Hospital Command Center — App Router Error Boundary
 * =======================================================
 * Catches unhandled runtime errors within the app segment.
 * Must be a Client Component (uses reset callback).
 */

"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console; swap for Sentry in production
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-8 max-w-md w-full border-red-500/30 bg-red-500/5 text-center space-y-5"
      >
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
        </div>

        <div>
          <h1 className="font-display text-base font-bold text-red-400 tracking-wider mb-2">
            Application Error
          </h1>
          <p className="font-body text-sm text-ink-secondary leading-relaxed">
            An unexpected error occurred in the Hospital Command Center.
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="font-mono text-xs text-red-400/70 mt-3 p-3 bg-red-500/8 rounded-lg text-left break-all">
              {error.message}
            </p>
          )}
        </div>

        <button
          onClick={reset}
          className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-lg font-display text-xs font-bold tracking-widest uppercase bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-all"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </motion.div>
    </div>
  );
}
