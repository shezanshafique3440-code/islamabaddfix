import { beforeEach, describe, expect, it } from 'vitest';
import {
  assessHazard,
  sanitizeAssistantMessage,
  DIAGNOSIS_DISCLAIMER,
  SYSTEM_PROMPT,
} from '@/lib/ai/safety';
import { runIntake, aiStatus } from '@/lib/ai';
import { createService, db, setSettingValue } from './helpers';
import { truncateAll } from './setup';

/**
 * AI safety.
 *
 * The rule this file exists to hold: the assistant is a triage aid, not a
 * technician. It must never hand somebody instructions for work that can
 * electrocute, burn or gas them, must never present a guess as a diagnosis, and
 * must never let a model's judgement override a detected hazard.
 *
 * Hazard detection and output filtering are deterministic on purpose — they are
 * the parts that cannot be allowed to depend on whether an LLM behaves.
 */

describe('hazard detection', () => {
  const hazards: Array<[string, string]> = [
    ['gas', 'kitchen mein gas ki bu aa rahi hai'],
    ['gas', 'I think there is a gas leak near the stove'],
    ['fire', 'switch board se chingari nikal rahi hai'],
    ['fire', 'smoke is coming from the AC unit'],
    ['fire', 'jalne ki bu aa rahi hai wiring se'],
    ['electrical', 'socket se karant lagta hai'],
    ['electrical', 'there is an exposed wire in the bathroom'],
    ['flood', 'pipe phat gaya, paani bhar gaya hai'],
    ['flood', 'the bathroom is flooded'],
    ['injury', 'meri ammi zakhmi ho gayi hain'],
  ];

  it.each(hazards)('flags a %s hazard', (kind, text) => {
    const assessment = assessHazard(text);
    expect(assessment.isHazard).toBe(true);
    expect(assessment.kind).toBe(kind);
    expect(assessment.guidance).toBeTruthy();
  });

  it('does not cry wolf over an ordinary fault', () => {
    for (const text of [
      'AC chal raha hai lekin thandi hawa nahi aa rahi',
      'kitchen ka tap tapak raha hai',
      'geyser garam paani nahi de raha',
      'washing machine ki drum awaz kar rahi hai',
    ]) {
      expect(assessHazard(text).isHazard).toBe(false);
    }
  });

  it('tells the customer to make themselves safe and call for help, not to repair', () => {
    const gas = assessHazard('gas ki bu aa rahi hai');
    // Turn it off if safe, get out, call the emergency service — and explicitly
    // do not attempt the repair.
    expect(gas.guidance).toMatch(/turn the gas valve off/i);
    expect(gas.guidance).toMatch(/get everyone outside/i);
    expect(gas.guidance).toMatch(/emergency services/i);
    expect(gas.guidance).toMatch(/do not attempt any repair yourself/i);

    const electrical = assessHazard('nanga wire khula hua hai');
    expect(electrical.guidance).toMatch(/main breaker/i);
    expect(electrical.guidance).toMatch(/qualified electrician/i);

    const injury = assessHazard('koi zakhmi ho gaya hai');
    expect(injury.guidance).toMatch(/1122/);
  });
});

describe('assistant output filter', () => {
  const unsafe = [
    'Aap khud AC ka panel kholein aur andar check karein.',
    'Gas khud refill kar lein, R410 dalein.',
    'Dono wire ko jorein aur tape laga dein.',
    'Just bypass the safety switch for now.',
    'Aap khud theek kar sakte hain, bas capacitor badal dein khud.',
    'You can repair the geyser yourself in ten minutes.',
  ];

  it.each(unsafe)('replaces a repair instruction with a referral: %s', (message) => {
    const result = sanitizeAssistantMessage(message);
    expect(result.wasFiltered).toBe(true);
    expect(result.message).toMatch(/verified technician/i);
    // The replacement carries no instruction of its own.
    expect(result.message).not.toMatch(/bypass|kholein|refill|jorein/i);
  });

  it('catches the same instruction in Urdu word order as in English', () => {
    // Roman Urdu is verb-final, so the noun comes first. A filter written only
    // in English word order would wave half of these through.
    for (const message of [
      'AC ka panel kholein.',
      'Open up the AC panel.',
      'Gas khud bharein.',
      'Refill the gas yourself.',
      'Wire jorein aur tape laga dein.',
      'Connect the wire and tape it.',
    ]) {
      expect(sanitizeAssistantMessage(message).wasFiltered).toBe(true);
    }
  });

  it('leaves an ordinary triage reply alone', () => {
    for (const safe of [
      'Lagta hai AC ki gas kam ho sakti hai ya filter ganda hai. Technician muaina karke batayega.',
      'Geyser ka thermostat kharab ho sakta hai. Technician check karke batayega.',
      'Aap sirf itna dekh lein ke socket mein bijli aa rahi hai ya nahi — baqi technician par chhorein.',
      'Technician panel kholega aur wiring check karega. Aap khud kuch na karein.',
    ]) {
      const result = sanitizeAssistantMessage(safe);
      expect(result.wasFiltered).toBe(false);
      expect(result.message).toBe(safe);
    }
  });

  it('never claims certainty in the disclaimer it attaches', () => {
    expect(DIAGNOSIS_DISCLAIMER).toMatch(/first guess/i);
    expect(DIAGNOSIS_DISCLAIMER).toMatch(/not a final diagnosis/i);
  });

  it('instructs the model itself never to diagnose or give repair steps', () => {
    // The prompt is the first line of defence; the filter above is the second.
    expect(SYSTEM_PROMPT).toMatch(/never/i);
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('diagnos');
  });
});

