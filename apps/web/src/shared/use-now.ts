import { useEffect, useState } from "react";

/** The current (real) time, refreshed every `everyMs` — for "updated 12 s ago" labels. */
export function useNow(everyMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
