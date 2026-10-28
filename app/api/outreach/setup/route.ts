import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { credentialsSchema } from "@/lib/outreach/auth/validation";
import { hashPassword } from "@/lib/outreach/auth/password";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/outreach/auth/session";

export async function POST(request: Request) {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Setup has already been completed." }, { status: 409 });
  }

  const body = await request.json();
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({ email: parsed.data.email, passwordHash, role: "admin" })
    .returning({ id: users.id });

  const { token, expiresAt } = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return NextResponse.json({ created: true }, { status: 201 });
}
