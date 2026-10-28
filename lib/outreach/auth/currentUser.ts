import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, validateSession, type SessionUser } from "./session";

/** Reads the session cookie and validates it. Safe to call from a Server
 * Component (read-only) or a Route Handler; calling `cookies()` opts the
 * caller into dynamic rendering automatically. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSession(token);
}
