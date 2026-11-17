"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { BeachMap, type SpotView } from "@/components/beach-map";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";
import type { OpenSeason } from "@/lib/booking/seasons";
import { BookingDetails, NewBookingForm, NoShowDay, ReleasedDay } from "./booking-panel";
import { MoveForm, type MoveTargets } from "./move-form";
import { QuickBookForm, SuggestionBar, type QuickBookPick } from "./quick-book";

/** Below Tailwind's `md`: where the panel is a bottom sheet. */
const PHONE = "(max-width: 47.99rem)";

interface Props {
  /** The venue's today: past days can't be released, restored or sold as a pass. */
  today: string;
  areaId: number;
  areaName: string;
  date: string;
  lines: MapLine[];
  occupancy: Record<number, Occupant>;
  /** Season passes that gave this day back, by spot: free to book, or to give back. */
  released: Record<number, Occupant>;
  /** Bookings that missed the hold time this day, by spot: free to book, or to restore. */
  noShows: Record<number, Occupant>;
  /** The season a pass can be sold for, if one is open. */
  openSeason: OpenSeason | null;
}

/**
 * The map plus its side panel: pick free umbrellas to book, or tap a booked one to see it.
 * On phones the panel is a bottom sheet over the map, so umbrellas stay tappable.
 */
