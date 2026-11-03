import type { Mesh, ShaderMaterial, Texture } from 'three';
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
  // Upload every texture and compile the shader while the boot screen is still up, so the
  // first hit, laser or soul burst doesn't stall on a lazy GPU upload.
  stage.scene.traverse((o) => {
    o.visible = true;
    const map = ((o as Mesh).material as ShaderMaterial | undefined)?.uniforms?.uMap?.value as Texture | undefined;
    if (map) stage.renderer.initTexture(map);
  });
  stage.renderer.compile(stage.scene, stage.camera);
  stage.render();
  let viewable = true;
  bridge.onViewableChange((v) => {
    viewable = v;
    audio.setPaused(!v);
  });

  const dev = CONFIG.dev ? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dev' })) : null;
  let devTimer = 0;
  let frames = 0;
  let worst = 0;

  // Adaptive resolution: if the device averages under ~42 fps, render fewer pixels.
  let slowTime = 0;
  let slowFrames = 0;

  // Stop the loop while the page is hidden (rAF throttling alone still runs a few frames).
  let running = true;
  let last = performance.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  });
  const loop = (now: number) => {
    if (!running) return;
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 1 / 20);
    if (viewable) {
      game.update(dt);
      stage.render();
    }

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

  const bootEl = document.getElementById('boot');
  bootEl?.addEventListener('transitionend', () => bootEl.remove(), { once: true });
  bootEl?.classList.add('is-done');
  (window as unknown as { __game: Game }).__game = game;
}

void boot();
