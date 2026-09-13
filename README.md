# Islamabad Fix

**Problem batao. Baqi hum sambhal lenge.**

An on-demand home and business services marketplace for Islamabad. A customer
describes a problem in their own words — Roman Urdu or English — and the
platform matches them with a verified technician, holds the price to a quote the
customer approved, and keeps a record of what happened at every step.

This repository is a working application, not a prototype. Every button that
appears does something; every integration that is not configured says so
plainly instead of pretending to work.

---

## What is actually built

| Area                                                               | State                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Customer booking (7-step wizard, intake → confirm)                 | Working end to end                                                                 |
| Password reset, email confirmation, phone OTP                      | Working                                                                            |
| Customer ↔ technician messaging on a booking                       | Working                                                                            |
| Rescheduling a visit                                               | Working                                                                            |
| Printable receipts                                                 | Working                                                                            |
| Two-factor authentication for staff                                | Working                                                                            |
| Notification preferences, data export, account closure             | Working                                                                            |
| Provider onboarding, admin verification, suspension                | Working                                                                            |
| Matching engine (hard eligibility filters + tunable scoring)       | Working                                                                            |
| Quotes, additional charges, customer approval                      | Working                                                                            |
| Booking lifecycle state machine + full status history              | Working                                                                            |
| Commission split, provider earnings, payouts                       | Working, server-side only                                                          |
| Cash payments                                                      | Working                                                                            |
| Online payment gateway                                             | Interface built, needs credentials                                                 |
| Disputes, Fix Guarantee claims                                     | Working                                                                            |
| Reviews and ratings                                                | Working                                                                            |
| Membership tiers (discount, guarantee bonus, priority, fee waiver) | Working; activation needs an admin to confirm the payment                          |
| Repeat visits (weekly / fortnightly / monthly / quarterly)         | Working; driven by `POST /api/cron/recurring`                                      |
| Live technician tracking                                           | Working where the provider has consented to share location                         |
| Customer ↔ technician calling                                      | Working; masked calling needs a telephony provider, direct otherwise               |
| Photo assessment                                                   | Interface built, needs a vision model; the photo reaches the technician regardless |
| Light / dark / system theme                                        | Working; both themes pass WCAG AA on every rendered text node                      |
| Admin dashboard: ops, catalogue, zones, settings, analytics, audit | Working                                                                            |
| AI intake assistant                                                | Working; falls back to a rule-based classifier, and says which answered            |
| Maps / geocoding                                                   | Interface built, needs credentials; zone centroids used meanwhile                  |
| Email / SMS / WhatsApp / voice agent                               | Interfaces built, need credentials                                                 |
| Object storage                                                     | Local disk by default; S3/MinIO driver included                                    |
| Scheduled jobs                                                     | Interface built, needs `CRON_SECRET`; refuses every caller without it              |

An unconfigured integration is a first-class state, not an error. `/api/health`
reports exactly which ones are live.

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** in strict mode,
  with `noUncheckedIndexedAccess`
- **PostgreSQL 16** via **Prisma 6**
- **Tailwind CSS** with a project design system (no component library)
- **Vitest** — server tests against a real database, component tests in jsdom
- Session auth: bcrypt + short-lived JWT access token + rotating opaque refresh
  token, all in `httpOnly` cookies, with CSRF double-submit
- TOTP second factor for staff, implemented against RFC 6238 rather than taken
  as a dependency

No state management library, no charting library, no UI kit, no OTP library. Charts are
hand-drawn SVG; the design system is ~700 lines of Tailwind and React.

---

## Running it locally

Requirements: Node 20.11+, PostgreSQL 16, and nothing else.

```bash
git clone <repo> && cd islamabaddfix
npm install

cp .env.example .env
# Set DATABASE_URL and generate AUTH_SECRET:
#   openssl rand -base64 48

npm run prisma:deploy   # create the schema
npm run db:seed         # reference catalogue (+ demo data, see below)
npm run dev             # http://localhost:3000
```

### Or with Docker

```bash
docker compose up --build
```

Brings up Postgres, MinIO, runs migrations as a release step, and starts the
app on <http://localhost:3000> with every optional integration off.

### The seed

`npm run db:seed` writes two different things:

- **Reference data** — 8 service categories, 42 services, 25 Islamabad zones
  with centroids, and the admin account from `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`. Idempotent, and safe to re-run. The admin password is
  never reset on a re-run.
- **Demo data** — sample providers, bookings and reviews, only when
  `ALLOW_DEMO_SEED=true`. Every demo row carries `isDemo: true`, is badged as
  demo in the UI, and can be removed later with
  `npx tsx scripts/purge-demo.ts --confirm`.

