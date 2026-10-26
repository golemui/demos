/**
 * Browser E2E of the whole demo — `npm run e2e`.
 *
 * Self-contained: starts the server with the scripted mock model (no API key)
 * and the Vite app on spare ports, drives the "6 people, a baby, parking"
 * conversation end to end in headless Chrome, then shuts everything down.
 *
 * Covers: agent-designed surfaces through @ag-ui/a2ui-middleware and
 * @a2ui/react → the agent books and charges through server tools → a surface
 * the renderer rejects (Slider.step) goes back to the agent and is re-rendered.
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
  const clickButton = (label) =>
    page.evaluate((l) => {
      const buttons = [...document.querySelectorAll('.chat__thread button')].filter((b) => b.textContent?.trim().startsWith(l));
      const button = buttons[buttons.length - 1];
      if (!button) throw new Error(`button "${l}" not found`);
      button.click();
    }, label);

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await clickButton('We are 6 people');
  /** Fills inputs and clicks a button of the newest A2UI surface of the visible chat (inputs as A2UI renders them). */
  const onLastA2ui = async (steps) => {
    await sleep(500); // let the web components finish their first render, or it resets what we type
    await page.evaluate(async (steps) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const chat = document.querySelector('section.chat');
      const frame = [...chat.querySelectorAll('.a2ui-frame')].at(-1);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const input = (fill) => frame.querySelectorAll(fill.selector)[fill.index ?? 0];
      const label = steps.find((step) => step.click)?.click;
      const button = () => [...frame.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label));
      // A slow first render can drop or reset the first inputs: fill again until
      // the values stick and the submit button accepts them.
      const settled = () =>
        steps.every((step) => !step.fill || input(step.fill).value === step.fill.value) && (!label || !button().disabled);
      for (let attempt = 0; attempt < 10; attempt++) {
        for (const step of steps) {
          if (step.fill) {
            setter.call(input(step.fill), step.fill.value);
            input(step.fill).dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            input(step.fill).dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }
          if (step.check) frame.querySelector(step.check).click();
          await wait(120);
        }
        await wait(300);
        if (settled()) break;
      }
      if (label) button().click();
    }, steps);
  };
  const a2uiFrames = (count) =>
    page.waitForFunction(
      (n) => {
        const chat = document.querySelector('section.chat');
        return chat.querySelectorAll('.a2ui-frame').length >= n && !chat.querySelector('.chat__typing');
      },
      { timeout: 20000 },
      count,
    );

  await a2uiFrames(1);
  await onLastA2ui([
    { fill: { selector: 'input[type=date]', index: 0, value: '2030-12-01' } },
    { fill: { selector: 'input[type=date]', index: 1, value: '2030-12-08' } },
    { check: 'input[type=radio][value=half]' },
    { click: 'Continue' },
  ]);
  await a2uiFrames(2);
  await has('Special requests');
  console.log('✓ the agent-designed form renders, its action reaches the agent, check_availability runs');
  await onLastA2ui([{ fill: { selector: 'input:not([type=checkbox])', value: '5678 XYZ' } }, { click: 'Add to my booking' }]);
  await a2uiFrames(3);
  await page.waitForFunction(() => [...document.querySelectorAll('.a2ui-frame strong')].some((el) => el.textContent === 'Total: €1680.00'), { timeout: 8000 });
  await page.screenshot({ path: SHOT('1-review') });
  await onLastA2ui([{ click: 'Confirm booking' }]);
  await a2uiFrames(4);
  await onLastA2ui([
    { fill: { selector: 'input', index: 0, value: 'Ada Lovelace' } },
    { fill: { selector: 'input', index: 1, value: '4242 4242 4242 4242' } },
    { fill: { selector: 'input', index: 2, value: '12/30' } },
    { fill: { selector: 'input', index: 3, value: '123' } },
    { click: 'Pay' },
  ]);
  await has('visa ending 4242');
  const bookings = await (await fetch(`http://localhost:${SERVER_PORT}/api/bookings`)).json();
  const booking = bookings[bookings.length - 1];
  if (booking.status !== 'paid' || booking.specialRequests?.licensePlate !== '5678 XYZ') throw new Error(`unexpected booking ${JSON.stringify(booking)}`);
  const written = await page.$eval('.inspector__summary strong', (el) => Number(el.textContent.replace(/\D/g, '')));
  if (written < 4000) throw new Error(`expected the agent to write >4 KB of A2UI, got ${written}`);
  console.log(`✓ review → the AGENT books ${booking.id} and charges the card (${written.toLocaleString()} bytes of A2UI written)`);
  await page.screenshot({ path: SHOT('2-done') });

  // A surface the renderer rejects (Slider has no `step`) goes back to the agent, which re-renders it.
  await page.evaluate(() => [...document.querySelectorAll('.layout__toolbar button')].find((b) => b.textContent.includes('New chat')).click());
  await page.type('section.chat .chat__input', 'We are 2 people, a slider for guests please');
  await page.keyboard.press('Enter');
  await has("Renderer rejected the surface: Validation failed for component 'Slider' (guests): root: Unrecognized key(s) in object: 'step'");
  await has('Renderer error sent back to the agent');
  await has('here it is again');
  await a2uiFrames(1);
  console.log('✓ Slider.step rejected by the renderer → error sent to the agent → surface re-rendered');

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
