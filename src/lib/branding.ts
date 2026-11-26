import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** The club's logo stays on the box (RUNBOOK, "Club name and icon"), never in the repository. */
const LOGO_FILES = { light: "logo.png", dark: "logo-dark.png" } as const;
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_NAME_LENGTH = 60;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type LogoVariant = keyof typeof LOGO_FILES;
export type Branding = { name: string | null; hasLogo: boolean; hasDarkLogo: boolean };

export function isLogoVariant(value: string | null): value is LogoVariant {
  return value === "light" || value === "dark";
}

function logoPath(variant: LogoVariant): string | null {
  const dir = process.env.BRANDING_DIR?.trim();
  return dir && path.isAbsolute(dir) ? path.join(dir, LOGO_FILES[variant]) : null;
}

/** The logo's bytes if BRANDING_DIR holds a real PNG under the size cap, else null. */
export async function readLogo(variant: LogoVariant): Promise<Buffer | null> {
  const file = logoPath(variant);
  if (!file) return null;
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_LOGO_BYTES) return null;
    const bytes = await readFile(file);
    return bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? bytes : null;
  } catch {
    return null;
  }
}

export async function getBranding(): Promise<Branding> {
  const name = process.env.CLUB_NAME?.trim().slice(0, MAX_NAME_LENGTH) || null;
  const [light, dark] = await Promise.all([readLogo("light"), readLogo("dark")]);
  return { name, hasLogo: light !== null, hasDarkLogo: light !== null && dark !== null };
}
