# Deployment

Getting Islamabad Fix into production, and keeping it there: backups, logging,
monitoring, and how to get back if a release goes wrong.

---

## 1. What you need

|                | Minimum                                                            | Comfortable            |
| -------------- | ------------------------------------------------------------------ | ---------------------- |
| Node           | 20.11                                                              | 22 LTS                 |
| PostgreSQL     | 16                                                                 | 16, managed, with PITR |
| Memory         | 1 GB                                                               | 2 GB per app instance  |
| Object storage | local disk on a persistent volume                                  | S3 or MinIO            |
| TLS            | required — the session cookies are `Secure` and `__Host-` prefixed |                        |

The app is stateless apart from uploaded files, so it scales horizontally. Rate
limiting is Postgres-backed precisely so it keeps working across instances.

---

## 2. Environment

Copy `.env.example` and fill it in. Two variables are genuinely required:

```bash
DATABASE_URL="postgresql://user:password@host:5432/isbfix?schema=public&sslmode=require"
AUTH_SECRET="$(openssl rand -base64 48)"     # 32 characters minimum
NEXT_PUBLIC_APP_URL="https://islamabadfix.pk"
```

Everything else is an integration that can be added later. The app boots with
all of them absent and says so on `/api/health` and in the admin panel.

**`AUTH_SECRET`.** Rotating it invalidates every access token immediately;
refresh tokens are opaque database rows and survive, so users are not signed out
— they simply refresh once. It **also** derives the key that encrypts enrolled
two-factor secrets, so rotating it means every staff member has to re-enrol.
Their recovery codes exist for exactly that day, but plan the rotation rather
than discovering it. Never commit it, never reuse the development value, and
never share it between environments.

**`NEXT_PUBLIC_*` variables are compiled into the browser bundle.** They must be
correct at build time, not just at runtime, and they must never hold a secret.
`NEXT_PUBLIC_MAPS_API_KEY` is public by definition — restrict it by HTTP
referrer at the provider.

**`CRON_SECRET` is required for anything to happen on a schedule.** Repeat
visits only generate bookings, and lapsed memberships only expire, when
something calls `POST /api/cron/recurring` with `Authorization: Bearer
$CRON_SECRET`. Without the secret set the endpoint refuses every caller —
deliberately, because an unauthenticated job runner that can create bookings is
worse than no job runner. Generate it the same way as `AUTH_SECRET` and see
§4 for wiring a scheduler to it.

**Secrets belong in your platform's secret store**, not in a `.env` file on the
server. `.env` is gitignored and should stay that way; the repository contains
only `.env.example`.

---

## 3. Deploying

### Docker (recommended)

```bash
docker build -t islamabad-fix:$(git rev-parse --short HEAD) \
  --build-arg NEXT_PUBLIC_APP_URL=https://islamabadfix.pk .

# Release step — must succeed before any new container serves traffic.
docker run --rm --env-file .env.production islamabad-fix:<tag> \
  node_modules/.bin/prisma migrate deploy

docker run -d --name isbfix --env-file .env.production -p 3000:3000 \
  islamabad-fix:<tag>
```

The image is Next's standalone server plus the Prisma engine and migration
files: no build tooling, no source, no dev dependencies, and it runs as an
unprivileged user. `HEALTHCHECK` hits `/api/health`.

`docker compose up --build` brings up the whole stack — Postgres, MinIO,
migrations, app — and is the fastest way to see it running.

### Without Docker

```bash
npm ci
npm run build            # emits .next/standalone
npx prisma migrate deploy
node .next/standalone/server.js
```

Copy `.next/static` to `.next/standalone/.next/static` and `public` to
`.next/standalone/public` — Next does not do this for you.

Put it behind nginx or Caddy for TLS, and run it under a process supervisor.

### Managed platforms

Vercel, Railway, Render and Fly all work: build with `npm run build`, start with
`npm start`, and run `npx prisma migrate deploy` as a release command. Attach a
PostgreSQL add-on and set `STORAGE_DRIVER=s3` — a serverless filesystem does not
persist, so the local storage driver is not an option there.

---

## 4. First run

```bash
npx prisma migrate deploy      # schema
ALLOW_DEMO_SEED=false npm run db:seed
```

