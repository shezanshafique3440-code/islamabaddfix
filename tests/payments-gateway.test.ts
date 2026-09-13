import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import type { ChargeIntent } from '@/lib/payments/types';

/**
 * The hosted-checkout driver, against a fake gateway.
 *
 * What is proven here is the contract this codebase cares about: the request
 * carries the server-computed amount and a signature over it, the driver never
 * reports money as taken, and anything other than an https checkout URL is a
 * failure rather than a redirect to nowhere.
 *
 * What is NOT proven here is that the field names match any particular
 * gateway. That needs a sandbox account, and until someone runs one this driver
 * should be treated as a template.
 */

let server: Server;
let baseUrl = '';
let received: Array<{ body: string; headers: Record<string, string | undefined> }> = [];
let status = 200;
let responseBody = '';

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: request.headers as Record<string, string | undefined>,
      });
      response.writeHead(status, { 'Content-Type': 'application/json' }).end(responseBody);
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
  status = 200;
  responseBody = JSON.stringify({
    redirectUrl: 'https://pay.example.pk/session/abc',
    id: 'sess_abc',
  });
  vi.unstubAllEnvs();
  vi.resetModules();
});

const intent: ChargeIntent = {
  bookingId: 'b1',
  bookingReference: 'IFX-000123',
  amountPaisa: 330_000,
  currency: 'PKR',
  customer: { id: 'u1', email: 'ayesha@example.pk', fullName: 'Ayesha Khan', phone: '+92333' },
  description: 'AC service',
};

async function loadDriver(overrides: Record<string, string> = {}) {
  vi.stubEnv('PAYMENT_GATEWAY', 'generic');
  vi.stubEnv('PAYMENT_API_KEY', 'pk-key');
  vi.stubEnv('PAYMENT_MERCHANT_ID', 'M-42');
  vi.stubEnv('PAYMENT_CHECKOUT_URL', `${baseUrl}/checkout`);
  vi.stubEnv('PAYMENT_SIGNING_SECRET', 'salt');
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
  const loaded = await import('@/lib/payments/providers/gateway');
  return loaded.gatewayProvider;
}

describe('online payment gateway', () => {
  it('is not configured with a key but no checkout endpoint', async () => {
    const driver = await loadDriver({ PAYMENT_CHECKOUT_URL: '' });

    expect(driver.isConfigured()).toBe(false);
    const result = await driver.charge(intent);
    expect(result.kind).toBe('FAILED');
    expect(received).toHaveLength(0);
  });

  it('sends the amount in paisa, signed, and returns a redirect', async () => {
    const driver = await loadDriver();

    const result = await driver.charge(intent);

    expect(result).toEqual({
      kind: 'REDIRECT',
      redirectUrl: 'https://pay.example.pk/session/abc',
      externalRef: 'sess_abc',
    });

    const request = received[0]!;
    const payload = JSON.parse(request.body);
    expect(payload.amount).toBe(330_000);
    expect(payload.currency).toBe('PKR');
    expect(payload.merchantId).toBe('M-42');
    expect(payload.reference).toBe('IFX-000123');

    // The signature has to be over exactly the bytes that were sent.
    const expected = createHmac('sha256', 'salt').update(request.body).digest('hex');
    expect(request.headers['x-payment-signature']).toBe(expected);
    expect(request.headers['authorization']).toBe('Bearer pk-key');
  });

  it('never reports money as taken — a checkout is only ever a redirect', async () => {
    responseBody = JSON.stringify({ redirectUrl: 'https://pay.example.pk/s/1', status: 'paid' });
    const driver = await loadDriver();

    const result = await driver.charge(intent);

    // Even when the gateway claims "paid" in its checkout reply, only the
    // signed webhook may settle a payment.
    expect(result.kind).toBe('REDIRECT');
  });

  it('accepts the other names gateways give the checkout URL', async () => {
    responseBody = JSON.stringify({ paymentUrl: 'https://pay.example.pk/x', token: 'tok_9' });
    const driver = await loadDriver();

    const result = await driver.charge(intent);

    expect(result).toMatchObject({ kind: 'REDIRECT', externalRef: 'tok_9' });
  });

  it('refuses a checkout URL that is not https', async () => {
    responseBody = JSON.stringify({ redirectUrl: 'http://pay.example.pk/insecure' });
    const driver = await loadDriver();

    const result = await driver.charge(intent);

    expect(result.kind).toBe('FAILED');
  });

  it('reports a gateway rejection instead of a broken redirect', async () => {
    status = 422;
    responseBody = JSON.stringify({ error: 'merchant suspended' });
    const driver = await loadDriver();

    const result = await driver.charge(intent);

    expect(result.kind).toBe('FAILED');
    expect(result.kind === 'FAILED' && result.reason).toContain('merchant suspended');
  });

  it('falls back to the booking reference when the gateway returns no id', async () => {
    responseBody = JSON.stringify({ redirectUrl: 'https://pay.example.pk/y' });
    const driver = await loadDriver();

    const result = await driver.charge(intent);

    expect(result).toMatchObject({ kind: 'REDIRECT', externalRef: 'IFX-000123' });
  });

  it('verifies a webhook signature and rejects a forged one', async () => {
    const driver = await loadDriver({ PAYMENT_WEBHOOK_SECRET: 'hook-secret' });
    const body = JSON.stringify({ type: 'payment.succeeded', data: { externalRef: 'sess_abc' } });
    const good = createHmac('sha256', 'hook-secret').update(body).digest('hex');

    expect(driver.verifyWebhook!(body, new Headers({ 'x-payment-signature': good }))).toEqual({
      valid: true,
    });

    const forged = driver.verifyWebhook!(
      body,
      new Headers({ 'x-payment-signature': 'a'.repeat(64) }),
    );
    expect(forged.valid).toBe(false);

    // A changed amount invalidates the signature, which is the whole point.
    const tampered = JSON.stringify({
      type: 'payment.succeeded',
      data: { externalRef: 'sess_abc', amount: 1 },
    });
    expect(
      driver.verifyWebhook!(tampered, new Headers({ 'x-payment-signature': good })).valid,
    ).toBe(false);
  });

  it('rejects a webhook when no secret is set, rather than trusting it', async () => {
    const driver = await loadDriver({ PAYMENT_WEBHOOK_SECRET: '' });

    const result = driver.verifyWebhook!('{}', new Headers({ 'x-payment-signature': 'x' }));

    expect(result.valid).toBe(false);
  });
});
