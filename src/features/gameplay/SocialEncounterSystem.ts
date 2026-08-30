import type { Engine } from '../../engine/Engine';
import type {
  SocialEncounterConfig,
  SocialEncounterState,
  SocialEncounterStatus,
  SocialEncounterTemplate,
} from './types';

export const DEFAULT_SOCIAL_ENCOUNTER_CONFIG: SocialEncounterConfig = {
  enabled: true,
  templates: [],
};

export class SocialEncounterSystem {
  private config: SocialEncounterConfig;
  private readonly templates = new Map<string, SocialEncounterTemplate>();
  private activeEncounter: {
    templateId: string;
    contactId: string;
    status: SocialEncounterStatus;
    scheduledGameHour: number;
    currentActivityIndex: number;
    accumulatedScore: number;
    elapsedSeconds: number;
  } | null = null;

  constructor(private readonly engine: Engine, initialConfig: SocialEncounterConfig = DEFAULT_SOCIAL_ENCOUNTER_CONFIG) {
    this.config = { ...initialConfig };
    for (const t of this.config.templates) {
      this.templates.set(t.id, { ...t });
    }
  }

  setConfig(config: Partial<SocialEncounterConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.templates) {
      for (const t of config.templates) {
        this.templates.set(t.id, { ...t });
      }
    }
  }

  getConfig(): Readonly<SocialEncounterConfig> {
    return this.config;
  }

  registerTemplate(template: SocialEncounterTemplate): void {
    this.templates.set(template.id, { ...template });
  }

  getTemplate(templateId: string): SocialEncounterTemplate | undefined {
    return this.templates.get(templateId);
  }

  getTemplates(): readonly SocialEncounterTemplate[] {
    return Array.from(this.templates.values());
  }

  inviteToEncounter(templateId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template || this.activeEncounter !== null) return false;

    this.activeEncounter = {
      templateId,
      contactId: template.contactId,
      status: 'invited',
      scheduledGameHour: template.timeWindowHours.startHour,
      currentActivityIndex: 0,
      accumulatedScore: 0,
      elapsedSeconds: 0,
    };

    this.engine.sceneManager?.events?.emit('social_encounter_invited', {
      templateId,
      contactId: template.contactId,
      title: template.title,
    });
    return true;
  }

  acceptInvitation(scheduledHour?: number): boolean {
    if (!this.activeEncounter || this.activeEncounter.status !== 'invited') return false;

    const template = this.templates.get(this.activeEncounter.templateId);
    if (!template) return false;

    this.activeEncounter.status = 'scheduled';
    if (scheduledHour !== undefined) {
      this.activeEncounter.scheduledGameHour = scheduledHour;
    }

    // Register destination marker on minimap
    this.engine.gameplayFeatures?.radar?.registerMarker?.({
      id: `encounter_${template.id}`,
      type: 'destination',
      position: { x: template.meetingLocation.x, y: template.meetingLocation.y, z: template.meetingLocation.z } as any,
      label: template.title,
      visible: true,
    });

    this.engine.sceneManager?.events?.emit('social_encounter_scheduled', {
      templateId: template.id,
      contactId: template.contactId,
      scheduledHour: this.activeEncounter.scheduledGameHour,
      location: template.meetingLocation,
    });
    return true;
  }

  declineInvitation(): boolean {
    if (!this.activeEncounter) return false;

    const templateId = this.activeEncounter.templateId;
    const contactId = this.activeEncounter.contactId;
    this.activeEncounter.status = 'declined';
    this.activeEncounter = null;

    this.engine.sceneManager?.events?.emit('social_encounter_declined', { templateId, contactId });
    return true;
  }

  startEncounter(): boolean {
    if (!this.activeEncounter || (this.activeEncounter.status !== 'scheduled' && this.activeEncounter.status !== 'invited')) {
      return false;
    }

    const template = this.templates.get(this.activeEncounter.templateId);
    if (!template) return false;

    this.activeEncounter.status = 'active';
    this.activeEncounter.currentActivityIndex = 0;

    this.engine.sceneManager?.events?.emit('social_encounter_started', {
      templateId: template.id,
      contactId: template.contactId,
      activity: template.activities[0] ?? null,
    });
    return true;
  }

  advanceActivity(scoreDelta = 25): boolean {
    if (!this.activeEncounter || (this.activeEncounter.status !== 'active' && this.activeEncounter.status !== 'activity_progress')) {
      return false;
    }

    const template = this.templates.get(this.activeEncounter.templateId);
    if (!template) return false;

    this.activeEncounter.accumulatedScore += scoreDelta;
    this.activeEncounter.currentActivityIndex++;

    if (this.activeEncounter.currentActivityIndex >= template.activities.length) {
      // Evaluate outcome
      const succeeded = this.activeEncounter.accumulatedScore >= template.minSuccessScore;
      this.activeEncounter.status = succeeded ? 'succeeded' : 'failed';

      this.engine.gameplayFeatures?.radar?.unregisterMarker?.(`encounter_${template.id}`);

      this.engine.sceneManager?.events?.emit('social_encounter_evaluated', {
        templateId: template.id,
        contactId: template.contactId,
        succeeded,
        totalScore: this.activeEncounter.accumulatedScore,
      });

      // If succeeded and allowed, trigger location visit invitation availability
      if (succeeded && template.allowHomeVisitOnSuccess) {
        this.engine.gameplayFeatures?.locationVisits?.offerInvitationForContact(template.contactId);
      }

      this.activeEncounter.status = 'completed';
      return true;
    } else {
      this.activeEncounter.status = 'activity_progress';
      const nextActivity = template.activities[this.activeEncounter.currentActivityIndex];
      this.engine.sceneManager?.events?.emit('social_encounter_activity_advanced', {
        templateId: template.id,
        activity: nextActivity,
      });
      return false;
    }
  }

  cancelEncounter(): void {
    if (!this.activeEncounter) return;
    const templateId = this.activeEncounter.templateId;
    this.engine.gameplayFeatures?.radar?.unregisterMarker?.(`encounter_${templateId}`);
    this.activeEncounter.status = 'cancelled';
    this.activeEncounter = null;
    this.engine.sceneManager?.events?.emit('social_encounter_cancelled', { templateId });
  }

  getState(): SocialEncounterState {
    return {
      activeEncounter: this.activeEncounter ? { ...this.activeEncounter } : null,
    };
  }

  clear(): void {
    this.activeEncounter = null;
  }

  dispose(): void {
    this.clear();
  }

  toJSON(): Record<string, unknown> {
    return {
      activeEncounter: this.activeEncounter ? { ...this.activeEncounter } : null,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (data.activeEncounter && typeof data.activeEncounter === 'object') {
      this.activeEncounter = { ...(data.activeEncounter as any) };
    } else {
      this.activeEncounter = null;
    }
  }
}
