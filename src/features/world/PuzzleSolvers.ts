import * as THREE from 'three';
import type { Engine } from '../../engine/Engine';

export type PuzzleType = 'circuit_plates' | 'sequence_lock' | 'pillar_weight' | 'floor_plate_sequence';

export interface BasePuzzleState {
  id: string;
  type: PuzzleType;
  isSolved: boolean;
  attempts: number;
}

// ── 1. Circuit Plates Puzzle ────────────────────────────────────────────────
export class CircuitPlatesSolver {
  public isSolved = false;
  public attempts = 0;
  private readonly plateStates: boolean[];
  private readonly adjacency: number[][];

  constructor(
    public readonly id: string,
    public readonly plateCount = 4,
    adjacencyList?: number[][]
  ) {
    this.plateStates = new Array(plateCount).fill(false);
    this.adjacency = adjacencyList ?? [
      [1, 3], // plate 0 toggles 1 and 3
      [0, 2], // plate 1 toggles 0 and 2
      [1, 3], // plate 2 toggles 1 and 3
      [0, 2], // plate 3 toggles 0 and 2
    ];
  }

  pressPlate(index: number): boolean {
    if (this.isSolved || index < 0 || index >= this.plateCount) return false;
    this.attempts++;

    // Toggle self
    this.plateStates[index] = !this.plateStates[index];

    // Toggle adjacent plates
    const neighbors = this.adjacency[index] ?? [];
    for (const n of neighbors) {
      if (n >= 0 && n < this.plateCount) {
        this.plateStates[n] = !this.plateStates[n];
      }
    }

    // Check win condition: all plates true
    if (this.plateStates.every(s => s === true)) {
      this.isSolved = true;
    }
    return this.isSolved;
  }

  getStates(): boolean[] {
    return [...this.plateStates];
  }

  reset(): void {
    this.plateStates.fill(false);
    this.isSolved = false;
  }
}

// ── 2. Sequence Lock Puzzle ─────────────────────────────────────────────────
export class SequenceLockSolver {
  public isSolved = false;
  public attempts = 0;
  private currentStep = 0;

  constructor(
    public readonly id: string,
    public readonly correctSequence: number[] = [2, 0, 3, 1]
  ) {}

  pressButton(buttonIndex: number): boolean {
    if (this.isSolved) return true;
    this.attempts++;

    if (buttonIndex === this.correctSequence[this.currentStep]) {
      this.currentStep++;
      if (this.currentStep >= this.correctSequence.length) {
        this.isSolved = true;
      }
    } else {
      // Mistake: reset sequence progress (or start at 1 if first button pressed)
      this.currentStep = (buttonIndex === this.correctSequence[0]) ? 1 : 0;
    }

    return this.isSolved;
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  reset(): void {
    this.currentStep = 0;
    this.isSolved = false;
  }
}

// ── 3. Pillar Weight Puzzle ─────────────────────────────────────────────────
export class PillarWeightSolver {
  public isSolved = false;
  public attempts = 0;
  private currentWeight = 0;

  constructor(
    public readonly id: string,
    public readonly targetWeight = 100,
    public readonly tolerance = 5
  ) {}

  addWeight(amount: number): boolean {
    if (this.isSolved) return true;
    this.attempts++;
    this.currentWeight += amount;

    if (Math.abs(this.currentWeight - this.targetWeight) <= this.tolerance) {
      this.isSolved = true;
    }
    return this.isSolved;
  }

  removeWeight(amount: number): void {
    if (this.isSolved) return;
    this.currentWeight = Math.max(0, this.currentWeight - amount);
  }

  getWeight(): number {
    return this.currentWeight;
  }

  reset(): void {
    this.currentWeight = 0;
    this.isSolved = false;
  }
}

// ── 4. Floor Plate Sequence Puzzle ──────────────────────────────────────────
export class FloorPlateSequenceSolver {
  public isSolved = false;
  public attempts = 0;
  private readonly validPath: string[];
  private currentPathIndex = 0;

  constructor(
    public readonly id: string,
    validPathIds = ['plate_a', 'plate_b', 'plate_c', 'plate_d']
  ) {
    this.validPath = [...validPathIds];
  }

  stepOnPlate(plateId: string): boolean {
    if (this.isSolved) return true;
    this.attempts++;

    if (plateId === this.validPath[this.currentPathIndex]) {
      this.currentPathIndex++;
      if (this.currentPathIndex >= this.validPath.length) {
        this.isSolved = true;
      }
    } else {
      // Stepped on incorrect plate / trap -> reset path (or start at 1 if first plate stepped on)
      this.currentPathIndex = (plateId === this.validPath[0]) ? 1 : 0;
    }

    return this.isSolved;
  }

  getProgress(): number {
    return this.currentPathIndex;
  }

  reset(): void {
    this.currentPathIndex = 0;
    this.isSolved = false;
  }
}
