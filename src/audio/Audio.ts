/**
 * Web Audio playback. Nothing plays before the first touch: the context is created
 * suspended and resumed inside the first pointer event. Buffers are decoded up front
 * from the inlined MP3s, the tab going hidden suspends everything, and a master gain
 * handles mute.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastPlay = new Map<string, number>();
  private readonly playing = new Map<string, Set<AudioBufferSourceNode>>();
  private unlocked = false;
  private paused = false;
  muted: boolean;

  constructor(private readonly urls: Map<string, string>, startMuted: boolean) {
    this.muted = startMuted;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = startMuted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'running') void this.ctx.suspend();
    } catch {
      this.ctx = null;
    }
    document.addEventListener('visibilitychange', () => this.sync());
  }

  async load(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      [...this.urls].map(async ([name, url]) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          this.buffers.set(name, await ctx.decodeAudioData(data));
        } catch (e) {
          console.warn('[audio] failed to decode', name, e);
        }
      }),
    );
  }

  /** Call from inside the first user gesture. */
  unlock(): void {
    if (this.unlocked || !this.ctx) return;
    this.unlocked = true;
    this.sync();
  }

  /** Ad containers pause the creative (MRAID viewability, app switch). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** Plays a one-shot. `minGap` rate-limits repeats of the same sound. */
  play(name: string, opts: { volume?: number; rate?: number; minGap?: number; delay?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = ctx.currentTime;
    if (now - (this.lastPlay.get(name) ?? -1) < (opts.minGap ?? 0.03)) return;
    this.lastPlay.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.master);
    let set = this.playing.get(name);
    if (!set) this.playing.set(name, (set = new Set()));
    set.add(src);
    src.onended = () => set.delete(src);
    src.start(now + (opts.delay ?? 0));
  }

  stopAll(name: string): void {
    const set = this.playing.get(name);
    if (!set) return;
    for (const src of set) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    set.clear();
  }

  private sync(): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked) return;
    if (document.hidden || this.paused) void ctx.suspend();
    else void ctx.resume();
  }
}
