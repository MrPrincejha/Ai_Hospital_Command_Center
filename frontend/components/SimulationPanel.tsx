// frontend/components/SimulationPanel.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { useSimulationControl } from "@/hooks/useHospital";
import { useHospitalStore } from "@/store/hospitalStore";
import { isTaskRunning } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEPT_CONFIGS = [
  { name: "OPD",  servers: 8,  arrival_rate: 24.0, service_rate: 6.0,  capacity: 60 },
  { name: "ER",   servers: 4,  arrival_rate: 12.0, service_rate: 3.0,  capacity: 20 },
  { name: "ICU",  servers: 10, arrival_rate: 2.0,  service_rate: 0.1,  capacity: 10 },
  { name: "Ward", servers: 30, arrival_rate: 8.0,  service_rate: 0.5,  capacity: 30 },
];

function getRhoColor(rho: number) {
  if (rho >= 0.9) return { border: "#f85149", bg: "#3d0000", color: "#f85149", borderBadge: "#8b1a1a", text: `ρ = ${rho.toFixed(2)} · Critical` };
  if (rho >= 0.7) return { border: "#f0883e", bg: "#2d1b00", color: "#f0883e", borderBadge: "#7a4500", text: `ρ = ${rho.toFixed(2)} · Warning` };
  return { border: "#3fb950", bg: "#0d2d16", color: "#3fb950", borderBadge: "#1a5c3a", text: `ρ = ${rho.toFixed(2)} · Stable` };
}

