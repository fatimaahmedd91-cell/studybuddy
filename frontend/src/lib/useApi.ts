"use client";

// Loads data from the API and tracks loading and error states, so every page can show
// "Loading…", an error with a "Try again" button, or the data.
//
//   const { data, error, loading, reload } = useApi(() => api.groups({}), []);
//
// pollMs: also reload quietly every N milliseconds (used for messages and the bell).
import { useCallback, useEffect, useRef, useState } from "react";

export function useApi<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  // quiet = refresh in the background without showing the loading state again.
  const run = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    if (!pollMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") run(true);
    }, pollMs);
    return () => clearInterval(timer);
    // deps decide when to load again; load itself changes on every render.
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload: () => run(true), setData };
}
