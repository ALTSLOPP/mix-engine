import type { GameSettingsConfig } from './GeneralFeatureTypes';

/** Shared accessible controls for the editor and pause menu. */
export function graphicsSettingsControls(c: Readonly<GameSettingsConfig>, prefix = 'setting'): string {
  const select = (key: 'internalHeight' | 'outputHeight', label: string, values: number[], zero: string) => {
    const choices = [...new Set([0, ...values, c[key]])].sort((a, b) => a - b);
    return `<div class="row"><label for="${prefix}-${key}">${label}</label><select id="${prefix}-${key}" data-setting="${key}">${choices.map(v => `<option value="${v}" ${v === c[key] ? 'selected' : ''}>${v === 0 ? zero : v + 'p'}</option>`).join('')}</select></div>`;
  };
  const toggle = (key: 'fsrEnabled' | 'shadows' | 'bloom' | 'ambientOcclusion', label: string) =>
    `<div class="row"><label for="${prefix}-${key}">${label}</label><input id="${prefix}-${key}" data-setting="${key}" type="checkbox" ${c[key] ? 'checked' : ''}></div>`;
  const range = (key: 'fsrSharpness' | 'renderScale', label: string, min: number, max: number) =>
    `<div class="row"><label for="${prefix}-${key}">${label}</label><div class="control"><input id="${prefix}-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="0.05" value="${c[key]}" ${key === 'renderScale' && c.internalHeight !== 0 ? 'disabled' : ''}><output for="${prefix}-${key}">${c[key]}</output></div></div>`;
  return `<div class="presets"><button type="button" data-quality="low">Low-spec 540p → 900p</button><button type="button" data-quality="balanced">Balanced</button><button type="button" data-quality="high">Native / Quality</button></div>
    ${toggle('fsrEnabled', 'FSR 1 upscaling')}
    ${select('internalHeight', 'Internal resolution cap', [480, 540, 600, 720, 900, 1080, 1440, 2160], 'Automatic (scale)')}
    ${select('outputHeight', 'Output resolution cap', [720, 900, 1080, 1440, 2160], 'Native display')}
    ${range('renderScale', 'Automatic resolution scale', 0.5, 1.5)}
    ${range('fsrSharpness', 'FSR sharpening (0 = off)', 0, 1)}
    ${toggle('shadows', 'Dynamic shadows')}${toggle('bloom', 'Bloom')}${toggle('ambientOcclusion', 'Ambient occlusion')}
    <p class="intro">540p → 900p is 960×540 → 1600×900 at 16:9. Smaller viewports use fewer pixels; other shapes keep their aspect ratio. FSR off uses basic scaling at the same resolutions. Choose Native / Quality for full resolution. Changes apply and save immediately.</p>`;
}
