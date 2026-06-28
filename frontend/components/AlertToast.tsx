// frontend/components/AlertToast.tsx
"use client";

import { useActiveAlerts } from "@/store/hospitalStore";
import { useHospitalStore } from "@/store/hospitalStore";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";

export default function AlertToast() {
  const activeAlerts = useActiveAlerts().slice(-3); // max 3 toasts
  const dismissAlert = useHospitalStore((s) => s.dismissAlert);

  return (
    <div className="notification-tray">
      <AnimatePresence>
        {activeAlerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`toast toast--${alert.level}`}
          >
            {alert.level === "critical" && <div className="toast__dot" />}
            <i className="ti ti-alert-triangle text-[16px]" style={{ color: alert.level === 'critical' ? 'var(--status-critical-dot)' : 'var(--status-warning-border)' }} />
            <div className="toast__body">
              <span className="toast__title">{alert.message.split('—')[0]?.replace('CRITICAL:', '').trim() || "Alert"}</span>
              <span className="toast__meta">
                {alert.message.split('—')[1]?.trim() || "Hospital"} · {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
              </span>
            </div>
            <button onClick={() => dismissAlert(alert.id)} className="toast__dismiss">×</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
