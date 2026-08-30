#!/usr/bin/env node
/**
 * MIX Engine MCP server — exposes HELM (the agent control plane) as Model Context
 * Protocol tools so Claude Code / Codex / Copilot / OpenCode can drive the engine with
 * native tool-calls instead of shelling out.
 *
 * Transport: stdio, newline-delimited JSON-RPC 2.0 (the MCP stdio convention). Uses
 * only Node built-ins — no SDK dependency. It is a thin proxy: every tool call becomes
 * a POST to the dev server's /api/helm/rpc, and the structured HELM result is returned
 * as the tool output.
 *
 * Register (Claude Code):   claude mcp add mix -- node scripts/mix-mcp.js
 * Register (generic):       command: "node", args: ["scripts/mix-mcp.js"], transport: stdio
 * Requires `npm run dev` running with the engine open in a browser at the dev URL.
 */
import http from 'http';
import readline from 'readline';

const PORT = process.env.MIX_PORT || 5173;
const HOST = process.env.MIX_HOST || 'localhost';
const PROTOCOL_VERSION = '2024-11-05';

function rpc(reqObj) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(reqObj);
    const r = http.request(
      { hostname: HOST, port: PORT, path: '/api/helm/rpc', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ ok: false, error: 'non-JSON response from engine' }); } });
      },
    );
    r.on('error', (err) => resolve({
      ok: false,
      error: `Cannot reach the MIX Engine at http://${HOST}:${PORT}. Run \`npm run dev\` and open the engine in a browser. (${err.message})`,
    }));
    r.write(postData);
    r.end();
  });
}

