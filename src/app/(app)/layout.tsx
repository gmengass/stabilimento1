import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { ClubLogo } from "@/components/club-logo";
import { ActingBadge, ActingProvider } from "@/components/acting";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LogoutIcon } from "@/components/icons";
import { UserMenu } from "@/components/user-menu";
import { currentActing, listActingChoices } from "@/lib/auth/acting";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getBranding } from "@/lib/branding";
import { MAIN_CONTENT_ID } from "@/components/page-main";
import { THEME_COOKIE, resolveTheme } from "@/theme/config";

/** Everything in this group needs a logged-in user. Pages and actions check again themselves. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("appShell");
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
  const choices = user.communal ? await listActingChoices(getDb()) : [];
  const acting = await currentActing(getDb(), user);
  const branding = await getBranding();
  return (
    <ActingProvider communal={user.communal} choices={choices} initialName={acting?.name ?? null}>
      <a
        href={`#${MAIN_CONTENT_ID}`}
        data-skip-link
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-30 focus:inline-flex focus:min-h-11 focus:items-center focus:m-2 focus:rounded focus:bg-background focus:px-3 focus:py-2"
      >
        {t("skipToContent")}
      </a>
      <nav
        data-banner
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1 text-sm sun:border-b-[5px] sun:border-b-[#e8862a] sun:bg-[#1f3d2b] sun:text-[#fbf6ec]"
      >
        <Link href="/" className="flex min-h-11 items-center gap-2">
          <ClubLogo branding={branding} decorative backdrop="banner" className="h-10" />
          {t("map")}
        </Link>
        <Link href="/prices" className="flex min-h-11 min-w-11 items-center justify-center">
          {t("prices")}
        </Link>
        {user.role === "admin" && (
          <>
            <Link href="/admin/beach" className="flex min-h-11 items-center">
              {t("beach")}
            </Link>
            <Link href="/admin/seasons" className="flex min-h-11 items-center">
              {t("seasons")}
            </Link>
            <Link href="/admin/staff" className="flex min-h-11 items-center">
              {t("staff")}
            </Link>
          </>
        )}
        <UserMenu label={t("signedInAs", { name: user.name })}>
          <div className="flex flex-col gap-3">
            <LanguageSwitcher />
            <ThemeSwitcher current={theme} />
            <form action={logout} className="border-t pt-3">
              <button
                type="submit"
                className="flex min-h-11 w-full items-center gap-2 rounded border px-3"
              >
                <LogoutIcon />
                {t("logout")}
              </button>
            </form>
          </div>
        </UserMenu>
        <ActingBadge />
      </nav>
      {children}
    </ActingProvider>
  );
}
