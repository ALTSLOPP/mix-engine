#!/usr/bin/env node
/**
 * HELM CLI — drive the MIX Engine from a coding agent / terminal and get a STRUCTURED
 * result back (unlike the fire-and-forget mix-cli.js). Talks to the dev server's
 * /api/helm/rpc endpoint, which forwards to the running engine and returns the result.
 *
 * Requires `npm run dev` running AND the engine open in a browser at the dev URL.
 *
 * Examples:
 *   node scripts/mix-helm.js describe
 *   node scripts/mix-helm.js status
 *   node scripts/mix-helm.js manifest
 *   node scripts/mix-helm.js do '{"type":"spawn_entity","x":0,"y":1.5,"z":0,"glbPath":"ayo"}'
 *   node scripts/mix-helm.js do --file edits.json
 *   node scripts/mix-helm.js plan --file edits.json --atomic
 *   node scripts/mix-helm.js apply --file edits.json --expects-file checks.json --request-key city-v4
 *   node scripts/mix-helm.js resolve @hero
 *   node scripts/mix-helm.js query --kind character
 *   node scripts/mix-helm.js get --id 3
 *   node scripts/mix-helm.js raycast --x 0.5 --y 0.5
 *   node scripts/mix-helm.js checkpoint --name before
 *   node scripts/mix-helm.js restore --name before
 *   node scripts/mix-helm.js assert '[{"kind":"entity_exists","name":"hero"}]'
 */
import http from 'http';
import fs from 'fs';
import path from 'path';

function resolvePort() {
  if (process.env.MIX_PORT) return +process.env.MIX_PORT;
  try {
    const lockPath = path.join(process.cwd(), '.mix', 'daemon.lock');
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      if (lock && typeof lock.port === 'number') return lock.port;
    }
  } catch {}
  return 5173;
}

const PORT = resolvePort();
const HOST = 'localhost';

function rpc(reqObj) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(reqObj);
    const r = http.request(
      { hostname: HOST, port: PORT, path: '/api/helm/rpc', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        });
      },
    );
    r.on('error', (err) => reject(new Error(
      `Failed to reach MIX dev server at http://${HOST}:${PORT}. Is \`npm run dev\` running with the engine open in a browser? (${err.message})`)));
    r.write(postData);
    r.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: HOST, port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    }).on('error', reject);
  });
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1];
      if (val !== undefined && !val.startsWith('--')) { flags[key] = val; i++; }
      else flags[key] = true;
    } else positionals.push(argv[i]);
  }
  return { positionals, flags };
}

const num = (v) => (v === undefined ? undefined : isNaN(+v) ? v : +v);
const bool = (v, fallback) => v === undefined ? fallback : v === true || String(v).toLowerCase() === 'true' || String(v) === '1';

function print(resp) {
  if (resp && resp.text) console.log(resp.text);
  // Always print the full JSON so an agent can parse it.
  console.log(JSON.stringify(resp, null, 2));
  if (resp && resp.ok === false) process.exitCode = 1;
}