// tool name → builds the HelmRequest from the tool arguments.
const TOOLS = {
  mix_describe: {
    description: 'Summarize the whole MIX Engine scene (entities, camera, bounds, selection, mode). Call this first to orient.',
    schema: { type: 'object', properties: {} },
    build: () => ({ op: 'describe' }),
  },
  mix_status: {
    description: 'Engine liveness + a one-line scene summary. Use to check the engine is reachable.',
    schema: { type: 'object', properties: {} },
    build: () => ({ op: 'status' }),
  },
  mix_manifest: {
    description: 'List every command + op the engine supports (with parameters). Read this to learn what mix_do accepts.',
    schema: { type: 'object', properties: {} },
    build: () => ({ op: 'manifest' }),
  },
  mix_query: {
    description: 'List entities, optionally filtered by kind/tag/name. Returns ids, names, world positions, sizes.',
    schema: { type: 'object', properties: { kind: { type: 'string' }, tag: { type: 'string' }, name: { type: 'string' } } },
    build: (a) => ({ op: 'query', filter: { kind: a.kind, tag: a.tag, name: a.name } }),
  },
  mix_get: {
    description: 'Full info on one entity by id.',
    schema: { type: 'object', properties: { entityId: { type: 'number' } }, required: ['entityId'] },
    build: (a) => ({ op: 'get', entityId: a.entityId }),
  },
  mix_raycast: {
    description: "What entity is under a screen point (the agent's 'look at the crosshair'). x,y are 0..1; default centre.",
    schema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
    build: (a) => ({ op: 'raycast', screen: (a.x !== undefined || a.y !== undefined) ? { x: a.x ?? 0.5, y: a.y ?? 0.5 } : undefined }),
  },
  mix_observe: {
    description: "RENDER-grounded visual check — the agent's 'look at the screen'. State queries can't tell you an entity is INVISIBLE (a mis-scaled/occluded/off-camera object still 'exists'); this renders the live scene and reports frame health (black/blown-out) + each entity's on-screen PIXEL coverage + position + plain-English anomalies. Use after editing to confirm what you built is actually visible. Optional filter narrows to kind/tag/name.",
    schema: { type: 'object', properties: { kind: { type: 'string' }, tag: { type: 'string' }, name: { type: 'string' } } },
    build: (a) => ({ op: 'observe', filter: (a.kind || a.tag || a.name) ? { kind: a.kind, tag: a.tag, name: a.name } : undefined }),
  },
  mix_do: {
    description: 'Execute one AICommand or an array of them against the engine (spawn, set_transform, set_material, set_time_of_day, add_light, …). Returns the entities created/removed and any errors. Call mix_manifest to see the command vocabulary.',
    schema: {
      type: 'object',
      properties: {
        commands: { description: 'A single AICommand object, or an array of them.' },
        settleMs: { type: 'number', description: 'Wait time for async spawns/loads (default 200ms).' },
      },
      required: ['commands'],
    },
    build: (a) => ({ op: 'do', commands: a.commands, settleMs: a.settleMs }),
  },
  mix_plan: {
    description: 'Preflight an AICommand batch without changing the MIX Engine. Returns an ordered effect plan and catches unknown commands, missing parameters, unsafe payloads, and commands that cannot be atomically rolled back.',
    schema: {
      type: 'object',
      properties: {
        commands: { description: 'A single AICommand object, or an array of them.' },
        atomic: { type: 'boolean', description: 'Also require scene-snapshot rollback safety.' },
      },
      required: ['commands'],
    },
    build: (a) => ({ op: 'plan', commands: a.commands, atomic: a.atomic }),
  },
  mix_apply: {
    description: 'Preferred authoring path: serialized guarded apply with preflight, semantic diff, optional postconditions, automatic rollback of failed scene edits, and request-key deduplication for safe IDE retries. Atomic defaults true; use mix_plan first for broad runtime/external batches.',
    schema: {
      type: 'object',
      properties: {
        commands: { description: 'A single AICommand object, or an ordered array.' },
        expects: { type: 'array', description: 'Optional HELM postconditions verified after execution.' },
        atomic: { type: 'boolean', description: 'Auto-rollback failed snapshot-safe scene changes (default true).' },
        dryRun: { type: 'boolean', description: 'Preflight only; execute nothing.' },
        requestKey: { type: 'string', description: 'Stable retry key (1..128 chars).' },
        settleMs: { type: 'number', description: 'Wait time for async work.' },
      },
      required: ['commands'],
    },
    build: (a) => ({ op: 'apply', commands: a.commands, expects: a.expects, atomic: a.atomic, dryRun: a.dryRun, requestKey: a.requestKey, settleMs: a.settleMs }),
  },
  mix_resolve: {
    description: 'Resolve a stable MIX entity selector to its current numeric id and full entity info. Accepts @name, guid:<guid>, tag:<tag>, id:<number>, a numeric id, or {name|guid|tag|id}. Ambiguity is an error—HELM never guesses which entity an IDE meant.',
    schema: {
      type: 'object',
      properties: { ref: { description: 'Stable entity selector string, number, or selector object.' } },
      required: ['ref'],
    },
    build: (a) => ({ op: 'resolve', ref: a.ref }),
  },
  mix_checkpoint: {
    description: 'Save a named in-memory snapshot of the scene (so you can try edits and roll back).',
    schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    build: (a) => ({ op: 'checkpoint', name: a.name }),
  },
  mix_restore: {
    description: 'Restore a previously-saved snapshot by name.',
    schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    build: (a) => ({ op: 'restore', name: a.name }),
  },
  mix_assert: {
    description: 'Validate expectations after an edit — state AND render-grounded. expects is an array of { kind: "entity_exists"|"entity_count"|"entity_near"|"no_errors"|"entity_visible"|"frame_renders", … }. entity_visible {name?/tag?/entityKind?/minCoveragePct?} actually checks the thing draws pixels on screen; frame_renders checks the frame is not black/blown-out.',
    schema: { type: 'object', properties: { expects: { type: 'array' } }, required: ['expects'] },
    build: (a) => ({ op: 'assert', expects: a.expects }),
  },
  mix_sensorium_test: {
    description: 'Run a SENSORIUM vision/feel gameplay test by profile (driving|locomotion|jump|combat|camera|stress). Fire-and-forget: the engine drives + records, then a report lands ~10-20s later. Read it via GET /api/sensorium/list → /api/sensorium/get?name=<run>, then hand report.analysis + the video/contact-sheet to a vision model for the game-feel read.',
    schema: { type: 'object', properties: { profile: { type: 'string' }, options: { type: 'object' } }, required: ['profile'] },
    build: (a) => ({ op: 'do', commands: [{ type: 'sensorium_test', profile: a.profile, options: a.options }] }),
  },
};

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function result(id, res) { send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  // Notifications (no id) require no response.
  if (id === undefined || id === null) {
    return; // e.g. notifications/initialized, notifications/cancelled
  }
  switch (method) {
    case 'initialize':
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mix-engine-helm', version: '1.0.0' },
        instructions: 'Drive the MIX Engine via HELM tools. Start with mix_status and mix_describe / mix_manifest. Address entities by stable @name, guid:<guid>, or unique tag:<tag> refs; use mix_resolve when inspecting identity. Prefer mix_plan then mix_apply with a requestKey and postconditions for safe, retryable edits. Use mix_do for deliberately non-atomic runtime actions. Then mix_observe to SEE the rendered result and mix_assert (incl. entity_visible / frame_renders) to verify.',
      });
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.schema })),
      });
    case 'tools/call': {
      const name = params?.name;
      const tool = TOOLS[name];
      if (!tool) return error(id, -32602, `Unknown tool: ${name}`);
      const reqObj = tool.build(params?.arguments ?? {});
      const res = await rpc(reqObj);
      const text = (res && res.text) ? `${res.text}\n\n${JSON.stringify(res, null, 2)}` : JSON.stringify(res, null, 2);
      return result(id, { content: [{ type: 'text', text }], isError: !!(res && res.ok === false) });
    }
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { process.stderr.write(`[mix-mcp] bad JSON line ignored\n`); return; }
  Promise.resolve(handle(msg)).catch((err) => {
    process.stderr.write(`[mix-mcp] handler error: ${err && err.message}\n`);
    if (msg && msg.id !== undefined && msg.id !== null) error(msg.id, -32603, String(err && err.message));
  });
});
process.stderr.write(`[mix-mcp] MIX Engine HELM MCP server on stdio → http://${HOST}:${PORT}\n`);
