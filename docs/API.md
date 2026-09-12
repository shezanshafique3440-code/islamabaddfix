# API reference

Base URL: `${NEXT_PUBLIC_APP_URL}/api`

A machine-readable version of the customer- and provider-facing surface is in
[openapi.yaml](openapi.yaml).

---

## Conventions

### Response envelope

Every endpoint except `/api/files/[id]` (which returns bytes) and the webhooks
returns the same shape.

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { ... } }   // meta is optional

// failure
{ "success": false, "message": "Booking nahi mili.", "code": "NOT_FOUND",
  "fields": [{ "path": "scheduledFor", "message": "Required" }] }  // fields on validation errors
```

`message` is written for the end user, in Roman Urdu. `code` is stable and is
what clients should branch on.

Paginated collections put the page in `meta`:

```json
{ "success": true, "data": [ ... ],
  "meta": { "page": 1, "perPage": 20, "total": 87, "totalPages": 5 } }
```

### Authentication

Cookie-based. `POST /api/auth/login` sets three cookies:

| Cookie        | Flags                                                          | Life                          |
| ------------- | -------------------------------------------------------------- | ----------------------------- |
| access token  | `httpOnly`, `SameSite=Lax`, `Secure` + `__Host-` in production | 15 minutes                    |
| refresh token | same                                                           | 30 days, rotated on every use |
| CSRF token    | **not** `httpOnly` — the client must read it                   | session                       |

On `401 UNAUTHENTICATED`, call `POST /api/auth/refresh` once and retry. The
browser client in `src/lib/client/api.ts` does this automatically.

### CSRF

Every unsafe request (`POST`, `PATCH`, `PUT`, `DELETE`) must send the CSRF
cookie value in the `x-csrf-token` header, and its `Origin` must be the app's
own or on `CORS_ALLOWED_ORIGINS`. Webhook routes are exempt — they authenticate
by HMAC signature over the raw body instead.

### Rate limits

Exceeding a limit returns `429` with code `RATE_LIMITED` and a `Retry-After`
header.

| Endpoint                     | Limit                                  |
| ---------------------------- | -------------------------------------- |
| `POST /auth/login`           | 10 per 5 min, per IP **and** per email |
| `POST /auth/register`        | 5 per hour                             |
| `POST /auth/refresh`         | 60 per 5 min                           |
| `POST /auth/password`        | 5 per 15 min                           |
| `POST /bookings`             | 12 per hour                            |
| `POST /files`                | 40 per hour                            |
| `POST /ai/intake`            | 30 per hour                            |
| `POST /bookings/{id}/review` | 20 per hour                            |
| `POST /support/tickets`      | 10 per hour                            |
| webhooks                     | 300 per minute                         |

### Error codes

| Code                                           | HTTP      | Meaning                                                       |
| ---------------------------------------------- | --------- | ------------------------------------------------------------- |
| `UNAUTHENTICATED`                              | 401       | No valid session                                              |
| `INVALID_CREDENTIALS`                          | 401       | Wrong email or password (deliberately indistinguishable)      |
| `TOKEN_EXPIRED` / `TOKEN_REUSED`               | 401       | Refresh failed; reuse revokes the whole token family          |
| `ACCOUNT_LOCKED`                               | 423       | Too many failed logins                                        |
| `ACCOUNT_DISABLED`                             | 403       | Account deactivated                                           |
| `FORBIDDEN`                                    | 403       | Authenticated, not permitted                                  |
| `EMAIL_TAKEN` / `PHONE_TAKEN`                  | 409       | Already registered                                            |
| `VALIDATION_ERROR`                             | 422       | Body or query failed validation; see `fields`                 |
| `NOT_FOUND`                                    | 404       | Missing — or present but not yours                            |
| `CONFLICT`                                     | 409       | State conflict                                                |
| `RATE_LIMITED`                                 | 429       | Slow down                                                     |
| `PAYLOAD_TOO_LARGE`                            | 413       | File over the per-purpose ceiling                             |
| `UNSUPPORTED_MEDIA_TYPE`                       | 415       | Type not allowed, or content does not match the declared type |
| `INVALID_STATUS_TRANSITION`                    | 409       | Not legal for this actor from this status                     |
| `BOOKING_NOT_AVAILABLE`                        | 409       | Already taken or withdrawn                                    |
| `PROVIDER_NOT_VERIFIED`                        | 403       | Provider has not been approved                                |
| `PROVIDER_SUSPENDED`                           | 403       | Provider suspended                                            |
| `PROVIDER_AT_CAPACITY`                         | 409       | Provider at their own job ceiling                             |
| `NO_PROVIDERS_AVAILABLE`                       | 404       | Nothing matched; the booking waits for manual assignment      |
| `QUOTE_REQUIRED`                               | 409       | An approved price is needed first                             |
| `QUOTE_NOT_PENDING`                            | 409       | Quote already decided, expired, or charges still pending      |
| `REVIEW_ALREADY_EXISTS` / `REVIEW_NOT_ALLOWED` | 409 / 403 | One review per booking, customer only, after completion       |
| `PAYMENT_ALREADY_SETTLED`                      | 409       | Payment already recorded                                      |
| `GUARANTEE_NOT_ELIGIBLE` / `GUARANTEE_EXPIRED` | 409       | Not covered, or outside the frozen window                     |
| `DISPUTE_ALREADY_OPEN`                         | 409       | One open dispute per booking                                  |
| `CANCELLATION_NOT_ALLOWED`                     | 409       | Too late, or wrong status                                     |
| `PROMO_INVALID`                                | 422       | Promo code rejected                                           |
| `INTEGRATION_NOT_CONFIGURED`                   | 503       | Credentials absent — the honest state, not a failure          |
| `INTEGRATION_FAILED`                           | 502       | The provider was called and did not co-operate                |
| `INTERNAL_ERROR`                               | 500       | Unexpected; details stay server-side                          |

---

## Public

| Method | Path                | Notes                                                                                                                                                                                               |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`           | Status, database latency, and which integrations are live. No auth.                                                                                                                                 |
| `GET`  | `/catalogue`        | Active categories and services.                                                                                                                                                                     |
| `GET`  | `/catalogue/zones`  | Active service zones.                                                                                                                                                                               |
| `GET`  | `/providers`        | Public directory. `categorySlug`, `serviceSlug`, `zoneSlug`, `search`, `minRating`, `emergencyOnly`, `sort` (`rating`\|`jobs`\|`experience`\|`newest`), `page`, `perPage`. Verified providers only. |
| `GET`  | `/providers/{slug}` | Public profile. No phone number, address, bank detail or GPS position — ever.                                                                                                                       |
| `GET`  | `/search`           | Combined search across services, categories and providers.                                                                                                                                          |

