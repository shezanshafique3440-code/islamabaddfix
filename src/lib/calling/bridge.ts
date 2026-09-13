import { SignJWT, importPKCS8 } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '../env';
import { AppError } from '../errors';

/**
 * Bridging two people through a platform number.
 *
 * The pattern is the same for both providers and is worth stating, because it
 * inverts what people expect: the platform rings *the caller first*, and only
 * once they answer does it dial the other party and join the two legs. Nobody
 * dials the platform number, so there is no inbound routing to get wrong and no
 * session table mapping numbers to bookings — and neither party's handset ever
 * receives the other's number, because both legs originate from ours.
 *
 * The cost of that is one thing the UI has to say plainly: your phone will
 * ring in a moment. A button labelled "Call" that instead causes an incoming
 * call is confusing unless it says so.
 */

export interface BridgeResult {
  /** The provider's identifier for the call, for support to trace later. */
  reference: string;
}

async function bridgeViaTwilio(callerNumber: string, counterpartNumber: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.CALLING_ACCOUNT_SID}/Calls.json`;

  // Both legs show the platform number, so neither party sees the other's.
  const twiml =
    `<Response><Dial callerId="${env.CALLING_FROM_NUMBER}">` +
    `<Number>${counterpartNumber}</Number></Dial></Response>`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${env.CALLING_ACCOUNT_SID}:${env.CALLING_API_KEY}`,
      ).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: callerNumber,
      From: env.CALLING_FROM_NUMBER!,
      Twiml: twiml,
    }),
  });

  const detail = await response.text();
  if (!response.ok) {
    throw new AppError(
      'INTEGRATION_FAILED',
      `The call could not be placed (Twilio ${response.status}).`,
      { context: { detail: detail.slice(0, 200) } },
    );
  }
  const json = JSON.parse(detail) as { sid?: string };
  return { reference: json.sid ?? 'twilio-call' };
}

/** Vonage authenticates the Voice API with a short-lived RS256 JWT. */
async function vonageToken(): Promise<string> {
  const key = await importPKCS8(env.CALLING_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'RS256');
  return new SignJWT({ application_id: env.CALLING_APPLICATION_ID, jti: randomUUID() })
    .setProtectedHeader({ typ: 'JWT', alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

async function bridgeViaVonage(callerNumber: string, counterpartNumber: string) {
  const response = await fetch('https://api.nexmo.com/v1/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await vonageToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ type: 'phone', number: callerNumber.replace('+', '') }],
      from: { type: 'phone', number: env.CALLING_FROM_NUMBER!.replace('+', '') },
      // Once the caller answers, connect them to the other party.
      ncco: [
        {
          action: 'connect',
          from: env.CALLING_FROM_NUMBER!.replace('+', ''),
          endpoint: [{ type: 'phone', number: counterpartNumber.replace('+', '') }],
        },
      ],
    }),
  });

  const detail = await response.text();
  if (!response.ok) {
    throw new AppError(
      'INTEGRATION_FAILED',
      `The call could not be placed (Vonage ${response.status}).`,
      { context: { detail: detail.slice(0, 200) } },
    );
  }
  const json = JSON.parse(detail) as { uuid?: string };
  return { reference: json.uuid ?? 'vonage-call' };
}

export async function placeBridgedCall(
  callerNumber: string,
  counterpartNumber: string,
): Promise<BridgeResult> {
  if (env.CALLING_PROVIDER === 'twilio') {
    return bridgeViaTwilio(callerNumber, counterpartNumber);
  }
  if (env.CALLING_PROVIDER === 'vonage') {
    return bridgeViaVonage(callerNumber, counterpartNumber);
  }
  throw new AppError('INTEGRATION_NOT_CONFIGURED', 'No calling provider is configured.');
}
