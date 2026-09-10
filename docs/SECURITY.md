# Security

What this application defends against, where each defence lives, and — just as
importantly — what it does **not** claim to do.

---

## 1. What is worth protecting

| Asset | Why it matters here |
|---|---|
| Customer home addresses and phone numbers | People are letting a stranger into their house. A leak is a physical-safety problem, not a privacy inconvenience. |
| Provider identity documents | CNIC scans and bank details. Unrecoverable if leaked. |
| Booking and payment records | The financial history of the business. |
| The commission calculation | If a client could influence it, the platform's revenue would be advisory. |
| Session cookies | A stolen session is a stolen account. |
| The audit log | The record of who decided what. Useless if it can be edited. |

---

## 2. Authentication

**Passwords** are hashed with bcrypt at cost 12 and never logged, never
projected, and never returned by any endpoint. Failed attempts are counted per
account; after `AUTH_MAX_FAILED_ATTEMPTS` the account locks for
`AUTH_LOCKOUT_MINUTES`. A wrong password and an unknown email produce the same
response, so login cannot be used to enumerate accounts.

**Sessions** are two tokens with different jobs:

- A 15-minute HS256 JWT access token, carrying only the subject. The role is
  read from the database on every request, so a demotion or a disabled account
  takes effect on the next call rather than in fifteen minutes.
- A 30-day opaque refresh token — 32 random bytes, stored only as a SHA-256
  hash, rotated on every use. Each token belongs to a family; presenting one
  that has already been rotated revokes the whole family, on the assumption it
  was stolen. Changing a password revokes every session.

Both cookies are `httpOnly`, `SameSite=Lax`, and in production `Secure` with the
`__Host-` prefix — which browsers only honour over HTTPS, so plain HTTP is
broken rather than quietly insecure.

**CSRF** uses double-submit: a non-`httpOnly` token cookie must be echoed in the
`x-csrf-token` header on every unsafe request, alongside an origin allow-list.
Webhooks are exempt because they cannot carry a cookie; they authenticate by
HMAC signature instead.

---

## 3. Authorization

Three layers, and the last one is the one that counts.

1. **Page layouts** call `requirePageAuth` / `requirePageRole` in the server
   component, redirecting to `/login?next=…` or `/403`. These are server-side
   and real, but they guard *navigation* — the API is what actually holds data.
2. **Route handlers** call `requireAuth`, `requireProvider`, `requireRole` or
   `requirePermission`. Nothing reaches a domain function without passing one.
3. **Domain functions re-check ownership** against the database. `createBooking`
   looks up the address `where: { id, userId, deletedAt: null }`; `submitQuote`
   verifies the booking is assigned to this provider; `approveQuote` verifies
   the quote belongs to this customer's booking.

Role information from the client is never trusted anywhere. The JWT carries a
subject, not a role.

Permissions are an explicit table (`src/lib/auth/rbac.ts`), not a rank
comparison. `settings:write:financial` and `user:role:write` belong to
`SUPER_ADMIN` alone, so an administrator can run operations all day without
being able to change what the platform earns or who is an administrator.

---

## 4. Data exposure

**Booking visibility is staged along the job.** A provider who has been *offered*
a job sees the zone and nothing else — no street, no coordinates, no phone
number. Those are released the moment they accept, which is the moment they have
committed to turning up. One function decides this (`projectBooking`), and
`tests/security.test.ts` fails if it ever stops.

**Public provider profiles** carry rating, experience, completed jobs and
badges. They never carry a phone number, an address, bank details, a CNIC
reference or a GPS position — asserted directly in
`tests/provider-approval.test.ts`.

**Commission** is visible to staff only. A provider sees their own earnings; a
customer sees neither.

**Bank details** are stored as a SHA-256 hash plus the last four digits. The
full IBAN is never written to the database.

**Uploads are deny-by-default.** The storage root is not web-served; every
private file goes through `/api/files/[id]`, which calls `canReadFile` — a
function whose default is `false` and whose every `true` is a justified
relationship. A denied read returns **404, not 403**, because the existence of
somebody's identity document is itself private, and it is written to the audit
log: a cluster of denials is exactly what an operator wants to see.

---

## 5. Input handling

**Every request body and query string is parsed with Zod** before it reaches
anything. Unknown fields are dropped rather than passed through, which is why a
client cannot smuggle a `commissionPaisa` into a booking: there is no such field
in the schema, and there is no code that would read it.

**Uploads are validated three independent ways**, because any one alone is
bypassable: the declared MIME type must be on the allow-list for that purpose,
the file extension must match that type, and the leading bytes must match it
too. A shell script named `holiday.jpg` and declared as `image/jpeg` passes the
first two checks and fails the third.

**Uploaded files are served with** `X-Content-Type-Options: nosniff`,
`Content-Disposition: inline` with an encoded filename, and
`Content-Security-Policy: default-src 'none'; sandbox` — so even a crafted SVG
cannot execute in this origin.

**SQL injection** is not reachable: Prisma parameterises everything, and the few
raw queries in the analytics module are tagged templates with bound parameters.
There is no string-concatenated SQL in the codebase.

