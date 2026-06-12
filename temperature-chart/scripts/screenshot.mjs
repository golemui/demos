import puppeteer from 'puppeteer-core';

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1200,800'],
  defaultViewport: { width: 1200, height: 800, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for the custom chart widget's canvas to mount.
await page.waitForSelector('.temperature-chart__canvas-wrap canvas', {
  timeout: 15000,
});
// Give Chart.js a moment to draw.
await new Promise((r) => setTimeout(r, 800));

await page.screenshot({ path: '/tmp/golem-1-initial.png' });
console.log('shot 1 (initial) saved');

// Count rendered number inputs.
const inputCount = await page.$$eval(
  'input[type="number"]',
  (els) => els.length,
);
console.log('number inputs rendered:', inputCount);

// Capture the chart's pixel signature before editing.
const before = await page.$eval(
  '.temperature-chart__canvas-wrap canvas',
  (c) => c.toDataURL().length,
);

// Change the first month (Jan) to a dramatic value and confirm the chart redraws.
const first = await page.$('input[type="number"]');
await first.click({ clickCount: 3 }); // select existing value
await first.type('40');
await new Promise((r) => setTimeout(r, 600));

const after = await page.$eval(
  '.temperature-chart__canvas-wrap canvas',
  (c) => c.toDataURL().length,
);

await page.screenshot({ path: '/tmp/golem-2-edited.png' });
console.log('shot 2 (Jan=40) saved');
console.log('chart canvas changed after edit:', before !== after);
console.log('console errors:', errors.length ? errors : 'none');

await browser.close();
