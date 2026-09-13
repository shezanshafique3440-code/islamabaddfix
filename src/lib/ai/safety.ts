/**
 * AI safety rails for the service assistant.
 *
 * The assistant is an intake clerk, not a technician. Two hard rules:
 *  1. It never gives repair instructions for anything that can electrocute,
 *     burn, asphyxiate or flood a home.
 *  2. It never states a diagnosis as fact from text or a photo. It describes
 *     likelihood and routes to an inspection.
 *
 * Hazard detection runs on every intake message regardless of whether an LLM is
 * configured, because the rule-based path must be just as safe.
 */

export const SYSTEM_PROMPT = `You are the intake assistant for Islamabad Fix, a home and business services marketplace in Islamabad, Pakistan.

Your ONLY job is to understand what service the customer needs and collect enough detail for a technician to arrive prepared.

You MUST:
- Reply in clear, plain English. Keep it warm and direct, the way a good technician talks.
- Identify the most likely service category from the customer's description.
- Ask at most two short clarifying questions at a time, and only questions that change which technician or part is needed.
- Ask for a photo or short video when it would genuinely help the technician (visible leak, error code on a display, burnt socket, model/rating plate).
- Assess urgency: NORMAL, URGENT, or EMERGENCY.
- Recommend a professional inspection whenever the cause cannot be established from a description.

You MUST NOT:
- State a definitive technical diagnosis. Say "this is often caused by" or "it could be", never "your compressor has failed".
- Give any repair, disassembly, wiring, gas, refrigerant, geyser or structural instruction. Not even a simple one.
- Tell the customer to open, dismantle, bypass or test any electrical or gas appliance.
- Quote a price. Prices come from the provider's quote, never from you.
- Claim any technician is licensed, insured, certified, government-verified or background-checked.
- Promise a completion time or a guarantee.

For a dangerous situation (gas smell, sparks, smoke, burning smell, exposed live wiring, major flooding, electric shock):
- Tell the customer to move away from the hazard and, ONLY IF it is safe and reachable, to switch off the main breaker or gas valve.
- Tell them to call emergency services if there is fire, gas leak or injury.
- Mark urgency EMERGENCY.
- Do not offer any other instruction.

Respond ONLY with a JSON object matching the provided schema. No prose outside the JSON.`;

export interface HazardAssessment {
  isHazard: boolean;
  kind?: 'gas' | 'electrical' | 'fire' | 'flood' | 'injury';
  /** Safety guidance shown prominently in the UI. */
  guidance?: string;
}

const HAZARD_PATTERNS: Array<{
  kind: NonNullable<HazardAssessment['kind']>;
  patterns: RegExp[];
  guidance: string;
}> = [
  {
    kind: 'gas',
    patterns: [
      /\bgas\s*(leak|leakage|smell|boo|bu)\b/i,
      /gas ki (bu|boo|smell)/i,
      /\bcylinder\s*leak/i,
      /smell(ing)? (of )?gas/i,
    ],
    guidance:
      'A gas leak is dangerous. Open the windows now, do not touch any switch or lighter, and if it is safe and reachable, turn the gas valve off. Get everyone outside and call emergency services. A technician will come to inspect it — do not attempt any repair yourself.',
  },
  {
    kind: 'fire',
    patterns: [
      /\b(spark|sparks|sparking|chingari)\b/i,
      /\b(smoke|smoking|dhuan|dhuaan)\b/i,
      /burn(ing|t)?\s*(smell|bu|boo)/i,
      /jalne ki (bu|boo|smell)/i,
      /\baag\b/i,
      /\bfire\b/i,
    ],
    guidance:
      'Sparking, smoke or a burning smell is dangerous. If it is safe to do so, switch off the main breaker and stop using that appliance. If there is fire, call Rescue 1122 immediately. Do not attempt any repair yourself — do not open the wiring or the appliance.',
  },
  {
    kind: 'electrical',
    patterns: [
      /\b(shock|karant|current)\s*(lag|lagta|laga|mar)/i,
      /electric shock/i,
      /\b(live|khula|nanga)\s*wire/i,
      /exposed wir(e|ing)/i,
      /wire jal (gaya|gai)/i,
    ],
    guidance:
      'This is an electrical hazard. Do not touch that part, and if it is safe to do so, switch off the main breaker. If it is anywhere near water, do not touch it at all. If anyone has had a shock, get medical help immediately. Have it inspected by a qualified electrician only.',
  },
  {
    kind: 'flood',
    patterns: [
      /\b(flood|flooding|flooded)\b/i,
      /paani bhar (gaya|gai|raha)/i,
      /\bburst\s*(pipe|line)/i,
      /pipe (phat|phat gaya|burst)/i,
      /major leak(age)?/i,
    ],
    guidance:
      'This is serious water damage. If you can, close the main water valve and safely cut the power to that area — never touch a switch while standing on a wet floor. Move anything valuable out of the way. We are finding you an emergency plumber.',
  },
  {
    kind: 'injury',
    patterns: [/\b(injur|zakhm|zakhmi|bleeding|khoon)\b/i, /koi zakhmi/i],
    guidance:
      'If anyone is hurt, get medical help first — call Rescue 1122. We will arrange a technician after that.',
  },
];

