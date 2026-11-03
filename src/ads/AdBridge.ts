interface MraidApi {
  getState(): string;
  open(url: string): void;
  addEventListener(event: string, listener: (...args: unknown[]) => void): void;
  isViewable?(): boolean;
}

interface ExitApi {
  exit(): void;
}

type AdWindow = Window & { mraid?: MraidApi; ExitApi?: ExitApi };

export type AdEnvironment = 'mraid' | 'google-exit-api' | 'demo';

/**
 * Thin adapter over ad-network container APIs. In production the CTA must
 * go through the SDK (MRAID `open`, Google `ExitApi.exit`); in a plain
 * browser (this portfolio demo) it only reports — no redirect.
 */
export class AdBridge {
  private readonly adWindow = window as AdWindow;

  get environment(): AdEnvironment {
    if (this.adWindow.mraid) return 'mraid';
    if (this.adWindow.ExitApi) return 'google-exit-api';
    return 'demo';
  }

  /** Resolves when the ad container says the creative is ready (immediately outside MRAID). */
  ready(): Promise<void> {
    const mraid = this.adWindow.mraid;
    if (!mraid || mraid.getState() !== 'loading') return Promise.resolve();
    return new Promise((resolve) => mraid.addEventListener('ready', () => resolve()));
  }

  /** Returns true when a real store redirect was requested. */
  openStore(url: string): boolean {
    try {
      switch (this.environment) {
        case 'mraid':
          this.adWindow.mraid?.open(url);
          return true;
        case 'google-exit-api':
          this.adWindow.ExitApi?.exit();
          return true;
        case 'demo':
          return false;
      }
    } catch (error) {
      console.warn('[ad] store redirect failed', error);
      return false;
    }
  }
}
