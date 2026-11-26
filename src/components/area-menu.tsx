"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { pickArea, rememberAreaCookie } from "@/lib/beach/area-cookie";
import type { AreaTab } from "@/lib/beach/layout";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { usePopover } from "./use-popover";

interface Props {
  areas: AreaTab[];
  /** The `area` cookie when the page was loaded: the space last viewed on this device. */
  remembered: string | null;
  /** The club logo, drawn before the name. */
  logo: ReactNode;
}

const link = "flex min-h-11 items-center gap-2";

/**
 * The banner's map link. With two or more beach spaces it names the space being viewed, and a
 * ▾ button beside it lists the spaces; picking one keeps the day being viewed.
 */
export function AreaMenu({ areas, remembered, logo }: Props) {
  const t = useTranslations("appShell");
  const ta = useTranslations("areas");
  const pathname = usePathname();
  const params = useSearchParams();
  const onMap = pathname === "/";
  // The layout isn't re-rendered on client navigation, so keep the last space seen here.
  const [lastSeen, setLastSeen] = useState(remembered);
  const current = pickArea(areas, onMap ? params.get("area") : null, lastSeen);
  const currentId = current ? String(current.id) : null;
  if (onMap && currentId !== null && currentId !== lastSeen) setLastSeen(currentId);

  useEffect(() => {
    if (!onMap || currentId === null) return;
    document.cookie = rememberAreaCookie(Number(currentId), location.protocol === "https:");
  }, [onMap, currentId]);

  if (areas.length < 2 || !current) {
    return (
      <Link href="/" className={link}>
        {logo}
        {t("map")}
      </Link>
    );
  }

  const date = onMap ? params.get("date") : null;
  const hrefOf = (id: number) => {
    const query = new URLSearchParams({ area: String(id) });
    if (date) query.set("date", date);
    return `/?${query}`;
  };
  return (
    <Picker
      areas={areas}
      current={current}
      hrefOf={hrefOf}
      logo={logo}
      labels={{ map: t("map"), pick: t("pickArea"), list: ta("tabsLabel") }}
    />
  );
}

interface PickerProps {
  areas: AreaTab[];
  current: AreaTab;
  hrefOf: (id: number) => string;
  logo: ReactNode;
  labels: { map: string; pick: string; list: string };
}

function Picker({ areas, current, hrefOf, logo, labels }: PickerProps) {
  const { open, setOpen, button, panelId, wrapperProps } = usePopover();
  return (
    <div {...wrapperProps} className="relative flex items-stretch rounded sun:bg-white/10">
      <Link
        href={hrefOf(current.id)}
        data-testid="area-menu-map"
        className={`${link} min-w-0 pr-2`}
      >
        {logo}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-xs max-sm:sr-only">{labels.map}</span>
          <span className="truncate text-lg font-bold max-sm:max-w-[45vw]">{current.name}</span>
        </span>
      </Link>
      <button
        ref={button}
        type="button"
        data-testid="area-menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        title={labels.pick}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-11 shrink-0 items-center justify-center border-l border-current/30"
      >
        <ChevronDownIcon />
        <span className="sr-only">{labels.pick}</span>
      </button>
      <nav
        id={panelId}
        hidden={!open}
        aria-label={labels.list}
        data-testid="area-menu-list"
        data-menu-panel
        className="bg-background text-foreground absolute top-full left-0 z-10 mt-1 min-w-64 rounded border p-1 shadow"
      >
        <ul>
          {areas.map((area) => {
            const isCurrent = area.id === current.id;
            return (
              <li key={area.id}>
                <Link
                  href={hrefOf(area.id)}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center gap-2 rounded px-3 text-lg ${isCurrent ? "bg-black/5 font-bold dark:bg-white/10" : ""}`}
                >
                  <span className="flex w-6 justify-center">{isCurrent && <CheckIcon />}</span>
                  {area.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
