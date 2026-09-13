import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { DeliveryTarget, NotificationPayload } from '@/lib/notifications/types';

/**
 * The SMS drivers, tested against a fake gateway.
 *
 * `src/lib/env.ts` parses the environment once on import, so each case stubs
 * the variables and then re-imports the module graph. That is the only honest
 * way to exercise more than one provider in a single run.
 */

interface Received {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string | undefined>;
}

let server: Server;
let baseUrl = '';
let received: Received[] = [];
let status = 200;
let responseBody = 'OK id=42';

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        method: request.method ?? '',
        url: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
        headers: request.headers as Record<string, string | undefined>,
      });
      response.writeHead(status, { 'Content-Type': 'text/plain' }).end(responseBody);
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
  responseBody = 'OK id=42';
  vi.unstubAllEnvs();
  vi.resetModules();
});

const target: DeliveryTarget = {
  userId: 'user-1',
  email: 'a@b.pk',
  phone: '+923331234567',
  fullName: 'Ayesha',
};

const payload: NotificationPayload = {
  event: 'booking.created',
  userId: 'user-1',
  title: 'Technician on the way',
  body: 'Bilal will arrive in about 20 minutes.',
};

async function loadDriver() {
  const loaded = await import('@/lib/notifications/channels/sms');
  return loaded.smsChannel;
}

