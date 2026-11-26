import { open } from "node:fs/promises";
import path from "node:path";

/** The club's logo stays on the box (RUNBOOK, "Club name and logo"), never in the repository. */
const LOGO_FILES = { light: "logo.png", dark: "logo-dark.png" } as const;
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_NAME_LENGTH = 60;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Signature, IHDR length and type, then width and height (big-endian). */
const HEADER_BYTES = 24;

export type LogoVariant = keyof typeof LOGO_FILES;
/** Enough to draw the logo without loading it: its size, and a version that changes with the file. */
export type LogoInfo = { width: number; height: number; version: string };
export type Branding = { name: string | null; light: LogoInfo | null; dark: LogoInfo | null };

export function isLogoVariant(value: string | null): value is LogoVariant {
  return value === "light" || value === "dark";
}

function logoPath(variant: LogoVariant): string | null {
  const dir = process.env.BRANDING_DIR?.trim();
  return dir && path.isAbsolute(dir) ? path.join(dir, LOGO_FILES[variant]) : null;
}

function parseHeader(header: Buffer, size: number, mtimeMs: number): LogoInfo | null {
  if (header.length < HEADER_BYTES) return null;
  if (!header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  if (header.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height, version: `${Math.trunc(mtimeMs).toString(36)}-${size.toString(36)}` };
}

/**
 * Opens the logo once and checks it is a real PNG under the size cap. Reads only the header
 * unless `withBytes`, so pages can ask on every render without loading the image.
 */
async function inspect(
  variant: LogoVariant,
  withBytes: boolean,
): Promise<{ info: LogoInfo; bytes: Buffer | null } | null> {
  const file = logoPath(variant);
  if (!file) return null;
  try {
    const handle = await open(file, "r");
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size > MAX_LOGO_BYTES) return null;
      const buffer = Buffer.alloc(withBytes ? stats.size : Math.min(HEADER_BYTES, stats.size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const bytes = buffer.subarray(0, bytesRead);
      const info = parseHeader(bytes.subarray(0, HEADER_BYTES), stats.size, stats.mtimeMs);
      return info ? { info, bytes: withBytes ? bytes : null } : null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/** The logo's bytes if BRANDING_DIR holds a real PNG under the size cap, else null. */
export async function readLogo(variant: LogoVariant): Promise<Buffer | null> {
  return (await inspect(variant, true))?.bytes ?? null;
}

export async function getBranding(): Promise<Branding> {
  const name = process.env.CLUB_NAME?.trim().slice(0, MAX_NAME_LENGTH) || null;
  const [light, dark] = await Promise.all([inspect("light", false), inspect("dark", false)]);
  return { name, light: light?.info ?? null, dark: light ? (dark?.info ?? null) : null };
}
