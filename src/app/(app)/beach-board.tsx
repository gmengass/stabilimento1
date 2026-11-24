"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { BeachMap, type SpotView } from "@/components/beach-map";
import type { MapLine, MapSpot } from "@/lib/beach/layout";
import type { Occupant } from "@/lib/booking/bookings";
import type { OpenSeason } from "@/lib/booking/seasons";
import { tileExtras } from "@/lib/booking/tile-extras";
import { BookingDetails, NewBookingForm, NoShowDay, ReleasedDay } from "./booking-panel";
import { initialPanel } from "./initial-panel";
import { MoveForm, type MoveTargets } from "./move-form";
import { QuickBookForm, SuggestionBar, type QuickBookPick } from "./quick-book";
import { sunOnBand, sunPrimary } from "@/components/button-classes";

const noticeKey = {
  taken: "spotsTaken",
  gone: "bookingGone",
  targetTaken: "moveTargetTaken",
} as const;

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
  /** A booking to open at first (from search): its panel, or its no-show umbrellas. */
  initialBooking?: number | null;
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
  initialBooking = null,
}: Props) {
  const t = useTranslations("quickBook");
  const [initial] = useState(() => initialPanel(lines, occupancy, noShows, initialBooking));
  const [selected, setSelected] = useState<MapSpot[]>(initial.selected);
  const [openBooking, setOpenBooking] = useState<number | null>(initial.openBooking);
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
  const lastSpotId = useRef<number | null>(null);
  const openedByKeyboard = useRef(false);
  const focusWasInPanel = useRef(false);
  const sheet = useRef<HTMLElement>(null);
  const contentId = useId();
  const ts = useTranslations("sheet");
  const tb = useTranslations("booking");
  const tm = useTranslations("map");
  /** Why the panel changed under the user: a change made elsewhere (live map, ADR 0019). */
  const [notice, setNotice] = useState<"taken" | "gone" | "targetTaken" | null>(null);
  const [syncedDate, setSyncedDate] = useState(date);
  const open = Object.values(occupancy).find((o) => o.bookingId === openBooking);
  const freeSelected = selected.filter((s) => !occupancy[s.id]);

  // A change made elsewhere can leave state pointing at what is gone: umbrellas booked by
  // someone else, or the open booking cancelled or moved. Drop it for good (a spot freed again
  // must not come back selected) and say so, unless the user just changed the day.
  const bookingGone = openBooking !== null && !open;
  const selectionStale = freeSelected.length !== selected.length;
  const targetsStale =
    !!targets &&
    Object.values(targets).some(
      (t) => occupancy[t.spotId] && occupancy[t.spotId].bookingId !== openBooking,
    );
  if (syncedDate !== date) {
    // A selection is for one day: another day starts blank, as its booking form does.
    setSyncedDate(date);
    setNotice(null);
    setSelected([]);
    setPick(null);
    setTargets(null);
    setMoveFor(null);
    if (bookingGone) setOpenBooking(null);
  } else if (bookingGone || selectionStale || targetsStale) {
    if (selectionStale) {
      setSelected(freeSelected);
      if (freeSelected.length === 0) setPick(null);
    }
    if (bookingGone || targetsStale) {
      setOpenBooking(bookingGone ? null : openBooking);
      setTargets(null);
      setMoveFor(null);
    }
    setNotice(bookingGone ? "gone" : targetsStale ? "targetTaken" : "taken");
  }

  const spotById = new Map(lines.flatMap((line) => line.spots.map((s) => [s.id, s])));

  function showSuggestion(next: QuickBookPick, index: number) {
    lastSpotId.current = null;
    setNotice(null);
    const spots = next.suggestions[index].spots.flatMap((s) =>
      occupancy[s.spotId] ? [] : (spotById.get(s.spotId) ?? []),
    );
    setPick(next);
    setPickIndex(index);
    setQuickForm(false);
    setOpenBooking(null);
    setSelected(spots);
  }

  function openQuickBook(viaKeyboard: boolean) {
    lastSpotId.current = null;
    openedByKeyboard.current = viaKeyboard;
    setNotice(null);
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
    setNotice(null);
    endMove();
    setSelected([]);
    setPick(null);
    setQuickForm(false);
  }

  function onSpotClick(spot: MapSpot, viaKeyboard: boolean) {
    openedByKeyboard.current = viaKeyboard;
    setNotice(null);
    if (targets && open) return onMoveTap(spot);
    const occupant = occupancy[spot.id];
    // Only a booking opened from its tile gives focus back to that tile; picking free umbrellas
    // closes onto Quick book, as before.
    lastSpotId.current = occupant ? spot.id : null;
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
    if (occupant?.checkedIn && occupant.kind !== "season") return "checkedIn";
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

  function extrasOf(spot: MapSpot) {
    const occupant = occupancy[spot.id];
    const own = occupant?.spots.find((s) => s.spotId === spot.id);
    if (!occupant || !own) return undefined;
    const extras = tileExtras({
      sunbeds: own.sunbeds,
      includedSunbeds: spot.includedSunbeds,
      deckchairs: occupant.deckchairs,
      showDeckchairs: own.number === Math.min(...occupant.spots.map((s) => s.number)),
    });
    if (!extras) return undefined;
    const parts = [
      extras.sunbedDelta > 0 && tm("extraSunbeds", { count: extras.sunbedDelta }),
      extras.sunbedDelta < 0 && tm("fewerSunbeds", { count: -extras.sunbedDelta }),
      extras.deckchairs > 0 && tm("extraDeckchairs", { count: extras.deckchairs }),
    ].filter(Boolean);
    return { text: extras.text, label: parts.join(", ") };
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
            onChange={(viaKeyboard) => {
              openedByKeyboard.current = viaKeyboard;
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

  /** The panel's title, shown on the green band in Arturo and Sera (the forms hide their own). */
  const panelTitle =
    open && targets
      ? tb("moveTitle")
      : open
        ? open.customerName
        : freeSelected.length > 0
          ? tb("newTitle", { area: areaName })
          : t("title", { area: areaName });

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

  // Keyboard and switch users land in a panel they opened on purpose (a booking, quick book), not
  // in one that only shows the umbrellas they are still picking. Beside the map, only a keyboard
  // opening moves focus, so a tap doesn't scroll a portrait tablet down to the panel.
  const opensSheet = panelKey !== null && !panelKey.startsWith("new-");
  useEffect(() => {
    if (!opensSheet) return;
    if (window.matchMedia(PHONE).matches)
      sheet.current?.querySelector<HTMLElement>("[data-sheet-toggle]")?.focus();
    else if (openedByKeyboard.current) sheet.current?.focus();
  }, [opensSheet, panelKey]);

  function returnFocus() {
    const id = lastSpotId.current;
    const tile =
      id === null ? null : mapArea.current?.querySelector<HTMLElement>(`[data-spot-id="${id}"]`);
    (tile ?? quickBookButton.current)?.focus();
  }

  // Where focus last landed. A removed element fires no focusin, so this still says "the panel"
  // after the panel is gone. Safari doesn't focus tapped buttons, so <body> alone proves nothing.
  useEffect(() => {
    const track = (event: FocusEvent) => {
      focusWasInPanel.current = sheet.current?.contains(event.target as Node) ?? false;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);

  // However the panel goes away (Close, Escape, the booking vanishing, another day), focus does not
  // fall to the page. Beside the map, only focus that was in the panel comes back; a tablet
  // scrolled elsewhere stays where it is.
  const wasSheetOpen = useRef(false);
  useEffect(() => {
    const focusLost = document.activeElement === document.body || document.activeElement === null;
    const lostFromPanel = focusLost && focusWasInPanel.current;
    if (wasSheetOpen.current && !sheetOpen && (window.matchMedia(PHONE).matches || lostFromPanel))
      returnFocus();
    wasSheetOpen.current = sheetOpen;
  }, [sheetOpen]);

  function closePanel() {
    setOpenBooking(null);
    reset();
    returnFocus();
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Wider screens show the panel beside the map: there a stray Escape would lose a draft.
    if (event.key !== "Escape" || !window.matchMedia(PHONE).matches) return;
    event.preventDefault();
    closePanel();
  }

  return (
    <div
      className={`grid grid-cols-1 gap-4 lg:items-start ${panel ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}
    >
      <div ref={mapArea} className="flex min-w-0 scroll-mt-2 flex-col gap-2">
        <button
          type="button"
          ref={quickBookButton}
          onClick={(event) => openQuickBook(event.detail === 0)}
          data-testid="quick-book-open"
          className={`min-h-11 self-start rounded bg-blue-700 px-4 py-2 font-semibold text-white ${sunPrimary}`}
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
          extrasOf={extrasOf}
          onSpotClick={onSpotClick}
        />
      </div>
      {notice && (
        <p
          role="status"
          data-testid="live-panel-notice"
          className="rounded border border-amber-600 bg-amber-100 px-3 py-2 text-sm text-amber-950 lg:col-span-full dark:bg-amber-950 dark:text-amber-100"
        >
          {tm(noticeKey[notice])}
        </p>
      )}
      {panel && (
        <aside
          ref={sheet}
          tabIndex={-1}
          aria-label={ts("label")}
          data-sheet={collapsed ? "collapsed" : "open"}
          onKeyDown={onPanelKeyDown}
          className="rounded border bg-background p-4 sun:border-[#d9cdb4] sun:bg-white sun:accent-[#1f3d2b] sun:dark:border-[#34495a] sun:dark:bg-[#1e2f3d] sun:dark:accent-[#e8862a] lg:sticky lg:top-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:max-h-[60dvh] max-md:overflow-y-auto max-md:rounded-b-none max-md:pt-0 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-4px_16px_rgb(0_0_0/0.2)]"
        >
          <div
            data-panel-band
            className="sticky top-0 z-10 -mx-4 flex items-center justify-end gap-2 bg-background px-4 py-2 md:hidden sun:mb-3 sun:flex sun:border-b-4 sun:border-b-[#e8862a] sun:bg-[#1f3d2b] sun:text-[#fbf6ec] sun:md:-mt-4 sun:md:flex sun:md:rounded-t"
          >
            <h2 className="mr-auto hidden min-w-0 truncate text-lg font-semibold sun:block">
              {panelTitle}
            </h2>
            <button
              type="button"
              data-sheet-toggle
              aria-expanded={!collapsed}
              aria-controls={contentId}
              onClick={() => setCollapsed(!collapsed)}
              className={`min-h-11 rounded border px-3 py-2 md:hidden ${sunOnBand}`}
            >
              {collapsed ? ts("expand") : ts("collapse")}
            </button>
            <button
              type="button"
              data-sheet-close
              onClick={closePanel}
              className={`min-h-11 rounded border px-3 py-2 ${sunOnBand}`}
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
