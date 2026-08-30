import type { Engine } from '../engine/Engine';
import { showToast } from '../ui/domUtils';

/**
 * animationPacksPanel.ts — the Animation Retarget Pro panel + viewport folder drop.
 *
 * Three ways in:
 *  1. Drag a folder of .fbx/.glb files onto the VIEWPORT → auto import + auto wire.
 *  2. Presets → Packs tab: import a public folder by path, or pick a folder.
 *  3. IDE: mix.importPack({ packId, sourcePath, targetRig:'ayo' }).
 */

// ─── Viewport folder drop ──────────────────────────────────────────────────

export function setupAnimationPackDrop(engine: Engine, canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.addEventListener('dragover', e => {
    const hasFiles = [...(e.dataTransfer?.types ?? [])].includes('Files');
    if (!hasFiles) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  canvas.addEventListener('drop', async (e: DragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    if (![...(dt.items ?? [])].some(it => it.kind === 'file')) return;
    const collected = await collectFileEntries(dt);
    const animFiles = collected.filter(ent => /\.(fbx|glb|gltf)$/i.test(ent.name));
    if (animFiles.length === 0) return; // not an animation drop — let other handlers run
    e.preventDefault();
    e.stopImmediatePropagation?.();
    const packId = guessPackId(collected);
    const buffers = await Promise.all(animFiles.map(async ent => ({ name: ent.name, buffer: await ent.file.arrayBuffer() })));
    await importAndMaybeWire(engine, packId, buffers);
  });
}

async function importAndMaybeWire(engine: Engine, packId: string, buffers: Array<{ name: string; buffer: ArrayBuffer }>): Promise<void> {
  showToast(`Importing ${buffers.length} animations into pack '${packId}'…`, 'info');
  try {
    const res = await engine.animImporter.importPack({ packId, targetRig: 'ayo', sourceFiles: buffers });
    if (!res.ok) {
      showToast(`Pack import failed: ${res.error}`, 'error');
      return;
    }
    showToast(`Pack '${packId}' imported: ${res.imported} clips`, 'success');
    // Auto-wire combat when the pack looks combat-y — one less step for the user.
    if (res.pack?.def.entries.some(en => en.category === 'combat')) {
      try { engine.aiBridge.execute({ type: 'anim_pack_wire_combat', packId, auto: true, target: 'all' } as never); } catch {}
    }
    window.dispatchEvent(new CustomEvent('mix:refresh-presets'));
  } catch (err) {
    showToast(`Pack import threw: ${String(err)}`, 'error');
  }
}

type FileEntry = { name: string; file: File };

/** Read a DataTransfer into flat files, recursing subdirectories (webkitGetAsEntry). */
async function collectFileEntries(dt: DataTransfer): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const walkEntry = async (entry: unknown, path: string): Promise<void> => {
    const ent = entry as {
      isFile?: boolean; isDirectory?: boolean; name: string;
      file?: (cb: (f: File) => void) => void;
      createReader?: () => { readEntries: (cb: (e: unknown[]) => void) => void };
    };
    if (ent.isFile && ent.file) {
      const file = await new Promise<File>(res => ent.file!(res));
      out.push({ name: path + file.name, file });
    } else if (ent.isDirectory && ent.createReader) {
      const reader = ent.createReader();
      const children = await new Promise<unknown[]>(resolve => {
        const all: unknown[] = [];
        const readBatch = () => reader.readEntries((batch: unknown[]) => {
          if (batch.length === 0) resolve(all);
          else { all.push(...batch); readBatch(); }
        });
        readBatch();
      });
      for (const child of children) await walkEntry(child, `${path}${ent.name}/`);
    }
  };

  for (const item of [...dt.items]) {
    const entry = (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.();
    if (entry) await walkEntry(entry, '');
    else {
      const f = item.getAsFile();
      if (f) out.push({ name: f.name, file: f });
    }
  }
  // Fallback: plain files list (no entry API).
  if (out.length === 0) for (const f of [...dt.files]) out.push({ name: f.name, file: f });
  return out;
}

/** Pack id from the dropped folder's top-level directory name (or first file). */
function guessPackId(entries: FileEntry[]): string {
  const first = entries[0]?.name ?? 'pack';
  const folder = first.includes('/') ? first.split('/')[0] : first.replace(/\.[^.]+$/, '');
  return folder.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'pack';
}

// ─── Presets → Packs panel ─────────────────────────────────────────────────

export function renderAnimationPacksSubPanel(): string {
  return `<div id="packs-studio-mount" style="min-height:200px; display:flex; flex-direction:column; gap:8px; padding:8px;">
    <div style="font-size:11px; font-weight:bold; color:var(--accent-purple);">ANIMATION PACKS — RETARGET PRO</div>
    <div style="font-size:9px; color:var(--text-muted);">Drop a folder of FBX/GLB onto the viewport (auto-imports + auto-wires), or import a folder below. Target rig: ayo.</div>
    <div style="display:flex; gap:6px; margin-top:6px;">
      <input id="anim-pack-folder" placeholder="/assets/packs/MyPack" style="flex:1; background:rgba(0,0,0,0.4); border:1px solid var(--border-color); color:#fff; padding:4px 6px; border-radius:4px; font-size:11px;" />
      <input id="anim-pack-id" placeholder="PackId" style="width:110px; background:rgba(0,0,0,0.4); border:1px solid var(--border-color); color:#fff; padding:4px 6px; border-radius:4px; font-size:11px;" />
      <button id="anim-pack-import-path" class="btn-secondary" style="font-size:11px; padding:4px 8px;">Import</button>
    </div>
    <label class="btn-secondary" style="font-size:11px; padding:4px 8px; cursor:pointer; width:fit-content;">
      Or pick a folder…
      <input id="anim-pack-picker" type="file" multiple accept=".fbx,.glb,.gltf" webkitdirectory directory style="display:none" />
    </label>
    <div id="anim-packs-list" style="margin-top:8px;"></div>
  </div>`;
}

export function hookAnimationPacksPanel(engine: Engine, container: HTMLElement): void {
  const list = container.querySelector<HTMLElement>('#anim-packs-list');
  const inpFolder = container.querySelector<HTMLInputElement>('#anim-pack-folder');
  const inpId = container.querySelector<HTMLInputElement>('#anim-pack-id');
  const btnImport = container.querySelector<HTMLButtonElement>('#anim-pack-import-path');
  const picker = container.querySelector<HTMLInputElement>('#anim-pack-picker');

  const refresh = (): void => {
    if (!list) return;
    const packs = engine.animPacks.list();
    if (packs.length === 0) {
      list.innerHTML = `<div style="font-size:9px; color:var(--text-muted); padding:6px; border:1px dashed var(--border-color); border-radius:4px; text-align:center;">No packs yet — drop an animation folder onto the viewport.</div>`;
      return;
    }
    list.innerHTML = packs.map(pack => {
      const issues = engine.animPacks.packIssues.get(pack.def.id) ?? [];
      const clips = pack.def.entries;
      const stale = clips.length > 0 && pack.clips.size === 0; // def survived reload; clips need reimport
      const cats = [...new Set(clips.map(c => c.category))].join(', ');
      const rootMotionCount = clips.filter(c => c.rootMotion).length;
      return `<div style="border:1px solid var(--border-color); border-radius:6px; padding:8px; margin:6px 0; background:rgba(0,0,0,0.18);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; font-size:11px; color:#fff;">${pack.def.displayName} <span style="opacity:0.6; font-weight:400;">(${pack.def.id})</span></div>
          <div style="font-size:10px; color:var(--text-muted);">${clips.length} clips • ${cats || 'misc'} • ${rootMotionCount} root-motion</div>
        </div>
        ${stale ? `<div style="font-size:10px; color:#f59e0b; margin-top:4px;">Needs reimport (clips were lost on reload).</div>` : ''}
        ${!stale && issues.length ? `<div style="font-size:10px; color:#f59e0b; margin-top:4px;">${issues.slice(0, 2).join('<br/>')}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
          ${stale
            ? `<button class="btn-secondary anim-pack-reimport" data-pack="${pack.def.id}" style="font-size:10px; padding:3px 8px;">Reimport</button>`
            : `<button class="btn-secondary anim-pack-apply" data-pack="${pack.def.id}" style="font-size:10px; padding:3px 8px;">Apply to all</button>
               <button class="btn-secondary anim-pack-wire" data-pack="${pack.def.id}" style="font-size:10px; padding:3px 8px;">Wire combat (auto)</button>`}
          <button class="btn-secondary anim-pack-remove" data-pack="${pack.def.id}" style="font-size:10px; padding:3px 8px; color:#ef4444;">Remove</button>
        </div>
        ${!stale && clips.length ? `<div style="max-height:110px; overflow:auto; margin-top:6px; display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:4px;">
          ${clips.map(c => `<button class="anim-pack-clip" data-pack="${pack.def.id}" data-entry="${c.id}" title="${c.displayName} — ${c.category}${c.duration ? ` • ${c.duration.toFixed(2)}s` : ''}" style="text-align:left; padding:4px 6px; border-radius:4px; border:1px solid var(--border-color); background:rgba(255,255,255,0.04); font-size:10px; color:#ddd; cursor:pointer;">${c.displayName}<br/><span style="opacity:0.6;">${c.category}${c.loop ? ' • loop' : ''}${c.rootMotion ? ' • RM' : ''}</span></button>`).join('')}
        </div>` : ''}
      </div>`;
    }).join('');

    list.querySelectorAll<HTMLButtonElement>('.anim-pack-clip').forEach(btn => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack')!;
        const entryId = btn.getAttribute('data-entry')!;
        engine.aiBridge.execute({ type: 'anim_pack_preview', packId, entryId } as never);
      });
    });
    list.querySelectorAll<HTMLButtonElement>('.anim-pack-apply').forEach(btn => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack')!;
        engine.aiBridge.execute({ type: 'anim_pack_apply', packId, target: 'all' } as never);
        showToast(`Pack '${packId}' applied to all characters`, 'success');
      });
    });
    list.querySelectorAll<HTMLButtonElement>('.anim-pack-wire').forEach(btn => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack')!;
        engine.aiBridge.execute({ type: 'anim_pack_wire_combat', packId, auto: true, target: 'all' } as never);
      });
    });
    list.querySelectorAll<HTMLButtonElement>('.anim-pack-reimport').forEach(btn => {
      btn.addEventListener('click', async () => {
        const packId = btn.getAttribute('data-pack')!;
        showToast(`Reimporting '${packId}'…`, 'info');
        const res = await engine.animImporter.reimport(packId);
        if (res.ok) showToast(`Pack '${packId}' rebuilt: ${res.imported} clips`, 'success');
        else showToast(res.error ?? 'Reimport failed', 'error');
        refresh();
      });
    });
    list.querySelectorAll<HTMLButtonElement>('.anim-pack-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack')!;
        engine.animPacks.remove(packId);
        refresh();
      });
    });
  };

  btnImport?.addEventListener('click', async () => {
    const source = inpFolder?.value.trim() ?? '';
    if (!source) { showToast('Enter a folder path like /assets/packs/SwordPack', 'error'); return; }
    const packId = (inpId?.value.trim() || source.split('/').filter(Boolean).pop() || 'pack')
      .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'pack';
    showToast(`Importing ${source} → '${packId}'…`, 'info');
    const res = await engine.animImporter.importPack({ packId, sourcePath: source, targetRig: 'ayo' });
    if (res.ok) showToast(`Pack '${packId}': ${res.imported} clips`, 'success');
    else showToast(res.error ?? 'Import failed', 'error');
    refresh();
  });

  picker?.addEventListener('change', async () => {
    const files = [...(picker.files ?? [])];
    if (files.length === 0) return;
    const rel = (files[0] as unknown as { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const packId = (inpId?.value.trim() || rel.split('/')[0] || 'pack')
      .replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'pack';
    const animFiles = files.filter(f => /\.(fbx|glb|gltf)$/i.test(f.name));
    if (animFiles.length === 0) { showToast('No .fbx/.glb files in that folder.', 'error'); picker.value = ''; return; }
    const buffers = await Promise.all(animFiles.map(async f => ({
      name: (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name,
      buffer: await f.arrayBuffer(),
    })));
    picker.value = '';
    await importAndMaybeWire(engine, packId, buffers);
    refresh();
  });

  refresh();
}
