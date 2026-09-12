# Architecture

How Islamabad Fix is put together, and why the decisions that constrain
everything else were made the way they were.

---

## 1. Shape of the system

One Next.js application, one PostgreSQL database, and a set of integration
adapters that each report whether they are configured.

```
                      ┌────────────────────────────────────────────┐
  Browser ───────────▶│  Next.js App Router                        │
  (customer,          │                                            │
   provider,          │  Server Components ── read models          │
   admin)             │  Route Handlers   ── /api/*  write path    │
                      │  Client Components ── forms, wizard        │
                      └──────────────┬─────────────────────────────┘
                                     │
                      ┌──────────────▼─────────────────────────────┐
                      │  Domain layer  (src/lib)                   │
                      │                                            │
                      │  bookings/   state machine, quotes,        │
                      │              cancellation, reviews         │
                      │  matching/   eligibility + scoring         │
                      │  providers/  onboarding, approval,         │
                      │              public projections            │
                      │  auth/       sessions, RBAC, rate limits   │
                      │  payments/   charge, settle, refund        │
                      │  settings/   typed, admin-editable config  │
                      │  ai/         intake, hazards, safety       │
                      └──────────────┬─────────────────────────────┘
                                     │ Prisma
                      ┌──────────────▼─────────────────────────────┐
                      │  PostgreSQL 16                             │
                      │  invariants as CHECK constraints and       │
                      │  partial unique indexes                    │
                      └────────────────────────────────────────────┘

  Adapters (each reports `configured`, each degrades honestly):
    storage → local disk | S3/MinIO
    ai      → Anthropic | OpenAI | rule-based classifier
    maps    → Google | Mapbox | zone centroids
    email / sms / whatsapp / voice / payments
```

Route handlers do request-shaped work only: authenticate, validate, call one
domain function, project a response. All business logic lives in `src/lib`, and
is therefore reachable from tests without an HTTP layer — which is why the test
suite exercises the real rules rather than mocks.

---

## 2. The decisions that constrain everything else

### Money is an integer number of paisa

There is no floating-point money anywhere. `1000` is Rs. 10.00.
`src/lib/money.ts` owns every conversion and format, and the commission split
rounds **down**, so a rounding remainder always stays with the provider rather
than being quietly taken by the platform.

### Commission is computed on the server, from a setting, and then frozen

The client never sends a total, a commission, or a rate — there are no such
fields on any request body. At the moment a booking completes,
`transitionBooking` reads `platform.commissionRateBp`, computes the split, and
writes `commissionRateBp`, `commissionPaisa` and `providerEarningsPaisa` onto
the booking. Changing the platform rate afterwards cannot reach back into work
that is already done.

### One write path for booking status

`src/lib/bookings/state-machine.ts` holds a transition table: for each status,
which statuses may follow and which actor may make the move. Nothing in the
codebase assigns `Booking.status` directly — everything goes through
`transitionBooking`, which:

1. takes a row lock (`SELECT … FOR UPDATE`),
2. asserts the transition against the table for that actor,
3. applies status-specific invariants (COMPLETED requires an agreed price),
4. writes the derived timestamps and money fields,
5. writes a `BookingStatusHistory` row,

all in one transaction. Notifications are emitted _after_ the commit, by the
caller, so a slow email provider can never roll back a status change.

The same table drives the UI: the action buttons a provider sees are
`availableTransitions(status, actor)`. An illegal transition is not merely
rejected — it is not rendered.

### Business rules are data, not literals

`src/lib/settings` is a typed registry: every tunable — commission rate, lead
times, cancellation window and fee, matching weights, guarantee days, emergency
fee ceiling, fan-out size — has a Zod schema, a default, a label and a help
string. The admin settings screen is generated from that registry. Values are
cached in-process for 15 seconds and the cache is dropped on write.

Islamabad's sectors are the same kind of data: `ServiceZone` rows with
centroids, editable in the admin panel. Nothing about G-10 or F-7 is compiled
into the matcher.

### Privacy is staged along the job

A provider who has merely been _offered_ a job sees the zone and nothing else —
no street address, no coordinates, no phone number. Those are released at the
moment the provider accepts, which is the moment they have committed to turning
up. `projectBooking` in `src/lib/bookings/queries.ts` is the single place that
decides this, and `tests/security.test.ts` holds it in place.

### Uploads are denied by default

The storage root is not web-served. Every private file is fetched through
`/api/files/[id]`, which calls `canReadFile` — a function whose default return
is `false` and whose every `true` is a justified relationship (uploader, booking
party, dispute party, staff). A denied read returns **404, not 403**: the
existence of somebody's CNIC scan is itself private. Denials are audit-logged.

