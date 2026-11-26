"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { SearchIcon } from "./icons";
import { SearchForm } from "./search-form";

interface Props {
  /** The date controls; the magnifier goes right after them. */
  children: ReactNode;
  date: string;
  areaId: number;
}

/**
 * A magnifier after the calendar opens the booking search. On a tablet the field opens on the same
 * row; on a phone there is no room, so it takes the date controls' place until it is closed. The
 * button is replaced by the form, so it carries no aria-expanded.
 */
export function DateBarSearch({ children, date, areaId }: Props) {
  const t = useTranslations("search");
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // The magnifier is back after the next render: focus it then.
    if (returnFocus) requestAnimationFrame(() => toggle.current?.focus());
  }, []);

  return (
    <div
      data-search={open ? "open" : "closed"}
      className={`flex max-w-full items-center gap-2 ${open ? "w-full flex-wrap" : "flex-nowrap"}`}
    >
      <div className={`flex min-w-0 max-w-full ${open ? "max-sm:hidden" : ""}`}>{children}</div>
      {open ? (
        <SearchForm
          date={date}
          areaId={areaId}
          onClose={close}
          className="w-full sm:w-auto sm:max-w-96 sm:min-w-56 sm:flex-1"
        />
      ) : (
        <button
          ref={toggle}
          type="button"
          data-testid="search-toggle"
          title={t("title")}
          onClick={() => setOpen(true)}
          className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded border"
        >
          <SearchIcon />
          <span className="sr-only">{t("title")}</span>
        </button>
      )}
    </div>
  );
}
