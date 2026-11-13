import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AreaTab } from "@/lib/beach/layout";

interface Props {
  areas: AreaTab[];
  currentId: number;
  /** Link for each area, keeping the rest of the page's state (e.g. the date). */
  hrefOf: Record<number, string>;
}

/** Tabs for the beach spaces. The current one is filled and marked for screen readers. */
export function AreaTabs({ areas, currentId, hrefOf }: Props) {
  const t = useTranslations("areas");
  if (areas.length < 2) return null;
  return (
    <nav aria-label={t("tabsLabel")} className="flex flex-wrap gap-2">
      {areas.map((area) => {
        const current = area.id === currentId;
        return (
          <Link
            key={area.id}
            href={hrefOf[area.id]}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "rounded-full bg-sky-800 px-4 py-2 font-semibold text-white"
                : "rounded-full border border-sky-800 px-4 py-2 text-sky-900"
            }
          >
            {area.name}
          </Link>
        );
      })}
    </nav>
  );
}

/** The name of the space being viewed, shown large so staff can't mistake it. */
export function AreaBanner({ name }: { name: string }) {
  const t = useTranslations("areas");
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-medium tracking-wide text-gray-600 uppercase">
        {t("current")}
      </span>
      <span className="text-2xl font-bold text-sky-900">{name}</span>
    </div>
  );
}
