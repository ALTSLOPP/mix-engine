import type { Engine } from '../../engine/Engine';

const KEY = '__gameplay_points__';
const wallets = new WeakMap<Engine, GameplayWallet>();

/** One persistent points balance for rewards, purchases and the zombie HUD.
 * SessionFlow's round score is intentionally not spendable currency. */
export class GameplayWallet {
  private balance = 0;
  constructor(private readonly engine: Engine) {}
  getBalance(): number {
    const store = this.engine.sceneManager?.gameState;
    const value = store?.getItem ? store.getItem(KEY) : this.balance;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }
  set(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    this.balance = amount;
    this.engine.sceneManager?.gameState?.setItem?.(KEY, amount);
    this.engine.sceneManager?.events?.emit('gameplay_points_changed', { balance: amount });
    return true;
  }
  add(amount: number): boolean {
    return Number.isFinite(amount) && amount >= 0 && this.set(this.getBalance() + amount);
  }
  trySpend(amount: number): boolean {
    return Number.isFinite(amount) && amount >= 0 && amount <= this.getBalance()
      && this.set(this.getBalance() - amount);
  }
}

export function gameplayWallet(engine: Engine): GameplayWallet {
  let wallet = wallets.get(engine);
  if (!wallet) { wallet = new GameplayWallet(engine); wallets.set(engine, wallet); }
  return wallet;
}
