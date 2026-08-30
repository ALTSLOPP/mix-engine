import type { Engine } from '../../engine/Engine';
import type {
  LocationVisitConfig,
  LocationVisitState,
  LocationVisitStatus,
  LocationVisitTemplate,
} from './types';

export const DEFAULT_LOCATION_VISIT_CONFIG: LocationVisitConfig = {
  enabled: true,
  templates: [],
};

export class LocationVisitSystem {
  private config: LocationVisitConfig;
  private readonly templates = new Map<string, LocationVisitTemplate>();
  private activeVisit: {
    templateId: string;
    contactId: string;
    status: LocationVisitStatus;
    invitationTimestamp: number;
    expiryTimestamp: number;
  } | null = null;

  constructor(private readonly engine: Engine, initialConfig: LocationVisitConfig = DEFAULT_LOCATION_VISIT_CONFIG) {
    this.config = { ...initialConfig };
    for (const t of this.config.templates) {
      this.templates.set(t.id, { ...t });
    }
  }

  setConfig(config: Partial<LocationVisitConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.templates) {
      for (const t of config.templates) {
        this.templates.set(t.id, { ...t });
      }
    }
  }

  getConfig(): Readonly<LocationVisitConfig> {
    return this.config;
  }

  registerTemplate(template: LocationVisitTemplate): void {
    this.templates.set(template.id, { ...template });
  }

  getTemplates(): readonly LocationVisitTemplate[] {
    return Array.from(this.templates.values());
  }

  offerInvitationForContact(contactId: string): boolean {
    const template = Array.from(this.templates.values()).find((t) => t.contactId === contactId);
    if (!template) return false;
    return this.offerInvitation(template.id);
  }

  offerInvitation(templateId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template) return false;

    const now = Date.now();
    const expiry = now + (template.expiryDurationGameHours ?? 4) * 3600 * 1000;

    this.activeVisit = {
      templateId,
      contactId: template.contactId,
      status: 'invitation_available',
      invitationTimestamp: now,
      expiryTimestamp: expiry,
    };

    this.engine.sceneManager?.events?.emit('location_visit_invitation_offered', {
      templateId,
      contactId: template.contactId,
      title: template.title,
      location: template.location,
    });
    return true;
  }

  acceptInvitation(): boolean {
    if (!this.activeVisit || this.activeVisit.status !== 'invitation_available') {
      return false;
    }

    const template = this.templates.get(this.activeVisit.templateId);
    if (!template) return false;

    this.activeVisit.status = 'travelling';

    // Register waypoint on minimap
    this.engine.gameplayFeatures?.radar?.registerMarker?.({
      id: `visit_${template.id}`,
      type: 'destination',
      position: { x: template.location.x, y: template.location.y, z: template.location.z } as any,
      label: template.title,
      visible: true,
    });

    this.engine.sceneManager?.events?.emit('location_visit_accepted', {
      templateId: template.id,
      contactId: template.contactId,
      location: template.location,
    });
    return true;
  }

  declineInvitation(): boolean {
    if (!this.activeVisit) return false;

    const templateId = this.activeVisit.templateId;
    const contactId = this.activeVisit.contactId;
    this.activeVisit.status = 'declined';
    this.activeVisit = null;

    this.engine.sceneManager?.events?.emit('location_visit_declined', { templateId, contactId });
    return true;
  }

  arriveAtLocation(): boolean {
    if (!this.activeVisit || this.activeVisit.status !== 'travelling') {
      return false;
    }

    const template = this.templates.get(this.activeVisit.templateId);
    if (!template) return false;

    this.activeVisit.status = 'arrived';
    this.engine.sceneManager?.events?.emit('location_visit_arrived', {
      templateId: template.id,
      contactId: template.contactId,
    });
    return true;
  }

  completeVisit(): boolean {
    if (!this.activeVisit || (this.activeVisit.status !== 'arrived' && this.activeVisit.status !== 'travelling')) {
      return false;
    }

    const template = this.templates.get(this.activeVisit.templateId);
    if (!template) return false;

    this.engine.gameplayFeatures?.radar?.unregisterMarker?.(`visit_${template.id}`);
    this.activeVisit.status = 'completed';

    this.engine.sceneManager?.events?.emit('location_visit_completed', {
      templateId: template.id,
      contactId: template.contactId,
      completionEvent: template.completionEvent,
    });

    this.activeVisit = null;
    return true;
  }

  getState(): LocationVisitState {
    return {
      activeVisit: this.activeVisit ? { ...this.activeVisit } : null,
    };
  }

  clear(): void {
    this.activeVisit = null;
  }

  dispose(): void {
    this.clear();
  }

  toJSON(): Record<string, unknown> {
    return {
      activeVisit: this.activeVisit ? { ...this.activeVisit } : null,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (data.activeVisit && typeof data.activeVisit === 'object') {
      this.activeVisit = { ...(data.activeVisit as any) };
    } else {
      this.activeVisit = null;
    }
  }
}
