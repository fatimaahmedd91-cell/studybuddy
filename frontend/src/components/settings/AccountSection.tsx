"use client";

// Settings → Profile, and Account and contact details.
import Link from "next/link";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { Notice } from "@/components/States";
import { Button, ButtonLink, DemoBadge, Field, SettingsSection, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { formatDateTime } from "@/lib/time";
import { useSave } from "./useSave";

export function ProfileSection() {
  const me = useMe();
  return (
    <SettingsSection id="profile" title="Profile">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar person={me} size="lg" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xl font-bold">{me.name} {me.is_demo && <DemoBadge />}</p>
          <p className="text-sm">{me.university || "No university yet"}</p>
        </div>
      </div>
      <p className="text-sm">
        Your photo, university, interests, what you&apos;re looking for, bio and public free times are edited on your
        profile. Interests and preferences are only what you write yourself: Meerkat never guesses things about you.
      </p>
      <ButtonLink href="/profile?edit=1">Edit my profile</ButtonLink>
    </SettingsSection>
  );
}

function DisplayName() {
  const me = useMe();
  const { setMe } = useAuth();
  const [name, setName] = useState(me.name);
  const save = useSave();
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      save.run(async () => setMe(await api.updateMe({ name })), "Display name saved.");
    }}>
      <Field label="Display name" htmlFor="display-name"
        hint="What other people see. It doesn't have to be your legal name, and Meerkat doesn't ask for one.">
        <input id="display-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Button type="submit" variant="outline" disabled={save.busy || name.trim() === me.name}>Save name</Button>
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </form>
  );
}

function EmailChange() {
  const me = useMe();
  const { setMe } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const save = useSave();
  if (me.is_demo) {
    return <p className="text-sm">Demo accounts use a made-up email address that can&apos;t be changed or verified.</p>;
  }
  return (
    <div className="space-y-2">
      <p>
        <span className="font-semibold">Email:</span> {me.email}{" "}
        <span className="text-sm">({me.email_verified ? "verified" : "not verified"} · only you can see it)</span>
      </p>
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>Change email</Button>
      ) : (
        <form className="space-y-2 rounded-xl bg-cream p-3" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await save.run(async () => setMe(await api.changeEmail(email, password)),
            "Email changed. It's unverified until you confirm the new address in Verification.");
          if (ok) {
            setOpen(false);
            setPassword("");
          }
        }}>
          <Field label="New email" htmlFor="new-email">
            <input id="new-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Current password" htmlFor="current-password" hint="To make sure it's really you.">
            <input id="current-password" type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.busy}>Save new email</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </div>
  );
}

function PhoneNumber() {
  const me = useMe();
  const { setMe } = useAuth();
  const [phone, setPhone] = useState(me.phone ?? "");
  const save = useSave();
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const value = phone.replace(/[\s().-]/g, "");
      save.run(async () => setMe(await api.changePhone(value || null)), value ? "Phone number saved (not verified yet)." : "Phone number removed.");
    }}>
      <Field label="Phone number (optional)" htmlFor="phone"
        hint="International format, like +1 416 555 0123. Private: never shown to other people. Changing it removes its verified label.">
        <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={save.busy}>Save phone</Button>
        {me.phone && (
          <Button type="button" variant="outline" disabled={save.busy}
            onClick={() => { setPhone(""); save.run(async () => setMe(await api.changePhone(null)), "Phone number removed."); }}>
            Remove
          </Button>
        )}
      </div>
      {me.phone && <p className="text-sm">Saved: {me.phone} ({me.phone_verified ? "verified" : "not verified"})</p>}
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </form>
  );
}

export function AccountSection() {
  const me = useMe();
  const { logout } = useAuth();
  return (
    <SettingsSection id="account" title="Account and contact">
      <DisplayName />
      <hr className="border-sage-strong" />
      <EmailChange />
      <hr className="border-sage-strong" />
      <PhoneNumber />
      <hr className="border-sage-strong" />
      <p className="text-sm">
        <span className="font-semibold">Age:</span>{" "}
        {me.terms.accepted_at
          ? `you confirmed you're 18 or older on ${formatDateTime(me.terms.accepted_at)}.`
          : "not confirmed yet."}{" "}
        This is your own confirmation, not a verified age. Meerkat doesn&apos;t ask for your date of birth.{" "}
        <Link href="#verification" className="underline">Age checks</Link>
      </p>
      <Button variant="outline" onClick={logout}>Log out</Button>
    </SettingsSection>
  );
}