Sector names are seeded as _data_, not compiled in: an admin adds, renames or
retires a zone from the admin panel, and the matcher picks it up immediately.

---

## Commands

| Command                                   | What it does                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                             | Development server                                                                                                   |
| `npm run build`                           | Production build (standalone output)                                                                                 |
| `npm start`                               | Serve the production build                                                                                           |
| `npm run verify`                          | typecheck → lint → the whole test suite                                                                              |
| `npm test`                                | Tests only                                                                                                           |
| `npm run smoke -- <url>`                  | Post-deploy browser check: pages render, CSP holds, the wizard responds                                              |
| `npm run acceptance -- <url>`             | Drives the whole AC-repair scenario over HTTP against a running app, checking the database row behind every response |
| `npm run premium -- <url>`                | Drives memberships, repeat visits, tracking and calling over HTTP, including every refusal and honest-state path     |
| `npm run format`                          | Apply the repo's Prettier style (CI checks it)                                                                       |
| `npm run db:seed`                         | Seed reference (and optionally demo) data                                                                            |
| `npm run db:reset`                        | Drop and recreate the schema — refuses to touch production                                                           |
| `npx tsx scripts/purge-demo.ts --confirm` | Delete demo rows only                                                                                                |

The test suite needs a PostgreSQL database whose name contains `test`; it
refuses to run otherwise, and creates `isbfix_test` if it can. Set
`TEST_DATABASE_URL` to point it elsewhere.

---

## Documentation

| Document                                     | Contents                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it is put together, the database schema, and why the load-bearing decisions were made |
| [docs/API.md](docs/API.md)                   | Every endpoint, the response envelope, error codes, auth and rate limits                  |
| [docs/openapi.yaml](docs/openapi.yaml)       | Machine-readable spec for the customer- and provider-facing API                           |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)     | Production deployment, backups, logging, monitoring, rollback                             |
| [docs/SECURITY.md](docs/SECURITY.md)         | Threat model, what is enforced where, and what is deliberately not claimed                |
| [.env.example](.env.example)                 | Every environment variable, annotated                                                     |

Continuous integration lives in [.github/workflows/ci.yml](.github/workflows/ci.yml):
typecheck, lint, format check and the full suite against a real PostgreSQL
service container, plus a production build and an audit of production
dependencies, on every push.

---

## Things this product does not claim

These are deliberate, and they are enforced in code, not just in copy:

- **Verification means what it says.** A "Platform verified" badge means an
  administrator reviewed that provider's onboarding submission. It is not a
  government check, a licence, a police clearance or an insurance policy, and
  the app never says it is. Each badge is set only from its own completed check.
- **The AI assistant is not a diagnosis.** It suggests a service category and
  attaches a disclaimer. It never gives repair instructions for electrical, gas,
  refrigeration or structural work; a detected hazard overrides everything the
  model says and shows safety guidance instead.
- **Islamabad Fix is a marketplace.** Technicians are independent providers, not
  employees, and the legal copy says so.
- **The Fix Guarantee is not universal.** It applies per service, its window is
  frozen onto the booking at completion, and every claim is reviewed.
- **Closing an account anonymises it; it does not erase the ledger.** Booking
  and payment records stay, because the other party to the transaction has
  their own claim on that history and the accounts have to balance. What goes
  is everything that identifies the person.
- **Notification preferences cannot switch off two things**: in-app delivery,
  because a customer must be able to find out that a stranger is on the way to
  their house, and security messages about their own account. Changing
  the platform setting later never reaches back into a job already done.
- **A membership is not live until the money is.** Buying one records an
  intent; an administrator confirms the payment and only then do benefits
  apply. Nothing pretends to have charged a card, because no gateway is
  configured to charge one.
- **Editing a plan never changes what a member already bought.** Every benefit
  is snapshotted onto the membership at purchase. Retiring a tier removes it
  from sale and takes nothing away from the people on it.
- **Guarantee bonus days extend a guarantee; they never create one.** A plan
  cannot sell cover on a service the guarantee excludes.
- **Priority means a wider first wave, not a place in a queue.** Nothing queues
  in this system, so a member's request simply reaches more technicians at
  once. The plans page says that in those words.
- **A repeat visit is not a subscription.** Each occurrence becomes an ordinary
  booking with its own written quote, which the customer approves as usual.
- **Tracking shows what we actually know.** A position more than five minutes
  old is labelled stale rather than drawn as current, the minutes-away figure
  is distance over an assumed speed rather than a routed ETA, and a technician
  who has not consented to share location is reported as exactly that.
- **A call is only "private" when it is.** Without a telephony provider the app
  hands over the real number — the one already shared after acceptance — and
  says so, instead of showing a masking badge over an ordinary `tel:` link.

---

## Licence

Proprietary. All rights reserved.