With `ALLOW_DEMO_SEED=false` the seed writes only the reference catalogue
(8 categories, 42 services, 25 zones with centroids), two membership plans left
**inactive**, and the administrator account from `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`. Set those to real values _before_ seeding, and change the
password on first login.

The membership plans are deliberately inactive and `memberships.enabled` is
off: a plan is a commercial promise, so it goes on sale only when somebody
decides it should, from Admin → Memberships.

The seed is idempotent and safe to re-run; it never resets the admin password on
a re-run.

If demo data ever reaches an environment it should not have:

```bash
npx tsx scripts/purge-demo.ts --confirm
```

It touches only rows with `isDemo: true`, and refuses to run without
`--confirm`.

Then verify the deployment with a real browser rather than a curl:

```bash
npm run smoke -- https://islamabadfix.pk
```

It loads the pages, watches for CSP violations and page errors, types into the
booking wizard and checks that the assistant answers. It exits non-zero on any
failure, so it can gate a release.

On a staging deployment, go further and run the whole scenario:

```bash
npm run acceptance -- https://staging.islamabadfix.pk
```

That registers a customer and a provider, onboards and approves the provider,
books a job, quotes it, works it to completion, pays, reviews and claims the
guarantee — over HTTP, through the real routes, checking the database row behind
every response. It writes data, so never point it at production.

### Wiring the scheduler

Two things need a periodic nudge: repeat visits must turn into bookings a few
days before each occurrence, and lapsed memberships must be retired. One
endpoint does both, and it is idempotent, so a scheduler that fires twice, late
or after a missed window produces the same result as one that fires once.

Hourly is plenty; the lead time is measured in days.

```bash
# crontab, systemd timer, platform scheduler — anything that can make a request
0 * * * * curl -fsS -X POST https://islamabadfix.pk/api/cron/recurring \
  -H "Authorization: Bearer $CRON_SECRET" >/dev/null
```

Check it is actually running: the admin dashboard's integration board shows
**Scheduled jobs** as configured or not, and every run writes a
`recurring.run` entry to the audit log with what it created, ended and skipped.
A repeat visit that could not be booked — a deleted address, a retired service —
pauses itself and notifies the customer rather than failing the whole run, so
watch for `recurring.paused` notifications as a signal that a schedule needs
attention.

---

## 5. Migrations

**Always `prisma migrate deploy`, never `migrate dev`,** which is interactive
and can drop data.

Run migrations as a release step that must finish before new containers take
traffic. A failed migration should stop the deploy, not start a server against a
schema it does not match.

For a rolling deploy, make schema changes backwards-compatible across one
release: add a nullable column, deploy code that writes both, backfill, then
make it required in the next release. The old and new versions of the
application will be serving simultaneously for a minute or two.

`scripts/db-reset.ts` exists for development. It refuses to run when
`NODE_ENV=production` and refuses any URL that looks like a hosted database
unless given `--i-really-mean-it`. There is no reason to run it against
production, ever.

---

## 6. Backups

**Nothing here is optional.** Bookings, quotes and payment records are what this
business runs on, and provider verification documents cannot be regenerated.

### Database

Use your provider's automated backups with point-in-time recovery if you have
them. Otherwise:

```bash
# Nightly, retained 30 days, encrypted, off-host.
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  | gpg --encrypt --recipient ops@islamabadfix.pk \
  > "isbfix-$(date +%F).dump.gpg"
```

Restore:

```bash
gpg --decrypt isbfix-2026-09-01.dump.gpg \
  | pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL"
```

**Test the restore quarterly, into a scratch database.** An untested backup is a
belief, not a backup.

### Uploaded files

S3/MinIO: enable versioning and a lifecycle rule, and replicate to a second
region or bucket. Local driver: the storage directory must be a persistent
volume, backed up on the same schedule as the database — a container filesystem
does not survive a restart.

### What to keep

| Data             | Retention                       | Why                              |
| ---------------- | ------------------------------- | -------------------------------- |
| Database dumps   | 30 days rolling + 12 monthly    | Recovery, and financial history  |
| Uploaded files   | Same as the database, versioned | Evidence for disputes            |
| Audit log        | 24 months minimum               | It is the record of who did what |
| Application logs | 30 days                         | Incident investigation           |

Provider identity documents are personal data. Encrypt them at rest and in
backup, restrict who can decrypt, and delete them when the retention period the
privacy policy states has passed.

---

## 7. Logging

