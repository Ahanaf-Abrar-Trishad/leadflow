# Deploying LeadFlow

A step-by-step checklist for running LeadFlow on a VPS with Docker. Work
through it in order and tick each box. Replace `app.example.com` with your
own address throughout.

Steps marked **(optional)** can wait; the app runs without them.

---

## 1. What you need

- [ ] A VPS: Ubuntu 24.04, **x86-64** (the Google Maps scraper image is
      amd64 only), **2 vCPU and 4 GB RAM** or more (the scraper runs a
      browser). Hetzner, DigitalOcean, Vultr or similar.
- [ ] A domain where you can add DNS records, for the app
      (`app.example.com`).
- [ ] A **sending domain** for cold email, separate from your main business
      domain (e.g. `getexample.com` next to `example.com`), so a deliverability
      problem never touches your main domain's email.
- [ ] Mailboxes on that sending domain (Google Workspace, Microsoft 365, Zoho
      or similar).
- [ ] A Claude plan with connectors (for icebreakers, reply triage,
      proposals and welcome emails).
- [ ] **(optional)** A Stripe account, for card and ACH payments.

## 2. Prepare the server

- [ ] Log in over SSH with a key, not a password.
- [ ] Update the system: `sudo apt update && sudo apt upgrade -y`
- [ ] Turn on the firewall, allowing only SSH and web traffic:
      ```bash
      sudo ufw allow OpenSSH
      sudo ufw allow 80
      sudo ufw allow 443
      sudo ufw enable
      ```
- [ ] Install Docker Engine and the Compose plugin, following Docker's
      official guide for Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- [ ] Check it works: `docker compose version`

## 3. Point the domain at the server

- [ ] Add a DNS **A record**: `app.example.com` -> the VPS's IP address.
- [ ] Wait until `ping app.example.com` answers from that IP.

## 4. Get the code

- [ ] Clone the repository onto the server (it is private: use a GitHub
      deploy key or `gh auth login`):
      ```bash
      git clone https://github.com/Ahanaf-Abrar-Trishad/leadflow.git
      cd leadflow
      ```

## 5. Configure `.env`

- [ ] `cp .env.example .env`, then fill it in. Generate each secret with:
      ```bash
      node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
      ```
      (no Node on the server? `openssl rand -base64 32` works too)

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | A long random value. |
| `APP_ENCRYPTION_KEY` | A generated secret. **Encrypts mailbox passwords and tokens.** |
| `UNSUBSCRIBE_SECRET` | A generated secret. **Signs every public link** (unsubscribe, proposal, pay, intake). |
| `NEXT_PUBLIC_SITE_URL` | `https://app.example.com` (no trailing slash). Every link sent to prospects and clients is built from it. |
| `MCP_ACCESS_TOKEN` | For the Claude connector: `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` (at least 32 characters). |
| `AGENCY_NAME`, `AGENCY_PITCH` | Your agency's name, and one line on what it sells (Claude uses it). |
| `KICKOFF_URL` | **(optional)** Your Calendly (or similar) booking link. |
| `PAYMENT_INSTRUCTIONS` | **(optional)** Wire/Zelle details shown on pay pages. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **(optional)** See step 11. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **(optional)** Only for mailboxes connected with Google; see step 8. |
| `DKIM_SELECTOR` | **(optional)** Only if your mail provider uses an unusual DKIM selector. |

- [ ] **Store a copy of `.env` somewhere safe outside the server** (a
      password manager). Losing `APP_ENCRYPTION_KEY` means reconnecting every
      mailbox; changing `UNSUBSCRIBE_SECRET` breaks every link already sent.
- [ ] Leave `DATABASE_URL` and `GMAPS_SCRAPER_URL` as they are;
      docker-compose overrides them for the app container.

## 6. Start the stack

- [ ] `docker compose up -d --build` (the first build takes a few minutes).
- [ ] `docker compose ps`: `db`, `app` and `gmaps-scraper` are running.
- [ ] `docker compose logs app --tail 50` shows `Migrations applied.`, the
      Next.js start line, and the worker, poller and scrape poller starting.
- [ ] The private ports are not open to the internet:
      `sudo ss -tlnp | grep -E ':(3000|5432|8080)'` lists them on
      `127.0.0.1` only.

## 7. HTTPS

Use Caddy as the reverse proxy: it gets and renews the certificate itself
and passes the client's IP along, which proposal signatures record.

- [ ] Install Caddy: https://caddyserver.com/docs/install#debian-ubuntu-raspbian
- [ ] Put this in `/etc/caddy/Caddyfile`:
      ```
      app.example.com {
          reverse_proxy 127.0.0.1:3000
      }
      ```
- [ ] `sudo systemctl reload caddy`
- [ ] `https://app.example.com` opens with a valid certificate.

## 8. First login and mailboxes

- [ ] **Right away**, open `https://app.example.com` and create the admin
      account. The first visitor becomes the admin, so do not leave a fresh
      install unclaimed.
- [ ] Add teammates under **Users**.

