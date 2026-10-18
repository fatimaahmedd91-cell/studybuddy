"use client";

// The friend button: shows the right action for where you stand with someone.
//   none      -> "Add friend"
//   outgoing  -> "Request sent" (and "Cancel request")
//   incoming  -> "Accept" and "Decline"
//   friends   -> "Friends ✓" and "Message"
import { useState } from "react";
import { api } from "@/lib/api";
import type { Relationship } from "@/lib/types";
import { Button, ButtonLink } from "./ui";

export default function FriendButton({
  personId,
  personName,
  relationship,
  onChange,
  compact = false,
}: {
  personId: number;
  personName: string;
  relationship: Relationship;
  onChange: (relationship: Relationship) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Relationship>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      const result = await api.sendRequest(personId);
      return { status: result.status === "friends" ? "friends" : "outgoing", request_id: result.request_id };
    });
  const id = relationship.request_id!;

  let buttons: React.ReactNode;
  switch (relationship.status) {
    case "none":
      buttons = <Button onClick={send} disabled={busy}>{busy ? "Sending…" : "Add friend"}</Button>;
      break;
    case "outgoing":
      buttons = (
        <>
          <Button variant="light" disabled aria-label={`Friend request sent to ${personName}`}>Request sent</Button>
          {!compact && (
            <Button variant="outline" disabled={busy}
              onClick={() => run(async () => (await api.cancelRequest(id), { status: "none", request_id: null }))}>
              Cancel request
            </Button>
          )}
        </>
      );
      break;
    case "incoming":
      buttons = (
        <>
          <Button disabled={busy} onClick={() => run(async () => (await api.acceptRequest(id), { status: "friends", request_id: id }))}>
            Accept
          </Button>
          <Button variant="outline" disabled={busy}
            onClick={() => run(async () => (await api.declineRequest(id), { status: "none", request_id: null }))}>
            Decline
          </Button>
        </>
      );
      break;
    case "friends":
      buttons = (
        <>
          <span className="inline-flex min-h-11 items-center rounded-xl bg-[#1c7c3a] px-4 font-semibold text-white">Friends ✓</span>
          <ButtonLink href={`/messages?with=${personId}`} variant="outline">Message</ButtonLink>
        </>
      );
      break;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {error && <p className="text-sm font-medium text-[#a32a00]" role="alert">{error}</p>}
    </div>
  );
}
