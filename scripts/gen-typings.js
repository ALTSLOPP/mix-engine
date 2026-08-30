#!/usr/bin/env node
/**
 * gen-typings.js — generates MIX Engine type definitions, schemas, and markdown
 * deterministically from the authoritative CommandRegistry.
 *
 * Writes:
 *   .claude/mix-engine.d.ts     — TypeScript declarations (ScriptAPI, AICommand, engine)
 *   .claude/helm-schema.json    — JSON Schema for HELM RPC operations
 *   .claude/mcp-schema.json     — JSON Schema for MCP tool definitions
 *   .claude/MIX-COMMANDS.md     — Markdown reference of all AICommands
 *   docs/MIX-COMMANDS.md        — Markdown reference in docs
 *
 * Run: node scripts/gen-typings.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_CLAUDE = path.join(ROOT, '.claude');
const OUT_DOCS = path.join(ROOT, 'docs');

if (!fs.existsSync(OUT_CLAUDE)) fs.mkdirSync(OUT_CLAUDE, { recursive: true });
if (!fs.existsSync(OUT_DOCS)) fs.mkdirSync(OUT_DOCS, { recursive: true });

// Load CommandRegistry via typescript in-memory transpile
function loadCommandRegistry() {
  const regFiles = [
    'src/features/gameplay/GeneralFeatureDescriptors.ts',
    'src/features/gameplay/GameplayFeatureRegistry.ts',
    'src/commands/types.ts',
    'src/commands/SchemaValidator.ts',
    'src/commands/registry/entityCommands.ts',
    'src/commands/registry/sceneCommands.ts',
    'src/commands/registry/physicsCommands.ts',
    'src/commands/registry/renderingCommands.ts',
    'src/commands/registry/audioCommands.ts',
    'src/commands/registry/cinematicCommands.ts',
    'src/commands/registry/navigationCommands.ts',
    'src/commands/registry/terrainCommands.ts',
    'src/commands/registry/gameplayCommands.ts',
    'src/commands/registry/animationCommands.ts',
    'src/commands/registry/tweenCommands.ts',
    'src/commands/registry/miscCommands.ts',
    'src/commands/registry/featureCommands.ts',
    'src/commands/registry/index.ts',
    'src/commands/CommandRegistry.ts',
  ];

  // We can transpile and evaluate or require
  // Create a minimal bundle or transpile step
  let aggregatedTs = '';
  // Read and strip imports from commands files
  for (const rel of regFiles) {
    let code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Remove import statements referencing local relative paths
    code = code.replace(/import\s+type\s+[^;]+;/g, '');
    code = code.replace(/import\s+[^;]+from\s+['"][^'"]+['"];/g, '');
    code = code.replace(/export\s+const\s+/g, 'const ');
    code = code.replace(/export\s+class\s+/g, 'class ');
    code = code.replace(/export\s+type\s+/g, 'type ');
    code = code.replace(/export\s+interface\s+/g, 'interface ');
    code = code.replace(/export\s+\*\s+from\s+[^;]+;/g, '');
    aggregatedTs += `\n// --- ${rel} ---\n` + code;
  }
  aggregatedTs += '\nreturn { CommandRegistry, HELM_PROTOCOL_VERSION };\n';

  const js = ts.transpileModule(aggregatedTs, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
    },
  }).outputText;

  const fn = new Function('require', 'module', 'exports', js);
  const mod = fn(null, {}, {});
  return mod.CommandRegistry.default;
}

const registry = loadCommandRegistry();

// ── 1. TypeScript declarations (.claude/mix-engine.d.ts) ────────────────────
const dts = registry.generateTypeScriptDeclarations();
fs.writeFileSync(path.join(OUT_CLAUDE, 'mix-engine.d.ts'), dts, 'utf-8');
console.log('  → .claude/mix-engine.d.ts');

// ── 2. HELM JSON Schema (.claude/helm-schema.json) ───────────────────────────
const helmSchema = registry.generateHelmJsonSchema();
fs.writeFileSync(path.join(OUT_CLAUDE, 'helm-schema.json'), JSON.stringify(helmSchema, null, 2) + '\n', 'utf-8');
console.log('  → .claude/helm-schema.json');

// ── 3. MCP JSON Schema (.claude/mcp-schema.json) ────────────────────────────
const mcpSchema = registry.generateMcpSchema();
fs.writeFileSync(path.join(OUT_CLAUDE, 'mcp-schema.json'), JSON.stringify(mcpSchema, null, 2) + '\n', 'utf-8');
console.log('  → .claude/mcp-schema.json');

// ── 4. Markdown command references ─────────────────────────────────────────
const md = registry.generateMarkdownDocs();
fs.writeFileSync(path.join(OUT_CLAUDE, 'MIX-COMMANDS.md'), md + '\n', 'utf-8');
fs.writeFileSync(path.join(OUT_DOCS, 'MIX-COMMANDS.md'), md + '\n', 'utf-8');
console.log('  → .claude/MIX-COMMANDS.md');
console.log('  → docs/MIX-COMMANDS.md');

console.log(`Done — Generated ${registry.getAll().length} command specifications across 5 artifacts.`);
