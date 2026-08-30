import type { Tween } from './Tween';
import type { TweenSequence } from './TweenSequence';

export type TrackItemKind = 'tween' | 'sequence' | 'callback' | 'marker' | 'interval';

export interface TweenTrackItem {
  id: string;
  kind: TrackItemKind;
  startTime: number;
  duration: number;
  endTime: number;
  tween?: Tween;
  sequence?: TweenSequence;
  callback?: () => void;
  markerName?: string;
  isTriggeredForward?: boolean;
  isTriggeredBackward?: boolean;
}

export class TweenTrack {
  readonly items: TweenTrackItem[] = [];

  addItem(item: TweenTrackItem): void {
    this.items.push(item);
    this.items.sort((a, b) => a.startTime - b.startTime);
  }

  get duration(): number {
    let max = 0;
    for (const item of this.items) {
      if (item.endTime > max) {
        max = item.endTime;
      }
    }
    return max;
  }

  resetTriggers(): void {
    for (const item of this.items) {
      item.isTriggeredForward = false;
      item.isTriggeredBackward = false;
      if (item.tween) {
        item.tween.restart();
        item.tween.pause();
      }
      if (item.sequence) {
        item.sequence.rewind();
      }
    }
  }
}