describe('sms', () => {
  it('reports unconfigured rather than pretending, when no provider is set', async () => {
    vi.stubEnv('SMS_PROVIDER', 'none');
    const driver = await loadDriver();

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('SKIPPED_NOT_CONFIGURED');
    expect(received).toHaveLength(0);
  });

  it('treats a generic gateway with a key but no URL as unconfigured', async () => {
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'secret');
    vi.stubEnv('SMS_GATEWAY_URL', '');
    const driver = await loadDriver();

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('SKIPPED_NOT_CONFIGURED');
    expect(received).toHaveLength(0);
  });

  it('fills the gateway URL template and reports the gateway reply', async () => {
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'k-123');
    vi.stubEnv('SMS_SENDER_ID', 'ISBFIX');
    vi.stubEnv('SMS_GATEWAY_URL', `${baseUrl}/send?key={key}&to={to}&from={from}&text={text}`);
    const driver = await loadDriver();

    const outcome = await driver.send(target, payload);

    expect(outcome).toEqual({ status: 'SENT', providerRef: 'OK id=42' });
    expect(received).toHaveLength(1);

    const url = new URL(received[0]!.url, baseUrl);
    expect(received[0]!.method).toBe('GET');
    expect(url.searchParams.get('key')).toBe('k-123');
    // The '+' has to survive as a plus, not decode into a space.
    expect(url.searchParams.get('to')).toBe('+923331234567');
    expect(url.searchParams.get('from')).toBe('ISBFIX');
    expect(url.searchParams.get('text')).toBe(
      'Technician on the way: Bilal will arrive in about 20 minutes.',
    );
  });

  it('posts a JSON body template with the values escaped for JSON', async () => {
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'k-123');
    vi.stubEnv('SMS_GATEWAY_URL', `${baseUrl}/json`);
    vi.stubEnv('SMS_GATEWAY_METHOD', 'POST');
    vi.stubEnv('SMS_GATEWAY_CONTENT_TYPE', 'application/json');
    vi.stubEnv('SMS_GATEWAY_BODY', '{"apikey":"{key}","msisdn":"{to}","message":"{text}"}');
    vi.stubEnv('SMS_GATEWAY_HEADERS', 'X-Account: isbfix | X-Trace: on');
    const driver = await loadDriver();

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('SENT');
    const request = received[0]!;
    expect(request.method).toBe('POST');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers['x-account']).toBe('isbfix');
    expect(request.headers['x-trace']).toBe('on');

    // It has to be valid JSON, not a string with a raw quote in it.
    const parsed = JSON.parse(request.body);
    expect(parsed).toEqual({
      apikey: 'k-123',
      msisdn: '+923331234567',
      message: 'Technician on the way: Bilal will arrive in about 20 minutes.',
    });
  });

  it('escapes a quote in the message rather than producing broken JSON', async () => {
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'k');
    vi.stubEnv('SMS_GATEWAY_URL', `${baseUrl}/json`);
    vi.stubEnv('SMS_GATEWAY_METHOD', 'POST');
    vi.stubEnv('SMS_GATEWAY_CONTENT_TYPE', 'application/json');
    vi.stubEnv('SMS_GATEWAY_BODY', '{"message":"{text}"}');
    const driver = await loadDriver();

    await driver.send(target, {
      ...payload,
      title: 'Quote',
      body: 'He said "it needs a new compressor" — 3,300',
    });

    const parsed = JSON.parse(received[0]!.body);
    expect(parsed.message).toBe('Quote: He said "it needs a new compressor" — 3,300');
  });

  it('reports a gateway error instead of claiming the message was sent', async () => {
    status = 402;
    responseBody = 'INSUFFICIENT_BALANCE';
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'k');
    vi.stubEnv('SMS_GATEWAY_URL', `${baseUrl}/send?key={key}&to={to}&text={text}`);
    const driver = await loadDriver();

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('FAILED');
    expect(outcome.status === 'FAILED' && outcome.reason).toContain('INSUFFICIENT_BALANCE');
  });

  it('fails cleanly when the recipient has no phone number', async () => {
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'k');
    vi.stubEnv('SMS_GATEWAY_URL', `${baseUrl}/send?to={to}`);
    const driver = await loadDriver();

    const outcome = await driver.send({ ...target, phone: null }, payload);

    expect(outcome.status).toBe('FAILED');
    expect(received).toHaveLength(0);
  });

  it('caps the body so one notification cannot become four billable parts', async () => {
    vi.stubEnv('SMS_PROVIDER', 'generic');
    vi.stubEnv('SMS_API_KEY', 'k');
    vi.stubEnv('SMS_GATEWAY_URL', `${baseUrl}/send?text={text}`);
    const driver = await loadDriver();

    await driver.send(target, { ...payload, body: 'x'.repeat(2000) });

    const text = new URL(received[0]!.url, baseUrl).searchParams.get('text')!;
    expect(text.length).toBe(300);
  });

  it('authenticates a Twilio send with the account SID and posts the form Twilio expects', async () => {
    responseBody = JSON.stringify({ sid: 'SM123', error_message: null });
    vi.stubEnv('SMS_PROVIDER', 'twilio');
    vi.stubEnv('SMS_API_KEY', 'auth-token');
    vi.stubEnv('SMS_ACCOUNT_SID', 'AC999');
    const driver = await loadDriver();

    // Point Twilio's host at the fake server for this one call.
    const realFetch = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      return realFetch(`${baseUrl}/twilio`, init);
    }) as typeof fetch;

    try {
      const outcome = await driver.send(target, payload);
      expect(outcome).toEqual({ status: 'SENT', providerRef: 'SM123' });
      expect(calls[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC999/Messages.json');

      const auth = (calls[0]!.init.headers as Record<string, string>)['Authorization']!;
      expect(Buffer.from(auth.replace('Basic ', ''), 'base64').toString()).toBe('AC999:auth-token');

      const form = new URLSearchParams(received[0]!.body);
      expect(form.get('To')).toBe('+923331234567');
      expect(form.get('Body')).toContain('Technician on the way');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('surfaces a Twilio error message rather than treating 200 as success', async () => {
    responseBody = JSON.stringify({ sid: 'SM1', error_message: 'Unreachable destination handset' });
    vi.stubEnv('SMS_PROVIDER', 'twilio');
    vi.stubEnv('SMS_API_KEY', 'auth-token');
    vi.stubEnv('SMS_ACCOUNT_SID', 'AC999');
    const driver = await loadDriver();

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) =>
      realFetch(`${baseUrl}/twilio`, init)) as typeof fetch;

    try {
      const outcome = await driver.send(target, payload);
      expect(outcome.status).toBe('FAILED');
      expect(outcome.status === 'FAILED' && outcome.reason).toContain('Unreachable destination');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
