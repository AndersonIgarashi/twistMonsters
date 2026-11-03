import { LinearSRGBColorSpace, OrthographicCamera, Scene, WebGLRenderer } from 'three';

/** The original game's portrait frame in Unity units (orthographic size 5), plus a hair of side margin for the HUD bars. */
export const DESIGN_W = 5.8;
export const DESIGN_H = 10;

export interface View {
  /** Visible world size in units. */
  w: number;
  h: number;
  /** CSS pixels per world unit. */
  unit: number;
  /** The design frame in CSS pixels. */
  frame: { x: number; y: number; w: number; h: number };
  cssW: number;
  cssH: number;
}

/**
 * Renderer, orthographic camera and resize handling. The camera always contains the
 * 5.8 x 10 design frame: tall phones see more sky and darkness above and below, wide
 * screens see more of the nebula on the sides, and gameplay never changes size relative to the HUD.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  readonly view: View = { w: DESIGN_W, h: DESIGN_H, unit: 1, frame: { x: 0, y: 0, w: 0, h: 0 }, cssW: 0, cssH: 0 };
  private maxDpr: number;
  private readonly listeners: ((view: View) => void)[] = [];
  shakeX = 0;
  shakeY = 0;

  constructor(readonly canvas: HTMLCanvasElement, maxDpr: number) {
    this.maxDpr = maxDpr;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x6da6ff, 1);
    this.renderer.sortObjects = true;
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    this.resize();
  }

  onResize(fn: (view: View) => void): void {
    this.listeners.push(fn);
    fn(this.view);
  }

  /** Lowers the render resolution when the device can't keep up (see the frame-time monitor in main.ts). */
  setMaxDpr(dpr: number): void {
    if (dpr >= this.maxDpr) return;
    this.maxDpr = dpr;
    this.resize();
  }

  get dpr(): number {
    return this.renderer.getPixelRatio();
  }

  resize(): void {
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH);

    const aspect = cssW / cssH;
    const v = this.view;
    if (aspect < DESIGN_W / DESIGN_H) {
      v.w = DESIGN_W;
      v.h = DESIGN_W / aspect;
    } else {
      v.h = DESIGN_H;
      v.w = DESIGN_H * aspect;
    }
    v.unit = cssH / v.h;
    v.cssW = cssW;
    v.cssH = cssH;
    v.frame.w = DESIGN_W * v.unit;
    v.frame.h = DESIGN_H * v.unit;
    v.frame.x = (cssW - v.frame.w) / 2;
    v.frame.y = (cssH - v.frame.h) / 2;
    this.applyCamera();
    for (const fn of this.listeners) fn(v);
  }

  applyCamera(): void {
    const v = this.view;
    const c = this.camera;
    c.left = -v.w / 2 + this.shakeX;
    c.right = v.w / 2 + this.shakeX;
    c.top = v.h / 2 + this.shakeY;
    c.bottom = -v.h / 2 + this.shakeY;
    c.updateProjectionMatrix();
  }

  /** World units to CSS pixels (relative to the viewport). */
  toScreen(x: number, y: number, out: { x: number; y: number }): void {
    out.x = (x + this.view.w / 2) * this.view.unit;
    out.y = (this.view.h / 2 - y) * this.view.unit;
  }

  /** CSS pixels to world units. */
  toWorld(px: number, py: number, out: { x: number; y: number }): void {
    out.x = px / this.view.unit - this.view.w / 2;
    out.y = this.view.h / 2 - py / this.view.unit;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
