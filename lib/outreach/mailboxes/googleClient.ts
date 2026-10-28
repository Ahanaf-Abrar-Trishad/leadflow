import { OAuth2Client, UserRefreshClient } from "google-auth-library";
import type { GoogleOAuthCredentials } from "./credentials";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

/** The app's own canonical origin - always read from the env var, never
 * from an incoming request's Host header. Behind a reverse proxy or a
 * container bound to 0.0.0.0, the request's own apparent origin can be
 * unreliable (e.g. resolving to "0.0.0.0:3000") even though the request
 * genuinely arrived at the public domain - so anything that needs to
 * build a URL the *browser* will follow next (an OAuth redirect_uri, a
 * post-auth redirect) must use this instead of request.url. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function googleRedirectUri(): string {
  return `${siteUrl()}/api/outreach/mailboxes/google/callback`;
}

function googleClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set.");
  }
  return { clientId, clientSecret };
}

/** For the OAuth consent flow itself (start/callback routes below) - has
 * the generateAuthUrl()/getToken() authorization-code methods. */
export function createGoogleOAuthClient(): OAuth2Client {
  return new OAuth2Client({ ...googleClientCredentials(), redirectUri: googleRedirectUri() });
}

/** For an already-connected mailbox (send/poll, Tasks 5 and 7) - lighter
 * weight than OAuth2Client, all it does is turn a stored refresh token
 * into a valid access token. */
export function createGoogleRefreshClient(oauth: GoogleOAuthCredentials): UserRefreshClient {
  return new UserRefreshClient({ ...googleClientCredentials(), refreshToken: oauth.refreshToken });
}
