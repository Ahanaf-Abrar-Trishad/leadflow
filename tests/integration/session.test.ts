import { sql, eq } from "drizzle-orm";
import { db, queryClient } from "@/db/client";
import { users, sessions } from "@/db/schema";
import { hashPassword } from "@/lib/outreach/auth/password";
import {
  createSession,
  validateSession,
  revokeSession,
  revokeAllSessionsForUser,
} from "@/lib/outreach/auth/session";

describe("session module (integration)", () => {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE sessions, users RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  async function makeUser(email = "jane@example.com") {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword("irrelevant"), role: "member" })
      .returning();
    return user;
  }

  it("validates a session it just created", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    const result = await validateSession(token);
    expect(result).toEqual({ id: user.id, email: user.email, role: "member" });
  });

  it("returns null for a token that was never issued", async () => {
    expect(await validateSession("not-a-real-token")).toBeNull();
  });

  it("returns null and deletes the row for an expired session", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    // Force it into the past directly, rather than waiting 30 days.
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, user.id));

    expect(await validateSession(token)).toBeNull();
    const remaining = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(remaining).toHaveLength(0);
  });

  it("revokes a single session by token", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    await revokeSession(token);
    expect(await validateSession(token)).toBeNull();
  });

  it("revokes every session for a user", async () => {
    const user = await makeUser();
    const { token: tokenA } = await createSession(user.id);
    const { token: tokenB } = await createSession(user.id);
    await revokeAllSessionsForUser(user.id);
    expect(await validateSession(tokenA)).toBeNull();
    expect(await validateSession(tokenB)).toBeNull();
  });
});
