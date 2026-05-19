import { useState, useEffect } from 'react';

/**
 * Hook that returns the current timestamp.
 * Updates every minute by default to satisfy purity rules while keeping it relatively current.
 */
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
