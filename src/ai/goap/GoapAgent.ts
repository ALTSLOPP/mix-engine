import { GoapAction, type GoapWorldState } from './GoapAction';
import { GoapPlanner } from './GoapPlanner';

export class GoapAgent {
  readonly worldState: GoapWorldState = {};
  readonly goals: GoapWorldState = {};
  readonly actions: GoapAction[] = [];
  currentPlan: GoapAction[] | null = null;
  currentActionIndex = 0;

  addAction(action: GoapAction): void {
    this.actions.push(action);
  }

  setState(key: string, value: boolean | number | string): void {
    this.worldState[key] = value;
  }

  setGoal(key: string, value: boolean | number | string): void {
    this.goals[key] = value;
  }

  replan(): boolean {
    this.currentPlan = GoapPlanner.plan(this.worldState, this.goals, this.actions);
    this.currentActionIndex = 0;
    return this.currentPlan !== null;
  }

  getCurrentAction(): GoapAction | null {
    if (!this.currentPlan || this.currentActionIndex >= this.currentPlan.length) {
      return null;
    }
    return this.currentPlan[this.currentActionIndex];
  }

  completeCurrentAction(): void {
    const action = this.getCurrentAction();
    if (!action) return;

    // Apply effects of completed action to world state
    Object.assign(this.worldState, action.effects);
    this.currentActionIndex += 1;

    // If plan complete, check if we need to replan
    if (this.currentActionIndex >= (this.currentPlan?.length ?? 0)) {
      this.currentPlan = null;
      this.currentActionIndex = 0;
    }
  }
}
