"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

interface Props {
  /** Text of the button, e.g. "Signed in as Anna". */
  label: string;
  children: ReactNode;
}

/** The logged-in user's name is a button; its panel holds per-user settings such as the language. */
export function UserMenu({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Touch browsers don't focus a tapped button, so blur alone misses a tap outside.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    setOpen(false);
    button.current?.focus();
  }

  return (
    <div ref={wrapper} className="relative ml-auto" onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
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
        className="bg-background absolute right-0 z-10 mt-1 rounded border p-3 shadow"
      >
        {children}
      </div>
    </div>
  );
}
