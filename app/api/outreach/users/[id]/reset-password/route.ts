import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";
import { hashPassword } from "@/lib/outreach/auth/password";
import { revokeAllSessionsForUser } from "@/lib/outreach/auth/session";

const resetPasswordSchema = z.object({ password: z.string().min(8) });

export async function POST(request: Request, ctx: RouteContext<"/api/outreach/users/[id]/reset-password">) {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await request.json();
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  // Force re-login everywhere with the new password - a stale session
  // shouldn't outlive a password reset.
  await revokeAllSessionsForUser(id);

  return NextResponse.json({ reset: true });
}
