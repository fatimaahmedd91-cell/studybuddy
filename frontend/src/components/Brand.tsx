// The Meetkat logo (frontend/public/logo.png). The browser-tab and home-screen icons are
// src/app/icon.png and src/app/apple-icon.png. To change the logo, replace those three images.
// It always sits next to the name "Meetkat", so screen readers skip the picture (alt="").
export function MeetkatMark({ className = "h-9 w-9" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="" width={256} height={256} className={`shrink-0 ${className}`} />;
}
