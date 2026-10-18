// The Meerkat logo: a small standing meerkat in a pine-green circle. Pure SVG, so it's sharp at any size.
export function MeerkatMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--color-pine)" />
      {/* body, head and ears in a warm sandy colour */}
      <path d="M12.3 14.2c-1.4 4.4-1.3 9.6.4 13.8h6.6c1.7-4.2 1.8-9.4.4-13.8z" fill="#e8d6b0" />
      <ellipse cx="16" cy="10.6" rx="4.3" ry="3.7" fill="#e8d6b0" />
      <circle cx="11.9" cy="9.4" r="1.1" fill="#c9b48b" />
      <circle cx="20.1" cy="9.4" r="1.1" fill="#c9b48b" />
      {/* the dark eye patches meerkats are known for */}
      <ellipse cx="14.3" cy="10.3" rx="1.15" ry="0.9" fill="var(--color-pine)" />
      <ellipse cx="17.7" cy="10.3" rx="1.15" ry="0.9" fill="var(--color-pine)" />
      <circle cx="16" cy="12.4" r="0.65" fill="var(--color-pine)" />
      {/* paws held up, on the lookout */}
      <path d="M13.4 17.6q2.6 1.6 5.2 0" stroke="#c9b48b" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
