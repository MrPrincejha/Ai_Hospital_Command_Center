// frontend/components/CopilotPanel.tsx
/**
 * AI Hospital Command Center — AI Copilot Chat Panel
 * ===================================================
 * Full conversational interface for the LangChain-powered
 * hospital operations AI copilot.
 *
 * Features:
 * - Chat message thread with user / assistant bubbles
 * - Quick-prompt suggestion buttons
 * - Telemetry context indicator (shows what the AI "sees")
 * - Mock mode toggle (no API key required)
 * - Session management (clear history)
 * - Message metadata: model, latency, timestamp
 * - Auto-scroll to latest message
 * - Animated loading dots while AI responds
 * - Copilot readiness status check on mount
 */

"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lightbulb,
  Loader2,
  Send,
  Trash2,
  User,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { useCopilot } from "@/hooks/useHospital";
import { useHospitalStore } from "@/store/hospitalStore";
import { fmtPct, relativeTime } from "@/lib/utils";
import type { ChatMessage } from "@/types/hospital";

// ─────────────────────────────────────────────────────────────────────────────
// Quick prompts
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { icon: Zap,       label: "ER Status",       text: "Why is the ER congested right now? What should we do?" },
  { icon: BrainCircuit, label: "ICU Forecast", text: "Assess ICU capacity and give me a 12-hour forecast review." },
  { icon: Lightbulb, label: "Staffing",        text: "What staffing adjustments should I make for the next 12 hours?" },
  { icon: CheckCircle2, label: "Overview",     text: "Give me a complete hospital operational status summary." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Loading animation
// ─────────────────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-cyan-400"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({ msg, index }: { msg: ChatMessage; index: number }) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.2) }}
      className={clsx(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className={clsx(
          "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5",
          isUser
            ? "bg-cyan-500/15 border border-cyan-500/25"
            : "bg-surface-600 border border-[rgba(6,182,212,0.15)]",
        )}
      >
        {isUser
          ? <User size={13} className="text-cyan-400" />
          : <Bot size={13} className="text-ink-secondary" />
        }
      </div>

      {/* Bubble */}
      <div
        className={clsx(
          "flex-1 max-w-[85%]",
          isUser ? "items-end" : "items-start",
          "flex flex-col gap-1",
        )}
      >
        <div
          className={clsx(
            "px-4 py-3 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-cyan-500/12 border border-cyan-500/20 text-ink-primary rounded-tr-sm"
              : "bg-surface-700 border border-[rgba(6,182,212,0.08)] text-ink-primary rounded-tl-sm",
          )}
        >
          {/* Preserve line breaks in AI responses */}
          {msg.content.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < msg.content.split("\n").length - 1 && <br />}
            </span>
          ))}
        </div>

        {/* Metadata footer */}
        <div
          className={clsx(
            "flex items-center gap-2 px-1",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="font-display text-[10px] text-ink-muted">
            {relativeTime(msg.timestamp)}
          </span>
          {msg.model && (
            <span className="font-display text-[10px] text-ink-muted">
              · {msg.model}
            </span>
          )}
          {msg.latency_ms !== undefined && (
            <span className="font-display text-[10px] text-ink-muted flex items-center gap-0.5">
              <Clock size={9} />
              {msg.latency_ms.toFixed(0)}ms
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Context status bar
// ─────────────────────────────────────────────────────────────────────────────

function ContextBar() {
  const telemetry = useHospitalStore((s) => s.latestTelemetry);
  const forecast  = useHospitalStore((s) => s.latestForecast);
  const wsState   = useHospitalStore((s) => s.wsState);
  const isLive    = wsState === "CONNECTED";

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-[rgba(6,182,212,0.06)] bg-surface-900/60 flex-wrap">
      <span className="font-display text-[10px] text-ink-muted tracking-widest uppercase">
        AI Context:
      </span>

      {/* Telemetry */}
      <div className={clsx(
        "flex items-center gap-1.5 font-display text-[10px] tracking-wider",
        telemetry ? "text-emerald-400" : "text-ink-muted",
      )}>
        {isLive
          ? <Wifi size={10} className="text-emerald-400" />
          : <WifiOff size={10} />
        }
        {telemetry
          ? `Telemetry live · Queue ${telemetry.total_queue} · ICU ${fmtPct(telemetry.icu_occupancy_pct, 0)} · ER ${fmtPct(telemetry.er_congestion_pct, 0)}`
          : "No telemetry"
        }
      </div>

      <span className="text-ink-dim">|</span>

      {/* Forecast */}
      <div className={clsx(
        "flex items-center gap-1.5 font-display text-[10px] tracking-wider",
        forecast ? "text-cyan-400" : "text-ink-muted",
      )}>
        <BrainCircuit size={10} />
        {forecast
          ? `Forecast · Risk: ${forecast.risk_level.toUpperCase()}`
          : "No forecast"
        }
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CopilotPanel() {
  const { messages, loading, sendMessage, clearSession } = useCopilot();
  const [input,    setInput]   = useState("");
  const [useMock,  setUseMock] = useState(true);
  const bottomRef              = useRef<HTMLDivElement>(null);
  const textareaRef            = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(() => {
    const query = input.trim();
    if (!query || loading) return;
    setInput("");
    sendMessage(query, useMock);
  }, [input, loading, useMock, sendMessage]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleQuickPrompt = useCallback((text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-128px)] max-w-4xl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(6,182,212,0.08)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
            <BrainCircuit size={16} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-primary tracking-wide">
              AI Operations Copilot
            </h2>
            <p className="font-display text-[10px] text-ink-muted tracking-widest">
              LANGCHAIN · GPT-4O-MINI · TELEMETRY-AWARE
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mock toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              onClick={() => setUseMock(!useMock)}
              className={clsx(
                "relative w-9 h-5 rounded-full border transition-all",
                useMock
                  ? "bg-cyan-500/20 border-cyan-500/40"
                  : "bg-surface-700 border-[rgba(6,182,212,0.1)]",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                  useMock ? "left-4 bg-cyan-400" : "left-0.5 bg-ink-muted",
                )}
              />
            </button>
            <span className="font-display text-[10px] text-ink-secondary tracking-wider hidden sm:inline">
              Mock
            </span>
          </label>

          {/* Clear */}
          {messages.length > 0 && (
            <button
              onClick={clearSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-display text-[11px] tracking-widest uppercase bg-surface-700 text-ink-secondary border border-[rgba(6,182,212,0.08)] hover:border-red-500/25 hover:text-red-400 transition-all"
            >
              <Trash2 size={11} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Context bar ──────────────────────────────────────────────────── */}
      <ContextBar />

      {/* ── Message thread ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full gap-6 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/8 border border-cyan-500/15 flex items-center justify-center">
              <BrainCircuit size={28} className="text-cyan-400/60" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-ink-secondary tracking-wider mb-2">
                Hospital Copilot Ready
              </h3>
              <p className="font-body text-sm text-ink-muted max-w-sm leading-relaxed">
                Ask me about ER congestion, ICU capacity, staffing, or any
                operational question. I have access to your live telemetry
                and 12-hour ML forecast.
              </p>
            </div>

            {/* Quick prompts */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {QUICK_PROMPTS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.label}
                    onClick={() => handleQuickPrompt(p.text)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left bg-surface-700 border border-[rgba(6,182,212,0.08)] hover:border-cyan-500/25 hover:bg-surface-600 transition-all group"
                  >
                    <Icon size={13} className="text-cyan-400/60 group-hover:text-cyan-400 flex-shrink-0" />
                    <span className="font-display text-[11px] text-ink-secondary group-hover:text-ink-primary tracking-wide">
                      {p.label}
                    </span>
                    <ChevronRight size={11} className="text-ink-muted ml-auto" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} msg={msg} index={i} />
        ))}

        {/* Loading indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-surface-600 border border-[rgba(6,182,212,0.15)] flex items-center justify-center mt-0.5">
              <Bot size={13} className="text-ink-secondary" />
            </div>
            <div className="bg-surface-700 border border-[rgba(6,182,212,0.08)] rounded-2xl rounded-tl-sm">
              <TypingDots />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-[rgba(6,182,212,0.08)] bg-surface-900/60">

        {/* Quick prompts (collapsed above input) */}
        {messages.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {QUICK_PROMPTS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.label}
                  onClick={() => handleQuickPrompt(p.text)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-display text-[10px] tracking-widest uppercase bg-surface-700 text-ink-muted border border-[rgba(6,182,212,0.06)] hover:border-cyan-500/20 hover:text-ink-secondary transition-all"
                >
                  <Icon size={10} />
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Textarea + send */}
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about operations, staffing, congestion… (Enter to send)"
            rows={2}
            className="flex-1 px-4 py-3 rounded-xl bg-surface-700 border border-[rgba(6,182,212,0.12)] text-ink-primary font-body text-sm resize-none focus:outline-none focus:border-cyan-500/35 placeholder-ink-muted leading-relaxed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={clsx(
              "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border transition-all",
              !input.trim() || loading
                ? "bg-surface-700 border-[rgba(6,182,212,0.06)] text-ink-muted cursor-not-allowed"
                : "bg-cyan-500/15 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25",
            )}
          >
            {loading
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} />
            }
          </button>
        </div>
        <p className="font-display text-[10px] text-ink-muted mt-2 tracking-wider">
          Shift+Enter for new line · AI responses grounded in live telemetry
        </p>
      </div>
    </div>
  );
}
