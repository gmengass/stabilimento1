import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { UserMenu } from "@/components/user-menu";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

/** Everything in this group needs a logged-in user. Pages and actions check again themselves. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("appShell");
  return (
    <>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1 text-sm">
        <Link href="/" className="flex min-h-11 items-center">
          {t("map")}
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
          <LanguageSwitcher />
        </UserMenu>
        <form action={logout}>
          <button type="submit" className="min-h-11 rounded border px-3 py-2">
            {t("logout")}
          </button>
        </form>
      </nav>
      {children}
    </>
  );
}
