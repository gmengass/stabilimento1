"use client";

import type { ReactNode } from "react";
import { UserIcon } from "./icons";
import { usePopover } from "./use-popover";

interface Props {
  /** Shown on the button: the logged-in user's name. */
  name: string;
  /** The button's full name for screen readers and the tooltip, e.g. "Signed in as Anna". */
  label: string;
  children: ReactNode;
}

/** The logged-in user's name is a button; its panel holds per-user settings such as the language. */
export function UserMenu({ name, label, children }: Props) {
  const { open, setOpen, button, panelId, wrapperProps } = usePopover();
  return (
    <div {...wrapperProps} className="relative ml-auto">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 max-w-48 items-center gap-2 rounded border px-3 py-2"
      >
        <UserIcon />
        <span className="truncate">{name}</span>
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
