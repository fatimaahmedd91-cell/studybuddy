"use client";

// The shared lists (friendship goals, suggested interests, days...) from GET /api/options.
// Loaded once and reused by every form.
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Options } from "./types";

let cached: Promise<Options> | null = null;

export function useOptions() {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cached ??= api.options();
    cached.then(setOptions).catch((err) => {
      cached = null;
      setError(err.message);
    });
  }, []);
  return { options, error };
}
