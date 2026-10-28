# LeadFlow

One console for the whole agency client pipeline:

**scrape leads → enrich → personalized outreach → follow-up → replies → proposal → payment → onboarding**

Claude does the writing (icebreakers, reply drafts, proposals) and you approve
everything before it goes out.

## Status

| Stage | Status |
|---|---|
| 1. Foundation: outreach engine (mailboxes, 5-step sequences, follow-ups, reply and bounce detection, unsubscribe and suppression, multi-user) | ✅ Done (carried over from PPC-Tools) |
| 2. Lead ingest: Google Maps scraper, Scout enrichment, CSV import, lead list | ⏳ Next |
| 3. AI personalization and approval queue (Claude via MCP, using a Claude subscription) | Planned |
| 4. Reply classification and deal pipeline | Planned |
| 5. Proposals with a public accept link | Planned |
| 6. Payments (gateway to be decided) and onboarding | Planned |
| 7. WhatsApp channel | Planned |

## Run it locally

Requires Node 22 and Docker.

```bash
cp .env.example .env   # then fill in APP_ENCRYPTION_KEY and UNSUBSCRIBE_SECRET
docker compose --profile dev up -d db mailhog
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
