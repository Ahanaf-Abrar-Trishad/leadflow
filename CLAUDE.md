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
- Never send email without operator approval; the AI only drafts. AI text
  reaches a prospect only through an approved `ai_drafts` row.
- Run `npm run verify` before calling a change done.
