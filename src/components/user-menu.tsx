"use client";

import { useId, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

interface Props {
  /** Text of the button, e.g. "Signed in as Anna". */
  label: string;
  children: ReactNode;
}

/** The logged-in user's name is a button; its panel holds per-user settings such as the language. */
export function UserMenu({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative ml-auto" onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="rounded border px-2 py-1"
      >
        {label}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-10 mt-1 rounded border bg-background p-3 shadow"
      >
        {children}
      </div>
    </div>
  );
}
