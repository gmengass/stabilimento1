"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { sunPrimary } from "./button-classes";
import { CloseIcon, SearchIcon } from "./icons";

interface Props {
  /** The day and space being viewed: results open there when the booking holds that day. */
  date: string;
  areaId?: number;
  query?: string;
  /**
   * In the date bar: focus on open, and close with ✕ or Escape (`returnFocus` true) or by leaving
   * it empty (false: focus stays where the user went).
   */
  onClose?: (returnFocus: boolean) => void;
  /** Width classes; the search page's form fills its column. */
  className?: string;
}

/** A plain GET form to `/search`, so Back returns to it. */
export function SearchForm({ date, areaId, query, onClose, className = "w-full max-w-md" }: Props) {
  const t = useTranslations("search");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (onClose) input.current?.focus();
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || !onClose) return;
    event.preventDefault();
    onClose(true);
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    if (!onClose || event.currentTarget.contains(event.relatedTarget)) return;
    if (!input.current?.value.trim()) onClose(false);
  }

  return (
    <form
      action="/search"
      role="search"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={`flex min-w-0 items-center gap-2 ${className}`}
    >
      <input type="hidden" name="date" value={date} />
      {areaId ? <input type="hidden" name="area" value={areaId} /> : null}
      <input
        ref={input}
        type="search"
        name="q"
        defaultValue={query}
        aria-label={t("label")}
        placeholder={t("placeholder")}
        maxLength={60}
        autoComplete="off"
        className="min-h-11 min-w-0 flex-1 rounded border px-3"
      />
      <button
        type="submit"
        title={t("submit")}
        className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded border font-semibold sm:px-3 ${sunPrimary}`}
      >
        <SearchIcon />
        <span className="max-sm:sr-only">{t("submit")}</span>
      </button>
      {onClose && (
        <button
          type="button"
          title={t("close")}
          onClick={() => onClose(true)}
          className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded border"
        >
          <CloseIcon />
          <span className="sr-only">{t("close")}</span>
        </button>
      )}
    </form>
  );
}
