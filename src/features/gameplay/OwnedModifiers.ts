/** Additive, independently removable numeric modifiers. The cleanup captures the
 * actual target, so changing possession cannot restore a different character. */
export function addOwnedModifier(target: any, key: string, amount: number): () => void {
  if (!Number.isFinite(target[key]) || !Number.isFinite(amount)) return () => {};
  target[key] += amount;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (Number.isFinite(target[key])) target[key] -= amount;
  };
}
