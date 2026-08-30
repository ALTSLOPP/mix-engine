import type { HelmManifest } from './types';
import { CommandRegistry, HELM_PROTOCOL_VERSION } from '../commands/CommandRegistry';

/**
 * HELM — capability manifest.
 *
 * Authoritative capability catalogue derived directly from the canonical CommandRegistry.
 * Served at GET /api/helm/manifest and surfaced by the MCP server's tools/list so a
 * coding agent can discover the engine's API without reading the source.
 */
export const HELM_VERSION = HELM_PROTOCOL_VERSION;

export const HELM_MANIFEST: HelmManifest = CommandRegistry.default.getHelmManifest() as unknown as HelmManifest;
