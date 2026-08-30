import type { Engine } from '../../engine/Engine';
import type { PhoneAppDefinition, PhoneShellConfig, PhoneShellState } from './types';

export const DEFAULT_PHONE_SHELL_CONFIG: PhoneShellConfig = {
  enabled: true,
  openKey: 'KeyP',
  allowWhileDriving: true,
  soundOpen: '/assets/audio/phone_open.wav',
  soundClose: '/assets/audio/phone_close.wav',
};

export class PhoneShellSystem {
  private config: PhoneShellConfig;
  private isOpen = false;
  private activeAppId: string | null = null;
  private readonly registeredApps = new Map<string, PhoneAppDefinition>();

  constructor(private readonly engine: Engine, initialConfig: PhoneShellConfig = DEFAULT_PHONE_SHELL_CONFIG) {
    this.config = { ...initialConfig };
    this.registerDefaultApps();
  }

  private registerDefaultApps(): void {
    this.registerApp({ id: 'messages', name: 'Messages', icon: '💬', badgeCount: 0 });
    this.registerApp({ id: 'contacts', name: 'Contacts', icon: '👥', badgeCount: 0 });
    this.registerApp({ id: 'services', name: 'Services', icon: '⭐', badgeCount: 0 });
  }

  registerApp(app: PhoneAppDefinition): void {
    this.registeredApps.set(app.id, { ...app });
  }

  getApps(): readonly PhoneAppDefinition[] {
    return Array.from(this.registeredApps.values());
  }

  setConfig(config: Partial<PhoneShellConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled && this.isOpen) {
      this.closePhone();
    }
  }

  getConfig(): Readonly<PhoneShellConfig> {
    return this.config;
  }

  get isPhoneOpen(): boolean {
    return this.isOpen;
  }

  get currentApp(): string | null {
    return this.activeAppId;
  }

  togglePhone(): boolean {
    if (this.isOpen) {
      this.closePhone();
      return false;
    } else {
      return this.openPhone();
    }
  }

  openPhone(): boolean {
    if (!this.config.enabled) return false;

    this.isOpen = true;
    this.activeAppId = this.activeAppId ?? 'messages';

    // Trap gameplay input
    (this.engine.player as any)?.setInputLocked?.(true);
    this.engine.sceneManager?.events?.emit('phone_opened', { activeAppId: this.activeAppId });
    return true;
  }

  closePhone(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    (this.engine.player as any)?.setInputLocked?.(false);
    this.engine.sceneManager?.events?.emit('phone_closed', {});
  }

  openApp(appId: string): boolean {
    if (!this.registeredApps.has(appId)) return false;
    this.activeAppId = appId;
    if (!this.isOpen) this.openPhone();
    this.engine.sceneManager?.events?.emit('phone_app_switched', { appId });
    return true;
  }

  setAppBadge(appId: string, count: number): void {
    const app = this.registeredApps.get(appId);
    if (app) {
      app.badgeCount = Math.max(0, count);
    }
  }

  getState(): PhoneShellState {
    let totalUnread = 0;
    for (const app of this.registeredApps.values()) {
      totalUnread += app.badgeCount ?? 0;
    }

    return {
      isOpen: this.isOpen,
      activeAppId: this.activeAppId,
      unreadCount: totalUnread,
    };
  }

  clear(): void {
    if (this.isOpen) this.closePhone();
    this.activeAppId = null;
  }

  dispose(): void {
    this.clear();
  }
}
