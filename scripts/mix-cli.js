#!/usr/bin/env node
import http from 'http';

const PORT = process.env.MIX_PORT || 5173;
const HOST = 'localhost';

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : '';
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method === 'POST') {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Server returned HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Failed to connect to MIX dev server at http://${HOST}:${PORT}. Is the engine running? (${err.message})`));
    });

    if (method === 'POST' && postData) {
      req.write(postData);
    }
    req.end();
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const params = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1];
      if (val && !val.startsWith('--')) {
        params[key] = isNaN(val) ? val : parseFloat(val);
        i++;
      } else {
        params[key] = true;
      }
    }
  }

  return { command, params };
}

async function run() {
  const { command, params } = parseArgs();

  if (!command) {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case 'status':
        await handleStatus();
        break;
      case 'spawn':
        await handleSpawn(params);
        break;
      case 'delete':
        await handleDelete(params);
        break;
      case 'set-transform':
        await handleSetTransform(params);
        break;
      case 'clear':
        await handleClear();
        break;
      case 'test':
        await handleTest(params);
        break;
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (err) {
    console.error('\x1b[31mError:\x1b[0m', err.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
\x1b[36mMIX Engine Remote CLI Bridge\x1b[0m
Usage: node scripts/mix-cli.js <command> [options]

Commands:
  \x1b[32mstatus\x1b[0m                      Get live engine performance, camera position, and active entities.
  \x1b[32mspawn\x1b[0m --kind <kind> [args]  Spawn a preset entity (box, sphere, character, extrusion).
                                Options: --x, --y, --z, --asset (character ID: ayo, hana, opp, RAYNEFBX)
  \x1b[32mdelete\x1b[0m --id <entityId>       Remove an entity by its outliner ID.
  \x1b[32mset-transform\x1b[0m --id <id>     Relocate/orient an entity. Options: --x, --y, --z, --rx, --ry, --rz, --rw
  \x1b[32mclear\x1b[0m                       Delete all spawned entities from the active viewport.
  \x1b[32mtest\x1b[0m --profile <name>         SENSORIUM: run a vision-driven, feel-aware gameplay test.
                                Profiles: driving, locomotion, jump, combat, camera, stress.
                                Options: --duration <s>, --baseline <name>, --game "<desc>"

Examples:
  node scripts/mix-cli.js status
  node scripts/mix-cli.js spawn --kind character --asset ayo --x 0 --y 1.5 --z 0
  node scripts/mix-cli.js delete --id 3
  node scripts/mix-cli.js set-transform --id 2 --x 5 --y 0.5 --z -5
  node scripts/mix-cli.js test --profile driving
  node scripts/mix-cli.js test --profile locomotion --baseline v1

After a run, read the report from public/sensorium/<run>/report.json (or GET
/api/sensorium/list then /api/sensorium/get?name=<run>) and hand report.analysis +
the video / contact-sheet to a vision model.
`);
}

async function handleStatus() {
  const data = await request('/api/telemetry');
  if (!data || !data.camera) {
    console.log('\x1b[33mNo active telemetry session cache found. Load the engine in the browser first.\x1b[0m');
    return;
  }

  const { camera, fps, drawCalls, triangles, entities, timestamp } = data;
  const time = new Date(timestamp).toLocaleTimeString();

  console.log(`
\x1b[35m=== MIX ENGINE LIVE STATUS [${time}] ===\x1b[0m
\x1b[36mPerformance:\x1b[0m FPS: ${fps} | Draw Calls: ${drawCalls} | Triangles: ${(triangles / 1000).toFixed(1)}k
\x1b[36mCamera Pos:\x1b[0m  X: ${camera.position[0].toFixed(2)} | Y: ${camera.position[1].toFixed(2)} | Z: ${camera.position[2].toFixed(2)}
\x1b[36mCamera Dir:\x1b[0m  X: ${camera.direction[0].toFixed(2)} | Y: ${camera.direction[1].toFixed(2)} | Z: ${camera.direction[2].toFixed(2)}

\x1b[36mActive Entities:\x1b[0m`);

  if (!entities || entities.length === 0) {
    console.log('  No custom entities spawned.');
    return;
  }

  console.log(`  | ID  | Kind       | Asset ID   | Position (X, Y, Z)`);
  console.log(`  |-----|------------|------------|-----------------------`);
  entities.forEach((ent) => {
    const id = String(ent.id).padEnd(3);
    const kind = String(ent.kind).padEnd(10);
    const assetId = String(ent.assetId || 'none').padEnd(10);
    const pos = `(${ent.position[0].toFixed(1)}, ${ent.position[1].toFixed(1)}, ${ent.position[2].toFixed(1)})`;
    console.log(`  | ${id} | ${kind} | ${assetId} | ${pos}`);
  });
}

async function handleSpawn(params) {
  const { kind, x = 0, y = 2, z = 0, asset } = params;
  if (!kind) {
    throw new Error('Missing parameter: --kind (e.g. box, sphere, character)');
  }

  let glbPath = asset || kind;
  // If character was requested but asset wasn't set, default to 'ayo'
  if (kind === 'character' && !asset) {
    glbPath = 'ayo';
  }

  const payload = {
    type: 'spawn_entity',
    x, y, z,
    glbPath,
  };

  await request('/api/cli-command', 'POST', payload);
  console.log(`\x1b[32mSuccessfully sent command to spawn '${kind}' (asset: '${glbPath}') at (${x}, ${y}, ${z})\x1b[0m`);
}

async function handleDelete(params) {
  const { id } = params;
  if (id === undefined) {
    throw new Error('Missing parameter: --id (the outliner entity ID to destroy)');
  }

  const payload = {
    type: 'destroy_entity',
    entityId: id,
  };

  await request('/api/cli-command', 'POST', payload);
  console.log(`\x1b[32mSuccessfully sent request to delete entity #${id}\x1b[0m`);
}

async function handleSetTransform(params) {
  const { id, x, y, z, rx, ry, rz, rw } = params;
  if (id === undefined) {
    throw new Error('Missing parameter: --id (the outliner entity ID to transform)');
  }

  const payload = {
    type: 'set_transform',
    entityId: id,
  };

  if (x !== undefined || y !== undefined || z !== undefined) {
    payload.position = {
      x: x !== undefined ? x : 0,
      y: y !== undefined ? y : 0,
      z: z !== undefined ? z : 0,
    };
  }

  if (rx !== undefined || ry !== undefined || rz !== undefined || rw !== undefined) {
    payload.rotation = {
      x: rx || 0,
      y: ry || 0,
      z: rz || 0,
      w: rw !== undefined ? rw : 1,
    };
  }

  await request('/api/cli-command', 'POST', payload);
  console.log(`\x1b[32mSuccessfully sent set-transform command for entity #${id}\x1b[0m`);
}

async function handleClear() {
  const payload = {
    type: 'clear_scene',
  };
  await request('/api/cli-command', 'POST', payload);
  console.log('\x1b[32mSuccessfully sent request to clear all spawned entities\x1b[0m');
}

async function handleTest(params) {
  const { profile = 'locomotion', duration, baseline, game } = params;
  const valid = ['driving', 'locomotion', 'jump', 'combat', 'camera', 'stress', 'free'];
  if (!valid.includes(profile)) {
    throw new Error(`Unknown --profile '${profile}'. Use one of: ${valid.join(', ')}`);
  }
  const options = {};
  if (duration !== undefined) options.duration = Number(duration);
  if (baseline !== undefined) options.baseline = String(baseline);
  if (game !== undefined) options.game = String(game);

  const payload = { type: 'sensorium_test', profile };
  if (Object.keys(options).length) payload.options = options;

  await request('/api/cli-command', 'POST', payload);
  console.log(`\x1b[36m◎ SENSORIUM\x1b[0m: started '\x1b[32m${profile}\x1b[0m' scenario in the running engine.`);
  console.log(`The engine is driving + recording now. When it finishes (~10-20s), read the report:`);
  console.log(`  \x1b[2mGET /api/sensorium/list\x1b[0m  then  \x1b[2mGET /api/sensorium/get?name=<run>\x1b[0m`);
  console.log(`  or open \x1b[2mpublic/sensorium/<run>/report.json\x1b[0m`);
  console.log(`Hand \x1b[33mreport.analysis\x1b[0m + the video / contact-sheet to a vision model to get the game-feel read.`);
}

run();