The app logs structured JSON to stdout — the platform collects it. Nothing is
written to files inside the container.

**What is never logged:** passwords, password hashes, access or refresh tokens,
CSRF tokens, full IBANs, CNIC numbers, and customer phone numbers or addresses.
Errors log the code and context, not the request body.

**The audit log is not the application log.** `AuditLog` rows live in the
database and record who did what to which entity: provider approvals and
rejections, suspensions, verification changes, dispute and guarantee decisions,
settings changes, refunds, role changes, and denied private-file reads. It is
queryable from the admin panel and is the first thing to read when something
looks wrong. Application logs answer "why did this crash"; the audit log answers
"who decided this".

Ship logs somewhere they outlive the container: CloudWatch, Loki, Datadog,
Better Stack — the choice matters less than the shipping.

---

## 8. Monitoring

### The health endpoint

`GET /api/health` returns:

```json
{
  "status": "ok",
  "database": "up",
  "latencyMs": 3,
  "integrations": {
    "ai": false,
    "maps": false,
    "email": false,
    "onlinePayments": false,
    "storage": "local"
  }
}
```

`status` is `ok` only when the database actually answered. Point your uptime
check at it, alert on two consecutive failures, and treat `latencyMs` above a
few hundred as a database problem.

### What to alert on

| Signal                                   | Threshold                 | Means                                                      |
| ---------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| `/api/health` failing                    | 2 consecutive checks      | The app or its database is down                            |
| 5xx rate                                 | > 1% over 5 minutes       | Something broke in the last release                        |
| p95 response time                        | > 2s                      | Database or a slow integration                             |
| Login failures                           | sudden spike from few IPs | Credential stuffing                                        |
| `FILE_ACCESS_DENIED` audit rows          | any cluster               | Somebody probing for other people's documents              |
| Bookings with `awaitingManualAssignment` | growing                   | Not enough providers in a zone — an ops problem, not a bug |
| Failed payment webhooks                  | any                       | Signature mismatch or a gateway change                     |
| Disk on the storage volume               | > 80%                     | Uploads will start failing                                 |

The last two rows matter as much as the first: this system is honest about
degradation, which means degradation shows up as data rather than as a crash.
Somebody has to be watching that data.

### Business metrics

The admin dashboard already computes bookings by day, completion and
cancellation rates, revenue and commission, average response time and provider
utilisation. Use it — it is the same numbers, without a second pipeline.

---

## 9. Rollback

**Application.** Deploy the previous image tag. The app is stateless; this takes
as long as a container start.

```bash
docker run -d --name isbfix --env-file .env.production -p 3000:3000 \
  islamabad-fix:<previous-tag>
```

**Database.** Prisma migrations are forward-only, and rolling one back is not
automatic. This is why the migration and the deploy are separate steps: if the
migration succeeded and the code is bad, roll back only the code — which works
precisely because schema changes are backwards-compatible across one release.

If a migration itself is the problem:

1. Stop the deploy. Do not run more migrations.
2. If it only added things (a column, a table, an index), the previous release
   ignores them. Roll back the code and fix forward.
3. If it destroyed something, restore from backup into a **new** database, point
   `DATABASE_URL` at it, and start the previous release. Do not attempt a
   partial restore over a live database.
4. Write the corrective migration and deploy it as a normal release.

**Decide who calls it.** Write the name down before you need it.

### A release checklist

- [ ] CI green on the branch (typecheck, lint, format, tests, build, audit)
- [ ] `npm run verify` green locally
- [ ] `npm run build` succeeds
- [ ] Migration reviewed by a second person, and backwards-compatible
- [ ] A fresh database backup exists and is less than an hour old
- [ ] Previous image tag noted for rollback
- [ ] `npm run acceptance -- <staging url>` green on staging
- [ ] Deploy: migrate → start → `npm run smoke -- <url>`
- [ ] Watch 5xx and `/api/health` for fifteen minutes

---

## 10. Hardening the deployment

Things the application cannot do for itself:

- **TLS everywhere.** The session cookies use the `__Host-` prefix in
  production, which browsers only accept over HTTPS. Plain HTTP will not just be
  insecure, it will be broken.
- **`sslmode=require`** on `DATABASE_URL`.
- **Do not expose PostgreSQL to the internet.** Private network or VPC only.
- **A separate database role for the application**, owning only its own schema.
  Migrations can run as a more privileged role from the release step.
