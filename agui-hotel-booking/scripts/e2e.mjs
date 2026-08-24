/**
 * Browser E2E for the AG-UI × GolemUI hotel booking demo.
 *
 * Prerequisites (in two terminals, from this folder's parent):
 *   MOCK_AGENT=1 npm run dev --workspace agent
 *   npm run start --workspace app
 * Then: node scripts/e2e.mjs
 *
 * Uses the deterministic mock agent so no ANTHROPIC_API_KEY is needed.
 */
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:4200';
const SHOT = (n) => `/tmp/agui-hotel-${n}.png`;

// A GolemUI internal logs this during conditional re-evaluation on change; it is
// non-fatal (the flow works) and out of this demo's control, so it's tolerated.
const KNOWN_WARNING = "reading 'source'";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=900,1150'],
  defaultViewport: { width: 900, height: 1150, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  const text = m.text();
  if (m.type() !== 'error') return;
  if (text.includes(KNOWN_WARNING)) return;
  // External resources (the Material Icons font) may be unreachable in
  // sandboxed/offline runs; app resources are local and would fail differently.
  if (text.startsWith('Failed to load resource: net::ERR_')) return;
  errors.push(text);
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const has = (t) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: 20000 }, t);
const pick = (path, value) => page.select(`select[id="${path}-select"]`, value);
const submit = (label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll('gui-form button')].find((x) => x.textContent?.includes(l));
    if (!b) throw new Error(`submit "${l}" not found`);
    b.click();
  }, label);

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.chat__suggestion', { timeout: 15000 });
  await page.screenshot({ path: SHOT('1-empty') });
  console.log('✓ app loaded');

  // 1. Stay form (render_form) — pre-filled dates + guests.
  await page.click('.chat__suggestion');
  await has('Welcome to Hotel Aurora');
  await page.waitForSelector('gui-form', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  const stay = await page.evaluate(() => document.body.innerText);
  for (const t of ['Stay (arrival', 'Guests', 'Board', 'Continue']) {
    if (!stay.includes(t)) throw new Error(`stay form missing "${t}"`);
  }
  await page.screenshot({ path: SHOT('2-stay') });
  console.log('✓ stay form rendered and pre-filled');

  await pick('stay.board', 'half');
  await new Promise((r) => setTimeout(r, 250));
  await submit('Continue');
  console.log('✓ stay form submitted (half board)');

  // 2. Car question (render_form) — the agent SUGGESTS a car (pre-filled yes);
  //    the branching lives in the agent: answering yes brings a car-type form.
  await has('rental car');
  await page.waitForSelector('select[id="stay.wantsCar-select"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 700));
  const suggested = await page.evaluate(
    () => document.getElementById('stay.wantsCar-select').value,
  );
  if (suggested !== 'yes') throw new Error('agent should pre-fill wantsCar = yes');
  await submit('Continue');
  console.log('✓ car question: agent suggested yes, accepted');

  //    The agent branches -> car-type form arrives.
  await has('which car');
  await page.waitForSelector('select[id="stay.car-select"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 700));
  await pick('stay.car', 'suv');
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: SHOT('3-car') });
  await submit('Review booking');
  console.log('✓ car-type form: SUV picked, submitted');

  // 3. confirm_booking: schema-derived review form + host-computed price breakdown.
  await has('review and edit before it');
  await page.waitForSelector('app-tool-approval gui-form', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  const review = await page.evaluate(() => document.body.innerText);
  for (const t of ['Guests', 'Board', 'Car rental', 'Confirm booking', 'Total']) {
    if (!review.includes(t)) throw new Error(`review missing "${t}"`);
  }
  // 2 nights, 2 guests, half board, SUV:
  //   room 120 + guests 40 + half 40 + suv 60 = 260
  if (!review.includes('260')) throw new Error('expected proposed total €260 in the breakdown');
  await page.screenshot({ path: SHOT('4-review') });
  console.log('✓ review: schema-derived fields + host price breakdown (€260.00)');

  // 4. Edit board half -> full: the host price breakdown recomputes LIVE
  //    (before confirming), then confirm.
  await pick('board', 'full');
  await new Promise((r) => setTimeout(r, 700));
  const liveSummary = await page.evaluate(
    () => document.querySelector('app-tool-approval .summary')?.textContent ?? '',
  );
  if (!liveSummary.includes('300')) {
    throw new Error(`price breakdown did not recompute live (still: ${liveSummary.slice(0, 120)})`);
  }
  console.log('✓ price breakdown recomputed live: €260 → €300 before confirming');
  await submit('Confirm booking');
  console.log('✓ edited board to full, confirmed');

  // 5. The agent acknowledges the diff AND the recomputed total (full board: +€40 -> €300).
  await has('is confirmed');
  await has('board: half → full');
  await has('300');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: SHOT('5-confirmed') });
  const confirmation = await page.evaluate(() => document.body.innerText);
  const id = confirmation.match(/BKG-2026-\d{4}/);
  if (!id) throw new Error('booking id missing from confirmation');
  console.log(`✓ confirmed ${id[0]}; agent acknowledged diff (half → full) and recomputed total €300`);

  // 6. collect_payment: the hand-crafted card checkout (TS gui.* API + custom
  //    Angular widgets + GSAP card). The agent charges the recomputed total.
  await has('take the payment');
  await page.waitForSelector('app-payment-tool gui-form', { timeout: 20000 });
  await page.waitForSelector('app-payment-tool .card', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  const checkout = await page.evaluate(() => document.body.innerText);
  for (const t of ['Pay €300.00', 'Cardholder name', 'Card number', 'MM/YY']) {
    if (!checkout.includes(t)) throw new Error(`checkout missing "${t}"`);
  }
  const payDisabledBefore = await page.evaluate(
    () => [...document.querySelectorAll('app-payment-tool button')]
      .find((b) => b.textContent?.includes('Pay €'))?.disabled,
  );
  await page.screenshot({ path: SHOT('6-payment') });
  console.log(`✓ card checkout rendered (Pay disabled before typing: ${payDisabledBefore})`);

  // 7. Fill the card. The preview and the Pay button react through runtime
  //    functions on $form — the sharpest probe of engine reactivity in a
  //    multi-form thread.
  const type = async (placeholder, text) => {
    const el = await page.waitForSelector(`app-payment-tool input[placeholder="${placeholder}"]`, { timeout: 5000 });
    await el.click();
    await el.type(text, { delay: 15 });
  };
  await type('Jane Doe', 'Raul Jimenez');
  await type('1234 1234 1234 1234', '4242424242424242');
  await type('MM/YY', '1230');
  await type('•••', '123');
  await new Promise((r) => setTimeout(r, 600));

  const state = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('app-payment-tool button')]
      .find((b) => b.textContent?.includes('Pay €'));
    return {
      payDisabled: btn?.disabled,
      previewNumber: document.querySelector('app-payment-tool .card__number')?.textContent?.trim(),
      brandOnCard: Boolean(document.querySelector('app-payment-tool .card [aria-label="Visa"]')),
    };
  });
  console.log(`✓ typed card; preview shows "${state.previewNumber}", visa mark: ${state.brandOnCard}, Pay disabled: ${state.payDisabled}`);
  if (state.previewNumber?.includes('••••')) {
    console.log('⚠ MULTI-FORM ENGINE BUG: runtime props did not update — see README finding 4');
  }
  await page.screenshot({ path: SHOT('7-payment-filled') });
  if (state.payDisabled) {
    throw new Error('Pay button still disabled after a valid card — runtime re-evaluation broken (engine finding 4)');
  }

  // 8. Pay -> GSAP success + tool result -> the agent closes the loop.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('app-payment-tool button')]
      .find((b) => b.textContent?.includes('Pay €'));
    btn?.click();
  });
  await has('Payment completed');
  await has('Payment received');
  await has('ending 4242');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: SHOT('8-paid') });
  console.log('✓ payment completed; agent confirmed €300.00 on visa ending 4242');

  console.log('\nE2E PASS');
} finally {
  if (errors.length) {
    console.log('\nUnexpected console errors:');
    for (const e of errors) console.log('  -', e);
  } else {
    console.log('no unexpected console errors');
  }
  await browser.close();
}