function help() {
  console.log(`\x1b[36mHELM\x1b[0m — MIX Engine agent control plane CLI

Usage: node scripts/mix-helm.js <op> [options]

Ops:
  \x1b[32mdescribe\x1b[0m                  Token-efficient summary of the whole scene.
  \x1b[32mstatus\x1b[0m                    Engine liveness + one-line scene summary.
  \x1b[32mmanifest\x1b[0m                  The full capability manifest (all ops + commands).
  \x1b[32mquery\x1b[0m [--kind --tag --name]  Filtered list of entities.
  \x1b[32mget\x1b[0m --id <n>               Full info on one entity.
  \x1b[32mraycast\x1b[0m [--x --y]          What entity is under a screen point (0..1, default centre).
  \x1b[32mdo\x1b[0m '<json>' | --file <f>   Run a command (or array of commands); returns created/removed/errors.
  \x1b[32mplan\x1b[0m '<json>' | --file <f> Validate a batch without changing the engine; add --atomic to check rollback safety.
  \x1b[32mapply\x1b[0m '<json>' | --file <f> Guarded apply: preflight + diff + optional postconditions + rollback.
                              Options: --expects '<json>' | --expects-file <f>, --request-key <key>,
                              --atomic false, --dry-run, --settle-ms <n>.
  \x1b[32mresolve\x1b[0m <ref>              Resolve @name, guid:<guid>, tag:<tag>, or id:<number>.
  \x1b[32mcheckpoint\x1b[0m --name <n>      Save an in-memory scene snapshot.
  \x1b[32mrestore\x1b[0m --name <n>         Restore a snapshot.
  \x1b[32mcheckpoints\x1b[0m               List snapshot names.
  \x1b[32massert\x1b[0m '<json>'            Evaluate scene-state expectations (array).

Every op prints a JSON result. Requires \`npm run dev\` + the engine open in a browser.`);
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const op = positionals[0];
  if (!op || op === 'help') { help(); return; }

  try {
    switch (op) {
      case 'describe': print(await rpc({ op: 'describe' })); break;
      case 'status': print(await rpc({ op: 'status' })); break;
      case 'checkpoints': print(await rpc({ op: 'checkpoints' })); break;
      case 'manifest': print(await getJson('/api/helm/manifest')); break;
      case 'query': print(await rpc({ op: 'query', filter: { kind: flags.kind, tag: flags.tag, name: flags.name } })); break;
      case 'get': print(await rpc({ op: 'get', entityId: num(flags.id) })); break;
      case 'raycast': print(await rpc({ op: 'raycast', screen: (flags.x !== undefined || flags.y !== undefined) ? { x: flags.x !== undefined ? +flags.x : 0.5, y: flags.y !== undefined ? +flags.y : 0.5 } : undefined })); break;
      case 'checkpoint': print(await rpc({ op: 'checkpoint', name: flags.name })); break;
      case 'restore': print(await rpc({ op: 'restore', name: flags.name })); break;
      case 'do': {
        const raw = flags.file ? fs.readFileSync(flags.file, 'utf-8') : positionals[1];
        if (!raw) throw new Error("`do` needs a JSON command string or --file <path>.");
        print(await rpc({ op: 'do', commands: JSON.parse(raw), settleMs: num(flags.settleMs) }));
        break;
      }
      case 'plan': {
        const raw = flags.file ? fs.readFileSync(flags.file, 'utf-8') : positionals[1];
        if (!raw) throw new Error("`plan` needs a JSON command string or --file <path>.");
        print(await rpc({ op: 'plan', commands: JSON.parse(raw), atomic: bool(flags.atomic, false) }));
        break;
      }
      case 'apply': {
        const raw = flags.file ? fs.readFileSync(flags.file, 'utf-8') : positionals[1];
        if (!raw) throw new Error("`apply` needs a JSON command string or --file <path>.");
        const expectsRaw = flags['expects-file'] ? fs.readFileSync(flags['expects-file'], 'utf-8') : flags.expects;
        print(await rpc({
          op: 'apply', commands: JSON.parse(raw),
          expects: expectsRaw ? JSON.parse(expectsRaw) : undefined,
          requestKey: flags['request-key'] ?? flags.requestKey,
          atomic: bool(flags.atomic, true), dryRun: bool(flags['dry-run'] ?? flags.dryRun, false),
          settleMs: num(flags['settle-ms'] ?? flags.settleMs),
        }));
        break;
      }
      case 'resolve': {
        const raw = positionals[1];
        if (!raw) throw new Error('`resolve` needs @name, guid:<guid>, tag:<tag>, or id:<number>.');
        let ref = raw;
        if (raw.startsWith('{')) ref = JSON.parse(raw);
        else if (/^\d+$/.test(raw)) ref = +raw;
        print(await rpc({ op: 'resolve', ref }));
        break;
      }
      case 'assert': {
        const raw = flags.file ? fs.readFileSync(flags.file, 'utf-8') : positionals[1];
        if (!raw) throw new Error("`assert` needs a JSON array of expectations or --file <path>.");
        print(await rpc({ op: 'assert', expects: JSON.parse(raw) }));
        break;
      }
      case 'daemon': {
        const sub = positionals[1] || 'status';
        const lockPath = path.join(process.cwd(), '.mix', 'daemon.lock');
        if (sub === 'status') {
          if (fs.existsSync(lockPath)) {
            const info = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
            console.log(`Daemon lock active: PID ${info.pid}, Port ${info.port}`);
          } else {
            console.log('Daemon is not running (no .mix/daemon.lock found).');
          }
        } else if (sub === 'stop') {
          if (fs.existsSync(lockPath)) {
            const info = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
            try { process.kill(info.pid, 'SIGTERM'); } catch {}
            try { fs.unlinkSync(lockPath); } catch {}
            console.log(`Sent stop signal to daemon PID ${info.pid}.`);
          } else {
            console.log('Daemon is not running.');
          }
        }
        break;
      }
      default: console.error(`Unknown op '${op}'. Run \`node scripts/mix-helm.js help\`.`); process.exitCode = 1;
    }
  } catch (err) {
    console.error('\x1b[31mError:\x1b[0m', err.message);
    process.exit(1);
  }
}

main();
