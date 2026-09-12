import type { IntakeContext, IntakeResult } from './types';
import { assessHazard } from './safety';

/**
 * Rule-based intake classifier.
 *
 * This is the honest fallback when no LLM is configured — and the safety net
 * when a configured LLM fails. It is a keyword scorer over Roman Urdu and
 * English service vocabulary, not a language model, and the UI says so.
 *
 * Keywords are matched against the live catalogue, so a category added in the
 * admin panel is matchable by its own name without a code change; the table
 * below only adds the colloquial vocabulary a name alone would miss.
 */

interface Rule {
  categorySlug: string;
  serviceSlug?: string;
  /** Each term contributes its weight when found. */
  terms: Array<{ pattern: RegExp; weight: number }>;
}

const t = (pattern: RegExp, weight = 1) => ({ pattern, weight });

const RULES: Rule[] = [
  {
    categorySlug: 'ac-cooling',
    terms: [
      t(/\bac\b/i, 3),
      t(/air\s*condition(er|ing)?/i, 3),
      t(/\bsplit\s*unit\b/i, 2),
      t(/\bthand[ia]\b/i, 1),
      t(/cooling/i, 2),
      t(/\bcompressor\b/i, 2),
      t(/\bgas\s*(refill|charge|low)\b/i, 2),
      t(/\boutdoor\s*unit\b/i, 2),
      t(/\bindoor\s*unit\b/i, 2),
    ],
  },
  {
    categorySlug: 'ac-cooling',
    serviceSlug: 'ac-repair',
    terms: [
      t(/thandi hawa nahi/i, 4),
      t(/cooling (nahi|nai|kam)/i, 4),
      t(/\bac\b.*(kharab|kaam nahi|chal nahi|band)/i, 3),
      t(/\bac\b.*(awaz|noise|shor)/i, 2),
      t(/\bac\b.*(paani|leak|tapak)/i, 2),
    ],
  },
  {
    categorySlug: 'ac-cooling',
    serviceSlug: 'ac-service',
    terms: [t(/\bac\b.*(service|safai|clean)/i, 4), t(/ac servicing/i, 4)],
  },
  {
    categorySlug: 'ac-cooling',
    serviceSlug: 'ac-installation',
    terms: [t(/\bac\b.*(install|lagwa|lagana|fit)/i, 4), t(/naya ac/i, 3)],
  },
  {
    categorySlug: 'ac-cooling',
    serviceSlug: 'ac-gas-refill',
    terms: [t(/\bgas\b.*(bhar|refill|dal|charge)/i, 4), t(/gas khatam/i, 3)],
  },
  {
    categorySlug: 'electrical',
    terms: [
      t(/\bbijli\b/i, 3),
      t(/electric(al|ian)?/i, 3),
      t(/\bwiring\b/i, 3),
      t(/\bswitch\b/i, 2),
      t(/\bsocket\b/i, 2),
      t(/\bfan\b/i, 2),
      t(/\bpankha\b/i, 3),
      t(/\bbreaker\b/i, 2),
      t(/\bups\b/i, 3),
      t(/\bgenerator\b/i, 3),
      t(/\blight\b/i, 2),
      t(/\bbulb\b/i, 2),
      t(/\bmeter\b/i, 2),
      t(/short circuit/i, 3),
      t(/\bcurrent\b/i, 2),
    ],
  },
  {
    categorySlug: 'electrical',
    serviceSlug: 'fan-repair',
    terms: [t(/(pankha|fan).*(kharab|chal nahi|awaz|slow|band)/i, 4)],
  },
  {
    categorySlug: 'electrical',
    serviceSlug: 'switch-socket-repair',
    terms: [t(/(switch|socket|board).*(kharab|jal|kaam nahi|loose)/i, 4)],
  },
  {
    categorySlug: 'plumbing',
    terms: [
      t(/\bplumb(er|ing)\b/i, 4),
      t(/\bleak(age)?\b/i, 3),
      t(/\btapak\b/i, 3),
      t(/\bpipe\b/i, 3),
      t(/\bnal\b/i, 3),
      t(/\btap\b/i, 2),
      t(/\bfaucet\b/i, 2),
      t(/\bdrain\b/i, 3),
      t(/\bchoke\b/i, 3),
      t(/\bband\s*ho\s*gaya\b.*\b(nali|drain|pipe)\b/i, 3),
      t(/\bcommode\b/i, 3),
      t(/\bflush\b/i, 2),
      t(/\bbasin\b/i, 2),
      t(/water tank/i, 3),
      t(/\bmotor\b.*\bpaani\b/i, 2),
      t(/\bsewerage\b/i, 3),
      t(/\bnali\b/i, 3),
    ],
  },
  {
    categorySlug: 'plumbing',
    serviceSlug: 'pipe-leakage',
    terms: [t(/(pipe|line).*(leak|tapak|phat)/i, 4), t(/leakage/i, 2)],
  },
  {
    categorySlug: 'plumbing',
    serviceSlug: 'drain-blockage',
    terms: [t(/(drain|nali|sewerage).*(band|choke|block|jam)/i, 4), t(/blockage/i, 3)],
  },
  {
    categorySlug: 'cleaning',
    terms: [
      t(/\bclean(ing|er)?\b/i, 3),
      t(/\bsafai\b/i, 4),
      t(/\bdeep clean/i, 3),
      t(/\bsofa\b/i, 2),
      t(/\bcarpet\b/i, 2),
      t(/\bqaleen\b/i, 3),
      t(/\bdusting\b/i, 2),
      t(/ghar ki safai/i, 4),
      t(/office (clean|safai)/i, 3),
    ],
  },
  {
    categorySlug: 'carpenter',
    terms: [
      t(/\bcarpent(er|ry)\b/i, 4),
      t(/\btarkhan\b/i, 4),
      t(/\bdarwaza\b/i, 3),
      t(/\bdoor\b/i, 2),
      t(/\bfurniture\b/i, 3),
      t(/\bcabinet\b/i, 3),
      t(/\balmari\b/i, 3),
      t(/\bshelf\b|\bshelves\b/i, 2),
      t(/\bkursi\b/i, 2),
      t(/\bmez\b/i, 2),
      t(/\block\b.*\bdoor\b/i, 2),
      t(/\bhinge\b|\bkabza\b/i, 2),
    ],
  },
  {
    categorySlug: 'painting',
    terms: [
      t(/\bpaint(ing|er)?\b/i, 4),
      t(/\brang\b/i, 2),
      t(/\bwhitewash\b/i, 3),
      t(/\bputty\b/i, 2),
      t(/\bdeewar\b/i, 2),
      t(/\bwall\b.*(crack|damage|repair)/i, 3),
      t(/\bemulsion\b/i, 2),
    ],
  },
  {
    categorySlug: 'appliances',
    terms: [
      t(/\bfridge\b/i, 4),
      t(/\brefrigerator\b/i, 4),
      t(/washing machine/i, 4),
      t(/\bmicrowave\b/i, 4),
      t(/\boven\b/i, 3),
      t(/\bgeyser\b/i, 4),
      t(/water heater/i, 3),
      t(/\bdishwasher\b/i, 3),
      t(/\bappliance\b/i, 3),
      t(/\bdryer\b/i, 3),
    ],
  },
  {
    categorySlug: 'appliances',
    serviceSlug: 'refrigerator',
    terms: [t(/(fridge|refrigerator).*(kharab|cooling|thand|band|kaam nahi)/i, 4)],
  },
  {
    categorySlug: 'appliances',
    serviceSlug: 'geyser',
    terms: [t(/geyser.*(kharab|garam nahi|leak|band|kaam nahi)/i, 4)],
  },
  {
    categorySlug: 'security',
    terms: [
      t(/\bcctv\b/i, 4),
      t(/\bcamera\b/i, 3),
      t(/\bdvr\b|\bnvr\b/i, 3),
      t(/security system/i, 3),
      t(/access control/i, 3),
      t(/\bintercom\b/i, 2),
      t(/\bsurveillance\b/i, 3),
    ],
  },
];

