import type { SpotView } from "@/components/beach-map";

export type StatusMarkKey = "markBooked" | "markSeason" | "markNoShow" | "markCheckedIn";

const markKey: Partial<Record<SpotView, StatusMarkKey>> = {
  booked: "markBooked",
  season: "markSeason",
  released: "markSeason",
  noShow: "markNoShow",
  checkedIn: "markCheckedIn",
};

/** The letter a sun tile shows in its corner when no badge is there (ADR 0030). */
export function statusMarkKey(view: SpotView): StatusMarkKey | undefined {
  return markKey[view];
}