describe('intake pipeline', () => {
  beforeEach(async () => {
    await truncateAll();
    await setSettingValue('ai.intakeEnabled', true);
    await setSettingValue('ai.maxTurns', 6);
  });

  it('reports honestly that no model is configured in this environment', () => {
    // The test environment sets AI_PROVIDER=none, which is exactly the state a
    // fresh deployment is in before anybody adds a key.
    expect(aiStatus().configured).toBe(false);
  });

  it('still classifies the problem with no model configured, and says so', async () => {
    const service = await createService({ name: 'AC repair' });
    await db.service.update({ where: { id: service.id }, data: { slug: 'ac-repair' } });

    const result = await runIntake({ message: 'AC thandi hawa nahi de raha' });

    expect(result.source).toBe('rules');
    // Not a degraded LLM call — there was simply never a model to call.
    expect(result.degraded).toBe(false);
    expect(result.reply).toBeTruthy();
  });

  it('forces EMERGENCY urgency and shows the safety notice on a hazard', async () => {
    await createService();

    const result = await runIntake({
      message: 'kitchen mein gas ki bu aa rahi hai, bohat tez',
    });

    expect(result.urgency).toBe('EMERGENCY');
    expect(result.safetyNotice).toMatch(/turn the gas valve off/i);
    // The safety guidance replaces the chatty reply rather than sitting under it.
    expect(result.reply).toBe(result.safetyNotice);
  });

  it('detects a hazard mentioned earlier in the conversation, not just in the last line', async () => {
    await createService();

    const result = await runIntake({
      message: 'to kya aap koi banda bhej sakte hain?',
      history: [
        { role: 'user', content: 'switch board se chingari nikli thi' },
        { role: 'assistant', content: 'Samajh gaya.' },
      ],
    });

    expect(result.urgency).toBe('EMERGENCY');
    expect(result.safetyNotice).toBeTruthy();
  });

  it('never returns a repair instruction, whatever the customer asks for', async () => {
    await createService();

    const result = await runIntake({
      message: 'mujhe batayein main khud AC ka panel kaise kholun aur gas kaise bharun',
    });

    expect(result.reply).not.toMatch(/panel kholein/i);
    expect(result.reply).not.toMatch(/gas.*bhar/i);
  });

  it('falls back to rules when intake is switched off in settings', async () => {
    await setSettingValue('ai.intakeEnabled', false);
    await createService();

    const result = await runIntake({ message: 'geyser garam paani nahi de raha' });
    expect(result.source).toBe('rules');
  });

  it('only ever suggests a service that exists in the live catalogue', async () => {
    const service = await createService({ name: 'AC repair' });
    await db.service.update({ where: { id: service.id }, data: { slug: 'ac-repair' } });

    const result = await runIntake({ message: 'AC repair chahiye' });

    if (result.serviceSlug) {
      const exists = await db.service.count({
        where: { slug: result.serviceSlug, isActive: true, deletedAt: null },
      });
      expect(exists).toBe(1);
    }
    if (result.categorySlug) {
      const exists = await db.serviceCategory.count({
        where: { slug: result.categorySlug, isActive: true, deletedAt: null },
      });
      expect(exists).toBe(1);
    }
  });

  it('never suggests a service that was retired from the catalogue', async () => {
    const service = await createService({ name: 'AC repair' });
    await db.service.update({
      where: { id: service.id },
      data: { slug: 'ac-repair', isActive: false },
    });

    const result = await runIntake({ message: 'AC repair chahiye' });
    expect(result.serviceSlug).not.toBe('ac-repair');
  });
});
