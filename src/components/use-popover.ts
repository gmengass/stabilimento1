"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

/**
 * A button that opens a panel: closes on a tap outside, on focus leaving, and on Escape (focus
 * back on the button). Spread `wrapperProps` on the element holding both.
 */
export function usePopover() {
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

  return {
    open,
    setOpen,
    button,
    panelId,
    wrapperProps: { ref: wrapper, onBlur, onKeyDown },
  };
}
