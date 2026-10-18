"use client";

// Your approximate meeting area, and a fair halfway area for a plan.
// Nothing location-related happens until you agree in the dialog. You never need a home address:
// pick a campus/neighbourhood, or share a rounded current location (about 1 km).
import { useState } from "react";
import Dialog from "@/components/Dialog";
import { ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Field, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { type AreaResult, type PlanPeople, planning } from "@/lib/planning";
import { useApi } from "@/lib/useApi";

type Pending = { kind: "preset"; preset: string } | { kind: "device" };

const PRICE_LABELS: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share a location. Pick an area instead."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error("Location wasn't shared (permission refused or unavailable). Pick an area from the list instead.")),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  });
}

export function MyMeetingArea() {
  const { setMe } = useAuth();
  const origin = useApi(() => planning.origin(), []);
  const presets = useApi(() => planning.presets(), []);
  const [preset, setPreset] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save(action: Pending) {
    setBusy(true);
    setMessage(null);
    try {
      const body = action.kind === "preset" ? { preset: action.preset } : { ...(await currentPosition()), label: "Near my current location" };
      const saved = await planning.setOrigin(body);
      origin.setData(saved);
      setMessage({ kind: "success", text: `Meeting area saved: ${saved.origin.label}.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  // Asks first if location suggestions are off; otherwise saves straight away.
  function start(action: Pending) {
    if (origin.data?.consent) save(action);
    else setPending(action);
  }

  async function agree() {
    if (!pending) return;
    const action = pending;
    setPending(null);
    try {
      setMe(await api.setConsent("location_suggestions", true));
      origin.setData({ origin: origin.data?.origin ?? null, consent: true });
      await save(action);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That didn't save." });
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      setMe(await api.setConsent("location_suggestions", false));
      origin.setData({ origin: null, consent: false });
      setMessage({ kind: "success", text: "Location suggestions are off, and your meeting area was deleted." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="my-area-title" className="space-y-3 rounded-frame bg-cream p-5">
      <h2 id="my-area-title" className="text-xl font-bold">My meeting area</h2>
      {origin.loading && <Loading />}
      {origin.error && <ErrorBox message={origin.error} onRetry={origin.reload} />}
      {origin.data && (
        <p className="text-sm">
          {origin.data.origin
            ? <>Saved: <b>{origin.data.origin.label}</b> (approximate). Only you can see this.</>
            : "Not set. Add one to get a fair halfway point with friends. Never your home address."}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Pick an area" htmlFor="area-preset" className="min-w-0 flex-1">
          <select id="area-preset" value={preset} onChange={(e) => setPreset(e.target.value)} className={inputClass}>
            <option value="">Choose a campus, station or neighbourhood</option>
            {(presets.data ?? []).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Button variant="dark" disabled={!preset || busy} onClick={() => start({ kind: "preset", preset })}>Save area</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => start({ kind: "device" })}>Use my current location</Button>
        {origin.data?.consent && <Button variant="outline" disabled={busy} onClick={turnOff}>Turn off location suggestions</Button>}
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {pending && (
        <Dialog title="Use a meeting area?" onClose={() => setPending(null)}>
          <div className="space-y-3">
            <p>
              Use your selected meeting origin to suggest a meeting area and nearby activities. Google Maps will receive the
              approximate halfway point and activity type. Your private starting point will not be displayed to other
              participants.
            </p>
            <p className="text-sm">
              {pending.kind === "device"
                ? "Your browser will ask to share your location. We round it to about 1 km before saving it."
                : "Only the area you picked is saved."}{" "}
              With just two people, the halfway point is rounded to about 5 km so it doesn&apos;t point to the other person&apos;s
              area, but it can still hint at the rough direction.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={agree}>Use this location</Button>
              <Button variant="outline" onClick={() => setPending(null)}>Choose another area</Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}

export function HalfwayArea({ people, defaultActivity }: { people: PlanPeople; defaultActivity: string }) {
  const [activity, setActivity] = useState(defaultActivity);
  const [budget, setBudget] = useState<"any" | "cheap" | "moderate">("any");
  const [result, setResult] = useState<AreaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    setBusy(true);
    setError(null);
    try {
      setResult(await planning.area({ ...people, activity: activity.trim(), budget }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't find a meeting area.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="halfway-title" className="space-y-3 rounded-frame bg-cream p-5">
      <h2 id="halfway-title" className="text-xl font-bold">Where to meet</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="What kind of place?" htmlFor="area-activity" hint="Leave empty to use your shared interests.">
          <input id="area-activity" value={activity} maxLength={60} placeholder="board game cafe"
            onChange={(e) => setActivity(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Budget" htmlFor="area-budget">
          <select id="area-budget" value={budget} onChange={(e) => setBudget(e.target.value as typeof budget)} className={inputClass}>
            <option value="any">Any</option>
            <option value="cheap">Cheap</option>
            <option value="moderate">Up to moderate</option>
          </select>
        </Field>
      </div>
      <Button variant="dark" onClick={find} disabled={busy}>{busy ? "Looking…" : "Find a halfway area"}</Button>
      {error && <Notice kind="error">{error}</Notice>}
      {result && (
        <div className="space-y-3">
          <p className="text-sm">Based on {result.used_count} of {result.total} people&apos;s chosen meeting areas.</p>
          {result.midpoint && (
            <div className="rounded-inner bg-sage px-4 py-3">
              <p className="font-semibold">{result.midpoint.label}</p>
              <a href={result.midpoint.maps_url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">
                See the halfway point on Google Maps
              </a>
            </div>
          )}
          {result.notice && <Notice kind="info">{result.notice}</Notice>}
          {result.venues.length > 0 && (
            <ul className="space-y-2" aria-label="Places from Google Maps">
              {result.venues.map((v) => (
                <li key={`${v.name}-${v.address}`} className="rounded-inner border-2 border-sage-strong px-4 py-3">
                  <p className="font-semibold">{v.name}</p>
                  {v.address && <p className="text-sm">{v.address}</p>}
                  <p className="text-xs">
                    {v.open_now === true && "Open now · "}
                    {v.open_now === false && "Closed now · "}
                    {v.price_level && PRICE_LABELS[v.price_level] ? `${PRICE_LABELS[v.price_level]} · ` : ""}
                    From Google Maps. Check details before you go.
                  </p>
                  {v.maps_url && <a href={v.maps_url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">Open in Google Maps</a>}
                </li>
              ))}
            </ul>
          )}
          {result.source === "google_places" && result.venues.length === 0 && <p className="text-sm">Google Maps found no matching places nearby.</p>}
          {result.links.length > 0 && (
            <ul className="space-y-2">
              {result.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="font-semibold underline">{l.label}</a>
                  <span className="block text-xs">{l.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
