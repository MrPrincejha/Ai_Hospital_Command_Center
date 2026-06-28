// frontend/components/CopilotPanel.tsx
"use client";

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { useCopilot } from "@/hooks/useHospital";
import type { ChatMessage } from "@/types/hospital";

function parseInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function parseText(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList) {
      elements.push(<ol key={`ol-${elements.length}`}>{listItems}</ol>);
      inList = false;
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    const listMatch = line.match(/^\d+\.\s+(.*)/);
    if (listMatch) {
      inList = true;
      listItems.push(<li key={i}>{parseInline(listMatch[1])}</li>);
    } else {
      flushList();
      if (line.trim() !== '') {
        elements.push(<p key={i} className="mb-2 last:mb-0">{parseInline(line)}</p>);
      }
    }
  });
  flushList();

  return <>{elements}</>;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="msg-user">
        <div className="flex flex-col items-end">
          <div className="msg-user__bubble">
            {msg.content}
          </div>
          <div className="msg-ai__meta text-right">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <div className="msg-user__avatar">US</div>
      </div>
    );
  }

  return (
    <div className="msg-ai">
      <div className="msg-ai__avatar">
        <i className="ti ti-bot" />
      </div>
      <div className="flex flex-col">
        <div className="msg-ai__bubble">
          {parseText(msg.content)}
        </div>
        <div className="msg-ai__meta">
          {new Date(msg.timestamp).toLocaleTimeString()}
          {msg.model && ` · ${msg.model.replace(/\[mock\] /gi, '')}`}
          {msg.latency_ms && ` · ${msg.latency_ms}ms`}
        </div>
      </div>
    </div>
  );
}

export default function CopilotPanel() {
  const { messages, loading, sendMessage, clearSession } = useCopilot();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = useCallback(() => {
    const query = input.trim();
    if (!query || loading) return;
    setInput("");
    sendMessage(query, true);
  }, [input, loading, sendMessage]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] w-full max-w-4xl bg-[#030B1A] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden shadow-2xl relative">
      <div className="copilot-header flex justify-between items-center">
        <div>
          <div className="copilot-title"><i className="ti ti-message-chatbot" /> AI Operations Copilot</div>
          <div className="copilot-meta">LANGCHAIN · GPT-4O-MINI · TELEMETRY-AWARE</div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearSession} className="text-[11px] font-bold tracking-widest uppercase text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 border border-slate-800 rounded-lg bg-slate-900/50">
            Clear Chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {messages.length === 0 && !loading && (
          <div className="copilot-empty">
            <div className="copilot-empty__icon"><i className="ti ti-brain" /></div>
            <div>
              <div className="copilot-empty__title text-center">Hospital Copilot Ready</div>
              <div className="copilot-empty__sub mt-2">I have access to live telemetry and the 12-hour XGBoost forecast.<br/>How can I help you today?</div>
            </div>
            
            <div className="prompt-chips">
              <div className="prompt-chip" onClick={() => { setInput("Are any departments currently critical?"); handleSend(); }}>Are any departments currently critical?</div>
              <div className="prompt-chip" onClick={() => { setInput("What is the projected ER wait time in 2 hours?"); handleSend(); }}>Projected ER wait time?</div>
              <div className="prompt-chip" onClick={() => { setInput("Show me the anomaly report for patient 448821."); handleSend(); }}>Anomaly report for PT-448821</div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className="msg-ai">
            <div className="msg-ai__avatar">
              <i className="ti ti-bot" />
            </div>
            <div className="flex flex-col">
              <div className="msg-ai__bubble flex items-center gap-1.5 h-10 px-4 min-w-[60px]">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse delay-75" />
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse delay-150" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="copilot-input-wrap">
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
          <div className="px-3 py-1.5 rounded-full bg-[#161b22] border border-[#30363d] text-[11px] font-semibold text-[#8b949e] whitespace-nowrap cursor-pointer hover:bg-[#1f242c] hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors" onClick={() => !loading && sendMessage("Simulate ER +20%", true)}>Simulate ER +20%</div>
          <div className="px-3 py-1.5 rounded-full bg-[#161b22] border border-[#30363d] text-[11px] font-semibold text-[#8b949e] whitespace-nowrap cursor-pointer hover:bg-[#1f242c] hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors" onClick={() => !loading && sendMessage("Show ICU forecast", true)}>Show ICU forecast</div>
          <div className="px-3 py-1.5 rounded-full bg-[#161b22] border border-[#30363d] text-[11px] font-semibold text-[#8b949e] whitespace-nowrap cursor-pointer hover:bg-[#1f242c] hover:border-[#58a6ff] hover:text-[#e6edf3] transition-colors" onClick={() => !loading && sendMessage("Explain triage score", true)}>Explain triage score</div>
        </div>
        <div className="copilot-input-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about operations, staffing, congestion… (Enter to send)"
            rows={1}
            className="copilot-textarea"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="send-btn"
            style={!input.trim() || loading ? { background: 'rgba(99,102,241,0.3)', cursor: 'not-allowed', color: 'rgba(255,255,255,0.4)' } : {}}
          >
            {loading ? <i className="ti ti-loader animate-spin" /> : <i className="ti ti-send" />}
          </button>
        </div>
        <div className="copilot-hint">
          Copilot can make mistakes. Verify critical clinical information.
        </div>
      </div>
    </div>
  );
}
