"use client";

// Settings → Notifications, Blocked people, and Terms and privacy.
import { useState } from "react";
import Avatar from "@/components/Avatar";
import Dialog from "@/components/Dialog";
import LegalLinks from "@/components/LegalLinks";
import { Empty, ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Field, SettingsSection, Toggle, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { useOptions } from "@/lib/options";
import { formatDateTime } from "@/lib/time";
import type { PrivacyRequest } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useSave } from "./useSave";

const DEFAULT_OFF = ["reminders"];

export function NotificationsSection() {
  const me = useMe();
  const { setMe } = useAuth();
  const { options } = useOptions();
  const save = useSave();
  const categories = options?.notification_categories ?? {};
  return (
    <SettingsSection id="notifications" title="Notifications">
      <p className="text-sm">Choose what appears under the bell. Meetkat doesn&apos;t send push notifications or emails for these.</p>
      {Object.entries(categories).map(([key, label]) => {
        const on = me.notification_prefs[key] ?? !DEFAULT_OFF.includes(key);
        return (
          <Toggle key={key} label={label} checked={on}
            onChange={(value) => save.run(async () => setMe(await api.setNotificationPrefs({ [key]: value })), "Saved.")} />
        );
      })}
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </SettingsSection>
  );
}

export function BlockedSection() {
  const { data, error, loading, reload, setData } = useApi(() => api.blocks(), []);
  const save = useSave();
  return (
    <SettingsSection id="blocked" title="Blocked people">
      <p className="text-sm">
        You and the people you block can&apos;t see each other in Discover, on profiles or in Memories, and can&apos;t
        message or send friend requests. In a group or event you&apos;re both in, member lists stay visible.
      </p>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty title="You haven't blocked anyone." />}
      <ul className="space-y-2">
        {data?.map(({ person, blocked_at }) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2">
            <span className="flex items-center gap-2">
              <Avatar person={person} size="sm" />
              <span><b>{person.name}</b><span className="block text-xs">Blocked {formatDateTime(blocked_at)}</span></span>
            </span>
            <Button variant="outline" disabled={save.busy} onClick={async () => {
              if (await save.run(() => api.unblock(person.id), `Unblocked ${person.name}. Your old friendship isn't restored.`)) {
                setData(data.filter((d) => d.person.id !== person.id));
              }
            }}>Unblock</Button>
          </li>
        ))}
      </ul>
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </SettingsSection>
  );
}

function DeleteAccount() {
  const me = useMe();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const save = useSave();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete my account</Button>
      {open && (
        <Dialog title="Delete your account?" onClose={() => setOpen(false)}>
          <p>
            This permanently deletes your profile, photos, friendships, messages, memories, schedule, screen-time
            entries, notifications and verification records, plus groups and events nobody else is in. It can&apos;t be
            undone. Reports you made are kept for moderators without your name.
          </p>
          {me.is_demo && <p className="mt-2 text-sm">Demo accounts are also deleted automatically after 24 hours.</p>}
          <label className="mt-4 block text-sm font-semibold" htmlFor="confirm-delete">Type DELETE to confirm</label>
          <input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} className={`${inputClass} mt-1`} />
          {save.message && <div className="mt-3"><Notice kind={save.message.kind}>{save.message.text}</Notice></div>}
          <div className="mt-5 flex gap-2">
            <Button variant="danger" disabled={typed !== "DELETE" || save.busy}
              onClick={async () => { if (await save.run(() => api.deleteAccount(), "Deleted.")) logout(); }}>
              {save.busy ? "Deleting…" : "Delete forever"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

const REQUEST_KINDS: { value: PrivacyRequest["kind"]; label: string }[] = [
  { value: "access", label: "See what information you hold about me" },
  { value: "correction", label: "Correct my information" },
  { value: "deletion", label: "Delete my information" },
  { value: "withdraw_consent", label: "Withdraw a permission I gave" },
  { value: "other", label: "Another privacy question or complaint" },
];

function PrivacyRequests() {
  const requests = useApi(() => api.privacyRequests(), []);
  const [kind, setKind] = useState<PrivacyRequest["kind"]>("access");
  const [details, setDetails] = useState("");
  const save = useSave();
  return (
    <div className="space-y-2">
      <h3 className="font-bold">Send a privacy request</h3>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        if (await save.run(() => api.createPrivacyRequest(kind, details),
          "Request sent to the Meetkat team. We'll reply to your account email.")) {
          setDetails("");
          requests.reload();
        }
      }}>
        <Field label="What would you like?" htmlFor="request-kind">
          <select id="request-kind" value={kind} onChange={(e) => setKind(e.target.value as PrivacyRequest["kind"])} className={inputClass}>
            {REQUEST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Details (optional)" htmlFor="request-details">
          <textarea id="request-details" rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} className={inputClass} />
        </Field>
        <Button type="submit" variant="outline" disabled={save.busy}>Send request</Button>
      </form>
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
      {requests.data && requests.data.length > 0 && (
        <ul className="space-y-1 text-sm">
          {requests.data.map((r) => (
            <li key={r.id} className="rounded-lg bg-cream px-3 py-2">
              {REQUEST_KINDS.find((k) => k.value === r.kind)?.label} · sent {formatDateTime(r.created_at)} ·{" "}
              <b>{r.status === "done" ? "handled" : "waiting"}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TermsSection() {
  const me = useMe();
  const save = useSave();

  async function download() {
    await save.run(async () => {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-meetkat-data.json";
      link.click();
      URL.revokeObjectURL(url);
    }, "Downloaded my-meetkat-data.json.");
  }

  return (
    <SettingsSection id="terms" title="Terms and privacy">
      <p className="text-sm">
        You accepted Terms version <b>{me.terms.accepted_version}</b>
        {me.terms.accepted_at && <> on {formatDateTime(me.terms.accepted_at)}</>}.
      </p>
      <LegalLinks />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={download} disabled={save.busy}>Download my data</Button>
        <DeleteAccount />
      </div>
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
      <PrivacyRequests />
    </SettingsSection>
  );
}
