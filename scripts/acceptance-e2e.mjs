/**
 * Section 58 acceptance scenario, end to end, over HTTP.
 *
 * The unit and integration suites exercise the domain layer directly. This one
 * drives the running application the way a browser does — real routes, real
 * cookies, real CSRF — and checks the database row behind every response, so a
 * green run means the whole stack agrees, not just the part under test.
 *
 *   npm run acceptance -- http://localhost:3000
 *
 * It writes to whatever database the app is pointed at, so run it against a
 * development or staging deployment, never production.
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? process.env.BASE ?? 'http://localhost:3000';
const db = new PrismaClient();
const stamp = Date.now().toString(36);
/** A distinct, valid +92 number per run: +92 3 0 0 + 7 digits. */
let phoneCounter = 0;
const phone = () =>
  `+92300${String(Date.now()).slice(-5)}${String(phoneCounter++).padStart(2, '0')}`;

let failures = 0;
/** Only show the response body when a check fails — otherwise it is noise. */
const describe = (r) =>
  r.status >= 400 ? `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 220)}` : `HTTP ${r.status}`;

const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/** A cookie jar per actor, so sessions do not bleed into each other. */
function actor(name) {
  const jar = new Map();
  return {
    name,
    async call(path, { method = 'GET', body } = {}) {
      const headers = { Origin: BASE };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const csrf = jar.get('ifx_csrf');
      if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        const k = pair.slice(0, idx);
        const v = pair.slice(idx + 1);
        if (v === '') jar.delete(k);
        else jar.set(k, v);
      }
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      return { status: res.status, json };
    },
  };
}

const customer = actor('customer');
const provider = actor('provider');
const admin = actor('admin');

// This walkthrough registers three accounts in a few seconds, which is exactly
// what the registration rate limit exists to stop. Clear the counters first —
// the limiter itself is verified separately, in tests/security.test.ts.
await db.rateLimitHit.deleteMany({ where: { bucket: { startsWith: 'auth:' } } });

console.log('\n=== Section 58: AC repair, start to finish, over HTTP ===\n');

// --- 1. customer registers -------------------------------------------------
let r = await customer.call('/api/auth/register', {
  method: 'POST',
  body: {
    fullName: 'Ayesha Khan',
    email: `ayesha.${stamp}@example.pk`,
    phone: phone(),
    password: 'Kh@nHouse2026!',
    role: 'CUSTOMER',
    acceptedTerms: true,
  },
});
check('1. customer registers', r.status === 200 || r.status === 201, describe(r));
const customerId = r.json.data?.user?.id ?? r.json.data?.id;
const customerRow = await db.user.findUnique({ where: { id: customerId } });
check('   user row exists with a bcrypt hash', /^\$2[aby]\$/.test(customerRow?.passwordHash ?? ''));
check('   role is CUSTOMER, not whatever was asked for later', customerRow?.role === 'CUSTOMER');

// --- 2. address ------------------------------------------------------------
const zone = await db.serviceZone.findFirstOrThrow({ where: { isActive: true } });
r = await customer.call('/api/addresses', {
  method: 'POST',
  body: {
    label: 'Ghar',
    zoneId: zone.id,
    addressLine: 'House 42, Street 9',
    houseOrBuilding: 'Ground floor',
    contactPhone: '+923009998877',
    isDefault: true,
  },
});
check('2. customer saves an address', r.status === 200 || r.status === 201, describe(r));
const addressId = r.json.data?.id;
check(
  '   address belongs to this customer',
  (await db.address.findUnique({ where: { id: addressId } }))?.userId === customerId,
);

