import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/branding/logo/route";
import { getBranding, isLogoVariant, readLogo } from "@/lib/branding";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

/** A PNG header (signature + IHDR with width and height) followed by filler. */
function png(width: number, height: number, rest = "rest of the image"): Buffer {
  const ihdr = Buffer.alloc(16);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    Buffer.from(rest),
  ]);
}

const PNG = png(800, 600);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "branding-"));
  vi.stubEnv("BRANDING_DIR", dir);
  vi.stubEnv("CLUB_NAME", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("readLogo", () => {
  it("reads logo.png and logo-dark.png", async () => {
    writeFileSync(join(dir, "logo.png"), PNG);
    writeFileSync(join(dir, "logo-dark.png"), PNG);
    expect(await readLogo("light")).toEqual(PNG);
    expect(await readLogo("dark")).toEqual(PNG);
  });

  it("is null without BRANDING_DIR, with a relative path, or with no file", async () => {
    expect(await readLogo("light")).toBeNull();
    vi.stubEnv("BRANDING_DIR", "");
    expect(await readLogo("light")).toBeNull();
    vi.stubEnv("BRANDING_DIR", "branding");
    expect(await readLogo("light")).toBeNull();
  });

  it("refuses a file that is not a PNG, such as an SVG renamed to .png", async () => {
    writeFileSync(join(dir, "logo.png"), '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(await readLogo("light")).toBeNull();
  });

  it("refuses a PNG signature with no valid IHDR, or a zero size", async () => {
    writeFileSync(join(dir, "logo.png"), PNG.subarray(0, 12));
    expect(await readLogo("light")).toBeNull();
    writeFileSync(join(dir, "logo.png"), png(0, 600));
    expect(await readLogo("light")).toBeNull();
  });

  it("refuses a PNG over 1 MB and accepts one exactly at the cap", async () => {
    writeFileSync(join(dir, "logo.png"), Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));
    expect(await readLogo("light")).toBeNull();
    const atCap = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 - PNG.length)]);
    writeFileSync(join(dir, "logo.png"), atCap);
    expect(await readLogo("light")).toEqual(atCap);
  });
});

describe("getBranding", () => {
  it("reports no logo and no name when nothing is set up", async () => {
    expect(await getBranding()).toEqual({ name: null, light: null, dark: null });
  });

  it("uses the dark logo only when the normal one exists too", async () => {
    writeFileSync(join(dir, "logo-dark.png"), PNG);
    expect(await getBranding()).toMatchObject({ light: null, dark: null });
    writeFileSync(join(dir, "logo.png"), png(400, 300));
    const branding = await getBranding();
    expect(branding.light).toMatchObject({ width: 400, height: 300 });
    expect(branding.dark).toMatchObject({ width: 800, height: 600 });
  });

  it("changes the version when the file is replaced", async () => {
    writeFileSync(join(dir, "logo.png"), PNG);
    utimesSync(join(dir, "logo.png"), 1_000, 1_000);
    const before = (await getBranding()).light?.version;
    writeFileSync(join(dir, "logo.png"), png(800, 600, "a new image"));
    utimesSync(join(dir, "logo.png"), 2_000, 2_000);
    expect((await getBranding()).light?.version).not.toBe(before);
  });

  it("trims the club name and caps it at 60 characters", async () => {
    vi.stubEnv("CLUB_NAME", `  ${"A".repeat(70)}  `);
    expect((await getBranding()).name).toBe("A".repeat(60));
  });
});

describe("isLogoVariant", () => {
  it("accepts only light and dark", () => {
    expect(isLogoVariant("light")).toBe(true);
    expect(isLogoVariant("dark")).toBe(true);
    expect(isLogoVariant("../logo")).toBe(false);
    expect(isLogoVariant(null)).toBe(false);
  });
});

describe("GET /branding/logo", () => {
  const get = (query = "") => GET(new NextRequest(`https://localhost/branding/logo${query}`));

  it("is 404 when no logo is set up", async () => {
    expect((await get()).status).toBe(404);
  });

  it("serves the PNG with nosniff and a cache lifetime", async () => {
    writeFileSync(join(dir, "logo.png"), PNG);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it("serves the dark logo for ?variant=dark and the normal one for any other value", async () => {
    const dark = Buffer.concat([PNG, Buffer.from("dark")]);
    writeFileSync(join(dir, "logo.png"), PNG);
    writeFileSync(join(dir, "logo-dark.png"), dark);
    expect(Buffer.from(await (await get("?variant=dark")).arrayBuffer())).toEqual(dark);
    const other = await get("?variant=../../etc/passwd");
    expect(Buffer.from(await other.arrayBuffer())).toEqual(PNG);
  });
});
