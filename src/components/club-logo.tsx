import type { Branding } from "@/lib/branding";

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

/** The club's logo from the box, or nothing when none is set up. */
export function ClubLogo({ branding, backdrop, className, decorative = false }: Props) {
  if (!branding.hasLogo) return null;
  const alt = decorative ? "" : (branding.name ?? "");
  const light = LIGHT_LOGO[backdrop];
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by /branding/logo */}
      <img
        src="/branding/logo"
        alt={alt}
        className={`${className} ${branding.hasDarkLogo ? light.withDark : light.alone}`}
        draggable={false}
      />
      {branding.hasDarkLogo && (
        // eslint-disable-next-line @next/next/no-img-element -- served by /branding/logo
        <img
          src="/branding/logo?variant=dark"
          alt={alt}
          className={`${className} ${DARK_LOGO[backdrop]}`}
          draggable={false}
        />
      )}
    </>
  );
}
