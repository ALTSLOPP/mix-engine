import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';
import type { EasterEggQuestConfig, EasterEggQuestState, QuestStep, SoulBoxDef } from './types';

export const DEFAULT_SOUL_BOXES: SoulBoxDef[] = [
  { id: 'soul_box_courtyard', name: 'Courtyard Ancient Altar', position: { x: -10, y: 0, z: 10 }, requiredSouls: 15, currentSouls: 0, isCharged: false },
  { id: 'soul_box_catacombs', name: 'Catacombs Relic Shrine', position: { x: 10, y: 0, z: -10 }, requiredSouls: 15, currentSouls: 0, isCharged: false },
  { id: 'soul_box_rooftop', name: 'Rooftop Gargoyle', position: { x: 0, y: 5, z: -15 }, requiredSouls: 20, currentSouls: 0, isCharged: false },
];

export const DEFAULT_QUEST_STEPS: QuestStep[] = [
  { id: 'step_power', title: 'Awaken the Electricity', description: 'Find the underground master power switch and turn on the grid.', isCompleted: false },
  { id: 'step_soul_boxes', title: 'Feed the Ancient Relics', description: 'Charge all 3 Soul Boxes by slaying infected in their presence.', isCompleted: false },
  { id: 'step_lockdown', title: 'Survive the Lockdown Chamber', description: 'Trigger the containment seal and survive the 45-second onslaught.', isCompleted: false },
  { id: 'step_boss', title: 'Defeat the Prime Monstrosity', description: 'Defeat the Panzer Goliath to break the temporal curse.', isCompleted: false },
];

export const DEFAULT_EASTER_EGG_CONFIG: EasterEggQuestConfig = {
  enabled: true,
  steps: DEFAULT_QUEST_STEPS,
  soulBoxes: DEFAULT_SOUL_BOXES,
  lockdownDurationSec: 45.0,
};

export class ZombieEasterEggQuestSystem {
  private config: EasterEggQuestConfig;
  private readonly rootGroup = new THREE.Group();
  private readonly soulBoxMeshes = new Map<string, THREE.Mesh>();
  private readonly unsubs: Array<() => void> = [];

  private readonly state: EasterEggQuestState = {
    currentStepIndex: 0,
    soulBoxes: [],
    isLockdownActive: false,
    lockdownTimeRemaining: 0,
    isQuestCompleted: false,
  };

  constructor(private readonly engine: Engine, initialConfig: EasterEggQuestConfig = DEFAULT_EASTER_EGG_CONFIG) {
    this.config = { ...initialConfig };
    this.rootGroup.name = 'ZombieEasterEggQuestRoot';
    this.state.soulBoxes = JSON.parse(JSON.stringify(this.config.soulBoxes));
    this.setupVisuals();
    this.bindEvents();
  }

