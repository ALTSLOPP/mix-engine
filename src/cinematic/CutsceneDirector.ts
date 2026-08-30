import type { CinematicCamera, CinematicSequence } from './CinematicCamera';
import type { AICommand } from '../ai/AIBridge';

/**
 * CutsceneEvent — A single choreographed event on the timeline.
 */
export interface CutsceneEvent {
  /** Time in seconds when this event triggers. */
  time: number;
  /** The AI command to execute (e.g. play_animation, spawn_vfx, play_sound). */
  command: AICommand;
  /** Pass an '@tag' or '@name'. The engine will find the entity dynamically and inject its ID into the command! */
  resolveTarget?: string;
  /** Which property to inject the resolved ID into (defaults to 'entityId') */
  resolveTargetKey?: string;
}

/**
 * CutsceneSequence — A complete timeline definition.
 */
export interface CutsceneSequence {
  /** Optional sequence title. */
  title?: string;
  /** Optional manual duration. If omitted, derives from the camera and events. */
  duration?: number;
  /** Cinematic camera sequence (optional, plays alongside the events). */
  cameraSequence?: CinematicSequence;
  /** Whether to show cinematic black bars and hide the HUD. Defaults to true. */
  letterbox?: boolean;
  /** Timeline events. */
  events: CutsceneEvent[];
}

/**
 * CutsceneDirector — A timeline sequencer that merges cinematic camera paths
 * with a schedule of AI commands (animations, fx, sound, etc).
 * 
 * An LLM IDE can author a full cutscene by passing a single CutsceneSequence JSON.
 */
export class CutsceneDirector {
  private sequence: CutsceneSequence | null = null;
  private elapsed = 0;
  private eventIndex = 0;
  
  public active = false;
  
  // Assigned by the Engine after AIBridge is constructed
  public executeCommand?: (cmd: AICommand) => void;
  public resolveEntity?: (ref: string) => number | undefined;

  private topBar?: HTMLDivElement;
  private bottomBar?: HTMLDivElement;
  private subtitleContainer?: HTMLDivElement;
  private subtitleTimeout?: number;

  constructor(private cinematic: CinematicCamera) {}

  private initUI() {
    if (this.topBar) return;
    this.topBar = document.createElement('div');
    this.topBar.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:12%; background:black; z-index:9999; transition: transform 0.5s cubic-bezier(0.25, 1, 0.5, 1); transform: translateY(-100%); pointer-events:none;';
    document.body.appendChild(this.topBar);

    this.bottomBar = document.createElement('div');
    this.bottomBar.style.cssText = 'position:fixed; bottom:0; left:0; width:100%; height:12%; background:black; z-index:9999; transition: transform 0.5s cubic-bezier(0.25, 1, 0.5, 1); transform: translateY(100%); pointer-events:none;';
    document.body.appendChild(this.bottomBar);

    this.subtitleContainer = document.createElement('div');
    this.subtitleContainer.style.cssText = 'position:fixed; bottom:14%; left:0; width:100%; text-align:center; z-index:10000; color:white; font-family:system-ui, sans-serif; font-size:28px; text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; pointer-events:none; opacity:0; transition: opacity 0.3s ease-in-out;';
    document.body.appendChild(this.subtitleContainer);
  }

  private setCinematicUI(active: boolean) {
    this.initUI();
    const hud = document.getElementById('mix-hud-container');
    if (active && (this.sequence?.letterbox !== false)) {
      this.topBar!.style.transform = 'translateY(0)';
      this.bottomBar!.style.transform = 'translateY(0)';
      if (hud) hud.style.display = 'none';
    } else {
      this.topBar!.style.transform = 'translateY(-100%)';
      this.bottomBar!.style.transform = 'translateY(100%)';
      if (hud) hud.style.removeProperty('display');
      if (this.subtitleContainer) this.subtitleContainer.style.opacity = '0';
    }
  }

  showSubtitle(text: string, speaker?: string, duration: number = 3) {
    this.initUI();
    if (!this.subtitleContainer) return;
    this.subtitleContainer.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : text;
    this.subtitleContainer.style.opacity = '1';
    
    if (this.subtitleTimeout) clearTimeout(this.subtitleTimeout);
    this.subtitleTimeout = window.setTimeout(() => {
      this.subtitleContainer!.style.opacity = '0';
    }, duration * 1000);
  }

  play(seq: CutsceneSequence) {
    this.sequence = seq;
    
    // Ensure events are chronological
    this.sequence.events.sort((a, b) => a.time - b.time);
    
    this.elapsed = 0;
    this.eventIndex = 0;
    this.active = true;

    this.setCinematicUI(true);

    // Start the camera track if provided
    if (seq.cameraSequence) {
      this.cinematic.play(seq.cameraSequence);
    }
  }

  stop() {
    this.active = false;
    this.setCinematicUI(false);
    this.sequence = null;
    if (this.cinematic.active) {
      this.cinematic.stop();
    }
  }

  update(dt: number) {
    if (!this.active || !this.sequence) return;
    
    this.elapsed += dt;

    // Dispatch scheduled events that have passed their timestamp
    while (this.eventIndex < this.sequence.events.length) {
      const evt = this.sequence.events[this.eventIndex];
      if (this.elapsed >= evt.time) {
        if (this.executeCommand) {
          let finalCmd = evt.command;
          
          if (evt.resolveTarget && this.resolveEntity) {
            const resolvedId = this.resolveEntity(evt.resolveTarget);
            if (resolvedId !== undefined) {
              finalCmd = { ...finalCmd }; // Clone to avoid mutating original JSON
              const key = evt.resolveTargetKey || 'entityId';
              (finalCmd as any)[key] = resolvedId;
            } else {
              console.warn(`CutsceneDirector: Failed to resolve target '${evt.resolveTarget}' for command ${finalCmd.type}`);
            }
          }
          
          this.executeCommand(finalCmd);
        } else {
          console.warn('CutsceneDirector: No executeCommand handler assigned, skipping event.');
        }
        this.eventIndex++;
      } else {
        break; // Wait for the next frame
      }
    }

    // Determine completion time
    const maxCameraTime = this.sequence.cameraSequence?.shots.reduce((acc, s) => acc + s.duration, 0) || 0;
    const maxEventTime = this.sequence.events.length > 0 ? this.sequence.events[this.sequence.events.length - 1].time : 0;
    const duration = this.sequence.duration ?? Math.max(maxCameraTime, maxEventTime);

    // Stop automatically if we've passed the cutscene duration and camera is done
    if (this.elapsed >= duration) {
      // Allow CinematicCamera to finish its sequence or looping before fully stopping
      if (!this.cinematic.active || !this.sequence.cameraSequence) {
        this.stop();
      }
    }
  }
}
