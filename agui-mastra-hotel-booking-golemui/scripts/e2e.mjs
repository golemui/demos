/**
 * Browser E2E of the whole demo — `npm run e2e`.
 *
 * Self-contained: starts the server with the scripted mock model (no API key)
 * and the Vite app on spare ports, drives the "6 people, a baby, parking"
 * conversation end to end in headless Chrome, then shuts everything down.
 *
 * Covers: only-missing-fields form → server tool (availability) → special
 * requests form → editable review (requests included) with live repricing →
 * POST /bookings → a change before paying (updateBooking → PATCH) → animated
 * checkout.
 *
 * Chrome: set CHROME_PATH if it isn't at the default macOS location.
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SERVER_PORT = 8787;
const APP_PORT = 5199;
const URL = `http://localhost:${APP_PORT}`;
const SHOT = (name) => join(tmpdir(), `hotel-e2e-${name}.png`);

const children = [];
function start(cwd, command, args, env) {
  const child = spawn(command, args, { cwd: join(ROOT, cwd), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (chunk) => process.env.E2E_VERBOSE && process.stderr.write(chunk));
  child.stdout.on('data', (chunk) => process.env.E2E_VERBOSE && process.stdout.write(chunk));
  children.push(child);
}

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`${url} did not come up`);
}

start('server', 'npx', ['tsx', 'src/server.ts'], { MOCK_AGENT: '1', SERVER_PORT: String(SERVER_PORT) });
start('app', 'npx', ['vite', '--port', String(APP_PORT), '--strictPort'], { SERVER_PORT: String(SERVER_PORT) });

let browser;
let page;
let failed = false;
try {
  await waitFor(`http://localhost:${SERVER_PORT}/api/bookings`);
  await waitFor(URL);

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });
  page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // External fonts may be unreachable offline; app resources are local.
    if (message.text().startsWith('Failed to load resource: net::ERR_')) return;
    errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith('http://localhost')) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const has = (text) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20000 }, text);
  /** The newest tool surface in the thread (an ElementHandle). */
  const lastSurface = async () => (await page.$$('.chat__thread .surface')).at(-1);
  const clickButton = (label) =>
    page.evaluate((l) => {
      const buttons = [...document.querySelectorAll('.chat__thread button')].filter((b) => b.textContent?.trim().startsWith(l));
      const button = buttons[buttons.length - 1];
      if (!button) throw new Error(`button "${l}" not found`);
      button.click();
    }, label);
  /** Types a date into the Nth date widget (day/month/year segments) of the last surface. */
  const typeDate = async (index, iso) => {
    const [year, month, day] = iso.split('-');
    const segments = await (await lastSurface()).$$('input[aria-label="Day"], input[aria-label="Month"], input[aria-label="Year"]');
    for (const [offset, value] of [day, month, year].entries()) {
      await segments[index * 3 + offset].click();
      await page.keyboard.type(value);
    }
  };
  const total = () => page.$eval('.quote__row--total span:last-child', (el) => el.textContent);

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await clickButton('We are 6 people');

  // 1. Only the missing fields: guests is known, so it is NOT asked.
  await page.waitForSelector('.chat__thread .surface .surface__meta', { timeout: 20000 });
  await sleep(500);
  const meta = await (await lastSurface()).$eval('.surface__meta', (el) => el.textContent);
  if (meta !== 'createBooking(dates, rooms, board, car)') throw new Error(`unexpected ask_user: ${meta}`);
  if ((await (await lastSurface()).$eval('#rooms-number', (el) => el.value)) !== '2') throw new Error('rooms not pre-filled from 6 guests');
  console.log('✓ ask_user asks only dates, rooms, board, car (rooms suggested: 2)');

  await typeDate(0, '2030-11-20');
  await typeDate(1, '2030-11-27');
  await (await (await lastSurface()).$('#board-select')).select('full');
  await (await (await lastSurface()).$('#car-select')).select('suv');
  await page.screenshot({ path: SHOT('1-ask') });
  await clickButton('Continue');

  // 2. Availability runs on the server, then — BEFORE the review — a form with
  //    just the special requests the guest hinted at, in a titled section.
  await has('ran on the server');
  await has('createBooking(specialRequests.babyCrib, specialRequests.parking, specialRequests.licensePlate)');
  await has('Special requests');
  const order = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.chat__thread > *')].map((el) => el.textContent ?? '');
    return { text: items.findIndex((t) => t.includes('Good news')), form: items.findIndex((t) => t.includes('specialRequests.babyCrib')) };
  });
  if (!(order.text >= 0 && order.text < order.form)) throw new Error(`form rendered above its intro text: ${JSON.stringify(order)}`);
  await sleep(500);
  await (await (await lastSurface()).$('input[type="text"]')).type('1234 ABC');
  await page.screenshot({ path: SHOT('2-requests') });
  await clickButton('Add to my booking');
  console.log('✓ availability checked on the server, special requests asked before the review');

  // 3. Review: host-priced, live repricing on edit, requests included.
  await has('Approval required');
  await sleep(500);
  await page
    .waitForFunction(() => document.querySelectorAll('.surface--review input[type="checkbox"]').length === 2, { timeout: 8000 })
    .catch(async () => {
      const text = await page.$eval('.surface--review', (el) => el.innerText);
      throw new Error(`expected the 2 proposed request checkboxes in the review:\n${text}`);
    });
  if ((await total()) !== '€2310.00') throw new Error(`unexpected total ${await total()}`);
  await page.select('.surface--review #board-select', 'half');
  await page.waitForFunction(() => document.querySelector('.quote__row--total span:last-child')?.textContent === '€1890.00', { timeout: 5000 });
  console.log('✓ review priced €2310 → €1890 live after switching to half board');
  await page.screenshot({ path: SHOT('3-review') });
  await clickButton('Confirm booking');

  // 4. The app created the booking (requests included); the agent acknowledges the edit.
  await has('Booked AUR-');
  await has('Saved with the booking: Baby crib in the room · Reserve a parking space · License plate: 1234 ABC');
  await has('board → half');
  console.log('✓ POST /bookings done with the special requests, agent acknowledged the edit');

  // 5. Before paying, a change: writing in the chat closes the open checkout,
  //    and the agent asks for JUST the car (updateBooking), then a review that
  //    PATCHes the same booking.
  await page.waitForSelector('input[placeholder="Jane Doe"]', { timeout: 20000 });
  await sleep(600);
  await page.type('section.chat .chat__input', 'Actually, I want a compact car instead');
  await page.keyboard.press('Enter');
  await has('closed — the guest wrote in the chat');
  await has('updateBooking(car)');
  await sleep(500);
  await clickButton('Review the change');
  await has('PATCH /bookings/AUR-');
  await sleep(500);
  if ((await total()) !== '€1855.00') throw new Error(`unexpected total after the change ${await total()}`);
  await clickButton('Confirm booking');
  await has('is updated');
  console.log('✓ change before paying: ask_user(updateBooking, car) → review → PATCH the same booking (€1890 → €1855)');

  // 6. Checkout, for the new total.
  await page.waitForFunction(() => document.querySelectorAll('input[placeholder="Jane Doe"]').length === 1, { timeout: 20000 });
  await sleep(600);
  await page.type('input[placeholder="Jane Doe"]', 'Jane Doe');
  await page.type('input[placeholder="1234 1234 1234 1234"]', '4242424242424242');
  await page.type('input[placeholder="MM/YY"]', '1230');
  await page.keyboard.press('Tab');
  await page.keyboard.type('123');
  await sleep(300);
  await page.screenshot({ path: SHOT('4-checkout') });
  await clickButton('Pay €1855.00');
  await has('Payment completed');
  await has('visa ending 4242');
  console.log('✓ paid with the test card');

  await has('special requests are saved');
  await page.screenshot({ path: SHOT('5-done') });

  const bookings = await (await fetch(`http://localhost:${SERVER_PORT}/api/bookings`)).json();
  const booking = bookings[bookings.length - 1];
  if (bookings.length !== 1 || booking.status !== 'paid' || booking.board !== 'half' || booking.car !== 'compact' || booking.specialRequests?.licensePlate !== '1234 ABC' || !booking.specialRequests?.babyCrib) {
    throw new Error(`unexpected stored booking ${JSON.stringify(booking)}`);
  }
  console.log(`✓ ${booking.id} stored (one booking): paid, half board, compact car, special requests inside the booking`);

  if (errors.length > 0) throw new Error(`console errors:\n${errors.join('\n')}`);
  console.log(`\nE2E passed. Screenshots: ${SHOT('*')}`);
} catch (error) {
  failed = true;
  console.error('✗ E2E failed:', error.message);
  await page?.screenshot({ path: SHOT('failure'), fullPage: true }).catch(() => {});
  console.error(`  screenshot: ${SHOT('failure')}`);
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
process.exit(failed ? 1 : 0);
