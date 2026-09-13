import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createECDH, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { db } from './helpers';
import { createUser } from './helpers';

/**
 * Web Push, tested against a fake push service.
 *
 * The server under test encrypts a payload and POSTs it to whatever endpoint
 * the subscription names — so the test stands up a real HTTP server, points a
 * subscription at it, and decrypts what arrives using an independent
 * implementation of the receiver half of RFC 8291.
 *
 * That is the only way to prove this works without a browser: if the bytes we
 * send can be decrypted with the browser's keys, a browser can read them too.
 */

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) =>
  hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
const info = (type: string) => Buffer.from(`Content-Encoding: ${type}\0`, 'utf8');

/** The browser's half: decrypt an aes128gcm push body. */
function decrypt(payload: Buffer, uaPrivate: Buffer, uaPublic: Buffer, authSecret: Buffer): string {
  const salt = payload.subarray(0, 16);
  const keyLength = payload.readUInt8(20);
  const asPublic = payload.subarray(21, 21 + keyLength);
  const body = payload.subarray(21 + keyLength);

  const ua = createECDH('prime256v1');
  ua.setPrivateKey(uaPrivate);
  const shared = ua.computeSecret(asPublic);

  const ikm = hkdf(
    authSecret,
    shared,
    Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]),
    32,
  );
  const key = hkdf(salt, ikm, info('aes128gcm'), 16);
  const nonce = hkdf(salt, ikm, info('nonce'), 12);

  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(body.subarray(body.length - 16));
  const plain = Buffer.concat([
    decipher.update(body.subarray(0, body.length - 16)),
    decipher.final(),
  ]);
  // Strip the 0x02 last-record delimiter.
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

/** A browser subscription, generated the way a real one would be. */
function makeSubscription(endpoint: string) {
  const ec = createECDH('prime256v1');
  ec.generateKeys();
  const auth = randomBytes(16);
  return {
    endpoint,
    privateKey: ec.getPrivateKey(),
    publicKey: ec.getPublicKey(),
    p256dh: ec.getPublicKey().toString('base64url'),
    auth: auth.toString('base64url'),
  };
}

interface Received {
  body: Buffer;
  headers: Record<string, string | undefined>;
}

let server: Server;
let baseUrl = '';
let received: Received[] = [];
/** Status the fake push service should answer with, per request path. */
let respondWith: Record<string, number> = {};

beforeAll(async () => {
  // The VAPID pair is set in tests/global-setup.ts: `src/lib/env.ts` parses the
  // environment once on import, so setting it here would be too late.
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        body: Buffer.concat(chunks),
        headers: request.headers as Record<string, string | undefined>,
      });
      response.writeHead(respondWith[request.url ?? ''] ?? 201).end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  respondWith = {};
});

describe('web push', () => {
  it('sends a payload the subscribing browser can decrypt', async () => {
    const { sendPushToUser } = await import('@/lib/notifications/push/send');
    const user = await createUser();
    const subscription = makeSubscription(`${baseUrl}/send/1`);

    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });

    const report = await sendPushToUser(user.id, {
      title: 'Quote ready',
      body: 'Rs. 3,300 for the AC service',
      href: '/account/bookings/abc',
    });

    expect(report).toMatchObject({ sent: 1, failed: 0, removed: 0, total: 1 });
    expect(received).toHaveLength(1);

    const plaintext = decrypt(
      received[0]!.body,
      subscription.privateKey,
      subscription.publicKey,
      Buffer.from(subscription.auth, 'base64url'),
    );
    expect(JSON.parse(plaintext)).toEqual({
      title: 'Quote ready',
      body: 'Rs. 3,300 for the AC service',
      href: '/account/bookings/abc',
    });
  });

  it('signs the request with a VAPID token bound to the endpoint origin', async () => {
    const { sendPushToUser } = await import('@/lib/notifications/push/send');
    const user = await createUser();
    const subscription = makeSubscription(`${baseUrl}/send/2`);
    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });

    await sendPushToUser(user.id, { title: 'Hello', body: 'There' });

    const headers = received[0]!.headers;
    expect(headers['content-encoding']).toBe('aes128gcm');
    expect(headers['authorization']).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);

    // The JWT's audience must be the push service's origin, not the full path.
    const jwt = headers['authorization']!.match(/t=([^,]+)/)![1]!;
    const claims = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8'));
    expect(claims.aud).toBe(baseUrl);
    expect(claims.sub).toBe('mailto:test@islamabadfix.pk');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('deletes a subscription the push service reports as gone', async () => {
    const { sendPushToUser } = await import('@/lib/notifications/push/send');
    const user = await createUser();
    const subscription = makeSubscription(`${baseUrl}/gone`);
    respondWith['/gone'] = 410;

    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });

    const report = await sendPushToUser(user.id, { title: 'Gone', body: 'Away' });

    expect(report).toMatchObject({ sent: 0, removed: 1 });
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
  });

  it('keeps a subscription through a transient failure, and counts it', async () => {
    const { sendPushToUser } = await import('@/lib/notifications/push/send');
    const user = await createUser();
    const subscription = makeSubscription(`${baseUrl}/flaky`);
    respondWith['/flaky'] = 503;

    const row = await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });

    const report = await sendPushToUser(user.id, { title: 'Flaky', body: 'Service' });

    expect(report).toMatchObject({ sent: 0, failed: 1, removed: 0 });
    const after = await db.pushSubscription.findUnique({ where: { id: row.id } });
    expect(after?.failureCount).toBe(1);
  });

  it('retires a subscription that has failed too many times in a row', async () => {
    const { sendPushToUser } = await import('@/lib/notifications/push/send');
    const user = await createUser();
    const subscription = makeSubscription(`${baseUrl}/dead`);
    respondWith['/dead'] = 500;

    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        // One short of the ceiling, so this send crosses it.
        failureCount: 7,
      },
    });

    const report = await sendPushToUser(user.id, { title: 'Dead', body: 'Endpoint' });

    expect(report.removed).toBe(1);
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
  });

  it('reports a user with no subscribed device without calling anything', async () => {
    const { pushChannel } = await import('@/lib/notifications/channels/push');
    const user = await createUser();

    const outcome = await pushChannel.send(
      { userId: user.id, email: user.email, phone: null, fullName: user.fullName },
      { event: 'booking.created', userId: user.id, title: 'Hi', body: 'There' },
    );

    expect(outcome.status).toBe('SKIPPED_NOT_CONFIGURED');
    expect(received).toHaveLength(0);
  });

  it('shortens a payload too long for one record rather than dropping it', async () => {
    const { sendPushToUser } = await import('@/lib/notifications/push/send');
    const user = await createUser();
    const subscription = makeSubscription(`${baseUrl}/long`);
    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    });

    const report = await sendPushToUser(user.id, {
      title: 'Long one',
      body: 'x'.repeat(8000),
    });

    expect(report.sent).toBe(1);
    const plaintext = decrypt(
      received[0]!.body,
      subscription.privateKey,
      subscription.publicKey,
      Buffer.from(subscription.auth, 'base64url'),
    );
    const message = JSON.parse(plaintext);
    expect(message.title).toBe('Long one');
    expect(message.body.endsWith('…')).toBe(true);
    expect(Buffer.byteLength(plaintext, 'utf8')).toBeLessThanOrEqual(4096 - 17);
  });
});
