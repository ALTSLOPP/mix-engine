# 🤖 LLM SYSTEM MANUAL: blender_test_game_123

**CRITICAL INSTRUCTION FOR LLMS (Codex, Claude, Antigravity, etc):** You are operating inside a workspace powered by the **MIX Engine**, an AI-native 3D open-world game engine. 

This directory (`games/blender_test_game_123`) is your isolated project workspace. The MIX Engine is currently running and watching this folder. Any changes you make here will be instantly reflected in the live engine.

---

## 🏗️ 1. Core Architecture

The engine uses a modern Entity-Component-System (ECS) architecture powered by Three.js and Rapier3D physics.
There are two primary ways you can build this game:

1. **Declarative Scene State (`scene.json`)**
2. **Imperative Game Logic (`scripts/main.js`)**

### `scene.json` (The Map/Level)
The engine automatically hot-reloads `scene.json`. If you want to spawn a static building, a ground plane, or initial enemies, simply edit `scene.json`. It is formatted nicely for you. 
*Tip: If you need to spawn something but don't know the schema, look at existing entities in the JSON or use the HELM tools to ask the engine to describe itself.*

### `scripts/main.js` (The Code)
When the engine boots up, it automatically `import()`s your `scripts/main.js` and passes the live `engine` instance to it.
Use this file to write your game loop, UI logic, and event handlers.
```javascript
export default function initGame(engine) {
  console.log("Welcome to blender_test_game_123!");
  
  // Example: Spawn a player dynamically
  engine.sceneManager.spawnNow(new THREE.Vector3(0, 5, 0), {
    kind: 'character',
    params: { assetId: 'ayo' } // Make sure you have an 'ayo.glb' or similar
  });

  // Access the player or physics
  // engine.player.possess(...)
}
```

---

## 🛠️ 2. Tooling & Control (HELM)

The MIX Engine ships with an **MCP (Model Context Protocol) Server** and a CLI to let you query and control the engine programmatically.
If your IDE supports MCP, you can register the engine's tools by running:
`node ../../scripts/mix-mcp.js` (path relative to this folder).

If you are using a standard CLI, you can query the live engine state:
- `node ../../scripts/mix-helm.js describe` (Gets a summary of everything in the scene, camera position, bounds, etc.)
- `node ../../scripts/mix-helm.js query --kind character` (Finds specific entities)
- `node ../../scripts/mix-helm.js do '{"type":"spawn_entity","x":0,"y":5,"z":0,"glbPath":"box"}'`

*Use these tools to "look" around the scene if you are unsure of coordinates or entity IDs.*

### Controller action mapping

Use semantic Unity-style controls instead of raw browser indices. Query `input_gamepad_controls` for the full list and `input_gamepad_status` for connected devices. Omit `pad` to target the first connected controller.

```json
{
  "type": "input_action_define",
  "name": "Jump",
  "kind": "button",
  "bindings": [
    { "device": "keyboard", "code": "Space" },
    { "device": "gamepad", "control": "<Gamepad>/buttonSouth" }
  ]
}
```

Use `input_actions` to export the action asset and `input_remap` to replace it. In game scripts and the REPL, the equivalent API is `mix.input`.

---

## 🎨 3. Assets & Models

The engine ships with a powerful library of global assets built-in under the root `public/assets/` folder. You can reference these directly in your `scene.json` or scripts without having to download them!

**Built-In Mixamo Characters (Rigged):**
- `ayo` (`assets/mixamo/characters/ayo.glb`)
- `hana` (`assets/mixamo/characters/hana.glb`)
- `opp` (`assets/mixamo/characters/opp.glb`)
- `RAYNEFBX` (`assets/mixamo/characters/RAYNEFBX.glb`)

**Built-In Animations:**
The engine includes hundreds of Mixamo animations categorised under `assets/mixamo/animations/`. Key folders include:
- `Locomotion/` (running, walking, idle)
- `Attack Melee/`, `Attack ranged/`, `swords animations/`
- `DYING/`, `Blocking/`, `flight/`, `Specials/`

**Textures & Presets:**
There are global textures available under `assets/textures/` including `anime/` and `realistic/` styles.

**Custom Game Assets:**
If you need specific 3D models (`.glb`), sounds, or textures just for this game:
1. Place them in the `games/blender_test_game_123/assets/` folder.
2. The engine's asset cache will automatically load them when referenced in `scene.json` or spawned via scripts.

**Blender Asset Generation Integration:**
No Blender path is currently configured in the engine settings.
If you need to make 3D assets using Blender, ask the user to link their Blender folder in the engine's top-right Settings menu first.

