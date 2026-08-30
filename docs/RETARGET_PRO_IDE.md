# MIX Retarget Pro — IDE Agent API

Retarget Pro is designed to be driven by Codex, Claude Code, HELM, or any tool that can send JSON to the MIX AI Bridge. Agents should use the one-shot workflow unless they need manual control.

## One-command AAA workflow

```json
{
  "type": "retarget_pro_build",
  "packId": "martial",
  "targetRig": "ayo",
  "sourcePath": "assets/packs/motifect_martial_arts",
  "qualityPreset": "aaa",
  "strict": false,
  "target": "all",
  "autoApply": true,
  "autoWireCombat": true,
  "previewEntry": "muay_thai_combination"
}
```

The command imports every FBX/GLB, detects the source profile, performs hierarchical world-space retargeting, corrects bind-pose differences, preserves root motion, enables contact IK for the AAA preset, registers the pack on characters, auto-wires combat slots, optionally previews a clip, and writes one structured result to `lastQueryResult`.

Use `strict:true` in CI or unattended agent runs. Strict mode does not apply a pack unless its readiness is `ready` (grade A).

## JavaScript facade

```js
const result = await mix.retargetPro({
  packId: 'martial',
  targetRig: 'ayo',
  sourcePath: 'assets/packs/motifect_martial_arts',
  qualityPreset: 'aaa',
  target: 'all',
  strict: false,
});

console.log(result.report.summary);
console.table(mix.retargetReport('martial'));
```

## Agent quality contract

Every successful import returns `report`:

- `readiness`: `ready`, `review`, or `blocked`
- `grade`: `A`, `B`, `C`, or `F`
- clip/profile/category/root-motion counts
- translation scale range
- separate `critical`, `warnings`, and `advisories` arrays
- actionable `recommendations`
- stable one-line `summary` for logs

Agents must never infer success from `ok:true` alone. For unattended AAA builds, require `report.readiness === "ready"`. For interactive work, a `review` result may be previewed after reporting the warnings. Never ship `blocked` output.

## Manual commands

- `import_animation_pack`: import and report only
- `retarget_pro_report`: inspect one/all registered packs
- `anim_pack_apply`: apply clips to selected/all characters
- `anim_pack_wire_combat`: map clips to combat slots
- `anim_pack_preview`: play one entry on a character
- `anim_pack_list` / `anim_pack_remove`: registry management

The lower-level commands remain useful when an agent needs explicit control, while `retarget_pro_build` is the preferred game-building primitive.
