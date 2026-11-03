// Scripted playthrough in headless Chrome: plays the playable from the first tap to the
// end card, saves a screenshot at every beat and reports console errors, external
// requests and frame times.
// Usage: node tools/playthrough.mjs [url] [WxH] [dpr] [outDir] [cpuThrottle]
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:5191/', size = '390x844', dprArg = '2', out = 'qa', cpuArg = '1'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const dpr = Number(dprArg);
const cpu = Number(cpuArg);
mkdirSync(out, { recursive: true });

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: width < height, hasTouch: true });

const errors = [];
const external = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  const u = r.url();
  // Antivirus suites inject their own scripts into local pages; those are not the playable's requests.
  if (u.includes('kaspersky-labs.com')) return;
  if (!u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith(new URL(url).origin)) external.push(u);
});

const cdp = await page.createCDPSession();
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

await page.evaluateOnNewDocument(() => {
  const w = window;
  w.__frames = [];
  let last = 0;
  const tick = (t) => {
    if (last) w.__frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('is-done'), { timeout: 20000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// SHOTS=0 skips screenshots, which stall the page and would pollute the frame-time numbers.
const SHOTS = process.env.SHOTS !== '0';
const shot = (name) => (SHOTS ? page.screenshot({ path: `${out}/${name}.png` }) : Promise.resolve());
const state = () =>
  page.evaluate(() => {
    const g = window.__game;
    return { state: g.state, monsterHp: g.monsterHp, playerHp: g.playerHp, arrows: g.arrows, souls: g.soulCount, hits: g.hits };
  });
const tap = async (x = width / 2, y = height * 0.82, hold = 70) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await sleep(hold);
  await page.mouse.up();
};

await sleep(1300);
// No sound may play before the first touch: the audio context must still be suspended.
const audioBeforeTap = await page.evaluate(() => window.__game.audio.ctx?.state ?? 'none');
if (audioBeforeTap === 'running') errors.push('audio context running before the first tap');
const handBeforeTap = await page.evaluate(() => document.querySelector('.hand')?.classList.contains('is-visible'));
if (!handBeforeTap) errors.push('tutorial hand not visible before the first tap');
await shot('01-intro-hand');

// Shoot until the monster charges its attack, then keep shooting through the laser.
const log = [];
let charged = false;
let fired = false;
for (let i = 0; i < 80; i++) {
  const s = await state();
  log.push(s);
  if (s.state !== 'play' && s.state !== 'intro') break;
  if (i === 1) await shot('02-first-hit');
  const attack = await page.evaluate(() => window.__game.attack.phase);
  if (!charged && attack === 'charge') {
    charged = true;
    await sleep(900);
    await shot('03-charging');
  }
  if (!fired && attack === 'fire') {
    fired = true;
    await sleep(500);
    await shot('04-laser');
  }
  await tap();
  await sleep(i < 2 ? 380 : Number(process.env.TAP_MS ?? 280));
}
await sleep(450);
await shot('05-dying');
await sleep(900);
await shot('06-souls');
await page.waitForFunction(() => window.__game.state === 'end', { timeout: 12000 }).catch(() => errors.push('never reached the end card'));
await sleep(1600);
await shot('07-endcard');
const card = await page.$('.card');
if (card) await card.click();
await sleep(1100);
await shot('08-upgrade');
const cta = await page.$('.end__cta');
if (cta) await cta.click();
await sleep(400);
await shot('09-cta');
const replay = await page.$('.end__replay');
if (replay) await replay.click();
await sleep(1300);
await shot('10-replay');
const after = await state();

const frames = await page.evaluate(() => window.__frames.slice(30));
frames.sort((a, b) => a - b);
const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
const p = (q) => frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] ?? 0;
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(JSON.stringify({
  gpu,
  audioBeforeTap,
  viewport: `${width}x${height}@${dpr}`,
  cpuThrottle: cpu,
  shots: log.length,
  final: log.at(-1),
  afterReplay: after,
  fpsAvg: Math.round(1000 / avg),
  frameP50: p(0.5).toFixed(1),
  frameP99: p(0.99).toFixed(1),
  worstFrame: (frames.at(-1) ?? 0).toFixed(1),
  over50ms: frames.filter((f) => f > 50).length,
  over100ms: frames.filter((f) => f > 100).length,
  errors,
  external,
}, null, 2));
await browser.close();
