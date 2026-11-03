import './ui/styles.css';
import { AdBridge } from './ads/AdBridge';
import { Audio } from './audio/Audio';
import { CONFIG } from './config';
import { loadTextures, sounds } from './core/assets';
import { Stage, type View } from './core/Stage';
import { Game } from './game/Game';

function placeFrame(frame: HTMLElement, v: View): void {
  frame.style.left = `${v.frame.x}px`;
  frame.style.top = `${v.frame.y}px`;
  frame.style.width = `${v.frame.w}px`;
  frame.style.height = `${v.frame.h}px`;
  frame.style.fontSize = `${v.unit}px`;
  // Text elements set their own font-size, so they position themselves with --u (1 world unit in px).
  frame.style.setProperty('--u', `${v.unit}px`);
}

function showFallback(message: string): void {
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = `<p style="color:#fff;font:600 16px system-ui;text-align:center;padding:24px">${message}</p>`;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const frame = document.getElementById('frame') as HTMLElement;
  const bridge = new AdBridge();

  let stage: Stage;
  try {
    stage = new Stage(canvas, CONFIG.maxDpr);
  } catch (e) {
    console.error(e);
    showFallback('This playable needs WebGL.');
    return;
  }
  stage.onResize((v) => placeFrame(frame, v));

  const audio = new Audio(sounds, CONFIG.startMuted);
  const [textures] = await Promise.all([
    loadTextures(),
    audio.load(),
    document.fonts.load("72px 'Lilita One'").catch(() => undefined),
    bridge.ready(),
  ]);

  const game = new Game(stage, textures, audio, bridge, frame);

  const dev = CONFIG.dev ? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dev' })) : null;
  let devTimer = 0;
  let frames = 0;
  let worst = 0;

  // Adaptive resolution: if the device averages under ~42 fps, render fewer pixels.
  let slowTime = 0;
  let slowFrames = 0;

  let last = performance.now();
  const loop = (now: number) => {
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 1 / 20);
    game.update(dt);
    stage.render();

    if (raw < 0.25) {
      slowTime += raw;
      slowFrames++;
      if (slowTime > 2) {
        if (slowTime / slowFrames > 1 / 42 && stage.dpr > 1.05) stage.setMaxDpr(Math.max(1, stage.dpr - 0.5));
        slowTime = 0;
        slowFrames = 0;
      }
    }

    if (dev) {
      frames++;
      devTimer += raw;
      worst = Math.max(worst, raw);
      if (devTimer >= 0.5) {
        const info = stage.renderer.info.render;
        dev.textContent = `${Math.round(frames / devTimer)} fps  worst ${Math.round(worst * 1000)} ms\ncalls ${info.calls}  tris ${info.triangles}\ndpr ${stage.dpr.toFixed(2)}`;
        frames = 0;
        devTimer = 0;
        worst = 0;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  document.getElementById('boot')?.classList.add('is-done');
  (window as unknown as { __game: Game }).__game = game;
}

void boot();
