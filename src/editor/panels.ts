import type { Engine } from '../engine/Engine';
import { MIXAMO_CHARACTERS, MIXAMO_ANIMATIONS } from '../animation/MixamoPresets';
import { escapeHtml, showToast } from '../ui/domUtils';
import { presetsContentArea, bottomDrawerContent } from './dom';
import { ui } from './state';
import { consoleLogs } from './consoleCapture';
import { renderAnimationPacksSubPanel, hookAnimationPacksPanel } from './animationPacksPanel';
import { renderTweenDirectorPanel } from './tweenDirectorPanel';
import { renderCopilotPanel, hookCopilotPanel } from './mixCopilot';
import { FPS_STARTER_CONTENT, FPS_STARTER_MODELS } from '../content/FpsStarterPack';

// Assets-drawer filter state (local to this panel).
let assetsSearchQuery = '';
let assetsFilterCat = 'all';

// --- Preset library tabs renderer -------------------------------------------
export function renderPresetsTab(engine?: Engine): void {
  if (!presetsContentArea) return;

  if (ui.activePresetTab === 'characters') {
    presetsContentArea.innerHTML = `
      <div class="character-preset-grid">
        ${MIXAMO_CHARACTERS.map((char) => `
          <div class="character-card" draggable="true" data-asset-id="${char.id}">
            <div class="character-avatar">👤</div>
            <div class="character-card-name">${char.id.toUpperCase()}</div>
          </div>
        `).join('')}
      </div>
      <div style="font-size:9px;color:var(--text-muted);text-align:center;padding:4px">
        Drag character cards onto viewport to spawn
      </div>
    `;
  } else if (ui.activePresetTab === 'animations') {
    presetsContentArea.innerHTML = `
      <div style="max-height: 180px; overflow-y: auto;">
        ${Object.entries(MIXAMO_ANIMATIONS).map(([category, list]) => `
          <div class="anim-category">
            <div class="category-title">${category}</div>
            <div class="anim-list">
              ${list.map((anim) => {
                const cleanCat = category.replace(/[^a-zA-Z0-9]/g, '_');
                const cleanId = anim.id.replace(/[^a-zA-Z0-9]/g, '_');
                const uniqueId = `anim_${cleanCat}_${cleanId}`;
                return `
                  <button class="anim-btn" data-anim-id="${uniqueId}">
                    <span>${anim.id}</span>
                    <span class="play-icon">▶</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    // Packs Tab — the Retarget Pro studio
    presetsContentArea.innerHTML = renderAnimationPacksSubPanel();
    if (engine) hookAnimationPacksPanel(engine, presetsContentArea);
    else {
      // hook will be called from uiEvents tab handler when engine is available
    }
  }
}

// --- Bottom Drawer tabs renderer (AI terminal vs Assets grid vs Console Logs) --
export function renderDrawerTab(engine: Engine): void {
  if (!bottomDrawerContent) return;

  if (ui.activeDrawerTab === 'ai') {
    bottomDrawerContent.innerHTML = `
      <div class="ai-bridge-grid">
        <div class="ai-terminal">
          <div class="ai-terminal-output" id="ai-logs">
            [AI BRIDGE] Listening on Port 3000...<br>
            [AI BRIDGE] System initialized. Enter prompt or copy JSON payload.
          </div>
          <div class="ai-terminal-input">
            <input type="text" placeholder="Type prompt to MIX AI... (e.g. spawn ayo character)" id="ai-prompt-input" />
            <button id="btn-ai-send">SEND</button>
          </div>
        </div>
        <div class="ai-terminal" style="padding:10px;font-size:11px;">
          <div style="color:var(--accent-gold);margin-bottom:6px;font-weight:bold;">JSON Command Sandbox</div>
          <textarea style="flex:1;background:rgba(0,0,0,0.5);border:1px solid var(--border-color);color:#a855f7;font-family:inherit;font-size:11px;padding:6px;resize:none;outline:none;" id="ai-json-input">{\n  "type": "spawn_entity",\n  "glbPath": "ayo",\n  "x": 0, "y": 2, "z": -2\n}</textarea>
          <button class="btn-accent" style="margin-top:6px" id="btn-ai-run-json">Run JSON</button>
        </div>
        ${renderCopilotPanel(engine)}
      </div>
    `;

    // Hook AI inputs
    const btnSend = document.getElementById('btn-ai-send');
    const inpPrompt = document.getElementById('ai-prompt-input') as HTMLInputElement;
    const aiLogs = document.getElementById('ai-logs');

    const handleSend = () => {
      if (!inpPrompt || !inpPrompt.value.trim()) return;
      const text = inpPrompt.value.trim().toLowerCase();
      const safeText = escapeHtml(text);
      if (aiLogs) aiLogs.innerHTML += `<br><span style="color:#fff">&gt; ${safeText}</span>`;

      // Basic rule parser for local interactive experience.
      if (text.includes('spawn') && text.includes('ayo')) {
        engine.aiBridge.execute({ type: 'spawn_entity', x: 0, y: 2, z: 2, glbPath: 'ayo' });
        if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Spawned 'ayo' in center.`;
      } else if (text.includes('spawn') && text.includes('hana')) {
        engine.aiBridge.execute({ type: 'spawn_entity', x: 0, y: 2, z: 2, glbPath: 'hana' });
        if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Spawned 'hana' in center.`;
      } else if (text.includes('clear') || text.includes('destroy')) {
        // Route through AIBridge.clear_scene which destroys ALL entities + re-spawns a
        // ground plane (the old "skip idx 0" trick broke after any swap-pop removal).
        engine.aiBridge.execute({ type: 'clear_scene' });
        if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Requested clear of entities.`;
      } else if (text.includes('save')) {
        engine.aiBridge.execute({ type: 'save_scene', name: 'world' });
        if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Save_scene dispatched.`;
      } else if (text.includes('load')) {
        engine.aiBridge.execute({ type: 'load_scene', name: 'world' });
        if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Load_scene dispatched.`;
      } else {
        if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Command not recognized. Try "spawn ayo", "clear", "save", "load".`;
      }
      inpPrompt.value = '';
      if (aiLogs) {
        aiLogs.scrollTop = aiLogs.scrollHeight;
      }
    };

    if (btnSend && inpPrompt) {
      btnSend.addEventListener('click', handleSend);
      inpPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
      });
    }

    const btnRunJson = document.getElementById('btn-ai-run-json');
    const txtJson = document.getElementById('ai-json-input') as HTMLTextAreaElement;
    if (btnRunJson && txtJson) {
      btnRunJson.addEventListener('click', () => {
        try {
          const payload = JSON.parse(txtJson.value);
          engine.aiBridge.execute(payload);
          if (aiLogs) aiLogs.innerHTML += `<br>[AIBridge] Executed JSON payload successfully.`;
          showToast('JSON command queued.', 'success');
        } catch (err) {
          showToast('Invalid JSON: ' + String(err), 'error');
        }
      });
    }

    hookCopilotPanel(engine, bottomDrawerContent);

  } else if (ui.activeDrawerTab === 'console') {
    bottomDrawerContent.innerHTML = `
      <div class="ai-terminal" style="height:100%;">
        <div class="panel-header" style="border:none; padding:4px 10px; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2);">
          <span style="font-size:10px; font-weight:bold; color:var(--text-muted);">LIVE ENGINE CONSOLE LOGS</span>
          <button class="btn-secondary" id="btn-console-clear" style="width:auto; padding:2px 8px; font-size:9px;">Clear Console</button>
        </div>
        <div class="ai-terminal-output" id="console-logs-output" style="font-family:monospace; font-size:11px; white-space:pre-wrap; background:rgba(0,0,0,0.5); flex:1; overflow-y:auto; padding:10px;"></div>
      </div>
    `;

    const logsContainer = document.getElementById('console-logs-output');
    if (logsContainer) {
      logsContainer.innerHTML = consoleLogs.map(log => {
        const color = log.type === 'error' ? '#ef4444' : log.type === 'warn' ? 'var(--accent-gold)' : 'var(--accent-cyan)';
        const prefix = log.type === 'error' ? '[ERR]' : log.type === 'warn' ? '[WRN]' : '[LOG]';
        return `<div style="margin-bottom:4px; color:${color}">[${log.time}] ${prefix} ${escapeHtml(log.text)}</div>`;
      }).join('');
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    const btnClearConsole = document.getElementById('btn-console-clear');
    if (btnClearConsole) {
      btnClearConsole.addEventListener('click', () => {
        consoleLogs.length = 0;
        if (logsContainer) logsContainer.innerHTML = '';
      });
    }

  } else if (ui.activeDrawerTab === 'games') {
    renderGamesTab(engine);
  } else if (ui.activeDrawerTab === 'tweens') {
    renderTweenDirectorPanel(engine, bottomDrawerContent);
  } else {
    // Project Assets Tab
    const trashEmojis = ['🗑️', '🥤', '🥫', '📰', '📦', '🍌', '🍏', '🧴', '🥛'];
    const customModelsList = [
      ...FPS_STARTER_MODELS.map(asset => ({ id: asset.id, name: asset.name, emoji: asset.id === 'fps_grenade' ? '💣' : '🔫', cat: 'weapon' })),
      { id: 'AptMailbox', name: 'Apartment Mailbox', emoji: '📬', cat: 'prop' },
      { id: 'Bench', name: 'Park Bench', emoji: '🪑', cat: 'prop' },
      { id: 'HighwayStreetLights', name: 'Highway Lights', emoji: '🚥', cat: 'prop' },
      { id: 'Planter', name: 'Garden Planter', emoji: '🪴', cat: 'prop' },
      { id: 'PublicTrashCan', name: 'Public Trash Can', emoji: '🗑', cat: 'prop' },
      { id: 'SmallGate', name: 'Small Gate', emoji: '🚧', cat: 'prop' },
      { id: 'StreetLamp', name: 'Street Lamp', emoji: '💡', cat: 'prop' },
      { id: 'StreetLamp2', name: 'Street Lamp Alt', emoji: '🔦', cat: 'prop' },
      { id: 'VendingMachine', name: 'Soda Vending', emoji: '🥤', cat: 'prop' },
      { id: 'VendingMachine2', name: 'Can Vending', emoji: '🥫', cat: 'prop' },
      { id: 'WaterFountain', name: 'Water Fountain', emoji: '🚰', cat: 'prop' },

      { id: 'AnimeBush', name: 'Anime Bush', emoji: '🌿', cat: 'vegetation' },
      { id: 'RealGrass', name: 'Real Grass Cluster', emoji: '🌱', cat: 'vegetation' },
      { id: 'AnimeTree1', name: 'Anime Oak Tree', emoji: '🌳', cat: 'vegetation' },
      { id: 'AnimeTree3', name: 'Anime Pine Tree', emoji: '🌲', cat: 'vegetation' },
      { id: 'AnimeTree3_Alt', name: 'Anime Palm Tree', emoji: '🌴', cat: 'vegetation' },

      ...Array.from({ length: 91 }, (_, i) => ({
        id: `TrashDebris${i + 1}`,
        name: `Trash Debris ${i + 1}`,
        emoji: trashEmojis[i % trashEmojis.length],
        cat: 'trash',
      })),
    ];

    bottomDrawerContent.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%;">
        <!-- QoL Controls Bar -->
        <div style="display:flex; gap:10px; align-items:center; padding:8px 12px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--border-color); flex-wrap:wrap; user-select:none;">
          <input type="text" id="asset-search-input" placeholder="🔍 Search assets..." value="${escapeHtml(assetsSearchQuery)}" style="min-width:150px; background:rgba(0,0,0,0.5); border:1px solid var(--border-color); color:#fff; padding:4px 8px; font-size:11px; border-radius:4px; outline:none;" />

          <div style="display:flex; gap:4px;" id="asset-category-filters">
            <button class="btn-secondary ${assetsFilterCat === 'all' ? 'active' : ''} asset-filter-btn" data-cat="all" style="padding:2px 8px; font-size:10px; height:auto;">All</button>
            <button class="btn-secondary asset-filter-btn" data-cat="weapon" style="padding:2px 8px; font-size:10px; height:auto;">Weapons</button>
            <button class="btn-secondary asset-filter-btn" data-cat="audio" style="padding:2px 8px; font-size:10px; height:auto;">Gun Sounds</button>
            <button class="btn-secondary ${assetsFilterCat === 'prop' ? 'active' : ''} asset-filter-btn" data-cat="prop" style="padding:2px 8px; font-size:10px; height:auto;">Props</button>
            <button class="btn-secondary ${assetsFilterCat === 'vegetation' ? 'active' : ''} asset-filter-btn" data-cat="vegetation" style="padding:2px 8px; font-size:10px; height:auto;">Flora</button>
            <button class="btn-secondary ${assetsFilterCat === 'trash' ? 'active' : ''} asset-filter-btn" data-cat="trash" style="padding:2px 8px; font-size:10px; height:auto;">Trash</button>
            <button class="btn-secondary ${assetsFilterCat === 'procedural' ? 'active' : ''} asset-filter-btn" data-cat="procedural" style="padding:2px 8px; font-size:10px; height:auto;">Procedural</button>
          </div>

          <div style="display:flex; gap:12px; align-items:center; font-size:10px; color:var(--text-muted); margin-left:auto;">
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;" title="Randomize rotation (Y-axis) on spawn for natural scattering.">
              <input type="checkbox" id="chk-random-rot" ${ui.randomizeSpawnRotation ? 'checked' : ''} style="cursor:pointer;" /> Random Rot (Y)
            </label>
            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;" title="Randomize scale (±25%) on spawn for variety.">
              <input type="checkbox" id="chk-random-scale" ${ui.randomizeSpawnScale ? 'checked' : ''} style="cursor:pointer;" /> Random Scale
            </label>
          </div>
        </div>

        <!-- Assets Grid -->
        <div class="asset-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; overflow-y: auto; padding: 10px; flex: 1; max-height:140px;">
          <div class="asset-item" draggable="true" data-asset-kind="tree" data-cat="procedural" data-name="pine tree (proc)">
            <div class="asset-thumb">🌲</div>
            <div class="asset-name">Pine Tree (Proc)</div>
          </div>
          <div class="asset-item" draggable="true" data-asset-kind="rock" data-cat="procedural" data-name="stone rock (proc)">
            <div class="asset-thumb">⛰</div>
            <div class="asset-name">Stone Rock (Proc)</div>
          </div>
          <div class="asset-item" draggable="true" data-asset-kind="drone" data-cat="procedural" data-name="hover drone (proc)">
            <div class="asset-thumb">🛸</div>
            <div class="asset-name">Hover Drone (Proc)</div>
          </div>
          ${customModelsList.map(item => `
            <div class="asset-item" draggable="true" data-asset-kind="model" data-asset-id="${item.id}" data-cat="${item.cat}" data-name="${item.name.toLowerCase()}">
              <div class="asset-thumb">${item.emoji}</div>
              <div class="asset-name">${item.name}</div>
            </div>
          `).join('')}
          ${FPS_STARTER_CONTENT.assets.filter(asset => asset.kind === 'audio').map(asset => `
            <div class="asset-item" data-cat="audio" data-name="${escapeHtml(asset.name.toLowerCase())}">
              <button type="button" class="btn-secondary" data-fps-sound="${escapeHtml(asset.path)}" title="Preview sound">▶ ${escapeHtml(asset.name)}</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Hook filter inputs
    const inpSearch = document.getElementById('asset-search-input') as HTMLInputElement;
    const filterContainer = document.getElementById('asset-category-filters');
    const chkRot = document.getElementById('chk-random-rot') as HTMLInputElement;
    const chkScale = document.getElementById('chk-random-scale') as HTMLInputElement;
    const gridItems = bottomDrawerContent.querySelectorAll('.asset-item');
    bottomDrawerContent.querySelectorAll<HTMLElement>('[data-fps-sound]').forEach(button => {
      button.addEventListener('click', () => { void engine?.audio.play(button.dataset.fpsSound!, { volume: 0.4 }); });
    });

    const applyFilters = () => {
      const query = assetsSearchQuery.toLowerCase().trim();
      gridItems.forEach((item) => {
        const itemCat = item.getAttribute('data-cat') || '';
        const itemName = item.getAttribute('data-name') || '';

        const matchesCat = assetsFilterCat === 'all' || itemCat === assetsFilterCat;
        const matchesQuery = query === '' || itemName.includes(query);

        if (matchesCat && matchesQuery) {
          (item as HTMLElement).style.display = 'flex';
        } else {
          (item as HTMLElement).style.display = 'none';
        }
      });
    };

    applyFilters();

    if (inpSearch) {
      inpSearch.addEventListener('input', () => {
        assetsSearchQuery = inpSearch.value;
        applyFilters();
      });
    }

    if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.asset-filter-btn');
        if (!btn) return;

        filterContainer.querySelectorAll('.asset-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        assetsFilterCat = btn.getAttribute('data-cat') || 'all';
        applyFilters();
      });
    }

    if (chkRot) {
      chkRot.addEventListener('change', () => {
        ui.randomizeSpawnRotation = chkRot.checked;
      });
    }
    if (chkScale) {
      chkScale.addEventListener('change', () => {
        ui.randomizeSpawnScale = chkScale.checked;
      });
    }

    // Hook asset dragging
    gridItems.forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        const kind = item.getAttribute('data-asset-kind');
        const assetId = item.getAttribute('data-asset-id');
        ui.draggedKind = kind;
        ui.draggedAssetId = assetId;
        if (e instanceof DragEvent && e.dataTransfer) {
          e.dataTransfer.setData('text/plain', assetId ? `model:${assetId}` : `asset:${kind}`);
        }
      });
    });
  }
}

