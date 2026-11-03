// Screenshots the gameplay and the end card at the aspect ratios ad networks serve,
// plus a live resize, and reports console errors.
// Usage: node tools/layouts.mjs [url] [outDir]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:5191/', out = 'qa-layouts'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SIZES = [
  ['540x910', 540, 910, 1],
  ['tall-9x19.5', 390, 844, 2],
  ['tablet-3x4', 768, 1024, 1],
  ['desktop-wide', 1920, 1080, 1],
  ['landscape-phone', 844, 390, 2],
];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, width, height, dpr] of SIZES) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: width < height, hasTouch: true });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'));
  await sleep(1200);
  await page.screenshot({ path: `${out}/${name}-play.png` });
  await page.evaluate(() => {
    const g = window.__game;
    g.state = 'play';
    g.monsterHp = 0;
    g.win();
  });
  await page.waitForFunction(() => window.__game.state === 'end', { timeout: 10000 });
  await sleep(1700);
  await page.screenshot({ path: `${out}/${name}-end.png` });
  await page.close();
}

// Live resize: portrait to landscape and back while playing.
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`resize: ${e.message}`));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'));
for (const [w, h] of [[844, 390], [600, 600], [1280, 720], [390, 844]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await sleep(300);
}
await page.screenshot({ path: `${out}/resize-back.png` });
await browser.close();
console.log(JSON.stringify({ errors }, null, 2));
