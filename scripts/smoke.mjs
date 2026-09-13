/**
 * Post-deploy smoke test.
 *
 * Loads the real pages in a real browser and checks three things that unit
 * tests cannot: the pages render, the Content-Security-Policy does not block
 * anything the app needs, and the booking wizard actually responds to a person
 * typing into it. It is deliberately a browser test — "the button is wired up"
 * is exactly the claim that is worthless when asserted in isolation.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Exits non-zero on the first CSP violation, page error, or dead interaction,
 * so it can gate a deploy.
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? process.env.SMOKE_URL ?? 'http://localhost:3000';
const PAGES = ['/', '/services', '/providers', '/book', '/login', '/how-it-works', '/faq'];

const problems = [];
const note = (message) => problems.push(message);

const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext();

for (const path of PAGES) {
  const page = await context.newPage();
  page.on('console', (message) => {
    const text = message.text();
    if (/content security policy|refused to (load|execute|connect)/i.test(text)) {
      note(`${path}: CSP — ${text}`);
    }
  });
  page.on('pageerror', (error) => note(`${path}: uncaught — ${error.message}`));

  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
  if (!response || response.status() >= 400) {
    note(`${path}: HTTP ${response?.status() ?? 'no response'}`);
  }
  // "Did it render?" as a fact about structure, not about how much copy the
  // page happens to have. A login form is deliberately short; a character
  // count fails it for being well written.
  const rendered = await page.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    interactive: document.querySelectorAll('a[href], button, input').length,
    chars: document.body.innerText.trim().length,
  }));
  if (!rendered.heading) note(`${path}: no <h1> — the page did not render`);
  if (rendered.interactive < 3) note(`${path}: nothing to interact with`);
  console.log(
    `  ${path.padEnd(16)} ${response?.status() ?? '—'}  ${String(rendered.chars).padStart(5)} chars  ${String(rendered.interactive).padStart(3)} controls  “${rendered.heading.slice(0, 32)}”`,
  );
  await page.close();
}

// The intake step is the first thing a customer touches, and the one most
// likely to be quietly broken by a CSP or hydration mistake.
const page = await context.newPage();
page.on('pageerror', (error) => note(`/book: uncaught — ${error.message}`));
await page.goto(`${baseUrl}/book`, { waitUntil: 'networkidle' });
await page.fill('#problem', 'AC chal raha hai lekin thandi hawa nahi aa rahi');
await page.click('button:has-text("Take a look")');
await page.waitForSelector('text=/Rule-based|^AI$/', { timeout: 15_000 }).catch(() => {
  note('/book: the intake assistant never answered — the wizard is not wired up');
});
const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
if (health.status !== 'ok') note(`/api/health reports ${health.status}`);
console.log(`  intake answered, database ${health.database}`);

await browser.close();

if (problems.length > 0) {
  console.error('\nSmoke test FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
