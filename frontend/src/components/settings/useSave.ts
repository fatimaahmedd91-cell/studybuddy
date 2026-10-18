"use client";

// A small helper for settings forms: run a save, remember "busy", and keep a success or error message.
// Messages only say "Saved" after the server confirmed the change.
import { useState } from "react";

export type SaveMessage = { kind: "success" | "error"; text: string } | null;

export function useSave() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "success", text: success });
      return true;
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That didn't work. Please try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, setMessage, run };
}