---

## 3. Database schema

34 models. UUID primary keys, `deletedAt` soft deletion where history matters,
money as integer paisa, and every timestamp in UTC.

### Identity and access

| Model                                       | Purpose                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                                      | One row per person. Role, bcrypt hash, lockout counters. Case-insensitive unique email (`lower(email)` unique index).                                                         |
| `RefreshToken`                              | Opaque token stored as SHA-256, with `familyId` for rotation and reuse detection.                                                                                             |
| `CustomerProfile` / `ProviderProfile`       | Role-specific data. Providers carry status, rating aggregates, response statistics, service radius, capacity, and bank details as a hash + last 4 digits — never a full IBAN. |
| `ProviderVerification`                      | One row per check (`PHONE`, `EMAIL`, `IDENTITY_CNIC`, `PLATFORM_ONBOARDING`, `BANK_ACCOUNT`). A badge is shown only when its own row is `APPROVED`.                           |
| `ProviderAvailability` / `ProviderLocation` | Weekly working windows; last known GPS fix (staff-only).                                                                                                                      |

### Catalogue and coverage

| Model                         | Purpose                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `ServiceCategory` / `Service` | The catalogue. Price bands, inspection requirement, emergency flag, guarantee eligibility. |
| `ProviderService`             | Which provider offers which service, at what starting price.                               |
| `ServiceZone`                 | An area of the city, with a centroid used for distance when no GPS fix exists.             |
| `ServiceArea`                 | Which zones a provider covers.                                                             |
| `Address`                     | A customer's saved address. Partial unique index enforces one default per user.            |

### The job

