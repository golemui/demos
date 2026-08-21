/**
 * Browser E2E for the AG-UI × GolemUI claims demo.
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
const SHOT = (n) => `/tmp/agui-claims-${n}.png`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=900,1000'],
  defaultViewport: { width: 900, height: 1000, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const bodyIncludes = (text) =>
  page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout: 20000 },
    text,
  );

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.chat__suggestion', { timeout: 15000 });
  await page.screenshot({ path: SHOT('1-empty') });
  console.log('✓ app loaded, suggestion visible');

  // 1. Send the canned utterance.
  await page.click('.chat__suggestion');
  await bodyIncludes("Let's get your claim filed");
  console.log('✓ assistant text streamed');

  // 2. The render_form tool call mounts a real gui-form.
  await page.waitForSelector('gui-form', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200)); // widget init + on.load city options
  await page.screenshot({ path: SHOT('2-form') });
  console.log('✓ gui-form rendered');

  const text = await page.evaluate(() => document.body.innerText);
  for (const expected of ['Netherlands', 'Amsterdam', 'Date of incident', 'Submit claim']) {
    if (!text.includes(expected)) throw new Error(`expected page to show "${expected}"`);
  }
  console.log('✓ pre-filled country/city visible (Netherlands / Amsterdam)');
  if (!text.includes('Incidents outside Spain')) {
    throw new Error('conditional "abroad" alert not visible although country is NL');
  }
  console.log('✓ conditional abroad alert + police report field visible');

  // 3. Complete the remaining fields.
  const textarea = await page.waitForSelector('gui-form textarea', { timeout: 5000 });
  await textarea.type('My bike was locked at Amsterdam Centraal and the lock was cut overnight.');
  const police = await page.waitForSelector('input[placeholder="e.g. AMS-2026-12345"]', {
    timeout: 5000,
  });
  await police.type('AMS-2026-98765');
  await page.screenshot({ path: SHOT('3-filled') });
  console.log('✓ description + police report filled');

  // 4. Submit.
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('gui-form button')].find((b) =>
      b.textContent?.includes('Submit claim'),
    );
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error('submit button not found');

  // 5. Tool result goes back to the agent; confirmation streams in.
  await bodyIncludes('has been filed');
  await bodyIncludes('Form submitted');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: SHOT('4-confirmed') });
  console.log('✓ form marked completed and claim confirmation received');

  const confirmation = await page.evaluate(() => document.body.innerText);
  const match = confirmation.match(/CLM-2026-\d{4}/);
  console.log(`✓ claim id in confirmation: ${match ? match[0] : 'NOT FOUND'}`);
  if (!match) throw new Error('claim id missing from confirmation');

  // 6. The agent proposes a payout -> the harness renders an approval form
  //    derived from the issue_payout JSON Schema, pre-filled with the proposal.
  await bodyIncludes('The agent wants to run issue_payout');
  await page.waitForSelector('app-tool-approval gui-form', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200)); // widget init
  const approvalText = await page.evaluate(() => document.body.innerText);
  for (const expected of ['issue_payout', 'Amount (EUR)', 'Beneficiary', 'Approve & execute']) {
    if (!approvalText.includes(expected)) throw new Error(`expected approval UI to show "${expected}"`);
  }
  await page.screenshot({ path: SHOT('5-approval') });
  console.log('✓ schema-derived approval form rendered for issue_payout');

  // 7. The human edits the proposal: amount 450 -> 400.
  const amountHandle = await page.waitForFunction(
    () =>
      [...document.querySelectorAll('app-tool-approval input')].find((i) => i.value === '450') ??
      null,
    { timeout: 10000 },
  );
  const amountInput = amountHandle.asElement();
  await amountInput.click();
  await amountInput.evaluate((el) => el.select());
  await amountInput.type('400');
  console.log('✓ amount edited from 450 to 400');

  // 8. Approve -> the app executes the payout and reports result + diff back.
  const approved = await page.evaluate(() => {
    const button = [...document.querySelectorAll('app-tool-approval gui-form button')].find((b) =>
      b.textContent?.includes('Approve & execute'),
    );
    if (!button) return false;
    button.click();
    return true;
  });
  if (!approved) throw new Error('approve button not found');

  // 9. The agent acknowledges the transfer AND the human's edit (the diff).
  await bodyIncludes('Transfer TRF-');
  await bodyIncludes('amount: 450 → 400');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: SHOT('6-payout-approved') });
  console.log('✓ payout executed; agent acknowledged the human edit (450 → 400)');

  console.log('\nE2E PASS');
} finally {
  if (errors.length) {
    console.log('\nConsole errors:');
    for (const e of errors) console.log('  -', e);
  } else {
    console.log('no console errors');
  }
  await browser.close();
}