export default function SimulationPanel() {
  const { simulation, loading, startSimulation, cancelSimulation } = useSimulationControl();
  const [simHours, setSimHours] = useState(24);
  const [seed, setSeed] = useState<number | "">("");
  const [useSeed, setUseSeed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState("OPD");
  const [simResData, setSimResData] = useState<any>(null);

  const simRunning = isTaskRunning(simulation.status);

  const handleStart = useCallback(() => {
    startSimulation(simHours, useSeed && seed !== "" ? Number(seed) : undefined);
    setCompleted(false);
  }, [simHours, seed, useSeed, startSimulation]);

  useEffect(() => {
    if (simulation.status === "COMPLETED" && simulation.results) {
      setCompleted(true);
      setSimResData(simulation.results);
      setTimeout(() => setCompleted(false), 2000);
    }
  }, [simulation.status, simulation.results]);

  const hasResults = !!simResData;
  const isInfiniteQueue = DEPT_CONFIGS.some(d => (d.arrival_rate / (d.servers * d.service_rate)) >= 1.0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100, margin: "0 auto", paddingBottom: 60, fontFamily: "system-ui, sans-serif" }}>
      
      {/* ━━━ 1. PAGE HEADER ━━━ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, background: "#1a1d2e", border: "1px solid #3d4580", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-cpu" style={{ fontSize: 20, color: "#a5b4fc" }}></i>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#e6edf3", margin: 0 }}>
              Simulation engine
            </h1>
            <p style={{ fontSize: 13, color: "#8b949e", margin: "4px 0 0" }}>
              M/M/C queuing model · Poisson arrivals · Exponential service
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleStart}
            disabled={loading || simRunning}
            style={{
              width: "fit-content", minWidth: 180, height: 44, background: completed ? "#3fb950" : "#7c3aed",
              border: "none", borderRadius: 8, color: "white", fontSize: 14, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 20px",
              cursor: (loading || simRunning) ? "not-allowed" : "pointer", opacity: (loading || simRunning) ? 0.7 : 1,
              transition: "all 0.2s"
            }}
          >
            {completed ? (
              <><i className="ti ti-check" style={{ fontSize: 16 }}></i> Simulation complete</>
            ) : simRunning ? (
              <>
                <svg className="animate-spin" style={{ width: 16, height: 16, color: "white" }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Simulating...
              </>
            ) : (
              <><i className="ti ti-player-play" style={{ fontSize: 16 }}></i> Run simulation</>
            )}
          </button>
        </div>
      </div>

      {/* ━━━ 2. SIMULATION PARAMETERS CARD ━━━ */}
      <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", color: "#8b949e", textTransform: "uppercase", marginBottom: 16 }}>
          Simulation parameters
        </div>
        
        <div style={{ display: "flex", gap: 40 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "#8b949e", marginBottom: 8 }}>Sim duration (hours)</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[8, 24, 48, 72].map(h => (
                <button
                  key={h}
                  onClick={() => setSimHours(h)}
                  style={{
                    background: simHours === h ? "#1d6fc4" : "#0d1117", border: simHours === h ? "1px solid #1d6fc4" : "1px solid #30363d",
                    color: simHours === h ? "white" : "#8b949e", borderRadius: 6, padding: "6px 14px", fontWeight: simHours === h ? 600 : 400,
                    fontSize: 13, cursor: "pointer"
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "#8b949e", marginBottom: 8 }}>Random seed</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div 
                onClick={() => setUseSeed(!useSeed)}
                style={{ width: 36, height: 20, background: useSeed ? "#1d6fc4" : "#30363d", borderRadius: 10, position: "relative", cursor: "pointer", transition: "background 0.2s" }}
              >
                <div style={{ width: 14, height: 14, background: "white", borderRadius: "50%", position: "absolute", top: 3, left: useSeed ? 19 : 3, transition: "left 0.2s" }}></div>
              </div>
              <span style={{ fontSize: 13, color: "#8b949e", cursor: "pointer", userSelect: "none" }} onClick={() => setUseSeed(!useSeed)}>
                {useSeed ? "Enabled" : "Disabled"}
              </span>
              {useSeed && (
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 42"
                  style={{ width: 80, padding: "4px 8px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "white", fontSize: 13, outline: "none" }}
                  onFocus={e => e.target.style.borderColor = "#58a6ff"}
                  onBlur={e => e.target.style.borderColor = "#30363d"}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ 3. DEPARTMENT CARDS ━━━ */}
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 12 }}>
          {DEPT_CONFIGS.map(dept => {
            const rawRho = dept.arrival_rate / (dept.servers * dept.service_rate);
            const simMetrics = simResData?.metrics?.find((m: any) => m.department === dept.name);
            const rho = simMetrics ? simMetrics.server_utilization : rawRho;
            const style = getRhoColor(rho);

            return (
              <div key={dept.name} style={{ background: "#161b22", border: `1px solid ${style.border}`, borderLeftWidth: 3, borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3" }}>{dept.name}</div>
                  <div style={{ background: style.bg, border: `1px solid ${style.borderBadge}`, color: style.color, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    {style.text}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, margin: "16px 0 12px" }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#8b949e", marginBottom: 4 }}>Servers (c)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e6edf3" }}>{dept.servers}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#8b949e", marginBottom: 4 }}>λ Arrivals/hr</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e6edf3" }}>{dept.arrival_rate.toFixed(1)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", color: "#8b949e", marginBottom: 4 }}>μ Service rate/hr</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e6edf3" }}>{dept.service_rate.toFixed(1)}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 10, color: "#8b949e", width: 28, flexShrink: 0 }}>UTIL</div>
                  <div style={{ flex: 1, height: 8, background: "#0d1117", borderRadius: 4 }}>
                    <div style={{ height: "100%", width: `${Math.min(rho * 100, 100)}%`, background: style.color, borderRadius: 4, transition: "width 0.6s ease-out" }}></div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: style.color, width: 44, textAlign: "right", flexShrink: 0 }}>
                    {Math.min(rho * 100, 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ━━━ 4. SIMULATION RESULTS PANEL ━━━ */}
      {hasResults && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 8 }}>
            
            {isInfiniteQueue && (
              <div style={{ background: "#3d0000", border: "1px solid #8b1a1a", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: "#f85149", marginTop: 2 }}></i>
                <div style={{ fontSize: 13, color: "#f85149", lineHeight: 1.4 }}>
                  <strong>ER queue is theoretically infinite (ρ ≥ 1.0).</strong><br/>
                  Add servers or reduce arrival rate to stabilise.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#e6edf3" }}>Simulation results</div>
              <div style={{ fontSize: 13, color: "#8b949e", marginTop: 4 }}>
                M/M/C model · {simHours}h simulation · completed {new Date(simulation.completed_at!).toLocaleTimeString()}
              </div>
              <div style={{ height: 1, background: "#30363d", marginTop: 12 }}></div>
            </div>

            <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
              {["OPD", "ER", "ICU", "Ward"].map(tab => (
                <div 
                  key={tab} 
                  onClick={() => setActiveTab(tab)}
                  style={{ 
                    paddingBottom: 6, fontSize: 13, fontWeight: activeTab === tab ? 600 : 400, cursor: "pointer", position: "relative",
                    color: activeTab === tab ? "#e6edf3" : "#8b949e"
                  }}
                >
                  {tab}
                  {activeTab === tab && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#58a6ff" }}></div>}
                </div>
              ))}
            </div>

            {(() => {
              const metrics = simResData.metrics.find((m: any) => m.department === activeTab);
              if (!metrics) return null;

              const getWaitColor = (w: number) => w < 10 ? '#3fb950' : w <= 30 ? '#f0883e' : '#f85149';

              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>Avg wait time</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: getWaitColor(metrics.avg_wait_time_mins) }}>{metrics.avg_wait_time_mins.toFixed(1)} min</div>
                    <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>Before service begins</div>
                  </div>
                  <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>Avg queue length</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: getWaitColor(metrics.avg_queue_length * 2) }}>{metrics.avg_queue_length.toFixed(1)} pts</div>
                    <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>Patients waiting</div>
                  </div>
                  <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>Throughput</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#3fb950" }}>{metrics.throughput_per_hour.toFixed(1)} pts/h</div>
                    <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>Patients processed</div>
                  </div>
                  <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", color: "#8b949e", marginBottom: 6 }}>Server util</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: getRhoColor(metrics.server_utilization).color }}>{(metrics.server_utilization * 100).toFixed(0)}%</div>
                    <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>Resource occupancy</div>
                  </div>
                </div>
              );
            })()}

          </motion.div>
        </AnimatePresence>
      )}

    </div>
  );
}