**XSS.** React escapes by default. The three places that use
`dangerouslySetInnerHTML` all render JSON-LD, and all go through `jsonLdScript`
in `src/lib/seo.ts`, which escapes `<`, `>`, `&` and the line separators. This
matters concretely: those documents contain provider-supplied business names,
and a provider named `</script><script>…` would otherwise own their own public
page. The escaping is asserted in `tests/security.test.ts`, including through a
real onboarding submission.

---

## 6. Rate limiting

A Postgres-backed sliding window, chosen over in-memory counters because the app
is expected to run behind more than one instance, where per-process counters are
close to useless. Login is limited by IP **and** by email address independently,
so an attacker cannot spread an attack on one account across many addresses.
Registration, refresh, password change, booking creation, uploads, AI intake,
reviews, support tickets and inbound webhooks are all limited.

---

## 7. Headers

Applied to every response by `next.config.ts`:

`Content-Security-Policy`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(self)`, and
`Strict-Transport-Security` with a two-year max-age.

The CSP is `default-src 'self'` with `object-src 'none'`,
`frame-ancestors 'none'` and `form-action 'self'`, so an injected off-origin
script, a plugin, a framing attack and a cross-origin form post are all refused.

**`script-src` allows `'unsafe-inline'`, and that is a real limitation.** Next's
hydration bootstrap is an inline script; the alternative is a per-request nonce
issued from middleware, which makes every page dynamic and costs the marketing
pages their static rendering. It is a deliberate trade-off, stated here rather
than papered over: CSP is a second line of defence in this application, not a
complete one, which is why the output escaping above has to be right on its own.
Nonce-based CSP is the documented next step.

---

## 8. Webhooks

Each inbound webhook verifies an HMAC signature over the **raw** request body —
read before any parsing, because the signature was computed over the bytes — and
compares it with `timingSafeEqual`. An unverified request gets `401` and is
logged. Each is idempotent by external reference.

A payment webhook can only move a payment forward. It cannot change an amount:
the amount was fixed when the payment was created from the booking's
server-side total.

---

## 9. Money

- Integer paisa everywhere. No floating-point money exists in the codebase.
- The commission rate comes from a platform setting, is applied server-side, and
  is written onto the booking at completion along with the resulting split. A
  later rate change cannot reach back into work already done.
- The split rounds **down**, so a rounding remainder stays with the provider.
- Quote totals are summed from line items on the server. There is no total field
  on any request.
- Additional charges require their own customer approval, and completion is
  refused while any quote is still awaiting a decision — that is what stops a
  bill growing after the fact.
- Database `CHECK` constraints enforce non-negative money, a commission rate
  within 0–10000 basis points, and a refund that never exceeds its payment.
  Application logic can be bypassed by a script or a bad migration; these cannot.

---

## 10. Destructive operations

- Deletions are soft where history matters (`deletedAt`), so a removed address
  or a retired service does not take a booking's history with it.
- `scripts/db-reset.ts` refuses to run when `NODE_ENV=production` and refuses
  any URL that looks like a hosted database unless given `--i-really-mean-it`.
- `scripts/purge-demo.ts` requires `--confirm` and only ever touches rows with
  `isDemo: true`.
- The test suite refuses to run against a database whose name does not contain
  `test`.

---

## 11. What is deliberately not claimed

Stating this precisely is itself a safety property.

- **"Platform verified" means an administrator reviewed that provider's
  onboarding submission.** It is not a government check, a licence, an insurance
  policy, a background check or a police clearance. Each badge is set only from
  its own completed verification, and the approval flow sets exactly one.
- **Islamabad Fix is a marketplace.** Technicians are independent providers, not
  employees. The legal copy says so and makes no claim about their licensing,
  certification or insurance.
- **The AI assistant is not a diagnosis**, and it is not a technician. It never
  gives instructions for electrical, gas, refrigeration or structural work. A
  detected hazard overrides everything the model produces and shows safety
  guidance — make yourself safe, call the emergency service — instead. When no
  model is configured, the UI says "Rule-based", never "AI".
- **The Fix Guarantee is not universal.** It applies per service, its window is
  frozen onto the booking at completion, and every claim is reviewed.
- **Payments are not held in escrow.** Cash is handed to the technician; the
  platform records that it happened.

---

## 12. Known limitations

Honest list, in rough order of how much they would matter:

1. **CSP allows inline scripts** (§7). Nonce-based CSP is the fix.
2. **No two-factor authentication.** Sessions rotate and lock out, but a stolen
   password is a stolen account until it is changed.
3. **No email or phone verification flow.** The `ProviderVerification` rows and
   the badge logic exist and are enforced; the send-a-code round trip needs an
   email or SMS provider, and is deliberately not faked in the meantime.
4. **Rate limiting is per-instance-shared but not distributed-lock-safe.** Two
   instances can each admit a request at the boundary of a window. It bounds
   abuse; it is not a precise quota.
5. **No automated dependency scanning in CI.** `npm audit` currently reports two
   advisories, both in development-only tooling (`@vitest/mocker`, and
   `deepmerge-ts` under the Prisma CLI). Neither ships in the production image.
6. **Audit log is append-only by convention, not by grant.** A database role
   with write access could edit it. Restricting that at the role level is a
   deployment task.
7. **No WAF or bot management.** Rate limits are the only volumetric defence.

---

## 13. Reporting a vulnerability

Email `security@islamabadfix.pk` with enough detail to reproduce. Please do not
open a public issue. We will acknowledge within two working days.