---

## Authentication

| Method  | Path             | Notes                                                                                      |
| ------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `POST`  | `/auth/register` | `{ fullName, email, phone?, password, role?, acceptedTerms: true }`. Sets session cookies. |
| `POST`  | `/auth/login`    | `{ email, password }`. Sets session cookies.                                               |
| `POST`  | `/auth/refresh`  | Rotates the refresh token. Reuse of a rotated token revokes the family.                    |
| `POST`  | `/auth/logout`   | Revokes this session and clears cookies.                                                   |
| `GET`   | `/auth/me`       | Current user, role, and provider status if applicable.                                     |
| `PATCH` | `/auth/me`       | `{ fullName?, phone? }`.                                                                   |
| `POST`  | `/auth/password` | `{ currentPassword, newPassword }`. Revokes **every** session, including this one.         |

---

## Customer

### Addresses

| Method   | Path              | Notes                                                    |
| -------- | ----------------- | -------------------------------------------------------- |
| `GET`    | `/addresses`      | The caller's addresses.                                  |
| `POST`   | `/addresses`      | Create. Setting `isDefault` clears the previous default. |
| `PATCH`  | `/addresses/{id}` | Update. Ownership checked before anything is read.       |
| `DELETE` | `/addresses/{id}` | Soft delete. Refused while a live booking references it. |

### Bookings

