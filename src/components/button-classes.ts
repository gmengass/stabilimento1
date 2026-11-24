/**
 * Arturo and Sera colours for the booking panel's buttons (ADR 0031, docs/plans/theme-panel.md).
 * Only `sun:` classes: they are added to a button's own classes, so Light and Dark never change.
 */

/** The one main action of a view: orange with dark text. */
export const sunPrimary =
  "sun:border-2 sun:border-[#2a1402] sun:bg-[#e8862a] sun:text-[#2a1402] sun:dark:border-[#e8862a]";

/** Every other button in the panel: outlined, green in Arturo and grey-blue in Sera. */
export const sunSecondary =
  "sun:border-2 sun:border-[#1f3d2b] sun:text-[#1f3d2b] sun:dark:border-[#8fa6b6] sun:dark:text-[#e8eef2]";

/** A button on the green band: outlined in the band's light text colour. */
export const sunOnBand = "sun:border-2 sun:border-[#fbf6ec] sun:bg-transparent sun:text-[#fbf6ec]";

/** Cancelling a booking: dark red, never the booked tile's red. */
export const sunDanger =
  "sun:border-2 sun:border-[#8b1a1a] sun:text-[#8b1a1a] sun:dark:border-[#f08a8a] sun:dark:text-[#f5b5b5]";

/** The filled "yes, cancel" button. */
export const sunDangerFilled =
  "sun:border sun:border-[#8b1a1a] sun:bg-[#8b1a1a] sun:text-white sun:dark:border-[#f08a8a] sun:dark:bg-[#b42318]";

/** A note box in the panel (suggested price, quick-book suggestion). */
export const sunNoteBox =
  "sun:border-transparent sun:bg-[#fbf1e2] sun:text-[#5a3a10] sun:dark:bg-[#2a2418] sun:dark:text-[#f5c98b]";