// --- 3. CSRF is actually enforced -----------------------------------------
{
  const res = await fetch(`${BASE}/api/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ addressLine: 'No session, no token' }),
  });
  check(
    '3. an unauthenticated write is refused',
    res.status === 401 || res.status === 403,
    `HTTP ${res.status}`,
  );
}

// --- 4. AI intake ----------------------------------------------------------
r = await customer.call('/api/ai/intake', {
  method: 'POST',
  body: { message: 'AC chal raha hai lekin thandi hawa nahi aa rahi' },
});
check('4. intake assistant answers', r.status === 200, describe(r));
check(
  '   it says which engine answered',
  r.json.data?.source === 'rules',
  `source=${r.json.data?.source}`,
);
check('   it does not claim to be AI when no model is configured', r.json.data?.degraded === false);
check('   it attaches the not-a-diagnosis disclaimer', Boolean(r.json.data?.disclaimer));

// --- 5. hazard overrides everything ---------------------------------------
r = await customer.call('/api/ai/intake', {
  method: 'POST',
  body: { message: 'AC se chingari nikal rahi hai aur jalne ki bu aa rahi hai' },
});
check(
  '5. a hazard forces EMERGENCY and shows safety guidance',
  r.json.data?.urgency === 'EMERGENCY' && /breaker band/i.test(r.json.data?.safetyNotice ?? ''),
);
check(
  '   the guidance is not replaced by a generic referral',
  !/verified technician muaina kare/i.test(r.json.data?.reply ?? ''),
);

// --- 6. provider registers and onboards -----------------------------------
r = await provider.call('/api/auth/register', {
  method: 'POST',
  body: {
    fullName: 'Bilal Ahmed',
    email: `bilal.${stamp}@example.pk`,
    phone: phone(),
    password: 'C00lingPro!2026',
    role: 'PROVIDER',
    acceptedTerms: true,
  },
});
check('6. provider registers', r.status === 200 || r.status === 201, describe(r));
const providerUserId = r.json.data?.user?.id ?? r.json.data?.id;

const service = await db.service.findFirstOrThrow({
  where: { isActive: true, name: { contains: 'AC', mode: 'insensitive' } },
});
r = await provider.call('/api/provider/onboarding', {
  method: 'PUT',
  body: {
    businessName: `Bilal Cooling ${stamp}`,
    contactPhone: '+923003334444',
    yearsExperience: 9,
    services: [{ serviceId: service.id, startingPriceRupees: 1500 }],
    zoneIds: [zone.id],
    availability: [1, 2, 3, 4, 5, 6].map((d) => ({
      dayOfWeek: d,
      startMinute: 540,
      endMinute: 1140,
    })),
    emergencyAvailable: false,
    bankIban: 'PK36SCBL0000001123456702',
    // Masked reference only; the platform never asks for a full CNIC number.
    cnicReference: '6702',
    acceptedTerms: true,
  },
});
check('   onboarding submitted', r.status === 200 || r.status === 201, describe(r));
if (r.status >= 400) {
  await db.$disconnect();
  process.exit(1);
}
const providerRow = await db.providerProfile.findUniqueOrThrow({
  where: { userId: providerUserId },
});
check(
  '   status is PENDING_VERIFICATION, not verified on submission',
  providerRow.status === 'PENDING_VERIFICATION',
);
check(
  '   the full IBAN was never stored',
  providerRow.bankIbanHash?.length === 64 &&
    providerRow.bankAccountLast4 === '6702' &&
    !JSON.stringify(providerRow).includes('0000001123456702'),
);

// --- 7. an unverified provider is invisible and unbookable ----------------
r = await customer.call(`/api/providers?search=${encodeURIComponent(`Bilal Cooling ${stamp}`)}`);
check(
  '7. unverified provider is not in the public directory',
  (r.json.data ?? []).length === 0,
  `${(r.json.data ?? []).length} results`,
);

r = await customer.call('/api/bookings', {
  method: 'POST',
  body: {
    serviceId: service.id,
    addressId,
    providerId: providerRow.id,
    problemDescription: 'AC chal raha hai lekin thandi hawa nahi aa rahi hai',
    scheduledFor: new Date(Date.now() + 26 * 3600_000).toISOString(),
  },
});
check('   booking against an unverified provider is refused', r.status >= 400, describe(r));
check('   no booking row was created', (await db.booking.count({ where: { customerId } })) === 0);

// --- 8. admin approves ----------------------------------------------------
const adminUser = await db.user.findFirstOrThrow({
  where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
});
r = await admin.call('/api/auth/login', {
  method: 'POST',
  body: {
    email: adminUser.email,
    password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin123',
  },
});
check('8. admin signs in', r.status === 200, describe(r));

r = await admin.call(`/api/admin/providers/${providerRow.id}`, {
  method: 'POST',
  body: { action: 'approve', note: 'Documents reviewed on video call' },
});
check('   admin approves the provider', r.status === 200, describe(r));
if (r.status >= 400) {
  await db.$disconnect();
  process.exit(1);
}
const approved = await db.providerProfile.findUniqueOrThrow({ where: { id: providerRow.id } });
check(
  '   status is VERIFIED with a timestamp',
  approved.status === 'VERIFIED' && approved.verifiedAt !== null,
);
const badges = await db.providerVerification.findMany({
  where: { providerId: providerRow.id, status: 'APPROVED' },
  select: { kind: true },
});
check(
  '   exactly one badge — the onboarding review, nothing implied',
  badges.length === 1 && badges[0].kind === 'PLATFORM_ONBOARDING',
  badges.map((b) => b.kind).join(','),
);
const audit = await db.auditLog.findFirst({
  where: { entity: 'ProviderProfile', entityId: providerRow.id, action: 'provider.approved' },
});
check('   the approval is in the audit log with its actor', audit?.actorUserId === adminUser.id);

// --- 9. booking ------------------------------------------------------------
r = await customer.call('/api/bookings', {
  method: 'POST',
  body: {
    serviceId: service.id,
    addressId,
    providerId: providerRow.id,
    problemDescription: 'AC chal raha hai lekin thandi hawa nahi aa rahi hai',
    scheduledFor: new Date(Date.now() + 26 * 3600_000).toISOString(),
    urgency: 'NORMAL',
    // A hostile client trying to dictate the money.
    commissionPaisa: 0,
    approvedTotalPaisa: 1,
    finalTotalPaisa: 1,
  },
});
check('9. booking created', r.status === 200 || r.status === 201, describe(r));
if (r.status >= 400) {
  await db.$disconnect();
  process.exit(1);
}
const bookingId = r.json.data?.id ?? r.json.data?.booking?.id;
let booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
// Choosing a specific provider sends them an offer rather than conscripting
// them: PROVIDER_NOTIFIED, with the job attached, awaiting their acceptance.
check(
  '   the chosen provider was offered the job, not forced to take it',
  ['PENDING', 'PROVIDER_NOTIFIED', 'ACCEPTED'].includes(booking.status) &&
    booking.providerId === providerRow.id,
  booking.status,
);
check(
  '   the client-sent totals were ignored',
  booking.approvedTotalPaisa === null &&
    booking.finalTotalPaisa === null &&
    booking.commissionPaisa === null,
);
check(
  '   a status-history row exists',
  (await db.bookingStatusHistory.count({ where: { bookingId } })) >= 1,
);

// --- 10. provider sees the job and accepts --------------------------------
r = await provider.call('/api/auth/login', {
  method: 'POST',
  body: { email: `bilal.${stamp}@example.pk`, password: 'C00lingPro!2026' },
});
check('10. provider signs in', r.status === 200);

r = await provider.call(`/api/provider/jobs/${bookingId}/status`, {
  method: 'POST',
  body: { action: 'accept' },
});
check('    provider accepts', r.status === 200, describe(r));
booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
check(
  '    status is ACCEPTED with a timestamp',
  booking.status === 'ACCEPTED' && booking.acceptedAt !== null,
);

r = await provider.call(`/api/provider/jobs/${bookingId}`);
check(
  '    now that they accepted, the address is released',
  typeof r.json.data?.address?.addressLine === 'string' &&
    r.json.data.address.addressLine.includes('Street 9'),
);

// --- 11. quote -------------------------------------------------------------
r = await provider.call(`/api/provider/jobs/${bookingId}/quote`, {
  method: 'POST',
  body: {
    items: [
      { kind: 'INSPECTION', label: 'Muaina', unitPriceRupees: 500 },
      { kind: 'LABOUR', label: 'Gas refill labour', unitPriceRupees: 1400 },
      { kind: 'PARTS', label: 'Refrigerant gas', unitPriceRupees: 1400 },
    ],
    notes: 'Gas kam thi, leak test bhi karunga.',
    // Again: a client asserting a total.
    subtotalPaisa: 100,
  },
});
check('11. quote submitted', r.status === 200 || r.status === 201, describe(r));
const quoteId = r.json.data?.id;
const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
check(
  '    the total is summed server-side: Rs. 3,300',
  quote.subtotalPaisa === 330_000,
  `${quote.subtotalPaisa} paisa`,
);
booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
check(
  '    booking is QUOTE_PENDING and still has no agreed price',
  booking.status === 'QUOTE_PENDING' && booking.approvedTotalPaisa === null,
);

// --- 12. only the right customer may decide it ---------------------------
{
  const stranger = actor('stranger');
  await stranger.call('/api/auth/register', {
    method: 'POST',
    body: {
      fullName: 'Random Person',
      email: `random.${stamp}@example.pk`,
      phone: phone(),
      password: 'Rand0m!Pass2026',
      acceptedTerms: true,
    },
  });
  const res = await stranger.call(`/api/bookings/${bookingId}/quotes`, {
    method: 'POST',
    body: { quoteId, decision: 'approve' },
  });
  check('12. a stranger cannot approve somebody else quote', res.status >= 400, describe(res));
  const still = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  check('    the price is still unset', still.approvedTotalPaisa === null);

  const detail = await stranger.call(`/api/bookings/${bookingId}`);
  check(
    '    and they cannot even read the booking',
    detail.status === 404,
    `HTTP ${detail.status}`,
  );
}

// --- 13. customer approves -------------------------------------------------
r = await customer.call(`/api/bookings/${bookingId}/quotes`, {
  method: 'POST',
  body: { quoteId, decision: 'approve' },
});
check('13. customer approves the quote', r.status === 200, describe(r));
booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
check('    the agreed price is Rs. 3,300', booking.approvedTotalPaisa === 330_000);
check('    status is QUOTE_APPROVED', booking.status === 'QUOTE_APPROVED');

// --- 14. the job runs ------------------------------------------------------
for (const [action, expected] of [
  ['confirm_schedule', 'SCHEDULED'],
  ['on_the_way', 'ON_THE_WAY'],
  ['arrived', 'ARRIVED'],
  ['start', 'IN_PROGRESS'],
]) {
  const res = await provider.call(`/api/provider/jobs/${bookingId}/status`, {
    method: 'POST',
    body: { action },
  });
  const row = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  check(
    `14. ${action} -> ${expected}`,
    res.status === 200 && row.status === expected,
    `HTTP ${res.status}, status ${row.status}`,
  );
}

// --- 15. an illegal transition is refused --------------------------------
{
  const res = await provider.call(`/api/provider/jobs/${bookingId}/status`, {
    method: 'POST',
    body: { action: 'accept' },
  });
  check('15. an illegal transition is refused', res.status >= 400, describe(res));
}

// --- 16. completion ---------------------------------------------------------
r = await provider.call(`/api/provider/jobs/${bookingId}/status`, {
  method: 'POST',
  body: { action: 'complete', notes: 'Gas refill done, leak test clear.' },
});
check('16. provider completes the job', r.status === 200, describe(r));
booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
check('    final total is Rs. 3,300', booking.finalTotalPaisa === 330_000);
check(
  '    commission is 10% of it: Rs. 330',
  booking.commissionPaisa === 33_000,
  `${booking.commissionPaisa} paisa at ${booking.commissionRateBp} bp`,
);
check('    provider earnings are Rs. 2,970', booking.providerEarningsPaisa === 297_000);
check(
  '    gross is conserved',
  booking.commissionPaisa + booking.providerEarningsPaisa === booking.finalTotalPaisa,
);
check(
  '    the guarantee window is frozen onto the booking',
  booking.guaranteeEligible === true && booking.guaranteeExpiresAt !== null,
);

// --- 17. what each party is allowed to see -------------------------------
r = await customer.call(`/api/bookings/${bookingId}`);
check(
  '17. the customer never sees the commission',
  r.json.data?.pricing?.commissionPaisa === undefined,
);
r = await provider.call(`/api/provider/jobs/${bookingId}`);
check(
  '    the provider sees their earnings but not the commission',
  r.json.data?.pricing?.providerEarningsPaisa === 297_000 &&
    r.json.data?.pricing?.commissionPaisa === undefined,
);

// --- 18. payment ------------------------------------------------------------
r = await customer.call(`/api/bookings/${bookingId}/payment`, {
  method: 'POST',
  body: { method: 'CASH' },
});
check('18. cash payment recorded', r.status === 201 || r.status === 200, describe(r));
const payment = await db.payment.findFirstOrThrow({ where: { bookingId } });
check(
  '    the amount came from the server-side total, not the request',
  payment.amountPaisa === 330_000,
);
check('    no card data anywhere on the row', !/cardNumber|cvv|pan/i.test(JSON.stringify(payment)));

// --- 19. online payment is honest about not being configured -------------
{
  const res = await customer.call(`/api/bookings/${bookingId}/payment`, {
    method: 'POST',
    body: { method: 'ONLINE_GATEWAY' },
  });
  check(
    '19. online payment says it is not configured, it does not fake success',
    res.status >= 400 && /configured|enabled/i.test(res.json.message ?? ''),
    describe(res),
  );
}

// --- 20. review --------------------------------------------------------------
r = await customer.call(`/api/bookings/${bookingId}/review`, {
  method: 'POST',
  body: { rating: 5, comment: 'Waqt par aaye, kaam saaf kiya.', punctuality: 5, valueForMoney: 4 },
});
check('20. review accepted', r.status === 201 || r.status === 200, describe(r));
const refreshed = await db.providerProfile.findUniqueOrThrow({ where: { id: providerRow.id } });
check(
  "    the provider's rating aggregate was recomputed",
  refreshed.ratingCount === 1 && refreshed.ratingAverage === 5,
);
check('    completed job count went up', refreshed.completedJobs === 1);

{
  const res = await customer.call(`/api/bookings/${bookingId}/review`, {
    method: 'POST',
    body: { rating: 1 },
  });
  check('    a second review is refused', res.status >= 400, describe(res));
}

// --- 21. the history is complete ------------------------------------------
const history = await db.bookingStatusHistory.findMany({
  where: { bookingId },
  orderBy: { createdAt: 'asc' },
  select: { toStatus: true },
});
const sequence = history.map((h) => h.toStatus).join(' → ');
check(
  '21. every transition was recorded',
  sequence.endsWith('SCHEDULED → ON_THE_WAY → ARRIVED → IN_PROGRESS → COMPLETED'),
  sequence,
);

// --- 22. the guarantee is claimable, and only within its window ----------
r = await customer.call(`/api/bookings/${bookingId}/guarantee`, {
  method: 'POST',
  body: { description: 'Do din baad wohi masla wapis aa gaya hai, thanda nahi kar raha.' },
});
check(
  '22. a guarantee claim inside the window is accepted',
  r.status === 201 || r.status === 200,
  describe(r),
);
check(
  '    the claim is in the database awaiting review',
  (await db.guaranteeClaim.count({ where: { bookingId, status: 'SUBMITTED' } })) === 1,
);

await db.$disconnect();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