| Method               | Path                       | Notes                                                                                    |
| -------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `GET`                | `/bookings`                | The caller's bookings. `status`, `page`, `perPage`.                                      |
| `POST`               | `/bookings`                | Create. See below.                                                                       |
| `GET`                | `/bookings/{id}`           | Detail, projected for the caller. A non-party gets `404`.                                |
| `POST`               | `/bookings/{id}/cancel`    | `{ reason }`. Fee applied per the cancellation window; never charged when staff cancel.  |
| `GET`/`POST`         | `/bookings/{id}/quotes`    | List quotes; `POST { quoteId, decision: "approve" \| "reject", reason? }` to decide one. |
| `GET`/`POST`/`PATCH` | `/bookings/{id}/payment`   | Read the payment; record or settle one.                                                  |
| `POST`/`PUT`/`PATCH` | `/bookings/{id}/review`    | One review per booking, after completion, customer only.                                 |
| `GET`/`POST`         | `/bookings/{id}/dispute`   | Read or open a dispute.                                                                  |
| `GET`/`POST`         | `/bookings/{id}/guarantee` | Read or submit a Fix Guarantee claim.                                                    |

`POST /bookings` body:

```jsonc
{
  "serviceId": "uuid",
  "addressId": "uuid", // must belong to the caller
  "problemDescription": "AC chal raha hai lekin thandi hawa nahi aa rahi",
  "providerId": "uuid | null", // null fans out to ranked providers
  "scheduledFor": "2026-10-01T12:00:00.000Z",
  "urgency": "NORMAL | URGENT | EMERGENCY",
  "isEmergency": false,
  "customerNotes": "string?",
  "fileIds": ["uuid"], // uploaded beforehand via POST /files
  "intakeSummary": {}, // optional, from the AI intake step
}
```

There is no price field, and there is no commission field. There is nowhere to
put one: the price comes from the technician's quote and the commission is
computed on the server.

The response `meta` carries `{ providersNotified, awaitingManualAssignment }`.
When nothing matched, the booking is created and held as `PENDING` with
`awaitingManualAssignment: true` — the customer is told honestly rather than
shown a fake confirmation.

### Other

| Method               | Path                    | Notes                                                                                                                          |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST`               | `/ai/intake`            | `{ message, history? }`. Returns the assessment plus `source` (`llm` \| `rules`), `degraded`, `safetyNotice` and `disclaimer`. |
| `POST`               | `/providers/match`      | Ranked providers for a service, zone and slot, each with a score `breakdown`.                                                  |
| `GET`                | `/notifications`        | The caller's notifications.                                                                                                    |
| `POST`               | `/notifications/read`   | `{ ids?: [] }` — omit to mark all read.                                                                                        |
| `GET`/`POST`         | `/support/tickets`      | List or open a ticket.                                                                                                         |
| `GET`/`POST`/`PATCH` | `/support/tickets/{id}` | Read, reply, close.                                                                                                            |

---

## Files

| Method | Path          | Notes                                                                                                                                |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/files`      | `multipart/form-data`: `file`, `purpose`, and the relevant id. Returns metadata; validates MIME type, extension **and** magic bytes. |
| `GET`  | `/files/{id}` | Returns bytes if the caller is allowed. Denied reads return `404`, not `403`, and are audit-logged.                                  |

Purposes and ceilings: `BOOKING_EVIDENCE` / `COMPLETION_PROOF` /
`DISPUTE_EVIDENCE` / `GUARANTEE_EVIDENCE` — images or short video, 40 MB;
`PROVIDER_PROFILE_PHOTO` / `CATEGORY_IMAGE` — images, 8 MB;
`PROVIDER_DOCUMENT` / `SUPPORT_ATTACHMENT` — PDF or image, 10 MB.

Visibility is decided by purpose, not by the caller: verification documents and
dispute evidence are always `PRIVATE`.

---

## Provider

All of these require a `PROVIDER` account.

