import { describe, it, expect } from 'vitest';
import { CommandRegistry, HELM_PROTOCOL_VERSION } from '../src/commands/CommandRegistry';
import { SchemaValidator } from '../src/commands/SchemaValidator';
import { preflightCommands } from '../src/helm/CommandPreflight';
import { HELM_MANIFEST, HELM_VERSION } from '../src/helm/manifest';
import * as fs from 'fs';
import * as path from 'path';

describe('CommandRegistry & Manifest Parity', () => {
  const registry = CommandRegistry.default;

  it('contains all 419 registered engine commands', () => {
    const allDefs = registry.getAll();
    expect(allDefs.length).toBe(419);
  });

  it('matches all handlerMap registrations in src/ai/commands', () => {
    const cmdDir = path.join(process.cwd(), 'src/ai/commands');
    const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.ts') && f !== 'BridgeContext.ts');
    const registeredHandlers = new Set<string>();

    for (const file of files) {
      const content = fs.readFileSync(path.join(cmdDir, file), 'utf8');
      for (const match of content.matchAll(/map\.set\(\s*['"]([^'"]+)['"]/g)) {
        registeredHandlers.add(match[1]);
      }
    }

    expect(registeredHandlers.size).toBe(419);

    // Every registered handler must have a definition in CommandRegistry
    for (const handler of registeredHandlers) {
      const def = registry.get(handler);
      expect(def, `Missing command definition for registered handler: '${handler}'`).toBeDefined();
      expect(def!.type).toBe(registry.resolveAlias(handler));
    }

    // Every definition in CommandRegistry must have a registered handler
    for (const def of registry.getAll()) {
      expect(registeredHandlers.has(def.type), `Definition '${def.type}' has no registered runtime handler`).toBe(true);
    }
  });

  it('resolves all deprecated aliases to real canonical commands', () => {
    const testAliases = [
      { alias: 'ragdoll_spawn', canonical: 'ragdoll_create' },
      { alias: 'ragdoll_set_dynamic', canonical: 'ragdoll_set_active' },
      { alias: 'kcc_telemetry_get', canonical: 'kcc_get_telemetry' },
      { alias: 'morph_set_weight', canonical: 'morph_set' },
    ];

    for (const { alias, canonical } of testAliases) {
      expect(registry.resolveAlias(alias)).toBe(canonical);
      expect(registry.has(alias)).toBe(true);
      expect(registry.get(alias)?.type).toBe(canonical);
    }
  });

  it('exports synchronized HELM_MANIFEST and HELM_VERSION', () => {
    expect(HELM_VERSION).toBe(HELM_PROTOCOL_VERSION);
    expect(HELM_MANIFEST.commands.length).toBe(419);
    expect(HELM_MANIFEST.ops.length).toBeGreaterThanOrEqual(14);
  });
});

describe('SchemaValidator & CommandPreflight', () => {
  const registry = CommandRegistry.default;

  it('validates correct command payloads', () => {
    const validSpawn = {
      type: 'spawn_entity',
      x: 10,
      y: 0,
      z: -5,
      glbPath: 'assets/hero.glb',
    };
    const res = registry.validateCommand(validSpawn);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects missing required parameters with precise JSON paths', () => {
    const invalidSpawn = {
      type: 'spawn_entity',
      x: 10,
      // missing y, z, glbPath
    };
    const res = registry.validateCommand(invalidSpawn, 'commands[0]');
    expect(res.valid).toBe(false);
    const paths = res.errors.map((e) => e.path);
    expect(paths).toContain('commands[0].y');
    expect(paths).toContain('commands[0].z');
    expect(paths).toContain('commands[0].glbPath');
  });

  it('rejects invalid types with descriptive errors', () => {
    const invalidTypes = {
      type: 'spawn_entity',
      x: 'ten', // should be number
      y: 0,
      z: 0,
      glbPath: 12345, // should be string
    };
    const res = registry.validateCommand(invalidTypes, 'commands[2]');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === 'commands[2].x' && e.code === 'type_mismatch')).toBe(true);
  });

  it('rejects prototype pollution and unsafe keys in preflight', () => {
    const malicious = JSON.parse(
      '{"type": "spawn_entity", "x": 0, "y": 0, "z": 0, "glbPath": "box", "__proto__": {"injected": true}}'
    );
    const result = preflightCommands([malicious]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Unsafe object key'))).toBe(true);

    const constructorAttack = {
      type: 'spawn_entity',
      x: 0,
      y: 0,
      z: 0,
      glbPath: 'box',
      constructor: { hacked: true },
    };
    const res2 = preflightCommands([constructorAttack]);
    expect(res2.valid).toBe(false);
    expect(res2.issues.some((i) => i.message.includes('Unsafe object key'))).toBe(true);
  });

  it('preflights batches and identifies atomic safety', () => {
    const atomicBatch = [
      { type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'hero' },
      { type: 'set_entity_name', entityId: 1, name: 'Hero' },
      { type: 'tag_entity', entityId: 1, tag: 'player' },
    ];
    const res = preflightCommands(atomicBatch, true);
    expect(res.valid).toBe(true);
    expect(res.atomicSafe).toBe(true);
  });

  it('rejects non-atomic operations in atomic preflight', () => {
    const mixedBatch = [
      { type: 'spawn_entity', x: 0, y: 0, z: 0, glbPath: 'hero' },
      { type: 'play_sound', src: 'audio/boom.wav' }, // non-atomic
    ];
    const res = preflightCommands(mixedBatch, true);
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.message.includes('not scene-snapshot safe'))).toBe(true);
  });
});

describe('Artifact Generation Determinism', () => {
  const registry = CommandRegistry.default;

  it('generates byte-identical TypeScript declarations twice', () => {
    const dts1 = registry.generateTypeScriptDeclarations();
    const dts2 = registry.generateTypeScriptDeclarations();
    expect(dts1).toBe(dts2);
    expect(dts1.length).toBeGreaterThan(1000);
  });

  it('generates byte-identical Markdown docs twice', () => {
    const md1 = registry.generateMarkdownDocs();
    const md2 = registry.generateMarkdownDocs();
    expect(md1).toBe(md2);
    expect(md1).toContain('# MIX Engine — AI Command Reference');
  });

  it('generates byte-identical HELM and MCP JSON schemas twice', () => {
    const helm1 = JSON.stringify(registry.generateHelmJsonSchema());
    const helm2 = JSON.stringify(registry.generateHelmJsonSchema());
    expect(helm1).toBe(helm2);

    const mcp1 = JSON.stringify(registry.generateMcpSchema());
    const mcp2 = JSON.stringify(registry.generateMcpSchema());
    expect(mcp1).toBe(mcp2);
  });
});


