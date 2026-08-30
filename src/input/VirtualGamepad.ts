export interface VirtualStickState {
  active: boolean;
  touchId: number | null;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  vectorX: number; // -1 to +1
  vectorY: number; // -1 to +1
}

export interface VirtualButtonConfig {
  name: string;
  x: number;
  y: number;
  radius: number;
}

/**
 * VirtualGamepad.ts — Mobile and touchscreen virtual joystick and action button overlay.
 */
export class VirtualGamepad {
  readonly stick: VirtualStickState = {
    active: false,
    touchId: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    vectorX: 0,
    vectorY: 0,
  };

  private readonly maxRadius: number;
  private readonly buttons = new Map<string, { config: VirtualButtonConfig; pressed: boolean; touchId: number | null }>();

  constructor(maxRadius = 50) {
    this.maxRadius = maxRadius;
  }

  /** Register an on-screen touch button (e.g. 'Jump', 'Attack'). */
  addButton(name: string, x: number, y: number, radius = 30): void {
    this.buttons.set(name, {
      config: { name, x, y, radius },
      pressed: false,
      touchId: null,
    });
  }

  /** Process touch start event. */
  handleTouchStart(touchId: number, x: number, y: number, isLeftHalfScreen = true): boolean {
    // 1. Check buttons first
    for (const btn of this.buttons.values()) {
      const dist = Math.hypot(x - btn.config.x, y - btn.config.y);
      if (dist <= btn.config.radius) {
        btn.pressed = true;
        btn.touchId = touchId;
        return true;
      }
    }

    // 2. Otherwise left screen side acts as floating thumbstick
    if (isLeftHalfScreen && !this.stick.active) {
      this.stick.active = true;
      this.stick.touchId = touchId;
      this.stick.originX = x;
      this.stick.originY = y;
      this.stick.currentX = x;
      this.stick.currentY = y;
      this.stick.vectorX = 0;
      this.stick.vectorY = 0;
      return true;
    }

    return false;
  }

  /** Process touch move event. */
  handleTouchMove(touchId: number, x: number, y: number): void {
    if (this.stick.active && this.stick.touchId === touchId) {
      this.stick.currentX = x;
      this.stick.currentY = y;

      const dx = x - this.stick.originX;
      const dy = y - this.stick.originY;
      const dist = Math.hypot(dx, dy);

      if (dist > 0) {
        const clampedDist = Math.min(dist, this.maxRadius);
        this.stick.vectorX = (dx / dist) * (clampedDist / this.maxRadius);
        this.stick.vectorY = (dy / dist) * (clampedDist / this.maxRadius);
      } else {
        this.stick.vectorX = 0;
        this.stick.vectorY = 0;
      }
    }
  }

  /** Process touch end event. */
  handleTouchEnd(touchId: number): void {
    if (this.stick.active && this.stick.touchId === touchId) {
      this.stick.active = false;
      this.stick.touchId = null;
      this.stick.vectorX = 0;
      this.stick.vectorY = 0;
    }

    for (const btn of this.buttons.values()) {
      if (btn.touchId === touchId) {
        btn.pressed = false;
        btn.touchId = null;
      }
    }
  }

  getStickVector(): { x: number; y: number } {
    return { x: this.stick.vectorX, y: this.stick.vectorY };
  }

  isButtonPressed(name: string): boolean {
    return !!this.buttons.get(name)?.pressed;
  }
}
