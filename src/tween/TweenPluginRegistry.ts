export interface TweenAdapter<T = any> {
  name: string;
  canHandle(value: any): boolean;
  clone(value: T): T;
  lerp(from: T, to: T, t: number, out?: T): T;
  add?(base: T, delta: T, out?: T): T;
  diff?(from: T, to: T, out?: T): T;
  multiply?(base: T, factor: number, out?: T): T;
  /** Combine concurrently evaluated values for blend/additive/multiply policies. */
  combine?(base: T, values: T[], mode: 'blend' | 'additive' | 'multiply', out?: T): T;
  isEqual?(a: T, b: T): boolean;
}

export class TweenPluginRegistry {
  private static adapters: TweenAdapter[] = [];

  static register(adapter: TweenAdapter): void {
    const existingIndex = TweenPluginRegistry.adapters.findIndex((a) => a.name === adapter.name);
    if (existingIndex >= 0) {
      TweenPluginRegistry.adapters[existingIndex] = adapter;
    } else {
      TweenPluginRegistry.adapters.unshift(adapter); // newer plugins get higher priority
    }
  }

  static findAdapter(value: any): TweenAdapter | null {
    if (value === null || value === undefined) return null;
    for (const adapter of TweenPluginRegistry.adapters) {
      if (adapter.canHandle(value)) {
        return adapter;
      }
    }
    return null;
  }

  static clear(): void {
    TweenPluginRegistry.adapters.length = 0;
  }
}
