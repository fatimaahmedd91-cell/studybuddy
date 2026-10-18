"use client";

// Settings → Verification. Each check has its own label. "Verified" only appears after a real code check
// on the server (backend/app/verification.py); if a provider isn't set up, we say so instead of faking it.
import Link from "next/link";
import { useState } from "react";
import Dialog from "@/components/Dialog";
import { ErrorBox, Loading, Notice } from "@/components/States";
import { Button, Field, SettingsSection, inputClass } from "@/components/ui";
import { get, send } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { OwnProfile } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useSave } from "./useSave";

type Status = {
  email: { address: string; verified: boolean; available: boolean; code_sent: boolean };
  phone: { number: string | null; verified: boolean; available: boolean; code_sent: boolean };
  age: { available: boolean; test_mode: boolean; status: string | null; provider: string | null; checked_at: string | null };
};

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${
      ok ? "bg-success text-white" : "bg-sage-strong text-pine"}`}>
      {ok ? "✓" : "○"} {children}
    </span>
  );
}

function CodeCheck({ channel, available, verified, codeSent, target, onChanged }: {
  channel: "email" | "phone";
  available: boolean;
  verified: boolean;
  codeSent: boolean;
  target: string | null;
  onChanged: () => void;
}) {
  const { setMe } = useAuth();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(codeSent);
  const save = useSave();
  const label = channel === "email" ? "Email verified" : "Phone verified";

  if (verified) return <Badge ok>{label}</Badge>;
  if (!available) {
    return (
      <div className="space-y-1">
        <Badge ok={false}>{channel === "email" ? "Email not verified" : "Phone not verified"}</Badge>
        <Notice kind="info">
          {channel === "email" ? "Email" : "Phone"} verification isn&apos;t set up on this server yet, so it can&apos;t be
          verified right now.
        </Notice>
      </div>
    );
  }
  if (!target) return <p className="text-sm">Add a phone number in Account and contact first.</p>;

  return (
    <div className="space-y-2">
      <Badge ok={false}>{channel === "email" ? "Email not verified" : "Phone not verified"}</Badge>
      <p className="text-sm">
        We&apos;ll {channel === "email" ? "email" : "text"} a 6-digit code to <b>{target}</b>. It expires in 10 minutes.
      </p>
      <Button variant="outline" disabled={save.busy} onClick={async () => {
        if (await save.run(() => send("POST", `/api/verification/${channel}/send`), "Code sent. Check your " + (channel === "email" ? "inbox." : "messages."))) setSent(true);
      }}>
        {sent ? "Send a new code" : "Send me a code"}
      </Button>
      {sent && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          await save.run(async () => {
            setMe(await send<OwnProfile>("POST", `/api/verification/${channel}/confirm`, { code }));
            onChanged();
          }, `${label}.`);
        }}>
          <Field label="Code" htmlFor={`${channel}-code`}>
            <input id={`${channel}-code`} inputMode="numeric" autoComplete="one-time-code" maxLength={10} required
              value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} w-36`} />
          </Field>
          <Button type="submit" disabled={save.busy}>Confirm</Button>
        </form>
      )}
      {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
    </div>
  );
}

function AgeCheck({ age, onChanged }: { age: Status["age"]; onChanged: () => void }) {
  const { setMe } = useAuth();
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const save = useSave();
  const passedForReal = age.status === "passed" && age.provider && age.provider !== "mock";

  if (passedForReal) return <Badge ok>Age checked</Badge>;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        A selfie age check would be done by an outside age-assurance provider, never by Meerkat or by AI guessing from
        photos. Meerkat would keep only the result, never your image, and wouldn&apos;t use the selfie as your profile photo.
      </p>
      {age.provider === "mock" && <Notice kind="warning">You ran a TEST-MODE check. It is not a real age check and never shows a badge.</Notice>}
      {!age.available ? (
        <Notice kind="info">Selfie age checks aren&apos;t available yet: no provider is set up. No age badge is shown.</Notice>
      ) : (
        <>
          {age.test_mode && <Notice kind="warning">TEST MODE (development only): no camera is used and no image is sent anywhere.</Notice>}
          <Button variant="outline" onClick={() => setOpen(true)}>Start age check</Button>
        </>
      )}
      {open && (
        <Dialog title="Selfie age check" onClose={() => setOpen(false)}>
          <p>
            [PROVIDER] will process [ACTUAL IMAGE/DATA] to [ESTIMATE AGE / VERIFY AGE ATTRIBUTE]. Meerkat will receive
            [RESULT]. Information will be retained for [VERIFIED PERIOD]. Read the provider&apos;s privacy information
            before continuing.
          </p>
          {age.test_mode && <p className="mt-2 font-semibold">In test mode, nothing is processed: you just get a test result.</p>}
          <label className="mt-3 flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5 accent-pine" />
            <span>I agree to this described age-check process.</span>
          </label>
          {save.message && <Notice kind={save.message.kind}>{save.message.text}</Notice>}
          <div className="mt-3 flex gap-2">
            <Button disabled={!agreed || save.busy} onClick={async () => {
              const ok = await save.run(async () => {
                const result = await send<{ test_mode?: boolean; user?: OwnProfile }>("POST", "/api/verification/age/start", { consent: true });
                if (result.user) setMe(result.user);
                onChanged();
              }, "Done.");
              if (ok) setOpen(false);
            }}>Continue</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function VerificationSection() {
  const { data, error, loading, reload } = useApi(() => get<Status>("/api/verification"), []);
  return (
    <SettingsSection id="verification" title="Verification">
      <p className="text-sm">
        Each label means only the check it names. None of them proves who someone is, that they&apos;re a student, or
        that they&apos;re safe to meet. <Link href="/terms" className="underline">Terms, section 4</Link>
      </p>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <div>
            <h3 className="font-bold">Email</h3>
            <CodeCheck channel="email" available={data.email.available} verified={data.email.verified}
              codeSent={data.email.code_sent} target={data.email.address} onChanged={reload} />
          </div>
          <div>
            <h3 className="font-bold">Phone</h3>
            <CodeCheck channel="phone" available={data.phone.available} verified={data.phone.verified}
              codeSent={data.phone.code_sent} target={data.phone.number} onChanged={reload} />
          </div>
          <div>
            <h3 className="font-bold">Age</h3>
            <AgeCheck age={data.age} onChanged={reload} />
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
