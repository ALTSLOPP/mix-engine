import type { SceneManager } from '../ecs/SceneManager';

// ── Types ─────────────────────────────────────────────────────────────────

export interface HUDWidgetBase {
  id: string;
  /** Anchor point: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top' | 'bottom' | 'left' | 'right' */
  anchor: string;
  /** Offset from anchor in CSS px/directions. */
  offsetX?: number;
  offsetY?: number;
  /** Width/height in px (some widgets use defaults). */
  width?: number;
  height?: number;
  /** CSS color (default #fff). */
  color?: string;
  /** Opacity 0-1. */
  opacity?: number;
  /** Visible by default. */
  visible?: boolean;
  /** Refresh interval in frames (0 = every frame). */
  refreshInterval?: number;
  /** Event to emit when clicked (e.g., 'button_start'). */
  onClick?: string;
}

export interface HUDTextWidget extends HUDWidgetBase {
  type: 'text';
  /** Static text or a binding path like `{state.score}` or `{entity.123.hp}` */
  text: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  outline?: boolean;
}

export interface HUDBarWidget extends HUDWidgetBase {
  type: 'bar';
  /** Binding path for current value, e.g. `{entity.123.hp}` */
  value: string;
  /** Binding path for max value (default 100). */
  max?: string;
  /** Bar fill color. */
  fillColor?: string;
  /** Background color. */
  bgColor?: string;
  /** Show label text. */
  label?: string;
  /** Orientation. */
  orientation?: 'horizontal' | 'vertical';
}

export interface HUDPanelWidget extends HUDWidgetBase {
  type: 'panel';
  /** Background color. */
  bgColor?: string;
  /** Border color. */
  borderColor?: string;
  /** Border radius px. */
  borderRadius?: number;
  /** Child widgets (for grouping). */
  children?: HUDWidget[];
}

export interface HUDCrosshairWidget extends HUDWidgetBase {
  type: 'crosshair';
  /** Crosshair gap in px. */
  gap?: number;
  /** Crosshair thickness in px. */
  thickness?: number;
  /** Crosshair length in px. */
  length?: number;
  /** Dot in center. */
  dot?: boolean;
}

export interface HUDImageWidget extends HUDWidgetBase {
  type: 'image';
  /** URL of the image. */
  src: string;
  /** Whether to maintain aspect ratio. */
  maintainAspect?: boolean;
}

export type HUDWidget = HUDTextWidget | HUDBarWidget | HUDPanelWidget | HUDCrosshairWidget | HUDImageWidget;

export interface HUDLayout {
  widgets: HUDWidget[];
}

// ── Binding resolver ──────────────────────────────────────────────────────

type BindingSource = 'state' | 'entity';

function resolveBinding(path: string, sceneManager: SceneManager): string {
  // Pattern: {state.key} or {entity.id.field}
  return path.replace(/\{([^}]+)\}/g, (_, expr: string) => {
    const parts = expr.trim().split('.');
    if (parts[0] === 'state') {
      if (parts.length >= 2) {
        const val = sceneManager.gameState.getItem(parts.slice(1).join('.'));
        return val !== undefined ? String(val) : '0';
      }
    } else if (parts[0] === 'entity' && parts.length >= 3) {
      const entityId = parseInt(parts[1], 10);
      if (!isNaN(entityId)) {
        const field = parts.slice(2).join('.');
        if (field === 'hp') {
          const combat = (sceneManager as any).engine?.combat;
          const hp = combat?.getHealth(entityId);
          return hp !== undefined ? String(hp) : '0';
        }
        // Add more field resolvers as needed
      }
    }
    return expr;
  });
}

function resolveNumericBinding(path: string, sceneManager: SceneManager, def = 100): number {
  const resolved = resolveBinding(path, sceneManager);
  const n = parseFloat(resolved);
  return isNaN(n) ? def : n;
}

// ── HUD Engine ────────────────────────────────────────────────────────────

/**
 * HUD — Declarative screen-space UI overlay for the MIX Engine.
 *
 * Define a HUD layout as a JSON array of widgets. Each widget auto-updates
 * per frame, binding to PersistentGameState (`{state.score}`) or entity
 * properties (`{entity.42.hp}`).
 *
 * Widget types: text, bar, panel, crosshair, image.
 *
 * Usage from IDE:
 *   { "type": "hud_load", "layout": { "widgets": [...] } }
 *   { "type": "hud_show", "id": "..." }
 *   { "type": "hud_hide", "id": "..." }
 *   { "type": "hud_clear" }
 */
