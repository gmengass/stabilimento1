/** Outline icons for icon-only buttons. Decorative: the button names itself (sr-only text). */
function Icon({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-6 w-6 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <Icon>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function ArrowRightIcon() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function CalendarIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Icon>
  );
}

export function LogoutIcon() {
  return (
    <Icon>
      <path d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3" />
      <path d="M9 12h12M17 8l4 4-4 4" />
    </Icon>
  );
}
