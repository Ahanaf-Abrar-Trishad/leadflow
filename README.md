# LeadFlow

One console for the whole agency client pipeline:

**scrape leads → enrich → personalized outreach → follow-up → replies → proposal → payment → onboarding**

Claude does the writing (icebreakers, reply drafts, proposals) and you approve
everything before it goes out.

## Status

| Stage | Status |
|---|---|
| 1. Foundation: outreach engine (mailboxes, 5-step sequences, follow-ups, reply and bounce detection, unsubscribe and suppression, multi-user) | ✅ Done (carried over from PPC-Tools) |
| 2. Lead ingest: Google Maps scrapes, website email finder, Scout/CSV import, lead list, add leads to campaigns | ✅ Done |
| 3. AI icebreakers through a Claude connector (MCP, your own Claude subscription) and an approval queue | ✅ Done |
| 4. Reply triage and answer drafts by Claude, sales pipeline board | ✅ Done |
| 5. Proposals: Claude drafts the wording, you price it, the client e-signs on a private link | ✅ Done |
| 6. Payments (gateway to be decided) and onboarding | ⏳ Next |
| 7. WhatsApp channel | Planned |

## Leads

**Leads → Scrape Google Maps** sends a search ("dentists" in "Austin, TX") to
the bundled scraper engine. The scrape poller picks up the results, stores
them as leads, and for leads with a website but no email checks the
homepage, contact and about pages for one. One scrape runs at a time.

**Leads → Import CSV** accepts a Scout export, a Google Maps scraper CSV, or
any spreadsheet with business names, emails or websites (Apollo and similar
exports work; columns are matched by name).

The same business arriving twice (same website domain, else same email)
merges into one lead; later data only fills empty fields. Each lead gets a
0-100 score for sorting: reachability (email, phone, website) plus a few
agency-fit signals (established business, middling rating).

Select leads and **Add to campaign** to turn them into contacts. These merge
fields become available in templates:

| Field | Value |
|---|---|
| `{{company}}` | Business name (always set) |
| `{{greeting}}` | Contact's first name, or "there" (always set) |
| `{{first_name}}`, `{{full_name}}` | Only when a person's name is known |
| `{{website}}`, `{{domain}}`, `{{category}}`, `{{phone}}`, `{{address}}`, `{{rating}}`, `{{review_count}}` | When the lead has them |
| `{{icebreaker}}` | Once you approve Claude's opening line for the lead |

Campaign preflight flags any lead missing a field a template uses. A Maps
lead's timezone carries over, so business-hours sending is in the lead's
local time.

## Claude icebreakers

LeadFlow exposes an MCP connector that Claude (Cowork, claude.ai, the
desktop app or Claude Code) uses with your own Claude subscription; no API
key is involved.

1. Set `MCP_ACCESS_TOKEN` in `.env` (32+ characters, see `.env.example`) and
   `NEXT_PUBLIC_SITE_URL` to the app's public HTTPS address, then restart.
2. Open **Connect Claude** (admins only) for the connector URL and the
   Claude Code command, and add it to Claude as a custom connector.
3. Ask Claude to draft icebreakers with the LeadFlow connector, or schedule
   that as a daily Cowork task (the page has a ready prompt).

Claude lists leads that have an email but no icebreaker, reads a snapshot of
each homepage (HTTPS, speed, mobile viewport, meta description, copyright
year, platform, analytics and ad tracking), and saves a one- or two-sentence
draft with the facts it used. Drafts wait in **Approvals**, where you
approve, edit or reject each one. Only an approved line becomes the lead's
`{{icebreaker}}`; a campaign template that uses `{{icebreaker}}` holds back
every lead without one at preflight.

The connector URL carries the secret; anyone with it can read lead data and
submit drafts (never send). Rotate it by changing `MCP_ACCESS_TOKEN`.

## Replies and pipeline

Through the same connector, Claude triages new replies before icebreakers:
it labels each one (interested, question, not now, not interested, wants
out, out of office, other) with a one-line reason, and for interested,
question and not-now replies drafts an answer. The label shows in
**Replies**; the draft pre-fills that thread's reply box, and only pressing
Send delivers it. A "wants out" label never suppresses anyone by itself -
use the Unsubscribe button.

An interested reply (or **Add to pipeline** on any thread) creates a deal
on the **Pipeline** board: Replied, Call booked, Proposal, Won, Lost. Each
deal carries a value in USD, notes, a lost reason, and a link back to the
conversation. One deal per contact.

## Proposals

Open **Proposal** on a deal in the Pipeline (or let Claude draft one: the
connector lists deals at Call booked or Proposal that have none, reads the
conversation, your deal notes and the website snapshot, and saves the
wording). Claude never sets prices; you price every line item (one-time or
monthly) in the editor, and a proposal cannot go out until every item is
priced.

**Send in conversation** emails the link in the deal's existing thread;
**Make live and copy link** lets you share it yourself. The client sees the
proposal at `/p/<signed token>`, types their name and email, ticks "I agree"
and presses Accept. LeadFlow stores the signer's name, email, time, IP
address and browser, plus an exact copy of the proposal as signed, and moves
the deal to Won. The client can also decline with a reason.

Back to draft (to change something) or Withdraw both revoke every link
already sent. Set `AGENCY_NAME` to show your agency on proposals.

This is a simple click-to-accept electronic signature with a consent
statement and an audit record. Have a lawyer review your terms and whether
it is enough for your contracts.

## Run it locally

Requires Node 22 and Docker.

```bash
cp .env.example .env   # then fill in APP_ENCRYPTION_KEY and UNSUBSCRIBE_SECRET
docker compose --profile dev up -d db mailhog gmaps-scraper
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000. The first visit creates the admin account.
MailHog (http://localhost:8025) catches test mail sent through an SMTP
mailbox pointed at `localhost:1025`.

The worker (sends due emails) and poller (checks for replies and bounces) run
inside the web process when `NODE_ENV=production`. Under `npm run dev`, set
`OUTREACH_BACKGROUND_JOBS=true` to run them too.

## Deploy to a VPS

```bash
cp .env.example .env   # fill in the secrets, NEXT_PUBLIC_SITE_URL and a strong POSTGRES_PASSWORD
docker compose up -d --build
```

This starts Postgres, the app on `127.0.0.1:3000`, and the Google Maps
scraper engine on `127.0.0.1:8080`. Put a reverse proxy with HTTPS (Caddy or
Nginx) in front of port 3000. Never expose the scraper or the database
publicly; neither has its own authentication.

## Tests

```bash
npm run verify             # lint, typecheck, unit tests
npm run test:integration   # needs DATABASE_URL pointing at a migrated database
```

Integration tests run inside a rolled-back transaction, but they TRUNCATE
tables, so point them at a dedicated database, not production.

## Compliance (USA / Canada)

Every campaign requires a postal address, and every email carries an
unsubscribe link. Unsubscribes, bounces and manual entries go on the
suppression list and are never mailed again. Keep it that way: CAN-SPAM and
CASL require it.

## Credits

- Outreach engine: PPC-Tools by Ahanaf Abrar.
- Google Maps engine: [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) (MIT), as packaged by [google-maps-scraper-kit](https://github.com/Mahanaicoach/google-maps-scraper-kit).
