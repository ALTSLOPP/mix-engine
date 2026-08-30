export type GoapValue = boolean | number | string;
export type GoapWorldState = Record<string, GoapValue>;

export interface GoapActionDef {
  name: string;
  cost?: number;
  preconditions: GoapWorldState;
  effects: GoapWorldState;
}

export class GoapAction {
  readonly name: string;
  readonly cost: number;
  readonly preconditions: GoapWorldState;
  readonly effects: GoapWorldState;

  constructor(def: GoapActionDef) {
    this.name = def.name;
    this.cost = def.cost ?? 1.0;
    this.preconditions = { ...def.preconditions };
    this.effects = { ...def.effects };
  }

  isSatisfied(state: GoapWorldState): boolean {
    for (const [key, value] of Object.entries(this.preconditions)) {
      if (state[key] !== value) {
        return false;
      }
    }
    return true;
  }

  apply(state: GoapWorldState): GoapWorldState {
    return {
      ...state,
      ...this.effects,
    };
  }
}