const URGENT_TERMS = [
  /\burgent\b/i,
  /\bjaldi\b/i,
  /\bfor(a|u)n\b/i,
  /\baaj\b/i,
  /\babhi\b/i,
  /\bimmediately\b/i,
  /\bmehmaan\b/i,
  /\bguests?\b/i,
];

/** Words that suggest the customer just wants routine maintenance. */
const ROUTINE_TERMS = [/\bservice\b/i, /\bsafai\b/i, /\bmaintenance\b/i, /\bcheck\s*up\b/i];

interface Score {
  categorySlug: string;
  serviceSlug: string | null;
  score: number;
}

export function classifyIntake(text: string, context: IntakeContext): IntakeResult {
  const haystack = [...context.history.map((h) => h.content), text].join(' ');
  const hazard = assessHazard(haystack);

  const scores = new Map<string, Score>();
  const bump = (categorySlug: string, serviceSlug: string | null, weight: number) => {
    const key = `${categorySlug}::${serviceSlug ?? ''}`;
    const existing = scores.get(key);
    if (existing) existing.score += weight;
    else scores.set(key, { categorySlug, serviceSlug, score: weight });
  };

  // 1. Keyword rules.
  for (const rule of RULES) {
    for (const { pattern, weight } of rule.terms) {
      if (pattern.test(haystack)) bump(rule.categorySlug, rule.serviceSlug ?? null, weight);
    }
  }

  // 2. Direct matches against live catalogue names, so admin-created services
  //    are matchable without touching this file.
  for (const category of context.catalogue) {
    if (nameMatches(category.categoryName, haystack)) bump(category.categorySlug, null, 2);
    for (const service of category.services) {
      if (nameMatches(service.name, haystack)) bump(category.categorySlug, service.slug, 3);
    }
  }

  const known = new Set(context.catalogue.map((c) => c.categorySlug));
  const ranked = [...scores.values()]
    .filter((entry) => known.has(entry.categorySlug))
    .sort((a, b) => b.score - a.score);

  // Category score is the sum of all its entries; the winning service is the
  // highest-scoring specific entry within the winning category.
  const categoryTotals = new Map<string, number>();
  for (const entry of ranked) {
    categoryTotals.set(
      entry.categorySlug,
      (categoryTotals.get(entry.categorySlug) ?? 0) + entry.score,
    );
  }
  const bestCategory = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  const categorySlug = bestCategory?.[0] ?? null;
  const categoryScore = bestCategory?.[1] ?? 0;
  const bestService =
    categorySlug === null
      ? null
      : (ranked.find((entry) => entry.categorySlug === categorySlug && entry.serviceSlug)
          ?.serviceSlug ?? null);

  // Confidence is a saturating function of the winning score, discounted when a
  // runner-up category scores nearly as high.
  const runnerUp =
    [...categoryTotals.entries()]
      .filter(([slug]) => slug !== categorySlug)
      .sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0;
  const margin = categoryScore === 0 ? 0 : (categoryScore - runnerUp) / categoryScore;
  const confidence = categorySlug
    ? Math.min(0.9, (Math.min(categoryScore, 8) / 8) * 0.75 * (0.5 + 0.5 * margin) + 0.15)
    : 0;

  const urgency = hazard.isHazard
    ? 'EMERGENCY'
    : URGENT_TERMS.some((p) => p.test(haystack))
      ? 'URGENT'
      : 'NORMAL';

  const categoryName =
    context.catalogue.find((c) => c.categorySlug === categorySlug)?.categoryName ?? null;
  const serviceName = bestService
    ? (context.catalogue
        .find((c) => c.categorySlug === categorySlug)
        ?.services.find((s) => s.slug === bestService)?.name ?? null)
    : null;

  const isRoutine = ROUTINE_TERMS.some((p) => p.test(haystack));

  return {
    categorySlug,
    serviceSlug: bestService,
    issueSummary: summarize(text),
    urgency,
    confidence,
    questions: buildQuestions(categorySlug, hazard.isHazard, confidence),
    mediaRequest: hazard.isHazard ? null : mediaRequestFor(categorySlug),
    recommendation: buildRecommendation(categoryName, serviceName, isRoutine),
    reply: buildReply({
      categoryName,
      serviceName,
      confidence,
      hazardGuidance: hazard.guidance,
    }),
  };
}

