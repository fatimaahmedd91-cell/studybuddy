"use client";

// Inputs used by the profile form: interest chips, goal toggles, the availability grid,
// and the photo picker.
import { useId, useState } from "react";
import { inputClass } from "./ui";

// ---------- Interests: type or pick suggestions, shown as removable chips ----------

export function ChipPicker({
  id,
  values,
  onChange,
  suggestions,
  max = 12,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!value || values.length >= max) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-2" aria-label="Chosen interests">
        {values.map((value) => (
          <li key={value}>
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-bark px-3 text-sm font-semibold text-paper"
              aria-label={`Remove ${value}`}
            >
              {value} <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
        {values.length === 0 && <li className="text-sm opacity-70">None yet.</li>}
      </ul>
      <div className="flex gap-2">
        <input
          id={id}
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={values.length >= max ? `Up to ${max}` : "Type an interest and press Enter"}
          disabled={values.length >= max}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="min-h-11 rounded-xl border-2 border-bark px-4 font-semibold hover:bg-paper"
        >
          Add
        </button>
      </div>
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions
          .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
          .slice(0, 12)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="min-h-8 rounded-full border border-bark/40 px-2.5 text-xs hover:bg-paper"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

// ---------- Friendship goals: toggle buttons ----------

export function ToggleChips({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = values.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? values.filter((v) => v !== option) : [...values, option])}
            className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${
              on ? "border-bark bg-bark text-paper" : "border-bark/40 bg-paper hover:border-bark"
            }`}
          >
            {on ? "✓ " : ""}
            {option}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Weekly availability grid ----------

export function AvailabilityGrid({
  days,
  slots,
  value,
  onChange,
  highlight = [],
}: {
  days: string[];
  slots: string[];
  value: Partial<Record<string, string[]>>;
  onChange?: (value: Partial<Record<string, string[]>>) => void;
  highlight?: { day: string; slot: string }[]; // shown in green: times you're both free
}) {
  const editable = Boolean(onChange);
  const isHighlighted = (day: string, slot: string) => highlight.some((h) => h.day === day && h.slot === slot);

  function toggle(day: string, slot: string) {
    if (!onChange) return;
    const current = value[day] ?? [];
    const next = current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot];
    onChange({ ...value, [day]: next });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[330px] table-fixed border-separate border-spacing-1 text-center text-xs">
        <caption className="sr-only">Weekly availability</caption>
        <thead>
          <tr>
            <th className="w-[4.5rem]" />
            {days.map((d) => (
              <th key={d} scope="col" className="pb-1 font-semibold">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot}>
              <th scope="row" className="pr-1 text-right font-medium capitalize">
                {slot}
              </th>
              {days.map((day) => {
                const free = (value[day] ?? []).includes(slot);
                const both = isHighlighted(day, slot);
                const style = both
                  ? "bg-[#1c7c3a] text-white"
                  : free
                    ? "bg-bark text-paper"
                    : "bg-paper/70 text-bark/40";
                const label = both ? "Both" : free ? "Free" : "–";
                return (
                  <td key={day} className="p-0">
                    {editable ? (
                      <button
                        type="button"
                        aria-pressed={free}
                        aria-label={`${day} ${slot}: ${free ? "free" : "busy"}`}
                        onClick={() => toggle(day, slot)}
                        className={`h-11 w-full rounded-lg font-semibold ${style}`}
                      >
                        {label}
                      </button>
                    ) : (
                      <div className={`flex h-9 items-center justify-center rounded-lg font-semibold ${style}`}>{label}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Profile photo: resized and turned into a JPEG in the browser ----------

const MAX_SIDE = 640;

// Draws the picture onto a canvas and saves it as a JPEG. This shrinks it and drops hidden
// metadata such as GPS location (the server removes any that are left, too).
export function photoToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file (JPEG, PNG, WebP…)."));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error("That image is over 15 MB. Please pick a smaller one."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = url;
  });
}
