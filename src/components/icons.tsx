/** Outline icons, always decorative: the button or count beside them names itself (sr-only text). */
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

/*
 * Day-count icons. Light and Dark draw outlines only; Arturo and Sera (`sun:`) fill them with the
 * club's colours: dark green umbrella with an orange stripe, yellow sunbed, orange deckchair. The
 * outline stays in the text colour, so each icon keeps 3:1 against the page (WCAG 1.4.11).
 */
export function UmbrellaIcon() {
  return (
    <Icon>
      <path d="M2.5 11a9.5 9.5 0 0 1 19 0Z" className="sun:fill-[#1f3d2b]" />
      <path d="M12 1.5C10 4 9.5 7 9.5 11h5c0-4-.5-7-2.5-9.5Z" className="sun:fill-[#e8862a]" />
      <path d="M12 11v10" />
    </Icon>
  );
}

function SunbedShape() {
  return (
    <>
      <path d="M2 10.5h10l4.5-7 4.5 2.5-5 9.5H2Z" className="sun:fill-[#ffc300]" />
      <path d="M5 15.5v4.5M14 15.5v4.5" />
    </>
  );
}

export function SunbedIcon() {
  return (
    <Icon>
      <SunbedShape />
    </Icon>
  );
}

/** A sunbed with a box: the venue's sunbeds in storage (ADR 0021). */
export function SunbedStockIcon() {
  return (
    <Icon>
      <SunbedShape />
      <path d="M15 14h7.5v7.5H15Z" className="fill-background" />
      <path d="M15 17h7.5M17.75 17v1.5h2v-1.5" />
    </Icon>
  );
}

export function DeckchairIcon() {
  return (
    <Icon>
      <path d="M4 2.5h4.5l4 9.5h7.5v4H10Z" className="sun:fill-[#e8862a]" />
      <path d="M6 16l-2 5M17 16l3 5M8 16l9 5" />
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
