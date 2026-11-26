"use client";

import type { ReactNode } from "react";
import { usePopover } from "./use-popover";

interface Props {
  /** Text of the button, e.g. "Signed in as Anna". */
  label: string;
  children: ReactNode;
}

/** The logged-in user's name is a button; its panel holds per-user settings such as the language. */
export function UserMenu({ label, children }: Props) {
  const { open, setOpen, button, panelId, wrapperProps } = usePopover();
  return (
    <div {...wrapperProps} className="relative ml-auto">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 rounded border px-3 py-2"
      >
        {label}
      </button>
      <div
        id={panelId}
        hidden={!open}
        data-menu-panel
        className="bg-background text-foreground absolute right-0 z-10 mt-1 rounded border p-3 shadow"
      >
        {children}
      </div>
    </div>
  );
}
