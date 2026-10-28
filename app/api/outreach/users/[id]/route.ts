import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { revokeAllSessionsForUser } from "@/lib/outreach/auth/session";
import { isLastAdmin } from "@/lib/outreach/auth/userManagement";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/outreach/users/[id]">) {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const allUsers = await db.select({ id: users.id, role: users.role }).from(users);

  if (isLastAdmin(allUsers, id)) {
    return NextResponse.json({ error: "Cannot remove the last remaining admin." }, { status: 409 });
  }

  await revokeAllSessionsForUser(id);
  await db.delete(users).where(eq(users.id, id));

  return NextResponse.json({ removed: true });
}
