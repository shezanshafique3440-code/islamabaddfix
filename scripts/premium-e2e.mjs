/**
 * The premium surfaces, driven over HTTP the way a browser does.
 *
 * The domain suites cover the arithmetic. This checks the wiring: routes,
 * cookies, CSRF, permissions — and above all that the honest states really do
 * reach the client instead of being swallowed by a route.
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.argv[2] ?? 'http://localhost:3111';
const db = new PrismaClient();
const stamp = Date.now().toString(36);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

function actor() {
  const jar = new Map();
  return {
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
        const i = pair.indexOf('=');
        const k = pair.slice(0, i);
        const v = pair.slice(i + 1);
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

await db.rateLimitHit.deleteMany({});
const customer = actor();
const admin = actor();

console.log('\n=== Memberships, repeat visits, tracking and calling, over HTTP ===\n');

// --- accounts --------------------------------------------------------------
let r = await customer.call('/api/auth/register', {
  method: 'POST',
  body: {
    fullName: 'Sana Malik',
    email: `sana.${stamp}@example.pk`,
    phone: `+92300${String(Date.now()).slice(-7)}`,
    password: 'M@likHouse2026!',
    role: 'CUSTOMER',
    acceptedTerms: true,
  },
});
check('customer registers', r.status < 300, `HTTP ${r.status}`);

const adminRow = await db.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
r = await admin.call('/api/auth/login', {
  method: 'POST',
  body: { email: adminRow.email, password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin123' },
});
check('admin signs in', r.status === 200, `HTTP ${r.status}`);

// --- memberships are off until somebody turns them on ----------------------
r = await customer.call('/api/memberships/plans');
check('plans endpoint is public', r.status === 200, `HTTP ${r.status}`);
check('   and reports memberships as switched off', r.json.meta?.enabled === false);
check('   with no plans on sale', (r.json.data ?? []).length === 0);

await admin.call('/api/admin/settings', {
  method: 'PATCH',
  body: { key: 'memberships.enabled', value: true },
});

r = await admin.call('/api/admin/membership-plans', {
  method: 'POST',
  body: {
    code: `care-${stamp}`,
    name: 'Care',
    description: 'Ten percent off every completed booking, plus a month of extra guarantee.',
    priceRupees: 6000,
    periodDays: 365,
    discountPercent: 10,
    guaranteeBonusDays: 30,
    priorityFanoutBonus: 2,
    emergencyFeeWaiverRupees: 500,
    isActive: true,
    sortOrder: 1,
  },
});
check('admin publishes a plan', r.status < 300, `HTTP ${r.status}`);
const planId = r.json.data?.id;

r = await admin.call('/api/admin/membership-plans', {
  method: 'POST',
  body: {
    code: `toomuch-${stamp}`,
    name: 'Too generous',
    description: 'Half off everything, forever and ever.',
    priceRupees: 1,
    periodDays: 365,
    discountPercent: 45,
    guaranteeBonusDays: 0,
    priorityFanoutBonus: 0,
    emergencyFeeWaiverRupees: 0,
    isActive: true,
    sortOrder: 9,
  },
});
check('a plan above the platform ceiling is refused', r.status === 422, `HTTP ${r.status}`);

// --- buying is an intent, not a charge -------------------------------------
r = await customer.call('/api/memberships', { method: 'POST', body: { planId, method: 'CASH' } });
check('customer buys a plan', r.status < 300, `HTTP ${r.status}`);
check(
  '   nothing is charged, and the API says so',
  r.json.meta?.awaitingPaymentConfirmation === true,
);
check('   it is PENDING_PAYMENT, not ACTIVE', r.json.data?.status === 'PENDING_PAYMENT');
const membershipId = r.json.data?.id;

r = await customer.call('/api/memberships');
check('   so no benefits apply yet', r.json.meta?.activeBenefits === null);

r = await customer.call(`/api/admin/memberships/${membershipId}/confirm`, {
  method: 'POST',
  body: {},
});
check('a customer cannot confirm their own payment', r.status === 403, `HTTP ${r.status}`);

r = await admin.call(`/api/admin/memberships/${membershipId}/confirm`, {
  method: 'POST',
  body: { externalRef: 'IBFT-TEST-0001' },
});
check('admin confirms the payment', r.status === 200, `HTTP ${r.status}`);
check('   the membership is now ACTIVE', r.json.data?.status === 'ACTIVE');

r = await customer.call('/api/memberships');
check('   and the benefits are live', r.json.meta?.activeBenefits?.discountBp === 1000);

// --- repeat visits ---------------------------------------------------------
const zone = await db.serviceZone.findFirstOrThrow({ where: { isActive: true } });
r = await customer.call('/api/addresses', {
  method: 'POST',
  body: {
    label: 'Office',
    zoneId: zone.id,
    addressLine: 'Plot 11, Blue Area',
    contactPhone: '+923001112233',
    isDefault: true,
  },
});
const addressId = r.json.data?.id;
const service = await db.service.findFirstOrThrow({ where: { isActive: true } });

r = await customer.call('/api/recurring', {
  method: 'POST',
  body: {
    serviceId: service.id,
    addressId,
    frequency: 'FORTNIGHTLY',
    intervalCount: 1,
    timeOfDayMinutes: 600,
    dayOfWeek: 2,
    problemDescription: 'Deep clean of the office — three rooms, a kitchen and two bathrooms.',
  },
});
check('customer sets up a repeat visit', r.status < 300, `HTTP ${r.status}`);
const scheduleId = r.json.data?.id;
check(
  '   and is told when the first booking appears',
  Boolean(r.json.meta?.firstBookingCreatedBefore),
);

r = await customer.call('/api/recurring');
check(
  '   it reads back in plain words',
  /Every two weeks on Tuesday at 10:00/.test(r.json.data?.[0]?.summary ?? ''),
  r.json.data?.[0]?.summary,
);

// --- the scheduled job refuses an unauthenticated caller -------------------
r = await customer.call('/api/cron/recurring', { method: 'POST' });
check(
  'the cron endpoint refuses a caller without the secret',
  r.status === 401 || r.status === 503,
  `HTTP ${r.status}`,
);

// --- tracking and calling on a real booking --------------------------------
r = await customer.call('/api/bookings', {
  method: 'POST',
  body: {
    serviceId: service.id,
    addressId,
    problemDescription: 'The office AC on the second floor stopped cooling this morning.',
    scheduledFor: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
  },
});
check('customer books a job', r.status < 300, `HTTP ${r.status}`);
const bookingId = r.json.data?.id;

r = await customer.call(`/api/bookings/${bookingId}/tracking`);
check(
  'tracking says there is nothing to track yet',
  r.json.data?.state === 'not_trackable',
  r.json.data?.state,
);
check(
  '   and explains itself in one sentence',
  /once the technician is on the way/i.test(r.json.data?.message ?? ''),
);

r = await customer.call(`/api/bookings/${bookingId}/call`, { method: 'POST' });
check('calling is refused before a technician accepts', r.status === 409, `HTTP ${r.status}`);

// A stranger may not watch somebody else's technician.
const stranger = actor();
await stranger.call('/api/auth/register', {
  method: 'POST',
  body: {
    fullName: 'Nobody Else',
    email: `nobody.${stamp}@example.pk`,
    phone: `+92301${String(Date.now()).slice(-7)}`,
    password: 'N0body!House2026',
    role: 'CUSTOMER',
    acceptedTerms: true,
  },
});
r = await stranger.call(`/api/bookings/${bookingId}/tracking`);
check('a stranger cannot track it', r.status === 404, `HTTP ${r.status}`);

// --- clean up the settings change so the deployment is left as found -------
await admin.call('/api/admin/settings', {
  method: 'PATCH',
  body: { key: 'memberships.enabled', value: false },
});
await db.recurringSchedule.deleteMany({ where: { id: scheduleId } });

await db.$disconnect();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
