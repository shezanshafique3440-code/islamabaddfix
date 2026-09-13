/**
 * Generate a VAPID keypair for Web Push.
 *
 * Push is the one integration this project can turn on without an account
 * anywhere: the keys below are self-issued, and the push services accept them
 * because the server signs a JWT with the private half.
 *
 * Run once per deployment. Rotating the pair invalidates every existing
 * subscription — browsers bind their subscription to the public key they were
 * given — so everyone has to re-enable notifications. Plan it rather than
 * discover it.
 *
 *   node scripts/generate-vapid.mjs
 */
import { createECDH } from 'node:crypto';

const ec = createECDH('prime256v1');
ec.generateKeys();

const publicKey = ec.getPublicKey().toString('base64url');
const privateKey = ec.getPrivateKey().toString('base64url');

console.log('\nAdd these to your environment:\n');
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
console.log('VAPID_SUBJECT="mailto:ops@your-domain.pk"');
console.log(
  '\nVAPID_PRIVATE_KEY is a secret — treat it like AUTH_SECRET.' +
    '\nThe public key is served to browsers at /api/push/key and is not secret.\n',
);
