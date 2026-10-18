"use client";

// The profile form, used for onboarding (first time) and for "Edit Profile".
// To add a new profile field: add it to the backend (migrations + ProfileUpdate in
// backend/app/profiles.py), to OwnProfile in src/lib/types.ts, then add an input here.
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOptions } from "@/lib/options";
import type { OwnProfile } from "@/lib/types";
import Avatar from "./Avatar";
import { AvailabilityGrid, ChipPicker, ToggleChips, photoToJpeg } from "./ProfileInputs";
import { ErrorBox, Loading, Notice } from "./States";
import { Button, Field, inputClass } from "./ui";

const COLOURS = ["#e05a10", "#1f9fc4", "#a8860a", "#d25b8c", "#4f9a36", "#401800"];
const PRONOUNS = ["she/her", "he/him", "they/them", "she/they", "he/they"];

type Form = Pick<
  OwnProfile,
  | "name" | "pronouns" | "university" | "hook" | "bio" | "interests" | "looking_for"
  | "availability" | "availability_audience" | "avatar_emoji" | "avatar_color" | "stickers"
> & { age: string };

function fromProfile(p: OwnProfile): Form {
  return {
    name: p.name, pronouns: p.pronouns, age: p.age ? String(p.age) : "", university: p.university, hook: p.hook,
    bio: p.bio, interests: p.interests, looking_for: p.looking_for, availability: p.availability,
    availability_audience: p.availability_audience ?? "everyone", avatar_emoji: p.avatar_emoji, avatar_color: p.avatar_color, stickers: p.stickers,
  };
}

