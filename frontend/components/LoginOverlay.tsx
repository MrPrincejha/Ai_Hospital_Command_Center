// frontend/components/LoginOverlay.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, User, ShieldCheck, Activity } from "lucide-react";
import toast from "react-hot-toast";

import { useHospitalStore } from "@/store/hospitalStore";
import { authApi } from "@/services/api";

export default function LoginOverlay() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const login = useHospitalStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Please enter credentials");
      return;
    }

    setIsLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      const res = await authApi.login(formData);
      login(res.access_token, res.user);
      toast.success(`Welcome back, ${res.user.username}`);
    } catch (err: any) {
      toast.error(err.detail || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{
        background: "rgba(2, 6, 23, 0.85)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Grid Pattern Background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px), linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[420px] rounded-2xl relative overflow-hidden"
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
        }}
      >
        {/* Header Ribbon */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#58a6ff] to-[#34d399]" />

        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(88,166,255,0.1), rgba(52,211,153,0.1))",
                border: "1px solid rgba(88,166,255,0.2)",
              }}
            >
              <Activity className="w-7 h-7 text-[#58a6ff]" />
            </div>
            <h1 className="text-2xl font-bold text-[#e6edf3] tracking-tight">AI Command Center</h1>
            <p className="text-[13px] text-[#8b949e] mt-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#3fb950]" />
              Secure Clinical Authentication
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#8b949e] mb-1.5 uppercase tracking-wide">
                Staff ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="w-4 h-4 text-[#8b949e]" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-[14px] text-[#e6edf3] focus:outline-none transition-colors"
                  style={{
                    background: "#0d1117",
                    border: "1px solid #30363d",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#58a6ff")}
                  onBlur={(e) => (e.target.style.borderColor = "#30363d")}
                  placeholder="Enter your username (e.g., admin)"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#8b949e] mb-1.5 uppercase tracking-wide">
                Security Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-[#8b949e]" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-[14px] text-[#e6edf3] focus:outline-none transition-colors"
                  style={{
                    background: "#0d1117",
                    border: "1px solid #30363d",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#58a6ff")}
                  onBlur={(e) => (e.target.style.borderColor = "#30363d")}
                  placeholder="Enter your password"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-6 py-2.5 rounded-lg text-[14px] font-semibold text-white transition-all flex items-center justify-center gap-2"
              style={{
                background: isLoading ? "#30363d" : "#58a6ff",
                boxShadow: isLoading ? "none" : "0 0 15px rgba(88, 166, 255, 0.3)",
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-[#8b949e]" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Authenticating...
                </>
              ) : (
                "Authenticate to Command Center"
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-[11px] text-[#8b949e]">
            Restricted System — Authorized Personnel Only
          </div>
        </div>
      </motion.div>
    </div>
  );
}
