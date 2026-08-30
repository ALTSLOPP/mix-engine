/**
 * HELM — the engine's control plane for IDE coding agents. Public barrel.
 *   import { HelmBridge, HELM_MANIFEST, type HelmRequest } from '../helm';
 */
export * from './types';
export { HelmBridge } from './HelmBridge';
export { HELM_MANIFEST, HELM_VERSION } from './manifest';
export { preflightCommands, ATOMIC_SCENE_COMMANDS } from './CommandPreflight';
export type { CommandPreflightResult, CommandPlanItem, PreflightIssue } from './CommandPreflight';
export { resolveEntityRef, resolveCommandRefs } from './EntityRefs';
export type { HelmEntityRef, EntityRefRecord, EntityRefResolution, CommandRefResolution } from './EntityRefs';
