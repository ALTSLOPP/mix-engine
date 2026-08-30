import { defineConfig, type Plugin, type Connect } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
// Type-only import graph (manifest → types → AICommand) is erased at build, so this
// pulls in just the plain manifest data — no THREE/engine runtime into the config.
import { HELM_MANIFEST } from './src/helm/manifest';

/**
 * Dev-only save endpoints.
 *
 *  - /api/save-glb   → public/assets/exports/<basename>.glb   (BuildingExtruder mesh export)
 *  - /api/save-world → public/worlds/<basename>.bin            (AI save_scene snapshot)
 *
 * Both validate the HTTP method and sanitize the requested filename through
 * path.basename so a caller can never escape the target directory.
 */
function devSaveEndpoints(): Plugin {
  const PROJECT_ROOT = path.resolve(__dirname);
  let lastKnownSceneState = '';
  let lastKnownTelemetry = '{}';
  let lastKnownSceneQuery = '{}';

  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  const handler =
    (subDir: string, ext: string): Connect.NextHandleFunction =>
    async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Allow', 'POST');
        res.end('Method Not Allowed');
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const requested = url.searchParams.get('name') ?? 'untitled';
        // path.basename strips any directory component → no traversal.
        const safe = path.basename(requested).replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = safe.endsWith(ext) ? safe : safe + ext;

        const outDir = path.join(PROJECT_ROOT, subDir);
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, fileName);

        const body = await readBody(req);
        fs.writeFileSync(outPath, body);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, path: `${subDir}/${fileName}`, bytes: body.length }));
      } catch (err) {
        // Surface but never crash the dev server.
        // eslint-disable-next-line no-console
        console.error('[dev-save] failed:', err);
        next(err as Error);
      }
    };

  return {
    name: 'mix-dev-save-endpoints',
    configureServer(server) {
      server.middlewares.use('/api/save-glb', handler('public/assets/exports', '.glb'));
      server.middlewares.use('/api/save-world', handler('public/worlds', '.bin'));

      // GET a saved world snapshot written by /api/save-world.
      server.middlewares.use('/api/load-world', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const requested = url.searchParams.get('name') ?? 'world';
          const safe = path.basename(requested).replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileName = safe.endsWith('.bin') ? safe : safe + '.bin';
          const filePath = path.join(PROJECT_ROOT, 'public', 'worlds', fileName);
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          const data = fs.readFileSync(filePath);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(data);
        } catch (err) {
          next(err as Error);
        }
      });

      // -------------------------------------------------------------
      // Game / Project Management
      // -------------------------------------------------------------
      const gamesDir = path.join(PROJECT_ROOT, 'games');
      const activeGameJsonPath = path.join(PROJECT_ROOT, 'active_game.json');
      const blenderConfigPath = path.join(PROJECT_ROOT, 'blender_config.json');
      
      // Ensure games dir exists
      if (!fs.existsSync(gamesDir)) {
        fs.mkdirSync(gamesDir, { recursive: true });
      }

      function getBlenderPath(): string | null {
        try {
          if (fs.existsSync(blenderConfigPath)) {
            const data = JSON.parse(fs.readFileSync(blenderConfigPath, 'utf-8'));
            return data.blenderPath || null;
          }
        } catch (e) {
          console.error('[mix-dev-server] error reading blender_config.json', e);
        }
        return null;
      }

      function updateActiveGameLlmAssets(gameName: string | null) {
        if (!gameName) return;
        const targetGameDir = path.join(gamesDir, gameName);
        if (!fs.existsSync(targetGameDir)) return;

        const blenderPath = getBlenderPath();
        const blenderPathTxtPath = path.join(targetGameDir, 'blender_path.txt');

        // 1. Write or delete blender_path.txt
        if (blenderPath) {
          fs.writeFileSync(blenderPathTxtPath, blenderPath, 'utf-8');
        } else {
          if (fs.existsSync(blenderPathTxtPath)) {
            try {
              fs.unlinkSync(blenderPathTxtPath);
            } catch (err) {
              console.error('[mix-dev-server] failed to delete blender_path.txt:', err);
            }
          }
        }

        // 2. Update LLM_GUIDE.md
        const llmGuidePath = path.join(targetGameDir, 'LLM_GUIDE.md');
        const templatePath = path.join(PROJECT_ROOT, 'LLM_GUIDE_TEMPLATE.md');

        if (fs.existsSync(templatePath)) {
          let templateStr = fs.readFileSync(templatePath, 'utf-8');
          // Replace GAME_NAME
          templateStr = templateStr.replace(/\{\{GAME_NAME\}\}/g, gameName);

          // Replace BLENDER_INTEGRATION_INFO placeholder
          let blenderInfo = '';
          if (blenderPath) {
            blenderInfo = `Blender is available on this computer at:
\`${blenderPath}\`

If you need to generate 3D models or process meshes procedurally, you can write a Blender Python script and execute it in the background using the command-line interface:
\`\`\`powershell
& "${blenderPath}\\blender.exe" --background --python <script.py>
\`\`\`
This is highly recommended for building bespoke 3D assets on the fly!`;
          } else {
            blenderInfo = `No Blender path is currently configured in the engine settings.
If you need to make 3D assets using Blender, ask the user to link their Blender folder in the engine's top-right Settings menu first.`;
          }

          templateStr = templateStr.replace(/\{\{BLENDER_INTEGRATION_INFO\}\}/g, blenderInfo);
          fs.writeFileSync(llmGuidePath, templateStr, 'utf-8');
        } else {
          fs.writeFileSync(llmGuidePath, `# ${gameName} - LLM Guide\n\nWelcome! You can write custom logic in \`scripts/main.js\` and place assets in the \`assets/\` directory.\nThe \`scene.json\` file controls the level layout and entities.\n\nTo control the engine, you can edit these files. The engine will auto-reload when \`scene.json\` changes!`, 'utf-8');
        }
      }

      function getActiveGame(): string | null {
        try {
          if (fs.existsSync(activeGameJsonPath)) {
            const data = JSON.parse(fs.readFileSync(activeGameJsonPath, 'utf-8'));
            return data.active || null;
          }
        } catch (e) {
          console.error('[mix-dev-server] error reading active_game.json', e);
        }
        return null;
      }

      function getProjectSummary(entry: fs.Dirent) {
        const projectDir = path.join(gamesDir, entry.name);
        const scenePath = path.join(projectDir, 'scene.json');
        const scriptPath = path.join(projectDir, 'scripts', 'main.js');
        let entityCount = 0;
        let sceneBytes = 0;
        let updatedAt = fs.statSync(projectDir).mtimeMs;
        const createdAt = fs.statSync(projectDir).birthtimeMs;
        try {
          if (fs.existsSync(scenePath)) {
            const sceneStat = fs.statSync(scenePath);
            sceneBytes = sceneStat.size;
            updatedAt = Math.max(updatedAt, sceneStat.mtimeMs);
            const scene = JSON.parse(fs.readFileSync(scenePath, 'utf-8'));
            if (Array.isArray(scene?.entities)) entityCount = scene.entities.length;
            else if (scene?.scenes && typeof scene.scenes === 'object') {
              const entryScene = scene.entryScene ?? Object.keys(scene.scenes)[0];
              const entities = scene.scenes[entryScene];
              if (Array.isArray(entities)) entityCount = entities.length;
            }
          }
          if (fs.existsSync(scriptPath)) updatedAt = Math.max(updatedAt, fs.statSync(scriptPath).mtimeMs);
        } catch (error) {
          console.warn(`[mix-dev-server] could not inspect project '${entry.name}':`, error);
        }
        return {
          name: entry.name,
          updatedAt,
          createdAt,
          entityCount,
          sceneBytes,
          hasScripts: fs.existsSync(scriptPath),
        };
      }

      function getActiveScenePath(): string {
        const active = getActiveGame();
        if (active) {
          const p = path.join(gamesDir, active, 'scene.json');
          // ensure subfolder exists
          if (!fs.existsSync(path.dirname(p))) {
            fs.mkdirSync(path.dirname(p), { recursive: true });
          }
          return p;
        }
        return path.join(PROJECT_ROOT, 'scene.json');
      }

      let currentWatcher: fs.FSWatcher | null = null;
      
      function setupSceneWatcher() {
        if (currentWatcher) {
          currentWatcher.close();
          currentWatcher = null;
        }
        const active = getActiveGame();
        let watchDir = PROJECT_ROOT;
        if (active) {
          watchDir = path.join(gamesDir, active);
          if (!fs.existsSync(watchDir)) fs.mkdirSync(watchDir, { recursive: true });
        }
        
        currentWatcher = fs.watch(watchDir, (eventType, filename) => {
          if (filename === 'scene.json') {
            try {
              const sp = getActiveScenePath();
              if (fs.existsSync(sp)) {
                const content = fs.readFileSync(sp, 'utf-8').trim();
                if (content && content !== lastKnownSceneState) {
                  lastKnownSceneState = content;
                  console.log(`[mix-dev-server] scene.json modified in ${active || 'root'}. Pushing update to browser...`);
                  server.ws.send('mix:reload-scene', { state: content });
                }
              }
            } catch (err) {
              console.error('[mix-dev-server] Error reading scene.json:', err);
            }
          }
        });
      }
      
      // Initial watcher setup
      setupSceneWatcher();

      // Watch for changes to active_game.json to reload the watcher
      fs.watch(PROJECT_ROOT, (eventType, filename) => {
        if (filename === 'active_game.json') {
          console.log('[mix-dev-server] active_game.json changed. Re-configuring scene watcher.');
          setupSceneWatcher();
        }
      });

      // API endpoints for games
      server.middlewares.use('/api/games/active', async (req, res, next) => {
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ active: getActiveGame() }));
        } else if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const parsed = JSON.parse(body.toString('utf-8'));
            if (parsed.active) {
              const safeName = String(parsed.active).replace(/[^a-zA-Z0-9._-]/g, '_');
              if (!safeName || !fs.existsSync(path.join(gamesDir, safeName))) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'Project not found.' }));
                return;
              }
              fs.writeFileSync(activeGameJsonPath, JSON.stringify({ active: safeName }), 'utf-8');
              setupSceneWatcher();
              // Sync Blender files for the active game
              updateActiveGameLlmAssets(safeName);
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            next(err);
          }
        } else {
          next();
        }
      });

      // Blender path endpoints
      server.middlewares.use('/api/blender-path', async (req, res, next) => {
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ blenderPath: getBlenderPath() }));
        } else if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const parsed = JSON.parse(body.toString('utf-8'));
            const bPath = typeof parsed.blenderPath === 'string' && parsed.blenderPath.trim() !== '' ? parsed.blenderPath.trim() : null;
            
            if (bPath) {
              fs.writeFileSync(blenderConfigPath, JSON.stringify({ blenderPath: bPath }, null, 2), 'utf-8');
            } else {
              if (fs.existsSync(blenderConfigPath)) {
                fs.unlinkSync(blenderConfigPath);
              }
            }

            // Sync with active game
            const active = getActiveGame();
            if (active) {
              updateActiveGameLlmAssets(active);
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, blenderPath: bPath }));
          } catch (err) {
            next(err);
          }
        } else {
          next();
        }
      });

      server.middlewares.use('/api/games', async (req, res, next) => {
        // Must check strict URL because /api/games/active is already handled above,
        // but connect middleware runs sequentially and matches prefixes.
        // Actually, connect `.use` matches prefix. Let's do exact match:
        if (req.url === '/' || req.url === '') {
          if (req.method === 'GET') {
            try {
              const entries = fs.readdirSync(gamesDir, { withFileTypes: true });
              const projectEntries = entries.filter(e => e.isDirectory());
              const games = projectEntries.map(e => e.name);
              const projects = projectEntries.map(getProjectSummary);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ games, projects }));
            } catch (err) {
              next(err);
            }
          } else if (req.method === 'POST') {
            try {
              const body = await readBody(req);
              const parsed = JSON.parse(body.toString('utf-8'));
              if (parsed.name) {
                const safeName = parsed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const newGameDir = path.join(gamesDir, safeName);
                if (!safeName) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: 'Invalid project name.' }));
                  return;
                }
                if (fs.existsSync(newGameDir)) {
                  res.statusCode = 409;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: false, error: 'A project with this name already exists.' }));
                  return;
                }
                fs.mkdirSync(newGameDir, { recursive: true });
                
                // Scaffold empty scene.json
                const newScenePath = path.join(newGameDir, 'scene.json');
                if (!fs.existsSync(newScenePath)) {
                  fs.writeFileSync(newScenePath, JSON.stringify({ entities: [] }, null, 2), 'utf-8');
                }
                
                // Scaffold LLM_GUIDE.md and blender_path.txt
                updateActiveGameLlmAssets(safeName);

                // Scaffold engine.d.ts
                const dtsPath = path.join(newGameDir, 'engine.d.ts');
                if (!fs.existsSync(dtsPath)) {
                  fs.writeFileSync(dtsPath, `declare interface Engine {\n  sceneManager: any;\n  input: any;\n  viewport: any;\n  worldOrigin: any;\n}\n\ndeclare function registerGameLogic(callback: (engine: Engine) => void): void;\n`, 'utf-8');
                }

                // Scaffold scripts/main.js
                const scriptsDir = path.join(newGameDir, 'scripts');
                if (!fs.existsSync(scriptsDir)) {
                  fs.mkdirSync(scriptsDir, { recursive: true });
                }
                const mainJsPath = path.join(scriptsDir, 'main.js');
                if (!fs.existsSync(mainJsPath)) {
                  fs.writeFileSync(mainJsPath, `// Custom game logic entry point\nexport default function initGame(engine) {\n  console.log("Game loaded: ${safeName}");\n  // engine.sceneManager.spawnNow(...);\n}\n`, 'utf-8');
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, name: safeName }));
              } else {
                res.statusCode = 400;
                res.end('Missing name');
              }
            } catch (err) {
              next(err);
            }
          } else if (req.method === 'DELETE') {
            try {
              const body = await readBody(req);
              const parsed = JSON.parse(body.toString('utf-8'));
              if (parsed.name) {
                const safeName = parsed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const targetDir = path.join(gamesDir, safeName);
                if (fs.existsSync(targetDir)) {
                  fs.rmSync(targetDir, { recursive: true, force: true });
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true }));
              } else {
                res.statusCode = 400;
                res.end('Missing name');
              }
            } catch (err) {
              next(err);
            }
          } else {
            next();
          }
        } else {
          next();
        }
      });

      // Endpoint: Client GETs its scene state (so it knows what to load on startup without ws push)
      server.middlewares.use('/api/scene-state', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const sp = getActiveScenePath();
            let state = '{}';
            if (fs.existsSync(sp)) {
              state = fs.readFileSync(sp, 'utf-8').trim() || '{}';
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(state);
          } catch(err) {
            next(err);
          }
        } else if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const content = body.toString('utf-8').trim();
            if (content !== lastKnownSceneState) {
              lastKnownSceneState = content;
              const sp = getActiveScenePath();
              fs.writeFileSync(sp, content, 'utf-8');
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            next(err);
          }
        } else {
          next();
        }
      });

      // Endpoint: Telemetry cache (GET retrieves, POST updates)
      server.middlewares.use('/api/telemetry', async (req, res, next) => {
        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            lastKnownTelemetry = body.toString('utf-8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            next(err);
          }
        } else if (req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(lastKnownTelemetry);
        } else {
          next();
        }
      });

      // Endpoint: Forward CLI command to the browser client via WebSockets
      server.middlewares.use('/api/cli-command', async (req, res, next) => {
        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const cmd = JSON.parse(body.toString('utf-8'));
            console.log('[mix-dev-server] CLI command received. Forwarding to client:', cmd);
            server.ws.send('mix:cli-command', cmd);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            next(err);
          }
        } else {
          next();
        }
      });

      // Endpoint: High-resolution screenshots posted by `engine.captureScreenshot()`.
      // Body: { dataUrl: "data:image/png;base64,..." }. Saved to public/screenshots/.
      // The IDE can read the file from disk immediately after the command returns.
      server.middlewares.use('/api/screenshot', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const requested = url.searchParams.get('name') ?? `mix_${Date.now()}`;
          const safe = path.basename(requested).replace(/[^a-zA-Z0-9._-]/g, '_');
          const fileName = safe.endsWith('.png') ? safe : safe + '.png';
          const body = await readBody(req);
          const parsed = JSON.parse(body.toString('utf-8'));
          const dataUrl = String(parsed?.dataUrl ?? '');
          const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
          if (!m) {
            res.statusCode = 400;
            res.end('missing dataUrl');
            return;
          }
          const outDir = path.join(PROJECT_ROOT, 'public', 'screenshots');
          fs.mkdirSync(outDir, { recursive: true });
          const outPath = path.join(outDir, fileName);
          fs.writeFileSync(outPath, Buffer.from(m[1], 'base64'));
          console.log(`[mix-dev-server] Screenshot saved: ${outPath}`);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: `public/screenshots/${fileName}` }));
        } catch (err) {
          console.error('[mix-dev-server] screenshot failed:', err);
          next(err as Error);
        }
      });

      // ─── Animation Retarget Pro — pack asset discovery ──────────────────────
      // GET /api/list-assets?path=/assets/packs/SwordPack
      //   → { files: ["Slash.fbx", ...], base: "/assets/packs/SwordPack" }
      // Resolves the folder against (in order): public/<path>, games/<active>/assets/<path>,
      // games/<active>/<path>. `base` is the URL prefix the client should fetch files from
      // (public paths serve directly; game folders are served via vite's fs allow).
      server.middlewares.use('/api/list-assets', (req, res, next) => {
        if (req.method !== 'GET') { next(); return; }
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const requested = (url.searchParams.get('path') ?? '/assets').replace(/^\/+/, '');
          const active = getActiveGame();
          const candidates: Array<{ dir: string; base: string }> = [
            { dir: path.join(PROJECT_ROOT, 'public', requested), base: `/${requested}` },
          ];
          if (active) {
            candidates.push({ dir: path.join(gamesDir, active, 'assets', requested), base: `/games/${active}/assets/${requested}` });
            candidates.push({ dir: path.join(gamesDir, active, requested), base: `/games/${active}/${requested}` });
          }
          for (const c of candidates) {
            if (!fs.existsSync(c.dir) || !fs.statSync(c.dir).isDirectory()) continue;
            const entries = fs.readdirSync(c.dir, { withFileTypes: true });
            const files = entries.filter(e => e.isFile() && /\.(fbx|glb|gltf)$/i.test(e.name)).map(e => e.name);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ files, base: c.base }));
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files: [] }));
        } catch (err) { next(err as Error); }
      });

      // GET /api/anim-packs → last known pack defs mirrored from the browser (or empty)
      // POST /api/anim-packs with defs keeps a dev-server copy for headless IDE inspection.
      // GET /api/anim-packs/result?packId=X → last import result for polling
      const animPackMirror: { defs: unknown } = { defs: [] };
      const animPackResults = new Map<string, unknown>();
      server.middlewares.use('/api/anim-packs', async (req, res, next) => {
        if (req.url?.startsWith('/api/anim-packs/result')) {
          if (req.method === 'POST') {
            try {
              const body = JSON.parse((await readBody(req)).toString('utf-8'));
              const pid = String(body.packId ?? 'unknown');
              animPackResults.set(pid, body.res ?? body);
              res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) { next(err as Error); }
            return;
          }
          if (req.method === 'GET') {
            try {
              const url = new URL(req.url ?? '', 'http://localhost');
              const pid = url.searchParams.get('packId') ?? '';
              const r = pid ? animPackResults.get(pid) : undefined;
              res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(r ?? null));
            } catch (err) { next(err as Error); }
            return;
          }
          next(); return;
        }
        if (req.method === 'GET') {
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(animPackMirror.defs));
          return;
        }
        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            animPackMirror.defs = JSON.parse(body.toString('utf-8'));
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) { next(err as Error); }
          return;
        }
        next();
      });

      // Endpoint: Scene-query cache. `query_scene` posts the result here; the IDE
      // GETs it right after to reason about live world state.
      server.middlewares.use('/api/scene-query', async (req, res, next) => {
        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            lastKnownSceneQuery = body.toString('utf-8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            next(err);
          }
        } else if (req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(lastKnownSceneQuery);
        } else {
          next();
        }
      });

      // ─── SENSORIUM endpoints (vision-driven, feel-aware gameplay test capture) ───
      // Artifacts land under public/sensorium/<recording>/ so the browser serves them
      // back as static files for the IDE to read. Registered under both /api/sensorium
      // (current) and /api/playback (deprecated alias) — same on-disk storage.
      const SENSORIUM_ROOT = path.join(PROJECT_ROOT, 'public', 'sensorium');
      const sensoriumIndex = new Map<string, {
        savedAt: number; duration: number; success: boolean; fps: number; anomalies: number; feel: number; profile: string;
      }>();
      const safeName = (s: string) => path.basename(s).replace(/[^a-zA-Z0-9._-]/g, '_');
      const writeDataUrl = (rec: string, rel: string, dataUrl: string, pngOnly = false): boolean => {
        const re = pngOnly ? /^data:image\/png;base64,(.+)$/ : /^data:([^;]+);base64,(.+)$/;
        const m = re.exec(dataUrl);
        if (!m) return false;
        const b64 = pngOnly ? m[1] : m[2];
        const outPath = path.join(SENSORIUM_ROOT, rec, rel);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
        return true;
      };

      const registerSensorium = (prefix: string): void => {
        // POST <prefix>/video — body: { recording, mime, dataUrl }
        server.middlewares.use(`${prefix}/video`, async (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          try {
            const p = JSON.parse((await readBody(req)).toString('utf-8'));
            const rec = safeName(String(p.recording ?? ''));
            if (!writeDataUrl(rec, 'video.webm', String(p.dataUrl ?? ''))) { res.statusCode = 400; res.end('bad dataUrl'); return; }
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `public/sensorium/${rec}/video.webm` }));
          } catch (err) { console.error('[mix-dev-server] sensorium video failed:', err); next(err as Error); }
        });

        // POST <prefix>/telemetry — body: { recording, jsonl }
        server.middlewares.use(`${prefix}/telemetry`, async (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          try {
            const p = JSON.parse((await readBody(req)).toString('utf-8'));
            const rec = safeName(String(p.recording ?? ''));
            const outDir = path.join(SENSORIUM_ROOT, rec);
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(path.join(outDir, 'telemetry.jsonl'), String(p.jsonl ?? ''), 'utf-8');
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true }));
          } catch (err) { next(err); }
        });

        // POST <prefix>/keyframe — body: { recording, t, dataUrl }
        server.middlewares.use(`${prefix}/keyframe`, async (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          try {
            const p = JSON.parse((await readBody(req)).toString('utf-8'));
            const rec = safeName(String(p.recording ?? ''));
            const t = Number(p.t ?? 0);
            const fileName = `frame_${t.toFixed(2).replace('.', '_')}.png`;
            if (!writeDataUrl(rec, path.join('keyframes', fileName), String(p.dataUrl ?? ''), true)) { res.statusCode = 400; res.end('bad dataUrl'); return; }
            res.statusCode = 200; res.end(JSON.stringify({ ok: true }));
          } catch (err) { next(err); }
        });

        // POST <prefix>/contactsheet — body: { recording, dataUrl } (one montage PNG)
        server.middlewares.use(`${prefix}/contactsheet`, async (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          try {
            const p = JSON.parse((await readBody(req)).toString('utf-8'));
            const rec = safeName(String(p.recording ?? ''));
            if (!writeDataUrl(rec, 'contact-sheet.png', String(p.dataUrl ?? ''), true)) { res.statusCode = 400; res.end('bad dataUrl'); return; }
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `public/sensorium/${rec}/contact-sheet.png` }));
          } catch (err) { next(err); }
        });

        // POST <prefix>/report — body: { recording, report }
        server.middlewares.use(`${prefix}/report`, async (req, res, next) => {
          if (req.method !== 'POST') { next(); return; }
          try {
            const p = JSON.parse((await readBody(req)).toString('utf-8'));
            const rec = safeName(String(p.recording ?? ''));
            const report = p.report ?? {};
            const outDir = path.join(SENSORIUM_ROOT, rec);
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf-8');
            const meta = {
              savedAt: Date.now(),
              duration: Number(report.duration ?? 0),
              success: !!report.success,
              fps: Number(report.fps?.avg ?? 0),
              anomalies: Array.isArray(report.anomalies) ? report.anomalies.length : 0,
              feel: Number(report.feel?.overall ?? 0),
              profile: String(report.profile ?? 'free'),
            };
            sensoriumIndex.set(rec, meta);
            const idx: Record<string, typeof meta> = {};
            for (const [k, v] of sensoriumIndex) idx[k] = v;
            fs.writeFileSync(path.join(SENSORIUM_ROOT, 'index.json'), JSON.stringify(idx, null, 2), 'utf-8');
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `public/sensorium/${rec}/report.json` }));
          } catch (err) { next(err); }
        });

        // GET <prefix>/list — index of past recordings (newest first).
        server.middlewares.use(`${prefix}/list`, (req, res, next) => {
          if (req.method !== 'GET') { next(); return; }
          try {
            if (sensoriumIndex.size === 0) {
              const idxPath = path.join(SENSORIUM_ROOT, 'index.json');
              if (fs.existsSync(idxPath)) {
                const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
                for (const [k, v] of Object.entries(idx as Record<string, any>)) sensoriumIndex.set(k, v as any);
              }
            }
            const list = [...sensoriumIndex.entries()]
              .map(([name, meta]) => ({ name, ...meta }))
              .sort((a, b) => b.savedAt - a.savedAt);
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(list));
          } catch (err) { next(err); }
        });

        // GET <prefix>/get?name=X — full report JSON (convenience).
        server.middlewares.use(`${prefix}/get`, (req, res, next) => {
          if (req.method !== 'GET') { next(); return; }
          try {
            const url = new URL(req.url ?? '', 'http://localhost');
            const rec = safeName(url.searchParams.get('name') ?? '');
            const filePath = path.join(SENSORIUM_ROOT, rec, 'report.json');
            if (!fs.existsSync(filePath)) { res.statusCode = 404; res.end('not found'); return; }
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(fs.readFileSync(filePath, 'utf-8'));
          } catch (err) { next(err); }
        });

        // GET/POST <prefix>/baseline?name=X — feel-regression baselines.
        // POST body: { savedAt, feel }. Stored at public/sensorium/baselines/<name>.json.
        server.middlewares.use(`${prefix}/baseline`, async (req, res, next) => {
          try {
            const url = new URL(req.url ?? '', 'http://localhost');
            const name = safeName(url.searchParams.get('name') ?? 'default');
            const dir = path.join(SENSORIUM_ROOT, 'baselines');
            const filePath = path.join(dir, `${name}.json`);
            if (req.method === 'POST') {
              const body = await readBody(req);
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(filePath, body.toString('utf-8'), 'utf-8');
              res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true }));
            } else if (req.method === 'GET') {
              if (!fs.existsSync(filePath)) { res.statusCode = 404; res.end('not found'); return; }
              res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(fs.readFileSync(filePath, 'utf-8'));
            } else { next(); }
          } catch (err) { next(err); }
        });
      };

      registerSensorium('/api/sensorium');
      registerSensorium('/api/playback'); // deprecated alias → same storage

      // ─── HELM endpoints (agent control plane: request → engine → structured result) ───
      // An agent POSTs a HelmRequest to /api/helm/rpc. We forward it to the browser over
      // the WS bridge and HOLD the HTTP response until the browser POSTs the matching
      // result to /api/helm/rpc-result (correlated by id). This turns the old fire-and-forget
      // bridge into a real request/response API an agent can program against.
      const helmPending = new Map<string, { res: ServerResponse; timer: NodeJS.Timeout }>();
      let helmSeq = 0;
      const genId = () => `h${Date.now().toString(36)}_${(helmSeq++).toString(36)}`;

      const forwardHelm = (reqObj: Record<string, unknown>, res: ServerResponse, timeoutMs: number): void => {
        const id = typeof reqObj.id === 'string' && reqObj.id ? reqObj.id : genId();
        reqObj.id = id;
        const timer = setTimeout(() => {
          if (!helmPending.has(id)) return;
          helmPending.delete(id);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            id, op: reqObj.op, ok: false, durationMs: timeoutMs,
            error: 'HELM: the engine did not respond. Is the MIX Engine open in a browser at the dev URL (npm run dev)?',
          }));
        }, timeoutMs);
        helmPending.set(id, { res, timer });
        server.ws.send('mix:helm-rpc', reqObj);
      };

      // POST /api/helm/rpc — body is a HelmRequest (id optional). Holds until resolved.
      server.middlewares.use('/api/helm/rpc', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const body = (await readBody(req)).toString('utf-8');
          const reqObj = body ? JSON.parse(body) : {};
          const configuredToken = process.env.MIX_HELM_TOKEN?.trim();
          const bearer = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
          const remote = req.socket.remoteAddress ?? '';
          const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
          if ((configuredToken && bearer !== configuredToken) || (!configuredToken && !isLoopback)) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'HELM authentication failed.' }));
            return;
          }
          const configuredRoles = (process.env.MIX_HELM_ROLES ?? 'admin').split(',').map((v) => v.trim()).filter(Boolean);
          reqObj._trustedAuth = {
            rolesOrCapabilities: configuredRoles,
            agentId: process.env.MIX_HELM_AGENT_ID?.trim() || 'helm-local',
            leaseId: typeof reqObj.leaseId === 'string' ? reqObj.leaseId : undefined,
          };
          // Never forward caller-asserted identity or privileges.
          delete reqObj.roles;
          delete reqObj.capabilities;
          delete reqObj.agentId;
          delete reqObj.leaseId;
          const url = new URL(req.url ?? '', 'http://localhost');
          const timeoutMs = Number(url.searchParams.get('timeoutMs') ?? reqObj.timeoutMs ?? 12000);
          forwardHelm(reqObj, res, Math.min(Math.max(timeoutMs, 1000), 60000));
        } catch (err) {
          res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: `bad request: ${(err as Error).message}` }));
        }
      });

      // POST /api/helm/rpc-result — body { id, result }. The browser calls this; we
      // resolve the matching held /api/helm/rpc response.
      server.middlewares.use('/api/helm/rpc-result', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const { id, result } = JSON.parse((await readBody(req)).toString('utf-8'));
          const pending = id ? helmPending.get(id) : undefined;
          if (pending) {
            clearTimeout(pending.timer);
            helmPending.delete(id);
            pending.res.statusCode = 200;
            pending.res.setHeader('Content-Type', 'application/json');
            pending.res.end(JSON.stringify(result ?? { id, ok: false, error: 'empty result' }));
          }
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true }));
        } catch (err) { next(err); }
      });

      // GET /api/helm/manifest — capability manifest, served statically (no engine tab
      // required) so an agent can discover the API before/without a running browser.
      server.middlewares.use('/api/helm/manifest', (req, res, next) => {
        if (req.method !== 'GET') { next(); return; }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(HELM_MANIFEST));
      });
    },
  };
}

export default defineConfig({
  plugins: [devSaveEndpoints()],
  // NOTE: deliberately NO COOP/COEP headers. @dimforge/rapier3d-compat inlines its
  // WASM as base64, so cross-origin isolation is unnecessary — and require-corp would
  // block cross-origin GLB / texture / DRACO-KTX2 assets and their decoder workers.
  server: {
    // Fixed port so Tauri's devUrl (http://localhost:5173) can reliably connect.
    // strictPort = fail if 5173 is taken rather than silently switching ports.
    port: 5173,
    strictPort: true,
    headers: {},
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 5000,
  },
  worker: {
    format: 'es',
  },
});
