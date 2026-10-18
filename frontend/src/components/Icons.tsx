// Simple line icons that match the hand-drawn sidebar in the design.
// They use the current text colour, so className="text-cream" makes them cream.
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-6 w-6"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const FeedIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M10 8.5v7l5.5-3.5z" />
  </Svg>
);

export const MessagesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 3 3 10.5l7 2.5 2.5 7z" />
    <path d="M21 3 10 13" />
  </Svg>
);

export const GroupsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7" r="3" />
    <circle cx="5" cy="10" r="2.2" />
    <circle cx="19" cy="10" r="2.2" />
    <path d="M7 20c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5M1.5 19c.3-2.2 1.7-4 3.5-4M22.5 19c-.3-2.2-1.7-4-3.5-4" />
  </Svg>
);

export const HourglassIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
  </Svg>
);

export const PartyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20 12 3l7 17z" />
    <path d="M8.5 13.5h7M7 17.5h10" />
    <circle cx="12" cy="3" r="1" />
  </Svg>
);

export const FriendsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.5" />
    <circle cx="12" cy="5.5" r="3" />
    <circle cx="12" cy="18.5" r="3" />
    <circle cx="5.5" cy="12" r="3" />
    <circle cx="18.5" cy="12" r="3" />
  </Svg>
);

export const PlusCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);

export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" />
    <path d="M10 21h4M12 3V2" />
  </Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 3 3 10.5l7 2.5 2.5 7z" />
    <path d="M21 3 10 13" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </Svg>
);

export const CrownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
  </Svg>
);

export const ProfileIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);

export const MemoriesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
  </Svg>
);

export const PlanIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4M16 3v4M4 10h16" />
    <path d="M9 15l2 2 4-4" />
  </Svg>
);

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="18" cy="12" r="1.3" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