- **Firewall everything except 80/443.**
- **Automatic security updates** on the host, and a rebuild schedule for the
  image so the base layer stays patched.
- **Off-site backups**, encrypted, with restores tested.

---

## 11. Turning on a second factor for staff

Two-factor is available to staff accounts and off until each person enrols. An
administrator enrols from **Platform settings → Aapke account ki hifazat**: the
page shows a setup key for an authenticator app, takes one code back to prove the
app works, and then hands over ten recovery codes, once.

Make it part of onboarding a new administrator rather than an afterthought — the
admin panel can approve providers, change the commission and issue refunds.

Two operational notes:

- **Recovery codes are shown once.** The server keeps only hashes, so there is no
  "show them again". If somebody loses both their phone and their codes, another
  administrator has to clear the row for their user in `TwoFactorSecret`.
- **Rotating `AUTH_SECRET` invalidates every enrolled secret** (§2). Everybody
  re-enrols; their recovery codes are what gets them in to do it.

---

## 12. Adding an integration later

Every integration is off until credentials exist, and turning one on is a
configuration change and a restart — no code change, no migration.

| Integration  | Set                                                                                                           | Effect                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| AI assistant | `AI_PROVIDER=anthropic\|openai`, `AI_API_KEY`, `AI_MODEL`                                                     | Intake stops saying "Rule-based" and starts saying "AI"                           |
| Maps         | `MAPS_PROVIDER`, `MAPS_API_KEY`, `NEXT_PUBLIC_MAPS_*`                                                         | Geocoding, map tiles and real distances; needs a rebuild for the public variables |
| Email        | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`                                                               | Notifications go out by email as well as in-app                                   |
| SMS          | `SMS_PROVIDER=twilio\|generic`, `SMS_API_KEY`, plus `SMS_ACCOUNT_SID` (Twilio) or `SMS_GATEWAY_URL`           | SMS channel                                                                       |
| Push         | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                                      | Browser notifications, with no account anywhere                                   |
| WhatsApp     | `WHATSAPP_*`                                                                                                  | Inbound booking by WhatsApp                                                       |
| Voice        | `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`                                                                         | Voice agent intake                                                                |
| Calling      | `CALLING_PROVIDER`, `CALLING_FROM_NUMBER`, provider credentials                                               | Masked calls between customer and technician                                      |
| Payments     | `PAYMENT_GATEWAY`, `PAYMENT_API_KEY`, `PAYMENT_CHECKOUT_URL`, `PAYMENT_MERCHANT_ID`, `PAYMENT_WEBHOOK_SECRET` | Online payment becomes selectable                                                 |
| S3 storage   | `STORAGE_DRIVER=s3`, `STORAGE_*`                                                                              | Uploads go to object storage                                                      |

**Push is the one to turn on first**, because it costs nothing and needs nobody:

```bash
npm run vapid:keys      # prints the pair; put it in the environment and restart
```

The keys are self-issued — browsers accept them because the server signs a JWT
with the private half, not because a provider granted them. Rotating the pair
invalidates every existing subscription, since each browser is bound to the key
it was given, so everyone has to re-enable notifications; plan it rather than
discover it.

**The online payment driver is a template.** It implements the signed
hosted-checkout redirect that JazzCash, Easypaisa and Safepay share, and it is
tested against a fake gateway — but the field names differ between real
gateways, and nobody has run it against a sandbox. Treat the first real
transaction as the integration test, and do it in sandbox mode.

Email and SMS are worth adding next for a reason beyond notifications: without
them, password reset and phone verification have no way to deliver anything, and
the UI says so plainly rather than pretending. Outside production the token is
handed back in the response so the flow is usable on a fresh checkout; in
production it never is.

After adding one, check `/api/health` and the admin integrations panel: both
report what is actually live, and neither will claim an integration works
because the variable is merely present.

**Webhook URLs** to register with the provider:

- `https://<host>/api/webhooks/payment`
- `https://<host>/api/webhooks/whatsapp`
- `https://<host>/api/webhooks/voice`

Each verifies an HMAC signature over the raw body in constant time and rejects
anything unsigned. Set the corresponding secret at the same time you register
the URL, or every delivery will be refused — which is the correct behaviour, but
confusing if you were not expecting it.