export async function renderGamesTab(engine: Engine) {
  if (!bottomDrawerContent) return;
  bottomDrawerContent.innerHTML = `<div style="padding:10px; color:#fff;">Loading games...</div>`;
  try {
    const resGames = await fetch('/api/games');
    const resActive = await fetch('/api/games/active');
    const { games } = await resGames.json();
    const { active } = await resActive.json();

    const gamesListHtml = games.length > 0
      ? games.map((g: string) => `
          <div class="game-card" style="background:rgba(255,255,255,0.05); border:1px solid ${g === active ? 'var(--accent-green)' : 'var(--border-color)'}; padding:12px; border-radius:6px; transition:border-color 0.2s; position:relative;">
            <div style="font-weight:bold; margin-bottom:8px; font-size:12px; color:${g === active ? 'var(--accent-green)' : '#fff'};">${escapeHtml(g)}</div>
            ${g === active
              ? '<div style="font-size:10px; color:var(--accent-green); font-weight:bold; padding:4px 0;">Currently Active</div>'
              : `<div style="display:flex; gap:4px;"><button class="btn-secondary btn-load-game" style="font-size:10px; flex:1; padding:6px;" data-game="${escapeHtml(g)}">Load Game</button>
                 <button class="btn-secondary btn-delete-game" style="font-size:10px; padding:6px; color:#ef4444; border-color:rgba(239,68,68,0.4);" data-game="${escapeHtml(g)}" title="Delete Game">🗑</button></div>`
            }
          </div>
        `).join('')
      : `<div style="grid-column: 1 / -1; padding:20px; text-align:center; color:var(--text-muted); font-size:11px; background:rgba(0,0,0,0.2); border-radius:6px; border:1px dashed var(--border-color);">
          No games found. Create your first game above!
         </div>`;

    bottomDrawerContent.innerHTML = `
      <div style="padding:10px; display:flex; flex-direction:column; gap:10px; height:100%; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0; font-size:12px; color:var(--accent-cyan); letter-spacing: 1px;">PROJECT MANAGEMENT</h3>
          <div style="display:flex; gap:6px;">
            <input type="text" id="inp-new-game" placeholder="New game name..." style="background:rgba(0,0,0,0.5); border:1px solid var(--border-color); color:#fff; padding:4px 8px; font-size:11px; border-radius:4px; outline:none;" />
            <button class="btn-accent" id="btn-create-game" style="padding:4px 12px; height:auto;">Create</button>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:10px;">
          ${gamesListHtml}
        </div>
      </div>
    `;

    const inpNewGame = document.getElementById('inp-new-game') as HTMLInputElement;
    inpNewGame?.focus();

    const handleCreate = async () => {
      const name = inpNewGame?.value.trim();
      if (!name) return;
      await fetch('/api/games', { method: 'POST', body: JSON.stringify({ name }) });
      await fetch('/api/games/active', { method: 'POST', body: JSON.stringify({ active: name }) });
      window.location.reload();
    };

    document.getElementById('btn-create-game')?.addEventListener('click', handleCreate);
    inpNewGame?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCreate();
    });

    document.querySelectorAll('.btn-load-game').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const name = (e.currentTarget as HTMLElement).getAttribute('data-game');
        if (name) {
          await fetch('/api/games/active', { method: 'POST', body: JSON.stringify({ active: name }) });
          window.location.reload();
        }
      });
    });

    document.querySelectorAll('.btn-delete-game').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const name = (e.currentTarget as HTMLElement).getAttribute('data-game');
        if (name && confirm(`Are you sure you want to completely delete "${name}"? This cannot be undone.`)) {
          await fetch('/api/games', { method: 'DELETE', body: JSON.stringify({ name }) });
          renderGamesTab(engine);
        }
      });
    });

  } catch (err) {
    bottomDrawerContent.innerHTML = `<div style="padding:10px; color:#ef4444;">Error loading games. Make sure the Vite dev server is running.</div>`;
  }
}