| Method          | Path                         | Notes                                                                                                                                                                                                                              |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`/`PUT`     | `/provider/onboarding`       | Read or submit the profile. Idempotent; re-submitting replaces the service and area sets. Never changes verification status.                                                                                                       |
| `GET`/`PATCH`   | `/provider/settings`         | Availability, radius, capacity, emergency preferences, pricing.                                                                                                                                                                    |
| `GET`           | `/provider/jobs`             | Assigned jobs and open offers.                                                                                                                                                                                                     |
| `GET`           | `/provider/jobs/{id}`        | Detail. Address and customer phone are withheld until the job is accepted.                                                                                                                                                         |
| `POST`          | `/provider/jobs/{id}/status` | `{ action, reason?, notes?, scheduledFor? }` where `action` is `accept`, `decline`, `confirm_schedule`, `on_the_way`, `arrived`, `start`, `complete` or `resume`. Every one is validated against the state machine for this actor. |
| `GET`/`POST`    | `/provider/jobs/{id}/quote`  | Read quotes; `POST { items: [{ kind, label, quantity?, unitPriceRupees }], notes?, validUntil? }` to submit one. Providers type rupees; the route converts to paisa and the total is summed server-side. There is no total field.  |
| `POST`/`DELETE` | `/provider/location`         | Publish or clear the current GPS fix. Visible to staff only.                                                                                                                                                                       |
| `GET`           | `/provider/earnings`         | Completed jobs, gross, commission and net, plus payout history.                                                                                                                                                                    |
| `GET`           | `/provider/reviews`          | Reviews received.                                                                                                                                                                                                                  |

---

## Admin

All admin endpoints require a staff role and a specific permission;
`settings:write:financial` and `user:role:write` are `SUPER_ADMIN` only.

| Area                  | Endpoints                                                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview & analytics  | `GET /admin/overview`, `GET /admin/analytics`, `GET /admin/map`                                                                                                                                                                                                   |
| Bookings              | `GET /admin/bookings`                                                                                                                                                                                                                                             |
| Providers             | `GET /admin/providers`, `GET`/`POST /admin/providers/{id}` (approve, reject, suspend, reinstate), `POST /admin/providers/{id}/verification`                                                                                                                       |
| Users                 | `GET /admin/users`, `PATCH`/`POST /admin/users/{id}`                                                                                                                                                                                                              |
| Catalogue             | `GET`/`POST /admin/catalogue/categories`, `PATCH`/`DELETE /admin/catalogue/categories/{id}`, `POST /admin/catalogue/services`, `PATCH`/`DELETE /admin/catalogue/services/{id}`, `GET`/`POST /admin/catalogue/zones`, `PATCH`/`DELETE /admin/catalogue/zones/{id}` |
| Disputes & guarantees | `GET /admin/disputes`, `GET`/`POST /admin/disputes/{id}`, `GET /admin/guarantees`, `GET`/`POST /admin/guarantees/{id}`                                                                                                                                            |
| Payouts               | `GET`/`POST /admin/payouts`, `GET`/`POST /admin/payouts/{id}`                                                                                                                                                                                                     |
| Promotions            | `GET`/`POST /admin/promos`, `PATCH /admin/promos/{id}`                                                                                                                                                                                                            |
| Settings              | `GET`/`PATCH /admin/settings`                                                                                                                                                                                                                                     |
| Audit                 | `GET /admin/audit`                                                                                                                                                                                                                                                |

Catalogue and user deletions are soft; history stays readable.

---

## Webhooks

Inbound, unauthenticated by cookie, authenticated by HMAC signature over the raw
request body, compared in constant time. An unverified request gets `401` and is
logged. Each is idempotent by external reference.

| Method       | Path                 | Signature header                                               |
| ------------ | -------------------- | -------------------------------------------------------------- |
| `POST`       | `/webhooks/payment`  | Provider-specific; verified through the payment adapter        |
| `GET`/`POST` | `/webhooks/whatsapp` | `x-hub-signature-256` (`GET` is Meta's subscription handshake) |
| `POST`       | `/webhooks/voice`    | `x-vapi-signature`                                             |

A payment webhook can only move a payment forward. It cannot change an amount:
the amount was fixed when the payment was created from the booking's
server-side total.
