import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import type { DeliveryTarget, NotificationPayload } from '@/lib/notifications/types';

/**
 * The SMTP backend, tested against a real SMTP conversation.
 *
 * A minimal server speaks enough of RFC 5321 to accept a message — greeting,
 * EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA — and records what was said. That
 * proves the transport authenticates and delivers, rather than proving that a
 * mock was called.
 *
 * No TLS: STARTTLS is switched off for the test by pointing at a plain port and
 * letting nodemailer fall back, which is why `requireTLS` is asserted
 * separately in the options rather than exercised here.
 */

interface Session {
  commands: string[];
  authUser?: string;
  authPass?: string;
  from?: string;
  recipients: string[];
  data: string;
}

let server: Server;
let port = 0;
let sessions: Session[] = [];
/** Live sockets, so teardown does not wait on nodemailer's idle pool. */
const sockets = new Set<Socket>();
/** When set, the server rejects the recipient with this code. */
let rejectRecipient = false;

function handle(socket: Socket): void {
  const session: Session = { commands: [], recipients: [], data: '' };
  sessions.push(session);
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));

  let inData = false;
  let expecting: 'user' | 'pass' | null = null;
  let buffer = '';

  socket.write('220 test.local ESMTP ready\r\n');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');

    let index: number;
    while ((index = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          socket.write('250 2.0.0 Ok: queued as TESTID123\r\n');
        } else {
          // Undo dot-stuffing, the way a real receiver must.
          session.data += (line.startsWith('..') ? line.slice(1) : line) + '\n';
        }
        continue;
      }

      if (expecting === 'user') {
        session.authUser = Buffer.from(line, 'base64').toString('utf8');
        expecting = 'pass';
        socket.write('334 UGFzc3dvcmQ6\r\n');
        continue;
      }
      if (expecting === 'pass') {
        session.authPass = Buffer.from(line, 'base64').toString('utf8');
        expecting = null;
        socket.write('235 2.7.0 Authentication successful\r\n');
        continue;
      }

      session.commands.push(line);
      const command = line.split(' ')[0]!.toUpperCase();

      if (command === 'EHLO' || command === 'HELO') {
        socket.write('250-test.local\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
      } else if (command === 'AUTH') {
        const [, mechanism, inlineCredentials] = line.split(' ');
        if (mechanism?.toUpperCase() === 'PLAIN' && inlineCredentials) {
          // AUTH PLAIN carries "\0user\0pass" base64-encoded in one go.
          const [, user, pass] = Buffer.from(inlineCredentials, 'base64')
            .toString('utf8')
            .split('\0');
          session.authUser = user;
          session.authPass = pass;
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else {
          expecting = 'user';
          socket.write('334 VXNlcm5hbWU6\r\n');
        }
      } else if (command === 'MAIL') {
        session.from = line;
        socket.write('250 2.1.0 Ok\r\n');
      } else if (command === 'RCPT') {
        if (rejectRecipient) {
          socket.write('550 5.1.1 No such user here\r\n');
        } else {
          session.recipients.push(line);
          socket.write('250 2.1.5 Ok\r\n');
        }
      } else if (command === 'DATA') {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (command === 'QUIT') {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
      } else {
        socket.write('250 2.0.0 Ok\r\n');
      }
    }
  });

  socket.on('error', () => {
    /* A pooled connection closing mid-teardown is not a test failure. */
  });
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  port = address.port;
});

afterAll(async () => {
  // The transport keeps pooled connections open for reuse, and server.close()
  // waits for every one of them. Drop them rather than spend the socket
  // timeout on teardown.
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  sessions = [];
  rejectRecipient = false;
  vi.unstubAllEnvs();
  vi.resetModules();
});

const target: DeliveryTarget = {
  userId: 'u1',
  email: 'ayesha@example.pk',
  phone: null,
  fullName: 'Ayesha Khan',
};

const payload: NotificationPayload = {
  event: 'quote.received',
  userId: 'u1',
  title: 'Your quote is ready',
  body: 'Rs. 3,300 for the AC service.',
  href: '/account/bookings/abc',
};

async function loadDriver(url: string) {
  vi.stubEnv('EMAIL_PROVIDER', 'smtp');
  vi.stubEnv('SMTP_URL', url);
  vi.stubEnv('EMAIL_FROM', 'Islamabad Fix <no-reply@islamabadfix.pk>');
  const loaded = await import('@/lib/notifications/channels/email');
  return loaded.emailChannel;
}

describe('email over smtp', () => {
  it('reports unconfigured when SMTP_URL is absent', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'smtp');
    vi.stubEnv('SMTP_URL', '');
    const { emailChannel } = await import('@/lib/notifications/channels/email');

    const outcome = await emailChannel.send(target, payload);

    expect(outcome.status).toBe('SKIPPED_NOT_CONFIGURED');
    expect(sessions).toHaveLength(0);
  });

  it('authenticates and delivers a message the server accepts', async () => {
    const driver = await loadDriver(`smtp://isbfix:s3cr%40t@127.0.0.1:${port}?requireTLS=false`);

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('SENT');
    expect(sessions).toHaveLength(1);

    const session = sessions[0]!;
    expect(session.authUser).toBe('isbfix');
    // The password was percent-encoded in the URL; it must arrive decoded.
    expect(session.authPass).toBe('s3cr@t');
    expect(session.from).toContain('no-reply@islamabadfix.pk');
    expect(session.recipients[0]).toContain('ayesha@example.pk');
  });

  it('sends both a text and an HTML part, with the subject from the template', async () => {
    const driver = await loadDriver(`smtp://u:p@127.0.0.1:${port}?requireTLS=false`);

    await driver.send(target, payload);

    const { data } = sessions[0]!;
    expect(data).toMatch(/^Subject: .*quote/im);
    expect(data).toContain('multipart/alternative');
    expect(data).toContain('text/plain');
    expect(data).toContain('text/html');
  });

  it('reports a rejected recipient as a failure rather than a send', async () => {
    rejectRecipient = true;
    const driver = await loadDriver(`smtp://u:p@127.0.0.1:${port}?requireTLS=false`);

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('FAILED');
    expect(outcome.status === 'FAILED' && outcome.reason.length).toBeGreaterThan(0);
  });

  it('fails rather than hangs when nothing is listening', async () => {
    // Port 1 is reserved and nothing will answer on it.
    const driver = await loadDriver('smtp://u:p@127.0.0.1:1');

    const outcome = await driver.send(target, payload);

    expect(outcome.status).toBe('FAILED');
  }, 30_000);
});
