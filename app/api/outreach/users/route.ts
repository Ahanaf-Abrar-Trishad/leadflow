import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { credentialsSchema } from "@/lib/outreach/auth/validation";
import { hashPassword } from "@/lib/outreach/auth/password";
import { getCurrentUser } from "@/lib/outreach/auth/currentUser";

const createUserSchema = credentialsSchema.extend({
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const rows = await db.select({ id: users.id, email: users.email, role: users.role }).from(users);
  return NextResponse.json({ users: rows });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({ email: parsed.data.email, passwordHash, role: parsed.data.role })
    .returning({ id: users.id, email: users.email, role: users.role });

  return NextResponse.json({ user }, { status: 201 });
}