| Model                        | Purpose                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Booking`                    | The centre of the system. Status, schedule, urgency, the frozen commission and guarantee fields, and the agreed and final totals.                                    |
| `BookingStatusHistory`       | Every transition: from, to, actor, reason, metadata. Written in the same transaction as the status change, so it cannot drift.                                       |
| `BookingOffer`               | A fan-out offer to one provider, with its matching score and expiry. Feeds the response-rate signal.                                                                 |
| `Quote` / `QuoteItem`        | Itemised quotes. `isAdditional` marks a charge raised after a price was agreed. A partial unique index allows at most one approved non-additional quote per booking. |
| `Payment`                    | Cash, bank transfer or gateway. Refunds tracked against the original. No card data is ever stored.                                                                   |
| `Payout` / `PayoutItem`      | Provider settlement batches.                                                                                                                                         |
| `Review`                     | One per booking, from the customer, after completion.                                                                                                                |
| `Dispute` / `GuaranteeClaim` | Escalations. Customer-opened, staff-resolved, audit-logged.                                                                                                          |

### Supporting

`Conversation` / `ConversationParticipant` / `Message` (threads for disputes and
support), `SupportTicket`, `Notification`, `UploadedFile`, `AuditLog`,
`PromoCode`, `Setting`, `RateLimitHit`.

### Invariants enforced by the database itself

Application checks can be bypassed by a script, a migration or a bug; these
cannot. From `prisma/migrations/*_constraints/migration.sql`:

- every money column is `>= 0`
- `commissionRateBp` between 0 and 10000
- `Review.rating` between 1 and 5
- availability windows: `startMinute < endMinute`, both within the day
- latitude/longitude within valid ranges
- a refund never exceeds the payment it refunds
- one default address per user (partial unique index)
- at most one approved initial quote per booking (partial unique index)
- case-insensitive unique email

---

## 4. Booking lifecycle

```
PENDING ──▶ PROVIDER_NOTIFIED ──▶ ACCEPTED ──▶ QUOTE_PENDING ──▶ QUOTE_APPROVED
   │              │                   │              │                  │
   │              └──▶ PENDING        │              └──▶ ACCEPTED      │
   │                  (re-fan-out)    │                  (rejected)     │
   │                                  ▼                                 ▼
   │                              SCHEDULED ◀───────────────────────────┘
   │                                  │
   │                        ON_THE_WAY │ ARRIVED
   │                                  ▼
   │                             IN_PROGRESS ──▶ COMPLETED ──▶ DISPUTED
   │                                  │                            │
   │                                  └──▶ QUOTE_PENDING           ├──▶ REFUNDED
   │                                       (extra charges)         └──▶ COMPLETED
   └──▶ CANCELLED
```

Two properties are worth stating explicitly:

**A quote interrupts the job wherever it is, and the decision puts it back.**
When a provider raises additional charges from `ARRIVED`, `IN_PROGRESS`,
`SCHEDULED` or `QUOTE_APPROVED`, the booking moves to `QUOTE_PENDING`. Whether
the customer approves or rejects, the job returns to the point it was
interrupted — read from `BookingStatusHistory`, not guessed. Declining an
optional upgrade does not un-schedule a visit or send a technician who is
already on site back to the beginning.

**Completion requires an agreed price and no pending charges.**
`completeBooking` refuses if `approvedTotalPaisa` is null, and refuses while any
quote is still `SUBMITTED`. That is what stops a bill growing after the fact.

---

## 5. Matching

Two stages, deliberately separated.

**Hard filters (SQL).** Non-negotiable eligibility, expressed as a query: the
provider must be `VERIFIED`, not soft-deleted, on an active account, offering
this service with the listing enabled, covering this zone, under their own job
ceiling, and — for an emergency — signed up for emergencies. Distance is a hard
filter _only when it is actually known_: an estimated distance never excludes
anybody, because a guess is not evidence.

**Soft scoring (in memory).** Every survivor is scored on seven signals, each
normalised to 0–1 before weighting, which is what makes the weights comparable:

| Signal          | Meaning                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `serviceMatch`  | Reaching this point means the service and area match.                                                                                 |
| `availability`  | Does the weekly schedule cover the requested slot (PKT)? Emergencies score 1.                                                         |
| `rating`        | Confidence ramps in over the first ten reviews; an unrated provider is credited the configured floor so they can win their first job. |
| `distance`      | Nearer is better; an unknown distance scores mid-range, not best.                                                                     |
| `responseRate`  | Share of offers answered. A provider who has never been offered a job scores neutrally rather than zero.                              |
| `completedJobs` | Log scale — 5 vs 50 matters more than 500 vs 545.                                                                                     |
| `workload`      | Lighter current load ranks higher, so work spreads across the network.                                                                |

Weights live in the `matching.weights` setting, so operations retunes ranking
from the admin panel without a deploy. Each candidate carries a per-signal
`breakdown`, which is what makes a ranking explainable rather than a black box.

---

## 6. Authentication and authorization

- **Passwords**: bcrypt, cost 12. Failed attempts counted; the account locks
  after `AUTH_MAX_FAILED_ATTEMPTS` for `AUTH_LOCKOUT_MINUTES`. A wrong password
  and an unknown email return the same error, so the endpoint is not a user
  directory.
- **Access token**: HS256 JWT, 15 minutes, `httpOnly` cookie. Carries only the
  subject; the role is read from the database on every request, so a role change
  or a disabled account takes effect immediately.
- **Refresh token**: 32 random bytes, stored as SHA-256, 30 days, rotated on
  every use. Each token belongs to a `familyId`; presenting a token that has
  already been rotated revokes the entire family, on the assumption it was
  stolen. Changing a password revokes every session.
- **Cookies**: `httpOnly`, `SameSite=Lax`, `Secure` and the `__Host-` prefix in
  production.
- **CSRF**: double-submit. A non-`httpOnly` token cookie is set at login and
  must be echoed in a header on every unsafe request, alongside an origin
  allow-list. Webhooks are exempt — they authenticate by HMAC signature instead.
- **RBAC**: an explicit permission table (`src/lib/auth/rbac.ts`). Roles do not
  imply each other by rank. `settings:write:financial` and `user:role:write` are
  `SUPER_ADMIN` only, so an ordinary administrator can run operations without
  being able to change what the platform earns or who is an administrator.
- **Rate limits**: a Postgres-backed sliding window, chosen over in-memory
  counters because the app is expected to run behind more than one instance.
  Applied to login (by IP _and_ by email), registration, refresh, password
  change, booking creation, uploads, AI intake, reviews, support tickets and
  inbound webhooks.

Role information from the client is never trusted anywhere.

---

## 7. Integrations

Every adapter implements the same contract: `isConfigured()`, plus its
operations. `src/lib/env.ts` exposes an `integrations` object that the UI and
`/api/health` read.

| Adapter                | Configured              | Not configured                                                                                                                     |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Storage                | S3/MinIO                | Local disk driver (fully working)                                                                                                  |
| AI                     | Anthropic or OpenAI     | Rule-based classifier; the UI says "Rule-based", never "AI"                                                                        |
| Maps                   | Google or Mapbox        | Zone centroids for distance; the map panel states plainly that tiles are unavailable and shows the same operational data as a list |
| Email / SMS / WhatsApp | Provider API            | Notification rows are still written and shown in-app                                                                               |
| Payments               | Gateway                 | Cash and bank transfer, which are the real methods in this market anyway                                                           |
| Voice                  | Vapi-compatible webhook | Endpoint returns a clear "not configured" state                                                                                    |

There is no code path anywhere that reports success for an operation that did
not happen.

---

## 8. AI intake and safety

Order of operations in `runIntake`, and the order is the point:

1. **Hazard detection runs first**, on the raw text (including recent history),
   independent of any model. A detected hazard forces `EMERGENCY` urgency and
   replaces the reply with safety guidance. No model output can override it.
2. **If an LLM is configured**, it produces the structured assessment. A slug it
   invents that is not in the live catalogue is dropped back to the rule-based
   guess. An unparseable response or a failed call falls back to the classifier
   and sets `degraded: true` — reported to the user, not hidden.
3. **The model's reply passes through an output filter** that replaces anything
   reading like a repair instruction with a referral. The filter is
   order-insensitive, because Roman Urdu is verb-final ("panel kholein") where
   English is verb-first ("open the panel") and customers mix both in one
   sentence.

Platform-authored safety guidance deliberately _does not_ pass through that
filter: it says things like "open the windows, do not touch a switch", which the
filter would otherwise replace with a generic referral — silently destroying the
most important message the product ever shows anybody.

Every conclusion carries `DIAGNOSIS_DISCLAIMER`. The assistant never claims a
definitive diagnosis and never gives instructions for electrical, gas,
refrigeration or structural work.

---

## 9. Frontend

- **Server Components by default.** Client components exist only where there is
  genuine interaction: the booking wizard, forms, the admin settings editor,
  toasts.
- **Design system in `src/components/ui`** — Button, Field, Badge, Card, Modal,
  Toast, EmptyState, Skeleton, and an `IntegrationNotConfigured` panel that is
  used wherever a feature depends on credentials that are absent.
- **Charts are hand-drawn SVG.** Three simple plots did not justify ~100KB of
  JavaScript on the connections this product targets. Chart colours come from a
  ramp validated for colour-vision deficiency (worst adjacent pair ΔE 10.0
  deutan / 13.2 tritan), kept separate from the reserved status colours, and
  identity is never carried by colour alone — there is always a legend, a
  directly labelled peak, and a table view of the same numbers.
- **Mobile first.** Most of this market is on a mid-range Android phone on
  mobile data; layouts are built at 360px and up, with a bottom navigation bar
  on small screens.
- **Roman Urdu throughout**, because that is what people in Islamabad actually
  read and type.

---

## 10. Testing

| Suite                              | What it covers                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `tests/money.test.ts`              | Paisa arithmetic, the commission split, rounding direction                       |
| `tests/state-machine.test.ts`      | The transition table, per actor                                                  |
| `tests/auth.test.ts`               | Registration, login, lockout, token rotation, family revocation, password change |
| `tests/booking-flow.test.ts`       | Creation, offers, acceptance, quotes, additional charges, cancellation, reviews  |
| `tests/provider-approval.test.ts`  | Onboarding, admin approval, badge honesty, suspension, public projection         |
| `tests/matching.test.ts`           | Hard filters, scoring, offers, response statistics                               |
| `tests/uploads.test.ts`            | MIME/extension/magic-byte validation, read authorization                         |
| `tests/disputes.test.ts`           | Disputes, refunds, guarantee eligibility and decisions                           |
| `tests/ai-safety.test.ts`          | Hazard detection, the output filter, the intake pipeline                         |
| `tests/security.test.ts`           | Booking visibility, server-side money, credentials, permissions, rate limits     |
| `tests/acceptance.test.ts`         | The full AC-repair scenario, seventeen steps, asserting database state at each   |
| `tests/ui/booking-wizard.test.tsx` | Intake honesty, confirm-step promises, quote rendering                           |

Server tests run against a real PostgreSQL database — the behaviour under test
lives partly in Postgres, so mocking it out would test nothing. The suite
refuses to run unless the database name contains `test`.

Two further checks run against a _deployed_ application rather than the code:

- `npm run smoke -- <url>` opens the real pages in Chromium, watches for CSP
  violations and page errors, and types into the booking wizard to confirm it
  answers.
- `npm run acceptance -- <url>` drives the whole AC-repair scenario over HTTP —
  registration, onboarding, admin approval, booking, quoting, the job, payment,
  review, guarantee claim — asserting the database row behind every response.

They exist because "the button is wired up" is exactly the claim that is
worthless when asserted in isolation.
