/**
 * EmptyState Component
 * Reusable styled component for empty, loading, and error states
 */

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  };
  children?: ReactNode;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-12 px-6"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="mb-4"
      >
        <Icon size={40} className="text-slate-500" />
      </motion.div>

      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-slate-400 text-center max-w-sm mb-6">
          {description}
        </p>
      )}

      {children}

      {action && (
        <button
          onClick={action.onClick}
          className={clsx(
            "mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            action.variant === "primary"
              ? "bg-emerald-950/40 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-950/60"
              : "bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600",
          )}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
