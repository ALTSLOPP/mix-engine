import type { Engine } from '../engine/Engine';
import { graphicsSettingsControls } from '../features/gameplay/GraphicsSettingsControls';

/** Graphics preferences are local and immediate; Blender settings retain their Save button. */
export function installGraphicsSettings(engine: Engine, modal: HTMLElement): () => void {
  const panel = document.createElement('section');
  panel.id = 'editor-graphics-settings';
  const refresh = () => {
    panel.innerHTML = `<style>
      #editor-graphics-settings { border-bottom:1px solid var(--border-color); padding-bottom:14px; margin-bottom:16px; }
      #editor-graphics-settings h4 { color:var(--accent-cyan); margin:0 0 12px; }
      #editor-graphics-settings .row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:10px 0; font-size:11px; }
      #editor-graphics-settings .control { display:flex; align-items:center; gap:8px; }
      #editor-graphics-settings input[type=range] { width:100px; }
      #editor-graphics-settings select { max-width:180px; }
      #editor-graphics-settings .presets { display:flex; flex-wrap:wrap; gap:6px; }
      #editor-graphics-settings .presets button { font-size:10px; padding:5px; }
      #editor-graphics-settings .intro { color:var(--text-muted); font-size:10px; line-height:1.5; }
      #settings-modal .modal-content { max-height:90vh; overflow-y:auto; }
    </style><h4>Display & performance</h4>${graphicsSettingsControls(engine.gameplayFeatures.settings.getConfig(), 'editor-setting')}`;
  };
  panel.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.setting) return;
    if (!engine.gameplayFeatures.settings.getConfig().enabled) engine.gameplayFeatures.enableFeature('game_settings');
    engine.gameplayFeatures.settings.setPreferences({ [input.dataset.setting]: input.type === 'checkbox' ? input.checked : Number(input.value) });
    const output = input.parentElement?.querySelector('output');
    if (output) output.textContent = input.value;
    if (input.tagName === 'SELECT') { const id = input.id; refresh(); panel.querySelector<HTMLElement>(`#${id}`)?.focus(); }
  });
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-quality]');
    if (!button) return;
    if (!engine.gameplayFeatures.settings.getConfig().enabled) engine.gameplayFeatures.enableFeature('game_settings');
    engine.gameplayFeatures.settings.applyQuality(button.dataset.quality as 'low' | 'balanced' | 'high');
    refresh();
    panel.querySelector<HTMLButtonElement>(`[data-quality="${button.dataset.quality}"]`)?.focus();
  });
  modal.querySelector('.modal-body')?.prepend(panel);
  refresh();
  return refresh;
}
