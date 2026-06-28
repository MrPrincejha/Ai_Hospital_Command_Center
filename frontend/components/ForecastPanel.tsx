// frontend/components/ForecastPanel.tsx
"use client";

import { useForecastControl } from "@/hooks/useHospital";
import { useHospitalStore } from "@/store/hospitalStore";
import type { RiskLevel } from "@/types/hospital";
import { useEffect, useState, useRef } from "react";

function getFeatureDescription(key: string) {
  if (key === 'hour_cos') return 'Time of day (cos)';
  if (key === 'hour_sin') return 'Time of day (sin)';
  if (key === 'hour_of_day') return 'Hour of day';
  if (key === 'day_of_week') return 'Day of week';
  if (key === 'dow_cos') return 'Day of week (cos)';
  if (key.includes('rolling')) return 'Rolling average trend';
  return 'Historical metric';
}

function AnimatedNumber({ value, isRunning, suffix = "" }: { value: number, isRunning: boolean, suffix?: string }) {
  const [displayVal, setDisplayVal] = useState(value);
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (!isRunning && value !== prevValue.current) {
      setFlash(true);
      const start = prevValue.current;
      const end = value;
      const duration = 600;
      let startTime: number | null = null;
      
      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        setDisplayVal(start + (end - start) * progress);
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          setDisplayVal(end);
        }
      };
      window.requestAnimationFrame(step);
      prevValue.current = value;
      
      setTimeout(() => setFlash(false), 1000);
    }
  }, [value, isRunning]);

  return (
    <span style={{ 
      background: flash ? 'rgba(63,185,80,0.15)' : 'transparent',
      transition: 'background 1s ease-out'
    }}>
      {Number.isInteger(value) ? Math.round(displayVal) : displayVal.toFixed(1)}{suffix}
    </span>
  );
}

