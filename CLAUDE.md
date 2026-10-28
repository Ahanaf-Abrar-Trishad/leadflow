@AGENTS.md

# LeadFlow

Next.js (App Router) + Postgres (Drizzle) console for an agency's lead
pipeline. See README.md for the stage roadmap.

- Schema: `db/schema.ts`. After changing it run `npm run db:generate`, commit
  the new file in `db/migrations/`, then `npm run db:migrate`.
- Sending happens only in `worker/tick.ts`; reply and bounce detection only in
  `worker/poller.ts`. Both run in-process via `instrumentation.ts`.
- Auth: every `/outreach` and `/api/outreach` route is gated in `proxy.ts`.
  Any new public page (proposal link, payment page) must be added there
  deliberately and protected by its own signed token, like unsubscribe.
- `/api/mcp/[token]` is the one deliberately public API route: Claude's
  connector, guarded by MCP_ACCESS_TOKEN in the path (lib/ai/mcpAuth.ts).
  Its tools may read leads and save drafts, never send or change campaigns.
- Public pages and routes, each keyed by a signed, versioned token
  (lib/links/signedLink.ts, one key per purpose; revoking bumps the row's
  link version): `/p/[token]` (proposal, accept/decline under `/api/p`),
  `/pay/[token]` (invoice, `/api/pay/[token]/checkout`) and `/intake/[token]`
  (`/api/intake/[token]`). `/api/stripe/webhook` is public but only acts on
  events signed with STRIPE_WEBHOOK_SECRET.
- Money is integer cents in `invoices`; amounts always come from the signed
  proposal snapshot, never from a request.
- Claude never sets prices: proposal amounts are operator-only, and a
  proposal cannot be sent until every line item is priced.
- Never send email without operator approval; the AI only drafts. AI text
  reaches a prospect only through an approved `ai_drafts` row.
- Run `npm run verify` before calling a change done.