  private setupVisuals(): void {
    const scene = this.engine.viewport?.scene;
    if (scene && !scene.children.includes(this.rootGroup)) {
      scene.add(this.rootGroup);
    }

    for (const box of this.state.soulBoxes) {
      const geo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4a4a4a });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `SoulBox_${box.id}`;
      mesh.position.set(box.position.x, box.position.y + 0.7, box.position.z);
      this.rootGroup.add(mesh);
      this.soulBoxMeshes.set(box.id, mesh);
    }
  }

  private bindEvents(): void {
    const events = this.engine.sceneManager?.events;
    if (!events) return;

    // Listen to power turned on
    const u1 = events.on('power_turned_on', () => {
      this.completeCurrentStep('step_power');
    });

    // Listen to zombie deaths near soul boxes
    const u2 = events.on('zombie_killed', (payload: any) => {
      if (!payload?.position) return;
      this.checkSoulAbsorption(new THREE.Vector3(payload.position.x, payload.position.y, payload.position.z));
    });

    if (u1) this.unsubs.push(u1);
    if (u2) this.unsubs.push(u2);
  }

  setConfig(config: Partial<EasterEggQuestConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.soulBoxes) {
      this.state.soulBoxes = JSON.parse(JSON.stringify(config.soulBoxes));
    }
  }

  getConfig(): Readonly<EasterEggQuestConfig> {
    return this.config;
  }

  getState(): Readonly<EasterEggQuestState> {
    return this.state;
  }

  getCurrentStep(): QuestStep | null {
    return this.config.steps[this.state.currentStepIndex] ?? null;
  }

  completeCurrentStep(stepId?: string): void {
    const step = this.getCurrentStep();
    if (!step) return;

    if (!stepId || step.id === stepId) {
      step.isCompleted = true;
      this.state.currentStepIndex++;

      this.engine.audio?.play?.('/assets/audio/quest_step_complete.wav', { volume: 1.0 });
      this.engine.sceneManager?.events?.emit('quest_step_completed', {
        stepId: step.id,
        title: step.title,
        nextStepIndex: this.state.currentStepIndex,
      });

      if (this.state.currentStepIndex >= this.config.steps.length) {
        this.completeQuest();
      }
    }
  }

  checkSoulAbsorption(killPosition: THREE.Vector3): void {
    for (const box of this.state.soulBoxes) {
      if (box.isCharged) continue;

      const boxPos = new THREE.Vector3(box.position.x, box.position.y, box.position.z);
      if (killPosition.distanceTo(boxPos) <= 6.5) {
        box.currentSouls++;
        this.engine.burstVfx?.('magic', killPosition.clone(), 6);

        this.engine.sceneManager?.events?.emit('soul_absorbed', {
          boxId: box.id,
          current: box.currentSouls,
          required: box.requiredSouls,
        });

        if (box.currentSouls >= box.requiredSouls) {
          box.isCharged = true;
          this.engine.burstVfx?.('glow', boxPos.clone().add(new THREE.Vector3(0, 1, 0)), 15);
          this.engine.sceneManager?.events?.emit('soul_box_completed', { boxId: box.id });

          // Check if all soul boxes charged
          if (this.state.soulBoxes.every((b) => b.isCharged)) {
            this.completeCurrentStep('step_soul_boxes');
          }
        }
        break;
      }
    }
  }

  startLockdownArena(): void {
    this.state.isLockdownActive = true;
    this.state.lockdownTimeRemaining = this.config.lockdownDurationSec;
    this.engine.audio?.play?.('/assets/audio/lockdown_alarm.wav', { volume: 1.0 });
    this.engine.sceneManager?.events?.emit('lockdown_started', { durationSec: this.config.lockdownDurationSec });
  }

  completeQuest(): void {
    this.state.isQuestCompleted = true;

    // Award Perkaholic (grant all perks)
    const perks = (this.engine.gameplayFeatures as any)?.perkVending;
    if (perks) {
      for (const p of ['juggernog', 'speed_cola', 'quick_revive', 'double_tap', 'stamin_up', 'deadshot', 'mule_kick'] as any[]) {
        perks.applyPerkEffects?.(p);
      }
    }

    (this.engine.sceneManager?.gameState as any)?.addScore?.(10000);
    this.engine.burstVfx?.('confetti', new THREE.Vector3(0, 5, 0), 40);
    this.engine.sceneManager?.events?.emit('easter_egg_quest_completed', {});
  }

  update(dt: number): void {
    if (!this.config.enabled) return;

    if (this.state.isLockdownActive) {
      this.state.lockdownTimeRemaining -= dt;
      if (this.state.lockdownTimeRemaining <= 0) {
        this.state.isLockdownActive = false;
        this.state.lockdownTimeRemaining = 0;
        this.engine.sceneManager?.events?.emit('lockdown_survived', {});
        this.completeCurrentStep('step_lockdown');
      }
    }
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs.length = 0;
    for (const m of this.soulBoxMeshes.values()) this.rootGroup.remove(m);
    this.soulBoxMeshes.clear();
    this.engine.viewport?.scene?.remove(this.rootGroup);
  }

  toJSON(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      currentStepIndex: this.state.currentStepIndex,
      isQuestCompleted: this.state.isQuestCompleted,
    };
  }

  fromJSON(data: Record<string, unknown>): void {
    if (typeof data.enabled === 'boolean') this.config.enabled = data.enabled;
    if (typeof data.currentStepIndex === 'number') this.state.currentStepIndex = data.currentStepIndex;
    if (typeof data.isQuestCompleted === 'boolean') this.state.isQuestCompleted = data.isQuestCompleted;
  }
}
