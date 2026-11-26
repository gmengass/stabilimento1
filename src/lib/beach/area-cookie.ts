import type { AreaTab } from "./layout";

/** The beach space last viewed on the map, so the map opens on it again (not a secret). */
export const AREA_COOKIE = "area";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function idOf(value: string | null | undefined): number | undefined {
  return value && /^\d{1,9}$/.test(value) ? Number(value) : undefined;
}

/**
 * The space the map shows: the one in the URL, else the one last viewed, else the first. An id
 * that matches no space is skipped.
 */
export function pickArea(
  areas: AreaTab[],
  fromUrl: string | null | undefined,
  remembered: string | null | undefined,
): AreaTab | undefined {
  const byId = (id: number | undefined) => areas.find((a) => a.id === id);
  return byId(idOf(fromUrl)) ?? byId(idOf(remembered)) ?? areas[0];
}

/**
 * `document.cookie` value that remembers the space being viewed for a year, per device. Set in
 * the browser, not by a Server Action, so switching spaces doesn't re-render the map twice.
 */
export function rememberAreaCookie(areaId: number, secure: boolean): string {
  const base = `${AREA_COOKIE}=${areaId}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}
