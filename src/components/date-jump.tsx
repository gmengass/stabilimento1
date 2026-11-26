"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, type KeyboardEvent } from "react";
import { isBookingDate } from "@/i18n/format";

/** Keys that edit the field. Space, Alt+Down and the like open the picker instead. */
const TYPING_KEYS = /^(\d|Arrow(Up|Down|Left|Right)|Backspace|Delete)$/;

export interface DayLabel {
  full: string;
  /** Shown on narrow screens, so the date controls fit on a phone. */
  short: string;
}

interface Props {
  /** The day being viewed (`YYYY-MM-DD`). */
  date: string;
  areaId: number;
  /** Shown instead of "Calendar": the day being viewed when it isn't today, full and short. */
  label?: DayLabel;
  /** Theme colours for the day being viewed (past, today, ahead). */
  toneClass?: string;
}

/**
 * A calendar button: picking a day opens it straight away, with no "Show" step. The date field
 * is invisible and covers the button, so tapping anywhere on it opens the browser's own picker.
 * Typed dates go only on Enter or when leaving the field, so half-typed days never load.
 */
export function DateJump({ date, areaId, label, toneClass = "" }: Props) {
  const t = useTranslations("map");
  const router = useRouter();
  const typing = useRef(false);

  const go = (value: string) => {
    if (value === date || !isBookingDate(value)) return;
    router.push(`/?${new URLSearchParams({ area: String(areaId), date: value })}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      go(event.currentTarget.value);
    } else if (TYPING_KEYS.test(event.key)) {
      typing.current = true;
    }
  };

  return (
    <label
      className={`relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border px-3 focus-within:ring-2 focus-within:ring-sky-700 ${toneClass}`}
    >
      <CalendarIcon />
      {label ? <DayText label={label} /> : <span>{t("calendar")}</span>}
      <input
        type="date"
        aria-label={label ? t("calendarOn", { day: label.full }) : undefined}
        defaultValue={date}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onClick={(event) => {
          typing.current = false;
          try {
            event.currentTarget.showPicker();
          } catch {
            // Older browsers open their picker on tap without help.
          }
        }}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          if (!typing.current) go(event.currentTarget.value);
        }}
        onBlur={(event) => {
          if (typing.current) go(event.currentTarget.value);
          typing.current = false;
        }}
      />
    </label>
  );
}

/** The full day on tablets and wider, the short one on phones. */
export function DayText({ label }: { label: DayLabel }) {
  return (
    <>
      <span className="md:hidden">{label.short}</span>
      <span className="max-md:hidden">{label.full}</span>
    </>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