---

## 🎬 4. Cutscenes & Cinematics

The MIX Engine includes a **Cutscene Timeline System** that makes it easy for AI IDEs to choreograph AAA-quality cinematic sequences. 
Whenever you are asked to generate a cutscene (e.g. "make Ayo swing his sword at Rayne"), you should use the `cutscene_play` AICommand to sequence character animations, VFX, sounds, and camera moves along a unified chronological timeline.

**Example Cutscene Payload:**
```json
{
  "type": "cutscene_play",
  "sequence": {
    "duration": 4.0,
    "letterbox": true,
    "cameraSequence": {
      "shots": [ { "duration": 4.0, "kind": "orbit", "orbitTargetEntity": 102, "orbitRadius": 5.0 } ]
    },
    "events": [
      { "time": 0.0, "command": { "type": "play_animation", "state": "draw_sword" }, "resolveTarget": "@ayo", "resolveTargetKey": "entityId" },
      { "time": 0.1, "command": { "type": "cutscene_subtitle", "text": "It ends here, Rayne!", "speaker": "Ayo", "duration": 2.0 } },
      { "time": 1.5, "command": { "type": "play_animation", "state": "swing_sword" }, "resolveTarget": "@ayo" },
      { "time": 1.7, "command": { "type": "spawn_vfx", "preset": "slash", "x": 0, "y": 1, "z": 0 } },
      { "time": 1.7, "command": { "type": "play_sound", "src": "sword_slash.ogg" } },
      { "time": 2.0, "command": { "type": "play_animation", "state": "hit_react" }, "resolveTarget": "@rayne" }
    ]
  }
}
```
**Why this makes the engine superior for AI:** 
1. **Dynamic Target Resolution:** You don't need to know the runtime numeric IDs of entities! Just use `"resolveTarget": "@name"` and the engine will dynamically inject it into the command.
2. **No messy async logic:** You don't have to write brittle async JavaScript timing code to sync animations and effects. Just output a single declarative timeline.
3. **Built-in Polish:** The engine automatically applies cinematic letterboxing (black bars), suppresses the gameplay HUD, and provides a native subtitle track for your dialogue!
Use this feature whenever appropriate!

---

### Interactive RPG Dialogue System

You can create branching narrative conversations natively in the engine using the `dialogue_show` command. You do not need to build custom UI! The engine provides a sleek, interactive dialogue window that automatically pauses the game.

**Example Branching Dialogue:**
```json
{
  "type": "dialogue_show",
  "speaker": "Rayne",
  "text": "You dare approach me, Ayo?",
  "pauseGame": true,
  "choices": [
    {
      "text": "Draw your sword!",
      "command": { "type": "cutscene_play", "sequence": { "duration": 2.0, "events": [] } }
    },
    {
      "text": "Let's talk this out...",
      "command": { 
        "type": "dialogue_show", 
        "speaker": "Rayne", 
        "text": "I have nothing left to say to you.",
        "choices": [ { "text": "Continue" } ]
      }
    }
  ]
}
```

**Why this is amazing for you:**
1. **Zero UI Code:** The engine renders the glassmorphism UI, handles mouse interaction, and animates the text.
2. **Infinite Branching:** Each choice can embed *any* AI command. You can trigger a cutscene, spawn an explosion, give the player an item, or show the next dialogue node!
3. **Auto-Pausing:** Setting `"pauseGame": true` ensures the physics simulation halts while the player reads.

---

## 🧪 5. Testing & Validation (SENSORIUM)

The MIX Engine has a built-in AI perception layer called **SENSORIUM**.
If you want to test how the game "feels" or if the physics are stable, you can trigger a SENSORIUM test. The engine will drive the player synthetically and output telemetry, feel scores, and a contact-sheet of images.
- CLI: `node ../../scripts/mix-cli.js test --profile driving`
The artifacts (video, telemetry, screenshots) will be saved so you can analyze them to ensure your code works.

---

## 🚀 Summary Checklist for the LLM

- [ ] Edit `scene.json` to build the static world.
- [ ] Edit `scripts/main.js` to write the game loop and mechanics.
- [ ] Read `engine.d.ts` if you need to know the exact TypeScript definitions of the `engine` object.
- [ ] Use `mix-helm.js` to inspect the live state of the engine.
- [ ] **Do not** edit the engine source code (`../../src/`) unless specifically asked by the user to modify the engine itself. Keep game logic contained to this folder.

Good luck building blender_test_game_123!
