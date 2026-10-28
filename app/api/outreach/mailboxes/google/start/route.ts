import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createGoogleOAuthClient, GMAIL_SCOPES } from "@/lib/outreach/mailboxes/googleClient";

export const STATE_COOKIE_NAME = "google_oauth_state";

export async function GET() {
  const state = crypto.randomBytes(32).toString("base64url");
  const client = createGoogleOAuthClient();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // guarantees a refresh token even on re-auth of an already-connected account
    scope: GMAIL_SCOPES,
    state,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes - the whole consent round-trip should be quick
  });
  return response;
}
