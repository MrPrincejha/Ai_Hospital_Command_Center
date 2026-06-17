/**
 * useMetricPulse Hook
 * Detects when a critical metric value changes significantly
 * and triggers pulse/flash animations
 */

import { useEffect, useRef } from "react";

interface MetricPulseConfig {
  value: number;
  isCritical?: boolean;
  onChange?: () => void;
}

export function useMetricPulse({
  value,
  isCritical = false,
  onChange,
}: MetricPulseConfig) {
  const prevValueRef = useRef<number>(value);
  const shouldPulseRef = useRef<boolean>(false);

  useEffect(() => {
    // Detect if value changed significantly
    const difference = Math.abs(value - prevValueRef.current);
    const percentChange = (difference / (prevValueRef.current || 1)) * 100;

    // Trigger animation if:
    // - Critical and changed >5%, OR
    // - Any metric changed >10%
    if (isCritical && percentChange > 5) {
      shouldPulseRef.current = true;
      onChange?.();
    } else if (percentChange > 10) {
      shouldPulseRef.current = true;
      onChange?.();
    }

    prevValueRef.current = value;
  }, [value, isCritical, onChange]);

  return shouldPulseRef.current;
}
