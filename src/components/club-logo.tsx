import type { Branding, LogoInfo, LogoVariant } from "@/lib/branding";

/** Where the logo sits: on the page background, or on the top bar (dark green in Arturo and Sera). */
type Backdrop = "page" | "banner";

type Props = { branding: Branding; backdrop: Backdrop; className: string; decorative?: boolean };

/** Shown when the backdrop is light; with no dark logo, a cream backing keeps it readable on dark. */
const LIGHT_LOGO: Record<Backdrop, { withDark: string; alone: string }> = {
  page: { withDark: "dark:hidden", alone: "dark:rounded-2xl dark:bg-[#fbf6ec] dark:p-[6%]" },
  banner: {
    withDark: "dark:hidden sun:hidden",
    alone: "rounded-lg dark:bg-[#fbf6ec] sun:bg-[#fbf6ec] dark:p-0.5 sun:p-0.5",
  },
};
const DARK_LOGO: Record<Backdrop, string> = {
  page: "hidden dark:block",
  banner: "hidden dark:block sun:block",
};
/** Height comes from the caller; a wide logo shrinks to fit instead of pushing the page sideways. */
const FIT = "w-auto max-w-full object-contain";

function logoSrc(variant: LogoVariant, info: LogoInfo): string {
  const query = new URLSearchParams({ v: info.version });
  if (variant === "dark") query.set("variant", "dark");
  return `/branding/logo?${query}`;
}

/** The club's logo from the box, or nothing when none is set up. */
export function ClubLogo({ branding, backdrop, className, decorative = false }: Props) {
  const { light, dark } = branding;
  if (!light) return null;
  const alt = decorative ? "" : (branding.name ?? "");
  const lightMode = dark ? LIGHT_LOGO[backdrop].withDark : LIGHT_LOGO[backdrop].alone;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by /branding/logo */}
      <img
        src={logoSrc("light", light)}
        width={light.width}
        height={light.height}
        alt={alt}
        className={`${className} ${FIT} ${lightMode}`}
        draggable={false}
      />
      {dark && (
        // eslint-disable-next-line @next/next/no-img-element -- served by /branding/logo
        <img
          src={logoSrc("dark", dark)}
          width={dark.width}
          height={dark.height}
          alt={alt}
          className={`${className} ${FIT} ${DARK_LOGO[backdrop]}`}
          draggable={false}
        />
      )}
    </>
  );
}
