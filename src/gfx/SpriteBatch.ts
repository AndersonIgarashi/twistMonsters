import {
  AdditiveBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
} from 'three';

const plane = new PlaneGeometry(1, 1);

const vertexShader = /* glsl */ `
  attribute vec4 aColor;
  attribute float aFrame;
  uniform vec2 uGrid;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float f = floor(aFrame + 0.5);
    float col = mod(f, uGrid.x);
    float row = floor(f / uGrid.x);
    vUv = (vec2(col, uGrid.y - 1.0 - row) + uv) / uGrid;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
  }
`;

export interface BatchOptions {
  texture: Texture;
  capacity: number;
  order: number;
  cols?: number;
  rows?: number;
  additive?: boolean;
}

/**
 * One draw call for any number of sprites that share a texture (or sprite sheet).
 * Immediate mode: callers `begin()`, `push()` what is visible this frame, then `commit()`.
 * Everything is written into preallocated typed arrays, so a frame allocates nothing.
 */
export class SpriteBatch {
  readonly mesh: InstancedMesh;
  readonly frames: number;
  private readonly matrix: Float32Array;
  private readonly color: Float32Array;
  private readonly frame: Float32Array;
  private readonly colorAttr: InstancedBufferAttribute;
  private readonly frameAttr: InstancedBufferAttribute;
  private count = 0;

  constructor(opts: BatchOptions) {
    const cols = opts.cols ?? 1;
    const rows = opts.rows ?? 1;
    this.frames = cols * rows;
    const material = new ShaderMaterial({
      uniforms: { uMap: { value: opts.texture }, uGrid: { value: [cols, rows] } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
    });
    this.mesh = new InstancedMesh(plane, material, opts.capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.order;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.matrix = this.mesh.instanceMatrix.array as Float32Array;
    this.color = new Float32Array(opts.capacity * 4);
    this.frame = new Float32Array(opts.capacity);
    this.colorAttr = new InstancedBufferAttribute(this.color, 4).setUsage(DynamicDrawUsage);
    this.frameAttr = new InstancedBufferAttribute(this.frame, 1).setUsage(DynamicDrawUsage);
    // Each batch owns its instance attributes, so it gets its own copy of the 4-vertex plane.
    const geometry = plane.clone();
    geometry.setAttribute('aColor', this.colorAttr);
    geometry.setAttribute('aFrame', this.frameAttr);
    this.mesh.geometry = geometry;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  /** Pushes one sprite: centre, rotation (radians), size in world units, sheet frame and RGBA tint. */
  push(x: number, y: number, rot: number, w: number, h: number, frame = 0, r = 1, g = 1, b = 1, a = 1): void {
    const i = this.count;
    if (i >= this.mesh.instanceMatrix.count || a <= 0.001) return;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const m = this.matrix;
    const o = i * 16;
    m[o] = c * w;
    m[o + 1] = s * w;
    m[o + 2] = 0;
    m[o + 3] = 0;
    m[o + 4] = -s * h;
    m[o + 5] = c * h;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = 0;
    m[o + 9] = 0;
    m[o + 10] = 1;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = 0;
    m[o + 15] = 1;
    const q = i * 4;
    this.color[q] = r;
    this.color[q + 1] = g;
    this.color[q + 2] = b;
    this.color[q + 3] = a;
    this.frame[i] = frame;
    this.count = i + 1;
  }

  commit(): void {
    const n = this.count;
    this.mesh.count = n;
    if (n === 0) return;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, n * 16);
    im.needsUpdate = true;
    this.colorAttr.clearUpdateRanges();
    this.colorAttr.addUpdateRange(0, n * 4);
    this.colorAttr.needsUpdate = true;
    this.frameAttr.clearUpdateRanges();
    this.frameAttr.addUpdateRange(0, n);
    this.frameAttr.needsUpdate = true;
  }
}
