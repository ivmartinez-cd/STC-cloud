import { useState, useEffect } from 'react';
import { TIME_TICK_MS } from '../lib/constants';

export function useTime(intervalMs = TIME_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