Sending domain DNS (at your sending domain's DNS host):

- [ ] **SPF**: the TXT record your mail provider gives you (`v=spf1 ...`).
- [ ] **DKIM**: turn on DKIM signing at your mail provider and publish its
      record. If your provider's selector is not one of `google`,
      `selector1`, `selector2`, `zoho`, `hostingermail1`, `default`, `dkim`,
      `mail`, `k1`, `s1`, `s2`, set `DKIM_SELECTOR` in `.env`.
- [ ] **DMARC**: a TXT record at `_dmarc.<sending domain>`, e.g.
      `v=DMARC1; p=none; rua=mailto:you@example.com`.

Connect each mailbox under **Mailboxes**, one of two ways:

- [ ] **SMTP + IMAP** (any provider): the provider's SMTP and IMAP host and
      port, and an **app password** (not your normal password; providers
      with two-factor sign-in require one).
- [ ] **Connect with Google** **(optional)**: needs a Google Cloud OAuth client:
  - [ ] In Google Cloud Console, create an OAuth client of type "Web
        application" with the redirect URI
        `https://app.example.com/api/outreach/mailboxes/google/callback`, and
        put its ID and secret in `.env`; run `docker compose up -d` to
        reload.
  - [ ] Enable the Gmail API for the project.
  - [ ] On the OAuth consent screen, if the mailboxes are Google Workspace
        accounts in your own organization, choose **Internal**. LeadFlow asks
        for `gmail.send` and `gmail.readonly`; with an External app left in
        Testing mode, Google expires the access after 7 days and the mailbox
        must be reconnected weekly.

Before the first real campaign:

- [ ] Keep each new mailbox's daily cap modest. LeadFlow ramps a new
      mailbox from 15 emails a day, adding 5 a day up to its cap; new
      domains still need a few weeks of gentle sending.
- [ ] Create a test campaign with your **postal address**, add yourself as
      the only contact, and start it. Preflight must show SPF, DKIM and
      DMARC passing.
- [ ] The email arrives in your inbox (not spam), with a working
      unsubscribe link.
- [ ] Reply to it. Within a few minutes it shows up under **Replies**.

## 9. Lead scraping

- [ ] **Leads -> Scrape Google Maps**: run a small test (one business type,
      one city, depth 2). It finishes under **Recent scrapes** and the leads
      appear in **Leads**.
- [ ] Keep scrapes modest. Heavy scraping can get the server's IP
      temporarily rate-limited by Google, and it is against Google's terms.

## 10. Claude connector

- [ ] Open **Connect Claude** (admins only) and copy the connector URL.
- [ ] In Claude, add it as a custom connector (no authentication).
- [ ] Ask Claude: "Use the LeadFlow connector and call get_queue_status."
      It answers with the queue counts.
- [ ] **(optional)** Create the daily Cowork scheduled task with the prompt
      shown on the page.
- [ ] Treat the connector URL like a password. To revoke it, change
      `MCP_ACCESS_TOKEN` and run `docker compose up -d`.

## 11. Payments (optional)

Start in Stripe **test mode**; switch to live keys only after a full test.

- [ ] Stripe Dashboard -> Developers -> API keys: put the test secret key in
      `STRIPE_SECRET_KEY`.
- [ ] Developers -> Webhooks: add the endpoint
      `https://app.example.com/api/stripe/webhook` with the events
      `checkout.session.completed`,
      `checkout.session.async_payment_succeeded` and
      `checkout.session.async_payment_failed`. Put its signing secret in
      `STRIPE_WEBHOOK_SECRET`.
- [ ] `docker compose up -d` to reload.
- [ ] Full test: send yourself a proposal, sign it, pay the deposit with
      Stripe's test card `4242 4242 4242 4242`. The invoice turns **Paid** and
      onboarding starts on the client page.
- [ ] Repeat with the live keys and a live webhook endpoint.

## 12. Backups

- [ ] Nightly database backup, kept off the server. For example, a cron
      job (`crontab -e`) for the deploy user:
      ```
      0 3 * * * cd /home/deploy/leadflow && docker compose exec -T db pg_dump -U postgres outreach | gzip > /home/deploy/backups/leadflow-$(date +\%F).sql.gz
      ```
      Then copy `/home/deploy/backups` to off-site storage (S3, Backblaze B2,
      or your provider's backup service), and delete old local copies.
- [ ] **Test a restore** once, into a scratch database, before you need it.
- [ ] `.env` is backed up separately (step 5); the database alone cannot
      decrypt mailbox credentials.

## 13. Updating

- [ ] `git pull`
- [ ] `docker compose up -d --build` (migrations run automatically on start).
- [ ] `docker compose logs app --tail 50` shows no errors; the Dashboard
      shows the worker and poller checking in.

## Troubleshooting

| Symptom | Check |
|---|---|
| Nothing sends; Dashboard says the worker is not running | `docker compose logs app`. The worker runs inside the app container, so the app must be up. |
| A campaign will not start | The preflight details on the campaign page: SPF/DKIM/DMARC, postal address, or a template field some contacts lack (e.g. `{{icebreaker}}` not yet approved). |
| Emails land in spam | DMARC/SPF/DKIM passing, a lower daily cap, plainer templates without links or images in the first email. |
| Links in emails point to `localhost` | `NEXT_PUBLIC_SITE_URL` in `.env`, then `docker compose up -d`. |
| Scrapes fail or come back empty | `docker compose logs gmaps-scraper`. Usually rate limiting: wait, lower the depth, or add proxies. |
| Stripe payments do not mark invoices paid | Stripe -> Webhooks -> the endpoint's recent deliveries. A 400 means `STRIPE_WEBHOOK_SECRET` does not match; a 404 means it is not set. |
| Claude says the connector is unreachable | `NEXT_PUBLIC_SITE_URL` is the public HTTPS address, and the URL has the current token. |
| Proposal signatures show the proxy's IP | The reverse proxy must pass `X-Forwarded-For` (Caddy does by default). |
