# Game Essentials

The current feature and preset inventory is maintained in the [generated gameplay catalog](docs/gameplay-features.generated.md). This guide covers the five general-purpose modules. Open **Gameplay Feature Hub → GENERAL**, or use the **Game Essentials** preset. Applying a preset now replaces the previous feature pack; use `engine.gameplayFeatures.addPreset('essentials')` to add these five without changing other modules.

| Module ID | Script / engine API | Includes |
| --- | --- | --- |
| `pause_menu` | `gameplay.pause` | Escape to pause/resume, cursor release, optional pause on hidden page, keyboard focus trap |
| `game_settings` | `gameplay.settings` | Resolution scale, FOV, exposure, shadows, bloom, ambient occlusion, audio buses, sensitivity, invert Y |
| `objective_tracker` | `gameplay.objectives` | Named objectives, progress, optional goals, HUD and pause-menu checklist |
| `game_notifications` | `gameplay.notifications` | Bounded, dismissible messages and automatic objective-completion messages |
| `session_flow` | `gameplay.session` | Score, elapsed/countdown timer, target score, win/loss results and round restart |

## Try the starter

Run `npm run dev`, then open `/examples/game-essentials.html` on the dev server. The Crystal Garden example uses the actual Engine. Collect five crystals to win. Its simulation counter freezes when paused while rendering and settings stay responsive. See `examples/game-essentials.ts` for the complete starter code.

## Entity scripts

Trusted entity scripts receive `api.gameplay`; engine integrations use `engine.gameplayFeatures`. Register event listeners inside `api.firstRun || api.reloaded` so hot reload does not leak listeners.

```js
if (api.firstRun) {
  api.gameplay.objectives.add({ id: 'crystals', title: 'Collect five crystals', target: 5 });
  api.gameplay.session.setConfig({ title: 'Crystal run', targetScore: 50, duration: 120 });
  api.gameplay.session.start();
}
if (api.firstRun || api.reloaded) {
  api.bus.on('crystal_picked_up', () => {
    if (api.gameplay.objectives.advance('crystals', 1)) {
      api.gameplay.session.addScore(10);
      api.gameplay.notifications.show('+10 points', 'success');
    }
  });
}
```

Use `pause.pause()`, `pause.resume()`, `settings.setPreferences({...})`, `settings.applyQuality('low' | 'balanced' | 'high')`, `objectives.remove(id)`, `objectives.reset()`, and `session.finish('won' | 'lost', message)` as needed. Setting a time limit or target score to zero disables that automatic end condition. Sessions start explicitly, not when a project loads.

## Commands

All are registered in AIBridge, the command schema, and the generated command reference:

```json
[
  { "type": "feature_apply_preset", "preset": "essentials" },
  { "type": "feature_configure", "feature": "pause_menu", "config": { "title": "My Game" } },
  { "type": "objective_add", "id": "exit", "title": "Find the exit", "target": 1 },
  { "type": "objective_advance", "id": "exit", "amount": 1 },
  { "type": "game_notify", "message": "Checkpoint reached" },
  { "type": "session_start" },
  { "type": "session_add_score", "amount": 100 },
  { "type": "session_finish", "result": "won" },
  { "type": "game_settings_set", "settings": { "fieldOfView": 75, "masterVolume": 0.8 } },
  { "type": "game_pause" },
  { "type": "game_resume" },
  { "type": "game_essentials_status" }
]
```

## State and behavior

- Pause skips simulation services, including physics, scripts, tweens, gameplay, animation and slow-motion timers. Rendering, command processing, notification expiry and menu input continue. Existing slow-motion settings are preserved. Browser audio already playing is not suspended.
- Module configuration and authored objective definitions use the existing project JSON save/load path. Live objective progress, notifications and session score are not save-game snapshots.
- Player preferences are optionally saved in browser-local storage. `storageKey` plus the page pathname isolates games; give different projects their own storage key when they share a URL. Loading a project does not overwrite saved preferences or let them re-enable disabled modules. `persist: false` opts out. Storage failures never block gameplay.
- “Start a new round” resets score and timer. Your game owns scene, enemy, player and objective resets; subscribe to `session_started` to perform them. The starter demonstrates resetting its crystals and objectives.
- Events: `game_paused`, `game_resumed`, `game_settings_changed`, `objective_added`, `objective_progress`, `objective_completed`, `game_notification`, `session_started`, `session_score`, `session_ended`.
- UI text is escaped, numeric settings are bounded, and the pause menu adapts to narrow screens. It is hidden in editor mode.

## Validation

Automated coverage includes settings/persistence, module lifecycle and configuration, commands, actual entity scripts, menu controls/focus/text escaping, and the Engine pause frame. Browser checks cover the real starter scene, frozen simulation counter, graphics presets and a 390px-wide pause menu. Editor and standalone runtime production builds are both checked.

Final verification: both production builds passed. All 818 tests passed across the final suite and targeted reruns: 776 passed in the suite, and 42 passed when three files with worker-startup timeouts were rerun with one worker. A timing-sensitive tween benchmark also passed its separate rerun without changing its threshold.
