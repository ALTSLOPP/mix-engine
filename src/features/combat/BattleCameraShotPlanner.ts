import * as THREE from 'three';

export type BattleCameraSizeMatchup =
  | 'balanced'
  | 'ally_taller'
  | 'opponent_taller'
  | 'extreme_ally_taller'
  | 'extreme_opponent_taller';

export type BattleCameraShotKind =
  | 'establish'
  | 'ally_shoulder'
  | 'opponent_shoulder'
  | 'side_action'
  | 'tactical_high'
  | 'critical_orbit'
  | 'victory_hero'
  | 'faint_reaction';

export interface BattleCameraTarget {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  height: number;
  sizeClass?: string;
}

export interface BattleCameraFramingPlan {
  matchup: BattleCameraSizeMatchup;
  heightRatio: number;
  framingScale: number;
  focusHeight: number;
  fovBoost: number;
}

export function planBattleCameraFraming(
  ally: BattleCameraTarget,
  opponent: BattleCameraTarget,
  shot: BattleCameraShotKind
): BattleCameraFramingPlan {
  return BattleCameraShotPlanner.computeFramingPlan(ally.height, opponent.height);
}

export class BattleCameraShotPlanner {
  /**
   * Classifies height matchup between ally and opponent.
   */
  static classifyMatchup(allyHeight: number, opponentHeight: number): BattleCameraSizeMatchup {
    const ah = Math.max(0.1, allyHeight);
    const oh = Math.max(0.1, opponentHeight);
    const ratio = ah / oh;

    if (ratio > 2.2) return 'extreme_ally_taller';
    if (ratio > 1.35) return 'ally_taller';
    if (ratio < 0.45) return 'extreme_opponent_taller';
    if (ratio < 0.75) return 'opponent_taller';
    return 'balanced';
  }

  /**
   * Computes framing parameters according to creature sizes.
   */
  static computeFramingPlan(allyHeight: number, opponentHeight: number): BattleCameraFramingPlan {
    const matchup = this.classifyMatchup(allyHeight, opponentHeight);
    const maxHeight = Math.max(allyHeight, opponentHeight);
    const avgHeight = (allyHeight + opponentHeight) * 0.5;

    let framingScale = 1.0;
    let fovBoost = 0;

    switch (matchup) {
      case 'extreme_ally_taller':
      case 'extreme_opponent_taller':
        framingScale = 1.45;
        fovBoost = 10;
        break;
      case 'ally_taller':
      case 'opponent_taller':
        framingScale = 1.2;
        fovBoost = 5;
        break;
      case 'balanced':
      default:
        framingScale = 1.0;
        fovBoost = 0;
        break;
    }

    return {
      matchup,
      heightRatio: allyHeight / Math.max(0.1, opponentHeight),
      framingScale,
      focusHeight: avgHeight * 0.55,
      fovBoost,
    };
  }

  /**
   * Deterministically selects the shot type based on turn/event index and combat phase.
   */
  static selectShot(
    eventIndex: number,
    phase: 'entry' | 'action' | 'impact' | 'faint' | 'victory',
    matchup: BattleCameraSizeMatchup = 'balanced'
  ): BattleCameraShotKind {
    if (phase === 'entry') return 'establish';
    if (phase === 'faint') return 'faint_reaction';
    if (phase === 'victory') return 'victory_hero';

    if (phase === 'impact') {
      return (eventIndex % 2 === 0) ? 'critical_orbit' : 'side_action';
    }

    // Action phase: cycle deterministically
    const actionShots: BattleCameraShotKind[] = ['ally_shoulder', 'side_action', 'opponent_shoulder', 'tactical_high'];

    // For extreme height differences, prefer tactical high or side action for readability
    if (matchup === 'extreme_ally_taller' || matchup === 'extreme_opponent_taller') {
      return (eventIndex % 2 === 0) ? 'tactical_high' : 'side_action';
    }

    return actionShots[Math.abs(eventIndex) % actionShots.length];
  }
}
