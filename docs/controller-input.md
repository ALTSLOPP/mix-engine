# Controller input

MIX uses the browser Gamepad API behind a Unity Input System-style action layer. Controllers are hot-pluggable, appear in the editor header and Engine Settings, and do not have to occupy browser pad index `0`.

## Semantic controls

Prefer semantic paths over numeric button and axis fields:

| Control | Xbox | PlayStation |
|---|---|---|
| `<Gamepad>/buttonSouth` | A | Cross |
| `<Gamepad>/buttonEast` | B | Circle |
| `<Gamepad>/buttonWest` | X | Square |
| `<Gamepad>/buttonNorth` | Y | Triangle |
| `<Gamepad>/leftShoulder` | LB | L1 |
| `<Gamepad>/rightShoulder` | RB | R1 |
| `<Gamepad>/leftTrigger` | LT | L2 |
| `<Gamepad>/rightTrigger` | RT | R2 |
| `<Gamepad>/leftStick` | Left stick | Left stick |
| `<Gamepad>/rightStick` | Right stick | Right stick |

The D-pad, Start/Options, Select/View, stick presses, Home/Guide, and individual stick axes are also available. Run `input_gamepad_controls` or `mix.input.controls()` for the complete machine-readable list.

Omit `pad` in a binding to accept the first connected controller. Set `pad` only for explicit local multiplayer slots.

## IDE and HELM mapping

Codex, Claude Code, Antigravity, or any HELM client can replace the action asset with one command:

```json
{
  "type": "input_remap",
  "actions": {
    "version": 1,
    "actions": [
      {
        "name": "Move",
        "kind": "axis2d",
        "deadzone": 0.15,
        "bindings": [
          { "device": "keyboard", "code": "KeyW" },
          { "device": "keyboard", "code": "KeyA" },
          { "device": "keyboard", "code": "KeyS" },
          { "device": "keyboard", "code": "KeyD" },
          { "device": "gamepad", "control": "<Gamepad>/leftStick" }
        ]
      },
      {
        "name": "Jump",
        "kind": "button",
        "bindings": [
          { "device": "keyboard", "code": "Space" },
          { "device": "gamepad", "control": "<Gamepad>/buttonSouth" }
        ]
      }
    ]
  }
}
```

Useful commands are `input_gamepad_status`, `input_gamepad_controls`, `input_actions`, `input_action_define`, `input_bind`, `input_unbind`, `input_remap`, `input_action_state`, and `input_gamepad_rumble`.

The browser REPL exposes the same surface:

```js
mix.input.devices();
mix.input.controls();
mix.input.actions();
mix.input.bind('Jump', { device: 'gamepad', control: '<Gamepad>/buttonSouth' });
mix.input.setBindings('Attack', [
  { device: 'mouse', button: 0 },
  { device: 'gamepad', control: '<Gamepad>/rightTrigger', triggerThreshold: 0.35 },
]);
mix.input.exportJson();
```

The default on-foot map includes left-stick movement, right-stick camera, South/Jump, East/Crouch, West/Interact, North/Backflip, left-stick press/Sprint, LT/Charge, and RT/Attack. Raw `button` and `axis` bindings remain supported for non-standard hardware.

