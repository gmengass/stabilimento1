import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

/** Everything in this group needs a logged-in user. Pages and actions check again themselves. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("appShell");
  return (
    <>
      <nav className="flex items-center gap-4 border-b px-4 py-2 text-sm">
        <Link href="/">{t("home")}</Link>
        {user.role === "admin" && <Link href="/admin/staff">{t("staff")}</Link>}
        <span className="ml-auto">{t("signedInAs", { name: user.name })}</span>
        <form action={logout}>
          <button type="submit" className="rounded border px-2 py-1">
            {t("logout")}
          </button>
        </form>
      </nav>
      {children}
    </>
  );
}
