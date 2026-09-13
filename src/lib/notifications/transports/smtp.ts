import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../env';

/**
 * SMTP transport.
 *
 * One connection pool for the process, created on first use. Building a
 * transport per message means a TCP and TLS handshake per message, which on a
 * server sending a burst of booking notifications is most of the time spent.
 *
 * `SMTP_URL` carries everything: `smtps://user:pass@host:465` for implicit TLS,
 * or `smtp://user:pass@host:587` which upgrades through STARTTLS. Credentials
 * live in the URL because that is how every platform's secret store expects to
 * hand them over.
 */

let transporter: Transporter | undefined;

/**
 * Turn `SMTP_URL` into transport options.
 *
 * Nodemailer accepts the URL directly, but only the object form takes the pool
 * and timeout settings — and a connection that hangs forever is worse than one
 * that fails.
 */
function optionsFromUrl(raw: string) {
  const url = new URL(raw);
  const implicitTls = url.protocol === 'smtps:';
  const flag = (name: string, fallback: boolean): boolean => {
    const value = url.searchParams.get(name);
    return value === null ? fallback : value !== 'false' && value !== '0';
  };

  return {
    host: url.hostname,
    // 465 is implicit TLS, 587 is STARTTLS. Both are conventional defaults.
    port: url.port ? Number(url.port) : implicitTls ? 465 : 587,
    secure: flag('secure', implicitTls),
    /*
     * On 587 the connection starts in the clear and upgrades, so by default we
     * refuse to continue if the server will not — sending credentials in
     * plaintext across the internet is not a thing to do quietly.
     *
     * `?requireTLS=false` exists for the one case where it is reasonable: a
     * relay on localhost, or a sidecar on a private network, where there is no
     * wire to tap. It has to be asked for explicitly.
     */
    requireTLS: flag('requireTLS', !implicitTls),
    // For a company relay with a self-signed certificate: `?rejectUnauthorized=false`.
    tls: { rejectUnauthorized: flag('rejectUnauthorized', true) },
    auth: url.username
      ? {
          user: decodeURIComponent(url.username),
          pass: decodeURIComponent(url.password),
        }
      : undefined,
    pool: true,
    maxConnections: 3,
    // A mail server that has not answered in ten seconds is not going to.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

function transport(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport(optionsFromUrl(env.SMTP_URL!));
  return transporter;
}

export interface SmtpMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Send one message. Returns the server's message id. */
export async function sendViaSmtp(message: SmtpMessage): Promise<string | undefined> {
  const info = await transport().sendMail({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  // A server can accept the envelope and still reject a recipient.
  if (info.rejected && info.rejected.length > 0) {
    throw new Error(`The mail server rejected ${info.rejected.join(', ')}`);
  }
  return info.messageId;
}

/**
 * Prove the credentials work, without sending anything.
 *
 * Used by the admin integration panel so "Configured" can mean the connection
 * was actually made, rather than that a variable is non-empty.
 */
export async function verifySmtp(): Promise<void> {
  await transport().verify();
}