export function BeachBoard({
  today,
  areaId,
  areaName,
  date,
  lines,
  occupancy,
  released,
  noShows,
  openSeason,
}: Props) {
  const t = useTranslations("quickBook");
  const [selected, setSelected] = useState<MapSpot[]>([]);
  const [openBooking, setOpenBooking] = useState<number | null>(null);
  /** Quick book: the request form is open, or a suggestion is on the map. */
  const [quickForm, setQuickForm] = useState(false);
  const [pick, setPick] = useState<QuickBookPick | null>(null);
  const [pickIndex, setPickIndex] = useState(0);
  /** Moving the open booking: its umbrellas' new ones, and which one the next tap is for. */
  const [targets, setTargets] = useState<MoveTargets | null>(null);
  const [moveFor, setMoveFor] = useState<number | null>(null);
  /** Phones: the sheet is folded down to its header. */
  const [collapsed, setCollapsed] = useState(false);
  /** The panel content the sheet last showed (see `panelKey`). */
  const [shownKey, setShownKey] = useState<string | null>(null);
  const quickBookButton = useRef<HTMLButtonElement>(null);
  const mapArea = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const ts = useTranslations("sheet");
  const tb = useTranslations("booking");
  const tm = useTranslations("map");
  const open = Object.values(occupancy).find((o) => o.bookingId === openBooking);
  // A booking made or cancelled elsewhere can make the selection stale: drop booked spots.
  const freeSelected = selected.filter((s) => !occupancy[s.id]);

  const spotById = new Map(lines.flatMap((line) => line.spots.map((s) => [s.id, s])));

  function showSuggestion(next: QuickBookPick, index: number) {
    const spots = next.suggestions[index].spots.flatMap((s) => spotById.get(s.spotId) ?? []);
    setPick(next);
    setPickIndex(index);
    setQuickForm(false);
    setOpenBooking(null);
    setSelected(spots);
  }

  function openQuickBook() {
    setSelected([]);
    setPick(null);
    setOpenBooking(null);
    setQuickForm(true);
  }

  function startMove() {
    setTargets({});
    setMoveFor(open?.spots[0]?.spotId ?? null);
  }

  function endMove() {
    setTargets(null);
    setMoveFor(null);
  }

  /** The next umbrella still without a new one, after this one. */
  function nextWithout(next: MoveTargets, after: number): number | null {
    const spots = open?.spots ?? [];
    const start = spots.findIndex((s) => s.spotId === after);
    const order = [...spots.slice(start + 1), ...spots.slice(0, start + 1)];
    return order.find((s) => !next[s.spotId])?.spotId ?? null;
  }

  /** In move mode a tap gives the active umbrella a new one: a free umbrella or its own. */
  function onMoveTap(spot: MapSpot) {
    if (!open || !targets || moveFor === null) return;
    const occupant = occupancy[spot.id];
    if (occupant && occupant.bookingId !== open.bookingId) return;
    const next = Object.fromEntries(
      Object.entries(targets).filter(([, target]) => target.spotId !== spot.id),
    ) as MoveTargets;
    if (spot.id === moveFor) delete next[moveFor];
    else next[moveFor] = { spotId: spot.id, number: spot.number };
    // Another umbrella of the booking that stays put would be shared: it takes this one (a swap).
    const sibling = open.spots.find((s) => s.spotId === spot.id && s.spotId !== moveFor);
    const mine = open.spots.find((s) => s.spotId === moveFor);
    if (sibling && mine && !next[sibling.spotId]) {
      for (const [from, target] of Object.entries(next))
        if (target.spotId === mine.spotId) delete next[Number(from)];
      next[sibling.spotId] = { spotId: mine.spotId, number: mine.number };
    }
    setTargets(next);
    setMoveFor(nextWithout(next, moveFor));
  }

  function keep(spotId: number) {
    if (!targets) return;
    const next = { ...targets };
    delete next[spotId];
    setTargets(next);
    setMoveFor(spotId);
  }

  function reset() {
    endMove();
    setSelected([]);
    setPick(null);
    setQuickForm(false);
  }

  function onSpotClick(spot: MapSpot) {
    if (targets && open) return onMoveTap(spot);
    const occupant = occupancy[spot.id];
    if (occupant) {
      setSelected([]);
      setPick(null);
      setQuickForm(false);
      setOpenBooking(occupant.bookingId === openBooking ? null : occupant.bookingId);
      return;
    }
    setOpenBooking(null);
    setQuickForm(false);
    const next = selected.some((s) => s.id === spot.id)
      ? selected.filter((s) => s.id !== spot.id)
      : [...selected, spot];
    changeSelection(next);
  }

  /** An emptied selection ends quick book: the next tap starts a new, blank booking. */
  function changeSelection(next: MapSpot[]) {
    setSelected(next);
    if (next.length === 0) setPick(null);
  }

  function viewOf(spot: MapSpot): SpotView {
    if (targets && Object.values(targets).some((target) => target.spotId === spot.id))
      return "selected";
    const occupant = occupancy[spot.id];
    if (occupant?.bookingId === openBooking) return "open";
    if (occupant?.checkedIn) return "checkedIn";
    if (occupant) return occupant.kind === "season" ? "season" : "booked";
    if (freeSelected.some((s) => s.id === spot.id)) return "selected";
    if (noShows[spot.id]) return "noShow";
    return released[spot.id] ? "released" : "free";
  }

  function badgeOf(spot: MapSpot) {
    const occupant = occupancy[spot.id];
    if (!occupant) return undefined;
    if (noShows[spot.id]) return { text: "!", label: tm("badgeNoShow") };
    if (occupant.checkedIn) return { text: "✓", label: tb("checkedIn") };
    if (occupant.holdUntil && occupant.kind !== "season" && date >= today) {
      const label = tm("badgeHold", { time: occupant.holdUntil });
      return { text: occupant.holdUntil, label };
    }
    return undefined;
  }

  /** One box per no-show booking on these umbrellas. */
  function noShowsOn(spotIds: number[]) {
    const bookings = new Map(
      spotIds.flatMap((id) => (noShows[id] ? [noShows[id]] : [])).map((o) => [o.bookingId, o]),
    );
    return [...bookings.values()].map((noShow) => (
      <NoShowDay key={noShow.bookingId} noShow={noShow} date={date} today={today} />
    ));
  }

  // One line per pass, even when several of its umbrellas are selected.
  const releasedSelected = [
    ...new Map(
      freeSelected
        .flatMap((s) => (released[s.id] ? [released[s.id]] : []))
        .map((pass) => [pass.bookingId, pass]),
    ).values(),
  ];

  const suggestion = pick?.suggestions[pickIndex];
  const sunbedsOf = Object.fromEntries(suggestion?.spots.map((s) => [s.spotId, s.sunbeds]) ?? []);
  const asSuggested =
    !!suggestion &&
    suggestion.spots.length === freeSelected.length &&
    suggestion.spots.every((s) => freeSelected.some((f) => f.id === s.spotId));

  const panel =
    open && targets ? (
      <MoveForm
        key={`move-${open.bookingId}`}
        occupant={open}
        date={date}
        today={today}
        targets={targets}
        activeSpotId={moveFor}
        onPickFor={setMoveFor}
        onKeep={keep}
        onBack={endMove}
        onDone={closePanel}
      />
    ) : open ? (
      <div className="flex flex-col gap-4">
        <BookingDetails
          key={open.bookingId}
          occupant={open}
          date={date}
          today={today}
          onClose={closePanel}
          onMove={startMove}
        />
        {noShowsOn(open.spots.map((s) => s.spotId))}
      </div>
    ) : freeSelected.length > 0 ? (
      <div className="flex flex-col gap-4">
        {pick && (
          <SuggestionBar
            pick={pick}
            index={pickIndex}
            edited={!asSuggested}
            onAnother={() => showSuggestion(pick, (pickIndex + 1) % pick.suggestions.length)}
            onChange={() => {
              setSelected([]);
              setQuickForm(true);
            }}
          />
        )}
        {noShowsOn(freeSelected.map((s) => s.id))}
        {releasedSelected.map((pass) => (
          <ReleasedDay key={pass.bookingId} pass={pass} date={date} today={today} />
        ))}
        <NewBookingForm
          key={pick ? `${date}-quick-${pickIndex}` : date}
          areaName={areaName}
          date={date}
          today={today}
          spots={freeSelected}
          openSeason={openSeason}
          initial={pick ? { draft: pick.draft, sunbeds: sunbedsOf } : undefined}
          onRemove={(id) => changeSelection(selected.filter((s) => s.id !== id))}
          onDone={reset}
        />
      </div>
    ) : quickForm ? (
      <QuickBookForm
        key={pick ? "change" : date}
        areaId={areaId}
        areaName={areaName}
        date={date}
        today={today}
        openSeason={openSeason}
        initial={pick?.draft ?? null}
        onSuggested={(next) => showSuggestion(next, 0)}
        onClose={closePanel}
      />
    ) : null;

  /** What the panel shows: new content opens a collapsed sheet again, toggling umbrellas doesn't. */
  const panelKey = open
    ? `booking-${open.bookingId}`
    : freeSelected.length > 0
      ? `new-${pick ? pickIndex : "map"}`
      : quickForm
        ? "quick"
        : null;
  if (panelKey !== shownKey) {
    setShownKey(panelKey);
    setCollapsed(false);
  }
  const sheetOpen = panelKey !== null;

  // Phones: the header above the map is taller than the room the sheet leaves, so bring the map up.
  useEffect(() => {
    if (sheetOpen && window.matchMedia(PHONE).matches) mapArea.current?.scrollIntoView();
  }, [sheetOpen]);

  function closePanel() {
    setOpenBooking(null);
    reset();
    quickBookButton.current?.focus();
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Wider screens show the panel beside the map: there a stray Escape would lose a draft.
    if (event.key !== "Escape" || !window.matchMedia(PHONE).matches) return;
    event.preventDefault();
    closePanel();
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div ref={mapArea} className="flex min-w-0 scroll-mt-2 flex-col gap-2">
        <button
          type="button"
          ref={quickBookButton}
          onClick={openQuickBook}
          data-testid="quick-book-open"
          className="min-h-11 self-start rounded bg-blue-700 px-4 py-2 font-semibold text-white"
        >
          {t("open")}
        </button>
        <BeachMap
          areaName={areaName}
          lines={lines}
          viewOf={viewOf}
          captionOf={(spot) =>
            (occupancy[spot.id] ?? noShows[spot.id] ?? released[spot.id])?.customerName
          }
          badgeOf={badgeOf}
          onSpotClick={onSpotClick}
        />
      </div>
      {panel && (
        <aside
          aria-label={ts("label")}
          data-sheet={collapsed ? "collapsed" : "open"}
          onKeyDown={onPanelKeyDown}
          className="rounded border bg-background p-4 lg:sticky lg:top-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:max-h-[60dvh] max-md:overflow-y-auto max-md:rounded-b-none max-md:pt-0 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-4px_16px_rgb(0_0_0/0.2)]"
        >
          <div className="sticky top-0 z-10 -mx-4 flex justify-end gap-2 bg-background px-4 py-2 md:hidden">
            <button
              type="button"
              data-sheet-toggle
              aria-expanded={!collapsed}
              aria-controls={contentId}
              onClick={() => setCollapsed(!collapsed)}
              className="min-h-11 rounded border px-3 py-2"
            >
              {collapsed ? ts("expand") : ts("collapse")}
            </button>
            <button
              type="button"
              data-sheet-close
              onClick={closePanel}
              className="min-h-11 rounded border px-3 py-2"
            >
              {tb("close")}
            </button>
          </div>
          <div id={contentId} className={collapsed ? "max-md:hidden" : undefined}>
            {panel}
          </div>
        </aside>
      )}
    </div>
  );
}
