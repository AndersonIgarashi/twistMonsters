import type { Texture } from 'three';
import type { Stage, View } from '../core/Stage';
import { SpriteBatch } from '../gfx/SpriteBatch';

/** Background.png and DarknessBack.png are 2902 x 1280 px at scale (1, 0.9) and (1, 0.8). */
const BG_W = 29.02;
const BG_H = 11.52;
const DARK_W = 29.02;
const DARK_TOP_H = 2.416;
const DARK_BOTTOM_H = 0.96;
/** The scene tints both layers with this colour. */
const TINT = [0.59, 0.81, 1.0] as const;
const PAN_PERIOD = 26;

/** Spiked seed pods hanging from the darkness: [x, y from the band edge, rotation deg, scale x, scale y, top band?]. */
const PODS: readonly (readonly [number, number, number, number, number, boolean])[] = [
  [-7.33, -1.06, -5, 0.37, 0.46, true],
  [-2.07, -1.61, 6.3, 0.5, 0.62, true],
  [4.75, -1.53, 30.7, 0.33, 0.41, true],
  [2.25, -0.31, 176, 0.33, 0.42, false],
  [-3.78, -0.03, 116.2, 0.33, 0.42, false],
  [9.6, -1.3, -12, 0.42, 0.52, true],
  [-11.2, -1.4, 14, 0.4, 0.5, true],
];
const POD_W = 2.98;
const POD_H = 3.0;

export class Background {
  private readonly bg: SpriteBatch;
  private readonly darkTop: SpriteBatch;
  private readonly darkBottom: SpriteBatch;
  private readonly pods: SpriteBatch;
  private view!: View;
  private scale = 1;
  private pan = 0;

  constructor(stage: Stage, tex: Record<'bg' | 'darkTop' | 'darkBottom' | 'spikeball', Texture>) {
    this.bg = new SpriteBatch({ texture: tex.bg, capacity: 1, order: 0, opaque: true });
    this.darkTop = new SpriteBatch({ texture: tex.darkTop, capacity: 1, order: 1 });
    this.darkBottom = new SpriteBatch({ texture: tex.darkBottom, capacity: 1, order: 1 });
    this.pods = new SpriteBatch({ texture: tex.spikeball, capacity: PODS.length, order: 2, cols: 3, rows: 3 });
    stage.scene.add(this.bg.mesh, this.darkTop.mesh, this.darkBottom.mesh, this.pods.mesh);
    stage.onResize((view) => {
      this.view = view;
      // Cover the view, with room left over to pan across the nebula.
      this.scale = Math.max(1, view.h / BG_H, (view.w + 4) / BG_W);
      this.pan = Math.max(0, Math.min(10.9, (BG_W * this.scale - view.w) / 2 - 0.05));
    });
  }

  update(time: number): void {
    const v = this.view;
    const s = this.scale;
    const x = Math.sin((time / PAN_PERIOD) * Math.PI * 2) * this.pan;
    this.bg.begin();
    this.bg.push(x, 0, 0, BG_W * s, BG_H * s, 0, TINT[0], TINT[1], TINT[2], 1);
    this.bg.commit();

    // The darkness moves at half speed for a little parallax and is pinned to the screen edges.
    const dx = x * 0.5;
    const top = v.h / 2 + 0.02;
    const bottom = -v.h / 2 - 0.02;
    this.darkTop.begin();
    this.darkTop.push(dx, top - (DARK_TOP_H * s) / 2, 0, DARK_W * s, DARK_TOP_H * s, 0, 0, 0, 0, 1);
    this.darkTop.commit();
    this.darkBottom.begin();
    this.darkBottom.push(dx, bottom + (DARK_BOTTOM_H * s) / 2, 0, DARK_W * s, DARK_BOTTOM_H * s, 0, 0, 0, 0, 1);
    this.darkBottom.commit();

    const frame = Math.floor(time * 12) % 9;
    this.pods.begin();
    for (let i = 0; i < PODS.length; i++) {
      const pod = PODS[i];
      const y = (pod[5] ? top : bottom) + pod[1] * s;
      this.pods.push(dx + pod[0] * s, y, (pod[2] * Math.PI) / 180, POD_W * pod[3] * s, POD_H * pod[4] * s, (frame + i * 2) % 9, 0, 0, 0, 1);
    }
    this.pods.commit();
  }
}