function nameMatches(name: string, haystack: string): boolean {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return false;
  return words.every((word) => haystack.toLowerCase().includes(word));
}

const STOPWORDS = new Set(['repair', 'service', 'general', 'other', 'installation', 'work']);

function summarize(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length <= 200 ? cleaned : `${cleaned.slice(0, 199)}…`;
}

function buildQuestions(
  categorySlug: string | null,
  isHazard: boolean,
  confidence: number,
): string[] {
  if (isHazard) {
    return ['Kya aap is waqt safe hain? Hum foran emergency technician dhoondte hain.'];
  }
  if (!categorySlug) {
    return [
      'Masla kis cheez mein hai — AC, bijli, plumbing, safai, carpenter, appliance ya CCTV?',
      'Thoda tafseel se batayein ke exactly kya ho raha hai?',
    ];
  }
  const common =
    confidence < 0.45 ? ['Kya hum ne sahi category samjhi? Neeche se confirm kar dein.'] : [];

  switch (categorySlug) {
    case 'ac-cooling':
      return [...common, 'AC window hai ya split?', 'Masla kab se shuru hua?'];
    case 'electrical':
      return [...common, 'Masla poore ghar mein hai ya sirf ek kamre/point par?'];
    case 'plumbing':
      return [...common, 'Paani kis jagah se aa raha hai — bathroom, kitchen ya main line?'];
    case 'cleaning':
      return [...common, 'Kitne kamre ya kitna area clean karana hai?'];
    case 'carpenter':
      return [...common, 'Kaam repair ka hai ya kuch naya banwana hai?'];
    case 'painting':
      return [...common, 'Kitne kamre ya kitni deewarein paint karani hain?'];
    case 'appliances':
      return [...common, 'Appliance ka brand aur model number mil sakta hai?'];
    case 'security':
      return [...common, 'Kitne cameras hain ya kitne lagwane hain?'];
    default:
      return [...common, 'Masla thoda tafseel se batayein?'];
  }
}

