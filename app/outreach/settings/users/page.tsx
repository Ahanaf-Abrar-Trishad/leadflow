import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { PageShell, PageHeader } from "@/components/outreach/PageShell";
import { UserManagement } from "./UserManagement";

export const metadata = { title: "Manage users | LeadFlow" };

export default async function UsersSettingsPage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") redirect("/outreach");

  const rows = await db.select({ id: users.id, email: users.email, role: users.role }).from(users);

  return (
    <PageShell>
      <PageHeader
        back={{ href: "/outreach", label: "All campaigns" }}
        title="Manage users"
        description="Everyone with access to this console. The last admin account can't be removed or demoted."
      />
      <UserManagement users={rows} currentUserId={currentUser.id} />
    </PageShell>
  );
}
