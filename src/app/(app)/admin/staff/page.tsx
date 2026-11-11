import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/staff";
import { CreateStaffForm, StaffRowActions } from "./staff-forms";

export default async function StaffPage() {
  const actor = await requireAdmin();
  const t = await getTranslations("staff");
  const users = await listUsers(getDb());
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t("columns.username")}</th>
            <th>{t("columns.name")}</th>
            <th>{t("columns.role")}</th>
            <th>{t("columns.status")}</th>
            <th>{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b align-top">
              <td className="py-2">{user.username}</td>
              <td>{user.name}</td>
              <td>{t(`roles.${user.role}`)}</td>
              <td>{user.banned ? t("status.disabled") : t("status.active")}</td>
              <td className="py-2">
                <StaffRowActions user={user} isSelf={user.id === actor.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CreateStaffForm />
    </main>
  );
}