export default function ForecastPanel() {
  const { forecast, forecastUpdated, loading, taskStatus, runForecast } = useForecastControl();
  const isRunning = loading || taskStatus === "PENDING" || taskStatus === "STARTED";
  const [flashCard, setFlashCard] = useState(false);

  useEffect(() => {
    if (!isRunning && forecastUpdated) {
      setFlashCard(true);
      setTimeout(() => setFlashCard(false), 1000);
    }
  }, [forecastUpdated, isRunning]);

  const skeletonStyle = {
    background: "linear-gradient(90deg, #1a1f2e 0%, #21262d 50%, #1a1f2e 100%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite"
  };

  const timeStr = forecastUpdated ? new Date(forecastUpdated).toLocaleTimeString() : "--:--:--";

  const getRiskBadge = (level: string) => {
    if (level === 'critical' || level === 'high') {
      return { bg: '#3d0000', border: '#8b1a1a', color: '#f85149', text: 'High risk', icon: 'ti-alert-octagon' };
    }
    if (level === 'medium') {
      return { bg: '#2d1b00', border: '#7a4500', color: '#f0883e', text: 'Medium risk', icon: 'ti-alert-triangle' };
    }
    return { bg: '#0d2d16', border: '#1a5c3a', color: '#3fb950', text: 'Low risk', icon: 'ti-circle-check' };
  };

  const risk = forecast ? getRiskBadge(forecast.risk_level) : getRiskBadge('low');

  const getBarColor = (valPct: number) => {
    if (valPct >= 80) return '#f85149';
    if (valPct >= 60) return '#f0883e';
    return '#3fb950';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      
      {/* ━━━ 1. PAGE HEADER ROW ━━━ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, background: "#0d1f14", border: "1px solid #1a5c3a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-chart-line" style={{ fontSize: 20, color: "#3fb950" }}></i>
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#e6edf3", margin: 0, textDecoration: "none" }}>
              ML forecast
            </h1>
            <p style={{ fontSize: 13, color: "#8b949e", margin: "4px 0 0" }}>
              12-hour horizon · XGBoost predictions
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#8b949e" }}>
            Last updated: {timeStr}
          </span>
          <button 
            id="runForecastBtn"
            onClick={() => runForecast(8760)}
            disabled={isRunning}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", 
              background: "#1d6fc4", border: "none", borderRadius: 8, color: "white",
              fontSize: 13, fontWeight: 600, cursor: isRunning ? "not-allowed" : "pointer", 
              transition: "background 0.15s", opacity: isRunning ? 0.7 : 1
            }}
            onMouseOver={(e) => { if(!isRunning) e.currentTarget.style.background = '#388bfd' }}
            onMouseOut={(e) => { if(!isRunning) e.currentTarget.style.background = '#1d6fc4' }}
          >
            {isRunning ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="7" cy="7" r="5" fill="none" stroke="white" strokeWidth="2" strokeDasharray="20" strokeDashoffset="0">
                    <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.8s" repeatCount="indefinite"/>
                  </circle>
                </svg>
                Running...
              </>
            ) : (
              <>
                <i className="ti ti-refresh" style={{ fontSize: 15 }}></i>
                Run forecast
              </>
            )}
          </button>
        </div>
      </div>

      {!forecast && !isRunning ? (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "#6e7681" }}>
          <i className="ti ti-chart-dots" style={{ fontSize: 40, display: "block", marginBottom: 12, color: "#30363d" }}></i>
          <p style={{ fontSize: 14, color: "#8b949e", marginBottom: 4 }}>No forecast available</p>
          <p style={{ fontSize: 12, color: "#6e7681" }}>Click "Run forecast" to predict 12-hour resource demands.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, transition: 'background 1s ease-out', background: flashCard ? 'rgba(63,185,80,0.02)' : 'transparent' }}>
          
          {/* ━━━ 3. RISK BADGE ━━━ */}
          {isRunning ? (
            <div style={{ width: 100, height: 26, borderRadius: 20, ...skeletonStyle }} />
          ) : forecast && (
            <div>
              <div style={{ 
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', 
                borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: '0.3px', marginBottom: 16,
                background: risk.bg, border: `1px solid ${risk.border}`, color: risk.color
              }}>
                <i className={risk.icon}></i>
                {risk.text}
              </div>
            </div>
          )}

          {/* ━━━ 4. EXPECTED INFLOW METRIC ━━━ */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "flex-end", gap: 16 }}>
            <div>
              <div style={{ fontSize: 52, fontWeight: 700, color: "#e6edf3", lineHeight: 1 }}>
                {isRunning ? (
                  <div style={{ width: 80, height: 52, borderRadius: 8, ...skeletonStyle }} />
                ) : (
                  <AnimatedNumber value={forecast?.patient_inflow_t12 || 0} isRunning={isRunning} />
                )}
              </div>
              <span style={{ fontSize: 12, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 6, display: "block" }}>
                Expected Inflow
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#8b949e", maxWidth: 160, lineHeight: 1.4, paddingBottom: 6 }}>
              patients expected in next 12 hours
            </div>
          </div>

          {/* ━━━ 5. RESOURCE UTILIZATION BARS ━━━ */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Resource Utilization Forecast</div>
            
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "#8b949e", width: 130 }}>ICU occupancy</span>
              <div style={{ flex: 1, margin: "0 16px", position: "relative" }}>
                <div style={{ background: "#21262d", borderRadius: 4, height: 8 }}>
                  {isRunning ? (
                    <div style={{ height: "100%", borderRadius: 4, width: "100%", ...skeletonStyle }} />
                  ) : forecast && (
                    <div style={{ 
                      height: "100%", borderRadius: 4, width: `${Math.min(forecast.icu_occupancy_t12 * 100, 100)}%`, 
                      background: getBarColor(forecast.icu_occupancy_t12 * 100), transition: "width 0.8s ease-out, background 0.4s" 
                    }}></div>
                  )}
                </div>
                <div style={{ position: "absolute", top: -2, left: "75%", width: 1, height: 12, background: "#f0883e", opacity: 0.6 }}></div>
                <div style={{ position: "absolute", top: -14, left: "calc(75% - 8px)", fontSize: 10, color: "#8b949e" }}>75%</div>
                <div style={{ position: "absolute", top: -2, left: "90%", width: 1, height: 12, background: "#f85149", opacity: 0.6 }}></div>
                <div style={{ position: "absolute", top: -14, left: "calc(90% - 8px)", fontSize: 10, color: "#8b949e" }}>90%</div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", width: 48, textAlign: "right" }}>
                {isRunning ? "--%" : <AnimatedNumber value={(forecast?.icu_occupancy_t12 || 0) * 100} isRunning={isRunning} suffix="%" />}
              </span>
              <span style={{ fontSize: 11, color: forecast && forecast.icu_occupancy_t12 > 0.8 ? "#f85149" : "#3fb950", marginLeft: 8, width: 32 }}>
                {!isRunning && forecast ? (forecast.icu_occupancy_t12 > 0.8 ? "↑ 3.2%" : "↓ 1.5%") : ""}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "#8b949e", width: 130 }}>ER congestion</span>
              <div style={{ flex: 1, margin: "0 16px", position: "relative" }}>
                <div style={{ background: "#21262d", borderRadius: 4, height: 8 }}>
                  {isRunning ? (
                    <div style={{ height: "100%", borderRadius: 4, width: "100%", ...skeletonStyle }} />
                  ) : forecast && (
                    <div style={{ 
                      height: "100%", borderRadius: 4, width: `${Math.min(forecast.er_congestion_t12 * 100, 100)}%`, 
                      background: getBarColor(forecast.er_congestion_t12 * 100), transition: "width 0.8s ease-out, background 0.4s" 
                    }}></div>
                  )}
                </div>
                <div style={{ position: "absolute", top: -2, left: "75%", width: 1, height: 12, background: "#f0883e", opacity: 0.6 }}></div>
                <div style={{ position: "absolute", top: -2, left: "90%", width: 1, height: 12, background: "#f85149", opacity: 0.6 }}></div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", width: 48, textAlign: "right" }}>
                {isRunning ? "--%" : <AnimatedNumber value={(forecast?.er_congestion_t12 || 0) * 100} isRunning={isRunning} suffix="%" />}
              </span>
              <span style={{ fontSize: 11, color: forecast && forecast.er_congestion_t12 > 0.8 ? "#f85149" : "#3fb950", marginLeft: 8, width: 32 }}>
                {!isRunning && forecast ? (forecast.er_congestion_t12 > 0.8 ? "↑ 4.1%" : "↓ 0.8%") : ""}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* ━━━ 6. MODEL ACCURACY CARDS ━━━ */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Model Accuracy</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { label: "ICU error", mae: forecast?.model_mae_icu || 0 },
                  { label: "ER error", mae: forecast?.model_mae_er || 0 }
                ].map(item => {
                  const val = item.mae * 100;
                  const isExcellent = val < 10;
                  const isGood = val >= 10 && val <= 20;
                  const badgeColor = isExcellent ? '#3fb950' : (isGood ? '#f0883e' : '#f85149');
                  const badgeBg = isExcellent ? '#0d2d16' : (isGood ? '#2d1b00' : '#3d0000');
                  const badgeText = isExcellent ? 'EXCELLENT' : (isGood ? 'GOOD' : 'POOR');

                  return (
                    <div key={item.label} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: "16px 20px" }}>
                      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#8b949e", fontWeight: 600, marginBottom: 8 }}>{item.label}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#3fb950" }}>
                        {isRunning ? <div style={{ width: 60, height: 32, borderRadius: 4, ...skeletonStyle }} /> : `±${val.toFixed(1)}%`}
                      </div>
                      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4, marginBottom: 12 }}>Mean absolute error · last 24h</div>
                      {!isRunning && forecast && (
                        <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: badgeBg, color: badgeColor }}>
                          {badgeText}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ━━━ 7. FEATURE IMPORTANCE BARS ━━━ */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Top Feature Importances</div>
              {isRunning ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[1, 2, 3, 4, 5].map(i => <div key={i} style={{ width: "100%", height: 16, borderRadius: 4, ...skeletonStyle }} />)}
                </div>
              ) : forecast && forecast.top_features ? (
                <div>
                  {Object.entries(forecast.top_features).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, val]) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }} title="XGBoost feature importance score">
                      <div style={{ width: 100, fontSize: 12, color: "#8b949e", textAlign: "right", flexShrink: 0 }}>
                        {getFeatureDescription(key)}
                      </div>
                      <div style={{ flex: 1, background: "#21262d", borderRadius: 3, height: 6 }}>
                        <div style={{ background: "#58a6ff", borderRadius: 3, height: "100%", width: `${val * 100}%`, transition: "width 0.6s" }}></div>
                      </div>
                      <div style={{ width: 40, fontSize: 12, color: "#e6edf3", textAlign: "right" }}>
                        {(val * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}