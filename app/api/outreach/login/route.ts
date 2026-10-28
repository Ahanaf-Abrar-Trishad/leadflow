import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { credentialsSchema } from "@/lib/outreach/auth/validation";
import { verifyPassword } from "@/lib/outreach/auth/password";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/outreach/auth/session";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));

  // Same generic message whether the email or the password was wrong - never
  // reveal which one, so a login form can't be used to enumerate accounts.
  const invalid = () => NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  if (!user) return invalid();
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalid();

  const { token, expiresAt } = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return NextResponse.json({ signedIn: true });
}
