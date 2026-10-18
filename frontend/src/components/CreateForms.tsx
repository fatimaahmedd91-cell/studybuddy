"use client";

// Forms for creating (or, with `existing`, editing) a group and an event.
// Used by the + menu and by the Groups/Events pages. onCreated gets the saved group or event either way.
import { useState } from "react";
import { api } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { localInputToIso, myTimeZone, toLocalInput } from "@/lib/time";
import type { FriendEvent, Group } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { ChipPicker } from "./ProfileInputs";
import { ErrorBox } from "./States";
import { Button, Field, inputClass } from "./ui";

export function GroupForm({ existing, onCreated }: { existing?: Group; onCreated: (group: Group) => void }) {
  const { options } = useOptions();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 3) {
      setNameError("Group names need at least 3 characters.");
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      onCreated(existing
        ? await api.updateGroup(existing.id, { name, description, tags })
        : await api.createGroup({ name, description, tags }));
    } catch (err) {
      setError(err instanceof Error ? err.message : existing ? "Couldn't save the group." : "Couldn't create the group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Group name" htmlFor="group-name" error={nameError}>
        <input id="group-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
          placeholder="CSCA08 Study Group" className={inputClass} />
      </Field>
      <Field label="What's it about? (optional)" htmlFor="group-description" hint={`${description.length}/500`}>
        <textarea id="group-description" value={description} maxLength={500} rows={3}
          onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Tags (up to 6)" htmlFor="group-tags">
        <ChipPicker id="group-tags" values={tags} onChange={setTags} max={6}
          suggestions={options?.suggested_interests ?? []} />
      </Field>
      {error && <ErrorBox message={error} />}
      <Button type="submit" disabled={saving}>
        {existing ? (saving ? "Saving…" : "Save changes") : saving ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}

function nextHour() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}

export function EventForm({
  defaultGroupId = null,
  existing,
  onCreated,
}: {
  defaultGroupId?: number | null;
  existing?: FriendEvent;
  onCreated: (event: FriendEvent) => void;
}) {
  const myGroups = useApi(() => (existing ? Promise.resolve([]) : api.groups({ mine: true })), [existing]);
  // When editing, remember the original times as typed, so unchanged ones aren't sent (or re-checked).
  const [originalStart] = useState(() => (existing ? toLocalInput(new Date(existing.starts_at)) : ""));
  const [originalEnd] = useState(() => (existing?.ends_at ? toLocalInput(new Date(existing.ends_at)) : ""));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [start, setStart] = useState(() => originalStart || toLocalInput(nextHour()));
  const [end, setEnd] = useState(originalEnd);
  const [where, setWhere] = useState<"place" | "online">(existing?.online_url && !existing.location ? "online" : "place");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [onlineUrl, setOnlineUrl] = useState(existing?.online_url ?? "");
  const [groupId, setGroupId] = useState<number | null>(existing ? existing.group?.id ?? null : defaultGroupId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function check() {
    const found: Record<string, string> = {};
    if (title.trim().length < 3) found.title = "Titles need at least 3 characters.";
    const startDate = new Date(start);
    if (!start || Number.isNaN(startDate.getTime())) found.start = "Pick a start date and time.";
    else if (start !== originalStart && startDate.getTime() < Date.now() - 60_000) found.start = "The start time is in the past.";
    if (end) {
      const endDate = new Date(end);
      if (endDate <= startDate) found.end = "The end must be after the start.";
      else if (endDate.getTime() - startDate.getTime() > 24 * 3600_000) found.end = "Events can last up to 24 hours.";
    }
    if (where === "place" && !location.trim()) found.location = "Add where it happens.";
    if (where === "online" && !/^https?:\/\/\S+$/.test(onlineUrl.trim())) found.online = "Add a link starting with https://";
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!check()) return;
    setSaving(true);
    const place = { location: where === "place" ? location : "", online_url: where === "online" ? onlineUrl.trim() : "" };
    try {
      if (existing) {
        onCreated(await api.updateEvent(existing.id, {
          title,
          description,
          ...place,
          ...(start !== originalStart && { starts_at: localInputToIso(start) }),
          ...(end !== originalEnd && { ends_at: end ? localInputToIso(end) : null }),
        }));
      } else {
        onCreated(await api.createEvent({
          title,
          description,
          starts_at: localInputToIso(start),
          ends_at: end ? localInputToIso(end) : null,
          ...place,
          group_id: groupId,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : existing ? "Couldn't save the event." : "Couldn't create the event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Title" htmlFor="event-title" error={errors.title}>
        <input id="event-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)}
          placeholder="Board game night" className={inputClass} />
      </Field>
      <Field label="Description (optional)" htmlFor="event-description">
        <textarea id="event-description" value={description} maxLength={1000} rows={3}
          onChange={(e) => setDescription(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="event-start" error={errors.start} hint={`Your time zone: ${myTimeZone()}`}>
          <input id="event-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Ends (optional)" htmlFor="event-end" error={errors.end}>
          <input id="event-end" type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Where?</legend>
        <div className="mt-1 flex gap-4">
          {(["place", "online"] as const).map((w) => (
            <label key={w} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="where" checked={where === w} onChange={() => setWhere(w)} className="h-5 w-5 accent-pine" />
              {w === "place" ? "In person" : "Online"}
            </label>
          ))}
        </div>
      </fieldset>
      {where === "place" ? (
        <Field label="Location" htmlFor="event-location" error={errors.location}>
          <input id="event-location" value={location} maxLength={120} onChange={(e) => setLocation(e.target.value)}
            placeholder="Library, Group Study Room 2" className={inputClass} />
        </Field>
      ) : (
        <Field label="Online link" htmlFor="event-url" error={errors.online}>
          <input id="event-url" type="url" value={onlineUrl} maxLength={300} onChange={(e) => setOnlineUrl(e.target.value)}
            placeholder="https://meet.example.com/…" className={inputClass} />
        </Field>
      )}
      {existing ? (
        <>
          {existing.group && <p className="text-sm">Group: <b>{existing.group.name}</b> (can&apos;t be changed)</p>}
          <p className="text-sm">If you change the time or place, everyone going gets a notification.</p>
        </>
      ) : (
        <Field label="Group (optional)" htmlFor="event-group" hint="Only groups you're in. Members get a notification.">
          <select id="event-group" value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
            className={inputClass}>
            <option value="">No group</option>
            {(myGroups.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
      )}
      {error && <ErrorBox message={error} />}
      <Button type="submit" disabled={saving}>
        {existing ? (saving ? "Saving…" : "Save changes") : saving ? "Creating…" : "Create event"}
      </Button>
    </form>
  );
}
