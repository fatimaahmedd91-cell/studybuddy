"use client";

// Settings → Privacy and availability: who can find you, who can use your public free times,
// your time zone, and optional features (AI, location), each chosen separately.
import Link from "next/link";
import { useMemo } from "react";
import { ErrorBox, Notice } from "@/components/States";
import { Field, SettingsSection, Toggle, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import type { Audience } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useSave } from "./useSave";

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone on Meetkat", hint: "Matches and planning can use your public free times." },
  { value: "friends", label: "Friends only", hint: "Only friends see times you're both free and can plan around them." },
  { value: "nobody", label: "Nobody", hint: "Your public free times are only used for your own planning." },
];

function timeZones() {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "UTC"];
  }
}

export function PrivacySection() {
  const me = useMe();
  const { setMe } = useAuth();
  const save = useSave();
  const consents = useApi(() => api.consents(), []);
  const zones = useMemo(timeZones, []);

  const update = (changes: Parameters<typeof api.updateMe>[0], text: string) =>
    save.run(async () => setMe(await api.updateMe(changes)), text);

  return (
    <SettingsSection id="privacy" title="Privacy and availability">
      <Toggle label="Show me in Discover" checked={me.discoverable}
        description="If off, people won't find you in Discover. Friends and people in your groups can still open your profile."
        onChange={(on) => update({ discoverable: on }, on ? "You're visible in Discover." : "You're hidden from Discover.")} />

      <fieldset className="rounded-xl bg-cream p-3">
        <legend className="px-1 font-semibold">Who can use your public &ldquo;free to hang out&rdquo; times</legend>
        <p className="text-sm">
          These are the times you chose to publish on your profile. Nobody ever sees your whole list: only times
          you&apos;re both free. <Link href="/profile?edit=1" className="underline">Edit your free times</Link>
        </p>
        <div className="mt-2 space-y-1">
          {AUDIENCES.map((a) => (
            <label key={a.value} className="flex min-h-11 items-start gap-3">
              <input type="radio" name="availability-audience" checked={me.availability_audience === a.value}
                onChange={() => update({ availability_audience: a.value }, "Saved.")} className="mt-1 h-5 w-5 accent-bark" />
              <span><b>{a.label}</b><span className="block text-sm">{a.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-xl bg-cream p-3">
        <p className="font-semibold">Private schedule</p>
        <p className="text-sm">
          Classes, shifts and other commitments you add are only ever visible to you. You decide which friends or
          groups may use them to find free times, and they only see the resulting free times.
        </p>
        <Link href="/plan?tab=schedule" className="mt-1 inline-block font-semibold underline">Manage my schedule and planning permissions</Link>
      </div>

      <Field label="Time zone" htmlFor="timezone" hint="Used for your schedule, plans and screen-time days.">
        <select id="timezone" value={me.timezone} onChange={(e) => update({ timezone: e.target.value }, "Time zone saved.")}
          className={inputClass}>
          {!zones.includes(me.timezone) && <option value={me.timezone}>{me.timezone}</option>}
          {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </Field>

      <div className="space-y-2">
        <h3 className="font-bold">Optional features</h3>
        <p className="text-sm">Each is a separate choice, off unless you turn it on. You can turn them off any time.</p>
        {consents.error && <ErrorBox message={consents.error} onRetry={consents.reload} />}
        {consents.data?.map((c) => (
          <Toggle key={c.key} checked={me.consents[c.key] ?? false}
            label={c.key === "ai_features" ? "AI features (Google Gemini)" : c.key === "location_suggestions" ? "Meeting-area suggestions" : c.key}
            description={c.description}
            onChange={(on) => save.run(async () => setMe(await api.setConsent(c.key, on)), on ? "Turned on." : "Turned off.")} />
        ))}
        {me.is_demo && <p className="text-sm">Demo accounts start with AI features on, because all their data is made up.</p>}
      </div>
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </SettingsSection>
  );
}