function PhotoField({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  const { me, setMe } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const jpeg = await photoToJpeg(file);
      setMe(await api.uploadPhoto(jpeg));
      setMessage({ kind: "success", text: "Photo uploaded." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      setMe(await api.deletePhoto());
      setMessage({ kind: "success", text: "Photo removed. Your emoji avatar is shown instead." });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Couldn't remove the photo." });
    } finally {
      setBusy(false);
    }
  }

  const preview = { name: form.name || "You", avatar_emoji: form.avatar_emoji, avatar_color: form.avatar_color,
    photo_url: me?.photo_url ?? null };

  return (
    <fieldset className="rounded-2xl border-2 border-bark/20 p-4">
      <legend className="px-1 text-sm font-semibold">Profile picture</legend>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar person={preview} size="lg" />
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-bark px-4 font-semibold text-cream ${busy ? "opacity-50" : ""}`}>
              {busy ? "Working…" : me?.photo_url ? "Change photo" : "Upload a photo"}
              <input type="file" accept="image/*" className="sr-only" disabled={busy}
                onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {me?.photo_url && (
              <Button type="button" variant="outline" onClick={remove} disabled={busy}>Remove photo</Button>
            )}
          </div>
          <p className="text-xs opacity-75">Optional. Saved as a small JPEG; location data is removed. Without a photo, your initials are shown on your colour.</p>
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
          <div>
            <p className="text-sm font-semibold">Your colour</p>
            <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Avatar colour">
              {COLOURS.map((colour) => (
                <button key={colour} type="button" aria-pressed={form.avatar_color === colour}
                  aria-label={`Colour ${colour}`} onClick={() => setForm({ ...form, avatar_color: colour })}
                  className={`h-11 w-11 rounded-full border-4 ${form.avatar_color === colour ? "border-bark" : "border-cream"}`}
                  style={{ background: colour }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

export default function ProfileForm({
  profile,
  mode,
  onSaved,
  onCancel,
}: {
  profile: OwnProfile;
  mode: "onboarding" | "edit";
  onSaved: (user: OwnProfile) => void;
  onCancel?: () => void;
}) {
  const { options, error: optionsError } = useOptions();
  const { setMe } = useAuth();
  const [form, setForm] = useState<Form>(() => fromProfile(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (optionsError) return <ErrorBox message={optionsError} />;
  if (!options) return <Loading label="Loading the form…" />;

  function check() {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = "Add your name.";
    if (!form.university.trim()) found.university = "Add your university or college.";
    if (form.interests.length === 0) found.interests = "Add at least one interest.";
    if (form.looking_for.length === 0) found.looking_for = "Pick at least one thing you're looking for.";
    const age = form.age.trim();
    if (age && (!/^\d+$/.test(age) || Number(age) < options!.min_age || Number(age) > 99))
      found.age = `Age must be a number from ${options!.min_age} to 99, or left empty.`;
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!check()) return;
    setSaving(true);
    try {
      const user = await api.updateMe({ ...form, age: form.age.trim() ? Number(form.age) : null });
      setMe(user);
      onSaved(user);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <input id="name" value={form.name} maxLength={60} autoComplete="name"
            onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </Field>
        <Field label="University or college" htmlFor="university" error={errors.university}>
          <input id="university" list="universities" value={form.university} maxLength={80}
            onChange={(e) => set("university", e.target.value)} className={inputClass} />
          <datalist id="universities">
            {options.suggested_universities.map((u) => <option key={u} value={u} />)}
          </datalist>
        </Field>
        <Field label="Pronouns (optional)" htmlFor="pronouns">
          <input id="pronouns" list="pronoun-list" value={form.pronouns} maxLength={30}
            onChange={(e) => set("pronouns", e.target.value)} className={inputClass} />
          <datalist id="pronoun-list">{PRONOUNS.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field label="Age (optional)" htmlFor="age" error={errors.age} hint="Shown on your profile if you add it.">
          <input id="age" inputMode="numeric" value={form.age} maxLength={2}
            onChange={(e) => set("age", e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Your hook" htmlFor="hook" hint="One fun line, like “Will trade flashcards for bubble tea.”">
        <input id="hook" value={form.hook} maxLength={120} onChange={(e) => set("hook", e.target.value)} className={inputClass} />
      </Field>

      <Field label="About you (optional)" htmlFor="bio" hint={`${form.bio.length}/600`}>
        <textarea id="bio" value={form.bio} maxLength={600} rows={3}
          onChange={(e) => set("bio", e.target.value)} className={inputClass} />
      </Field>

      <div>
        <p className="text-sm font-semibold" id="goals-label">What kind of friends are you looking for?</p>
        <div className="mt-2">
          <ToggleChips label="What kind of friends are you looking for?" options={options.friendship_goals}
            values={form.looking_for} onChange={(v) => set("looking_for", v)} />
        </div>
        {errors.looking_for && <p className="mt-1 text-sm font-medium text-danger" role="alert">{errors.looking_for}</p>}
      </div>

      <Field label="Interests" htmlFor="interests" error={errors.interests}>
        <ChipPicker id="interests" values={form.interests} onChange={(v) => set("interests", v)}
          suggestions={options.suggested_interests} />
      </Field>

      <div>
        <p className="text-sm font-semibold">When are you usually free to hang out? (optional)</p>
        <p className="mb-2 text-xs opacity-75">
          These are PUBLIC free times you choose to share. Others only ever see times you&apos;re BOTH free, never your
          whole week. Classes and shifts go in your private schedule (Plan → My schedule) instead.
        </p>
        <AvailabilityGrid days={options.days} slots={options.slots} value={form.availability}
          onChange={(v) => set("availability", v)} />
        <label htmlFor="availability-audience" className="mt-3 block text-sm font-semibold">Who can use these times?</label>
        <select id="availability-audience" value={form.availability_audience}
          onChange={(e) => set("availability_audience", e.target.value as Form["availability_audience"])}
          className={`${inputClass} mt-1`}>
          <option value="everyone">Everyone on Meetkat (for matching and planning)</option>
          <option value="friends">Friends only</option>
          <option value="nobody">Nobody (only for my own planning)</option>
        </select>
      </div>

      <PhotoField form={form} setForm={setForm} />

      {saveError && <ErrorBox message={saveError} />}
      {Object.keys(errors).length > 0 && <Notice kind="error">Please fix the highlighted fields above.</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving} className="px-6 text-lg">
          {saving ? "Saving…" : mode === "onboarding" ? "Finish and find friends" : "Save"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        )}
      </div>
    </form>
  );
}
