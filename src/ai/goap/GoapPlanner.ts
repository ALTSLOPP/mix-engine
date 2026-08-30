import { GoapAction, type GoapWorldState } from './GoapAction';

export interface PlanNode {
  state: GoapWorldState;
  action: GoapAction | null;
  parent: PlanNode | null;
  gCost: number; // Cost from start
  hCost: number; // Heuristic to goal
  fCost: number; // Total estimated cost
}

export class GoapPlanner {
  static plan(
    startState: GoapWorldState,
    goalState: GoapWorldState,
    actions: GoapAction[],
  ): GoapAction[] | null {
    const openList: PlanNode[] = [];
    const closedList: PlanNode[] = [];

    const startNode: PlanNode = {
      state: { ...startState },
      action: null,
      parent: null,
      gCost: 0,
      hCost: this.heuristic(startState, goalState),
      fCost: this.heuristic(startState, goalState),
    };

    openList.push(startNode);

    while (openList.length > 0) {
      // Find lowest fCost node
      let bestIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].fCost < openList[bestIdx].fCost) {
          bestIdx = i;
        }
      }

      const current = openList.splice(bestIdx, 1)[0];
      closedList.push(current);

      // Check if goal reached
      if (this.matchesGoal(current.state, goalState)) {
        return this.reconstructPath(current);
      }

      // Expand possible actions
      for (const action of actions) {
        if (!action.isSatisfied(current.state)) {
          continue;
        }

        const nextState = action.apply(current.state);
        const gCost = current.gCost + action.cost;

        // Check if already in closed list with lower/equal cost
        const inClosed = closedList.find((n) => this.isStateEqual(n.state, nextState) && n.gCost <= gCost);
        if (inClosed) continue;

        // Check if already in open list
        let inOpen = openList.find((n) => this.isStateEqual(n.state, nextState));
        if (!inOpen) {
          const hCost = this.heuristic(nextState, goalState);
          const newNode: PlanNode = {
            state: nextState,
            action,
            parent: current,
            gCost,
            hCost,
            fCost: gCost + hCost,
          };
          openList.push(newNode);
        } else if (gCost < inOpen.gCost) {
          inOpen.parent = current;
          inOpen.gCost = gCost;
          inOpen.fCost = gCost + inOpen.hCost;
          inOpen.action = action;
        }
      }
    }

    return null; // No valid plan found
  }

  private static matchesGoal(state: GoapWorldState, goal: GoapWorldState): boolean {
    for (const [key, value] of Object.entries(goal)) {
      if (state[key] !== value) return false;
    }
    return true;
  }

  private static heuristic(state: GoapWorldState, goal: GoapWorldState): number {
    let unsatisfied = 0;
    for (const [key, value] of Object.entries(goal)) {
      if (state[key] !== value) unsatisfied += 1;
    }
    return unsatisfied;
  }

  private static isStateEqual(a: GoapWorldState, b: GoapWorldState): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  }

  private static reconstructPath(node: PlanNode): GoapAction[] {
    const actions: GoapAction[] = [];
    let curr: PlanNode | null = node;
    while (curr && curr.action) {
      actions.unshift(curr.action);
      curr = curr.parent;
    }
    return actions;
  }
}
