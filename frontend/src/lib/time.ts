// Dates and times are stored in UTC on the server and shown in YOUR time zone here.

export function myTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// "Tue, Oct 20, 4:00 PM EDT"
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "just now", "5 min ago", "2 h ago", "3 d ago"
export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

// The value of an <input type="datetime-local"> (local time, no zone) -> ISO time with zone.
export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

// A Date -> the "YYYY-MM-DDTHH:mm" text a datetime-local input expects, in local time.
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