export class HUD {
  private readonly container: HTMLElement;
  private readonly widgetElements = new Map<string, HTMLElement>();
  private layout: HUDWidget[] = [];
  private frameCount = 0;
  private readonly sceneManager: SceneManager;

  constructor(sceneManager: SceneManager, container?: HTMLElement) {
    this.sceneManager = sceneManager;
    // Create or reuse the HUD overlay container.
    if (container) {
      this.container = container;
    } else {
      let el = document.getElementById('mix-hud-container');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mix-hud-container';
        el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5000;overflow:hidden;';
        document.body.appendChild(el);
      }
      this.container = el as HTMLDivElement;
    }
  }

  /** Load a new HUD layout (replaces previous). */
  load(layout: HUDLayout): void {
    this.clear();
    this.layout = layout.widgets;
    for (const widget of this.layout) {
      this.createElement(widget);
    }
  }

  /** Show a specific widget by id. */
  show(id: string): void {
    this.widgetElements.get(id)?.style.removeProperty('display');
  }

  /** Hide a specific widget by id. */
  hide(id: string): void {
    this.widgetElements.get(id)?.style.setProperty('display', 'none');
  }

  /** Remove all widgets. */
  clear(): void {
    this.layout = [];
    for (const el of this.widgetElements.values()) el.remove();
    this.widgetElements.clear();
  }

  /** Update properties of an existing widget dynamically. */
  updateWidget(id: string, props: Partial<HUDWidgetBase>): void {
    const idx = this.layout.findIndex(w => w.id === id);
    if (idx === -1) return;
    const oldWidget = this.layout[idx];
    const newWidget = { ...oldWidget, ...props } as HUDWidget;
    this.layout[idx] = newWidget;
    
    const oldEl = this.widgetElements.get(id);
    // Capture the parent id BEFORE removing oldEl — remove() disconnects it from its
    // parent, so reading parentElement after would always be null and reparent nested
    // widgets to the root overlay on every update.
    const parentId = oldEl?.parentElement?.dataset.hudId;
    if (oldEl) {
      oldEl.remove();
      this.widgetElements.delete(id);
    }
    
    const parentContainer = parentId ? this.widgetElements.get(parentId) : this.container;
    
    if (parentContainer) {
      const el = this.buildElement(newWidget);
      parentContainer.appendChild(el);
    }
  }

  /** Call each frame to update bindings. */
  update(): void {
    this.frameCount++;
    for (const widget of this.layout) {
      const el = this.widgetElements.get(widget.id);
      if (!el) continue;
      if (widget.refreshInterval && this.frameCount % widget.refreshInterval !== 0) continue;
      this.updateWidgetBindings(el, widget);
    }
  }

  // ── Widget creation ───────────────────────────────────────────────────

  private createElement(widget: HUDWidget): HTMLElement {
    const el = this.buildElement(widget);
    this.container.appendChild(el);
    return el;
  }

  private buildElement(widget: HUDWidget): HTMLElement {
    const el = document.createElement('div');
    el.id = `mix-hud-${widget.id}`;
    el.dataset.hudId = widget.id;
    el.style.position = 'absolute';
    el.style.color = widget.color ?? '#fff';
    if (widget.opacity !== undefined) el.style.opacity = String(widget.opacity);
    if (widget.visible === false) el.style.display = 'none';

    // Anchor positioning.
    const anchor = widget.anchor || 'top-left';
    const ox = widget.offsetX ?? 0;
    const oy = widget.offsetY ?? 0;
    if (anchor.includes('left')) el.style.left = `${ox}px`;
    if (anchor.includes('right')) el.style.right = `${ox}px`;
    if (anchor.includes('top')) el.style.top = `${oy}px`;
    if (anchor.includes('bottom')) el.style.bottom = `${oy}px`;
    if (anchor === 'center') {
      el.style.left = '50%';
      el.style.top = '50%';
      el.style.transform = 'translate(-50%, -50%)';
      // Offset via translate.
      if (ox || oy) el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    }

    this.applyWidgetStyle(el, widget);

    if (widget.onClick) {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sceneManager.events.emit(widget.onClick!, { widgetId: widget.id });
      });
    }

    this.widgetElements.set(widget.id, el);
    return el;
  }

  private applyWidgetStyle(el: HTMLElement, widget: HUDWidget): void {
    switch (widget.type) {
      case 'text':
        el.style.fontSize = `${widget.fontSize ?? 16}px`;
        el.style.fontFamily = widget.fontFamily ?? 'monospace';
        if (widget.bold) el.style.fontWeight = 'bold';
        if (widget.outline) el.style.textShadow = '0 0 4px #000, 0 0 8px #000';
        el.textContent = resolveBinding(widget.text, this.sceneManager);
        break;

      case 'bar': {
        el.style.width = `${widget.width ?? 200}px`;
        el.style.height = `${widget.height ?? 20}px`;
        el.style.background = widget.bgColor ?? 'rgba(0,0,0,0.5)';
        el.style.borderRadius = '4px';
        el.style.overflow = 'hidden';
        el.style.position = 'relative';

        const fill = document.createElement('div');
        fill.id = `mix-hud-${widget.id}-fill`;
        fill.style.height = '100%';
        fill.style.width = '100%';
        fill.style.background = widget.fillColor ?? '#00ff88';
        fill.style.transition = 'width 0.15s ease';
        fill.style.borderRadius = '4px';

        if (widget.orientation === 'vertical') {
          fill.style.width = '100%';
          fill.style.height = '100%';
          fill.style.alignSelf = 'flex-end';
        }

        const label = document.createElement('div');
        label.id = `mix-hud-${widget.id}-label`;
        label.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:11px;font-family:monospace;text-shadow:0 0 4px #000;';

        el.appendChild(fill);
        el.appendChild(label);
        break;
      }

      case 'panel':
        el.style.background = widget.bgColor ?? 'rgba(0,0,0,0.6)';
        el.style.border = widget.borderColor ? `1px solid ${widget.borderColor}` : 'none';
        el.style.borderRadius = `${widget.borderRadius ?? 8}px`;
        el.style.padding = '8px';
        el.style.width = `${widget.width ?? 200}px`;
        el.style.pointerEvents = 'auto';
        if (widget.children) {
          for (const child of widget.children) {
            const childEl = this.createElement(child);
            el.appendChild(childEl);
          }
        }
        break;

      case 'crosshair':
        el.style.width = '0';
        el.style.height = '0';
        el.style.position = 'absolute';

        const gap = widget.gap ?? 4;
        const thick = widget.thickness ?? 2;
        const len = widget.length ?? 12;
        const color = widget.color ?? '#fff';

        const makeLine = (x: number, y: number, w: number, h: number) => {
          const d = document.createElement('div');
          d.style.cssText = `position:absolute;background:${color};width:${w}px;height:${h}px;left:${x}px;top:${y}px;pointer-events:none;`;
          el.appendChild(d);
        };

        // Top, right, bottom, left
        makeLine(-thick / 2, -gap - len, thick, len);
        makeLine(gap, -thick / 2, len, thick);
        makeLine(-thick / 2, gap, thick, len);
        makeLine(-gap - len, -thick / 2, len, thick);

        if (widget.dot) {
          const dot = document.createElement('div');
          dot.style.cssText = `position:absolute;background:${color};width:${thick * 1.5}px;height:${thick * 1.5}px;border-radius:50%;left:${-thick * 0.75}px;top:${-thick * 0.75}px;`;
          el.appendChild(dot);
        }
        break;

      case 'image':
        el.style.width = `${widget.width ?? 64}px`;
        el.style.height = `${widget.height ?? 64}px`;
        el.style.backgroundImage = `url(${widget.src})`;
        el.style.backgroundSize = widget.maintainAspect ? 'contain' : 'cover';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        break;
    }
  }

  /** Per-frame update of widget content. */
  private updateWidgetBindings(el: HTMLElement, widget: HUDWidget): void {
    switch (widget.type) {
      case 'text':
        el.textContent = resolveBinding(widget.text, this.sceneManager);
        break;

      case 'bar': {
        const val = resolveNumericBinding(widget.value, this.sceneManager, 0);
        const max = widget.max ? resolveNumericBinding(widget.max, this.sceneManager, 100) : 100;
        const pct = max > 0 ? Math.min(100, Math.max(0, (val / max) * 100)) : 0;

        const fill = el.querySelector(`#mix-hud-${widget.id}-fill`) as HTMLElement | null;
        const label = el.querySelector(`#mix-hud-${widget.id}-label`) as HTMLElement | null;

        if (fill) {
          if (widget.orientation === 'vertical') {
            fill.style.height = `${pct}%`;
          } else {
            fill.style.width = `${pct}%`;
          }
        }
        if (label) {
          label.textContent = widget.label ? `${widget.label} ${Math.round(val)}/${Math.round(max)}` : `${Math.round(val)}/${Math.round(max)}`;
        }
        break;
      }

      case 'panel':
        if (widget.children) {
          for (const child of widget.children) {
            const childEl = this.widgetElements.get(child.id);
            if (childEl) this.updateWidgetBindings(childEl, child);
          }
        }
        break;

      default:
        break;
    }
  }

  dispose(): void {
    this.clear();
    this.container.remove();
  }
}
