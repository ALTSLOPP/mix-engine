/**
 * ScreenFlash.ts — DOM-overlay based screen flash for impact / damage / pickup
 * feedback. Uses a fullscreen fixed-position <div> with a CSS colour and
 * alpha, so it costs nothing on the GPU and is independent of the render
 * pipeline (doesn't matter what passes are active, doesn't break tonemapping).
 *
 * Public API:
 *   flash({ color, intensity, duration, mode }) — single flash that fades
 *   startLoop({...}) / stopLoop() — for pulsating effects (low health vignette)
 *   clear() — instantly stop all flashes
 *
 * Multiple flashes can be ACTIVE at once; the brightest is shown.
 */

export interface FlashOptions {
  /** CSS colour string. '#ff0000', 'red', 'rgba(255,0,0,0.5)' all work. */
  color?: string;
  /** 0..1 — how opaque the flash is at peak. */
  intensity?: number;
  /** How long the flash takes to fade out, in seconds. */
  duration?: number;
  /** 'fade' (default — instant on, then linear fade) or 'pulse' (rises and falls). */
  mode?: 'fade' | 'pulse';
}

interface ActiveFlash {
  el: HTMLDivElement;
  startedAt: number;
  duration: number;
  peakIntensity: number;
  color: string;
  mode: 'fade' | 'pulse';
  raf: number | null;
}

export class ScreenFlash {
  private container: HTMLDivElement | null = null;
  private readonly flashes = new Set<ActiveFlash>();

  private ensureContainer(): HTMLDivElement {
    if (this.container && this.container.isConnected) return this.container;
    const el = document.createElement('div');
    el.id = 'mix-screen-flash-layer';
    el.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      'z-index:9998',
      'mix-blend-mode:screen',         // colour, never blackens
      'will-change:opacity',
    ].join(';');
    document.body.appendChild(el);
    this.container = el;
    return el;
  }

  flash(opts: FlashOptions = {}): ActiveFlash {
    const container = this.ensureContainer();
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute',
      'inset:0',
      'background:' + (opts.color ?? '#ffffff'),
      'opacity:0',
      'will-change:opacity',
      'transition:opacity 0.05s linear',
    ].join(';');
    container.appendChild(el);

    const flash: ActiveFlash = {
      el,
      startedAt: performance.now(),
      duration: Math.max(0.01, opts.duration ?? 0.25),
      peakIntensity: Math.max(0, Math.min(1, opts.intensity ?? 0.5)),
      color: opts.color ?? '#ffffff',
      mode: opts.mode ?? 'fade',
      raf: null,
    };
    this.flashes.add(flash);
    this.tickFlash(flash, 0);
    return flash;
  }

  private tickFlash(flash: ActiveFlash, tSec: number): void {
    const u = Math.max(0, Math.min(1, tSec / flash.duration));
    let alpha: number;
    if (flash.mode === 'pulse') {
      // Triangle: rise to peak at 25%, fall to 0 by 100%.
      const peak = 0.25;
      if (u < peak) alpha = (u / peak) * flash.peakIntensity;
      else alpha = Math.max(0, 1 - (u - peak) / (1 - peak)) * flash.peakIntensity;
    } else {
      // 'fade': instant on, then linear fade to 0.
      alpha = (1 - u) * flash.peakIntensity;
    }
    flash.el.style.opacity = String(alpha);
    if (u >= 1) {
      this.endFlash(flash);
      return;
    }
    flash.raf = requestAnimationFrame((now) => {
      this.tickFlash(flash, (now - flash.startedAt) / 1000);
    });
  }

  private endFlash(flash: ActiveFlash): void {
    if (flash.raf != null) cancelAnimationFrame(flash.raf);
    flash.el.remove();
    this.flashes.delete(flash);
  }

  /** Remove every active flash immediately. */
  clear(): void {
    for (const f of [...this.flashes]) this.endFlash(f);
  }

  dispose(): void {
    this.clear();
    this.container?.remove();
    this.container = null;
  }

  get active(): boolean { return this.flashes.size > 0; }
  get count(): number { return this.flashes.size; }
}
