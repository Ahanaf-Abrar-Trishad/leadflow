import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";
import { encrypt, loadEncryptionKey } from "@/lib/outreach/crypto";
import { createGoogleOAuthClient, siteUrl } from "@/lib/outreach/mailboxes/googleClient";
import { STATE_COOKIE_NAME } from "../start/route";

function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE_NAME)?.value;
  cookieStore.delete(STATE_COOKIE_NAME);

  const redirectWithError = (message: string) =>
    NextResponse.redirect(new URL(`/outreach/mailboxes?googleError=${encodeURIComponent(message)}`, siteUrl()));

  if (error) return redirectWithError(`Google sign-in was cancelled or failed (${error}).`);
  if (!code) return redirectWithError("Google did not return an authorization code.");
  if (!state || !expectedState || !statesMatch(state, expectedState)) {
    return redirectWithError("The sign-in link expired or was tampered with. Try connecting again.");
  }

  const client = createGoogleOAuthClient();
  let refreshToken: string | null | undefined;
  try {
    const { tokens } = await client.getToken(code);
    refreshToken = tokens.refresh_token;
    client.setCredentials(tokens);
  } catch {
    return redirectWithError("Could not complete Google sign-in.");
  }

  if (!refreshToken) {
    return redirectWithError(
      "Google did not return a refresh token. If you've connected this account before, remove its access at myaccount.google.com/permissions and try again.",
    );
  }

  const gmail = google.gmail({ version: "v1", auth: client });
  let email: string;
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (!profile.data.emailAddress) throw new Error("No email address returned.");
    email = profile.data.emailAddress;
  } catch {
    return redirectWithError("Could not read the connected Google account's email address.");
  }

  const key = loadEncryptionKey();
  const encryptedCredentials = encrypt(JSON.stringify({ oauth: { refreshToken, email } }), key);

  const [mailbox] = await db
    .insert(mailboxes)
    .values({
      provider: "gmail_oauth",
      fromName: email,
      fromEmail: email,
      encryptedCredentials,
      dailyCap: 15,
      rampStartedAt: new Date(),
    })
    .returning({ id: mailboxes.id });

  return NextResponse.redirect(new URL(`/outreach/mailboxes?connected=${mailbox.id}`, siteUrl()));
}