export function assessHazard(text: string): HazardAssessment {
  for (const entry of HAZARD_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return { isHazard: true, kind: entry.kind, guidance: entry.guidance };
    }
  }
  return { isHazard: false };
}

/**
 * Last-line filter over assistant output. Even a well-prompted model can drift
 * into giving instructions, so anything that reads like a repair directive is
 * replaced with a referral rather than shown to the customer.
 */
/**
 * Match two groups in either order, within one sentence.
 *
 * Word order cannot be assumed here. Roman Urdu is verb-final ("panel
 * kholein") where English is verb-first ("open the panel"), and customers mix
 * both in a single message — a pattern written in one order catches only half
 * of what it is meant to catch. Staying inside a sentence (no `.` `!` `?`
 * between the two halves) keeps it from joining an instruction in one sentence
 * to an unrelated noun in the next.
 */
function eitherOrder(first: string, second: string): RegExp {
  const within = '[^.!?\\n]*';
  return new RegExp(
    `\\b(?:${first})\\b${within}\\b(?:${second})\\b|\\b(?:${second})\\b${within}\\b(?:${first})\\b`,
    'i',
  );
}

const OPEN_UP = 'khol|kholein|kholo|kholna|kholni|open up|dismantle|disassemble';
const APPLIANCE = 'panel|unit|appliance|geyser|AC|board|socket|switch|meter|cover';
const REFRIGERANT = 'gas|refrigerant|freon|r22|r410|r-?32';
const FILL = 'bhar|bharein|bharna|dalein|dal dein|refill|top up|recharge';
const WIRE = 'wire|wiring|tar|taar';
const JOIN = 'jorein|jor dein|jorna|connect|splice|cut|katein|kaatein';
const SELF = 'khud|self|yourself';
const REPAIR = 'repair|fix|theek|thik|marammat|replace|badal|badlein|tabdeel';

const UNSAFE_OUTPUT_PATTERNS = [
  eitherOrder(OPEN_UP, APPLIANCE),
  eitherOrder(REFRIGERANT, FILL),
  eitherOrder(WIRE, JOIN),
  eitherOrder(SELF, REPAIR),
  /\bbypass\b/i,
  /\b(capacitor|compressor|thermostat)\b[^.!?\n]*\b(khud|yourself)\b/i,
];

const SAFE_REPLACEMENT =
  'Doing this yourself can be dangerous. It is better to have a verified technician inspect it — we will show you who is available nearby.';

export function sanitizeAssistantMessage(message: string): {
  message: string;
  wasFiltered: boolean;
} {
  if (UNSAFE_OUTPUT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message: SAFE_REPLACEMENT, wasFiltered: true };
  }
  return { message, wasFiltered: false };
}

/** Wording the UI must attach to every assistant conclusion. */
export const DIAGNOSIS_DISCLAIMER =
  'This is a first guess, not a final diagnosis. The technician will inspect it and tell you the real cause.';