function mediaRequestFor(categorySlug: string | null): string | null {
  switch (categorySlug) {
    case 'ac-cooling':
      return 'Indoor unit aur uske rating plate ki tasveer bhej dein — technician sahi parts saath laa sakega.';
    case 'plumbing':
      return 'Jahan se paani aa raha hai us jagah ki tasveer ya chhoti video bhej dein.';
    case 'electrical':
      return 'Us switch/board ya point ki tasveer bhej dein (door se, chhuye baghair).';
    case 'appliances':
      return 'Appliance ke model/rating sticker ki tasveer bhej dein.';
    case 'security':
      return 'Mojooda camera setup ya jagah ki tasveer helpful hogi.';
    case 'carpenter':
    case 'painting':
      return 'Kaam ki jagah ki tasveer bhej dein taake scope samajh aa jaye.';
    default:
      return null;
  }
}

function buildRecommendation(
  categoryName: string | null,
  serviceName: string | null,
  isRoutine: boolean,
): string {
  if (serviceName) return serviceName;
  if (categoryName) return `${categoryName} — ${isRoutine ? 'service' : 'inspection'}`;
  return 'Service category confirm karein';
}

function buildReply(params: {
  categoryName: string | null;
  serviceName: string | null;
  confidence: number;
  hazardGuidance?: string;
}): string {
  if (params.hazardGuidance) return params.hazardGuidance;

  if (!params.categoryName) {
    return 'Main aapki madad karna chahta hoon, lekin ab tak category clear nahi hui. Thoda batayein masla kis cheez mein hai — AC, bijli, plumbing, safai, carpenter, appliance ya CCTV?';
  }

  const what = params.serviceName ?? params.categoryName;
  const hedge =
    params.confidence < 0.45
      ? `Lagta hai yeh ${what} se related hai, lekin please confirm kar dein.`
      : `Samajh gaya — yeh ${what} ka kaam lagta hai.`;

  return `${hedge} Asal wajah technician muaina karke hi confirm kar sakta hai, is liye main aap ko nearby verified technicians dikhata hoon jo dekh kar quote de sakein.`;
}
