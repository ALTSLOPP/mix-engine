# MIX Tween Director — AI & HELM Command Catalog

This document describes all AI Bridge and HELM commands provided by **MIX Tween Director**.

---

## 1. Single Property Tweens

### `tween_to`
Tween a target property to a specified value.
```json
{
  "type": "tween_to",
  "entityId": 12,
  "property": "position.y",
  "to": 5.0,
  "duration": 1.5,
  "ease": "cubicOut"
}
```

### `tween_from`
Tween a property from a specific starting value to its current value.
```json
{
  "type": "tween_from",
  "entityId": 12,
  "property": "scale.y",
  "from": 0.0,
  "duration": 0.8,
  "ease": "backOut"
}
```

### `tween_from_to`
Explicit from-to tween.
```json
{
  "type": "tween_from_to",
  "entityId": 12,
  "property": "material.opacity",
  "from": 0.0,
  "to": 1.0,
  "duration": 0.5
}
```

---

## 2. Transform Helpers

### `tween_move`
```json
{
  "type": "tween_move",
  "entityId": 105,
  "x": 10.0,
  "y": 2.0,
  "z": -4.0,
  "duration": 2.0,
  "ease": "sineInOut"
}
```

### `tween_rotate`
```json
{
  "type": "tween_rotate",
  "entityId": 105,
  "y": 3.14159,
  "duration": 1.2,
  "ease": "quadOut"
}
```

### `tween_scale`
```json
{
  "type": "tween_scale",
  "entityId": 105,
  "scale": 2.0,
  "duration": 0.6,
  "ease": "elasticOut"
}
```

### `tween_punch`
```json
{
  "type": "tween_punch",
  "entityId": 105,
  "property": "position",
  "y": 1.5,
  "duration": 0.5,
  "vibrato": 12
}
```

### `tween_shake`
```json
{
  "type": "tween_shake",
  "entityId": 105,
  "property": "position",
  "x": 0.4,
  "y": 0.4,
  "z": 0.4,
  "duration": 0.6
}
```

---

## 3. Sequences and Timelines

### `tween_sequence_create`
```json
{
  "type": "tween_sequence_create",
  "sequenceId": "door_sequence",
  "autoPlay": false
}
```

### `tween_sequence_append`
```json
{
  "type": "tween_sequence_append",
  "sequenceId": "door_sequence",
  "entityId": 105,
  "op": "move",
  "y": 4.0,
  "duration": 1.0,
  "ease": "cubicOut"
}
```

### `tween_sequence_join`
```json
{
  "type": "tween_sequence_join",
  "sequenceId": "door_sequence",
  "entityId": 105,
  "op": "rotate",
  "y": 1.57,
  "duration": 1.0,
  "ease": "sineInOut"
}
```

### `tween_sequence_marker`
```json
{
  "type": "tween_sequence_marker",
  "sequenceId": "door_sequence",
  "name": "door_opened"
}
```

### `tween_sequence_play`
```json
{
  "type": "tween_sequence_play",
  "sequenceId": "door_sequence"
}
```

---

## 4. High-Level Composite Orchestration: `tween_effect_create`
```json
{
  "type": "tween_effect_create",
  "effectId": "boss_spawn",
  "steps": [
    {
      "op": "scale",
      "entityId": 42,
      "to": [1, 1, 1],
      "duration": 0.8,
      "ease": "backOut"
    },
    {
      "op": "material",
      "entityId": 42,
      "property": "emissiveIntensity",
      "to": 4,
      "duration": 0.4,
      "join": true
    },
    {
      "op": "marker",
      "name": "spawn_complete"
    }
  ]
}
```

---

## 5. Global & Target Controls

- `tween_pause`: `{ "type": "tween_pause", "id": "boss_intro" }`
- `tween_resume`: `{ "type": "tween_resume", "id": "boss_intro" }`
- `tween_cancel`: `{ "type": "tween_cancel", "entityId": 42 }`
- `tween_complete`: `{ "type": "tween_complete", "id": "boss_intro" }`
- `tween_inspect`: `{ "type": "tween_inspect" }`
- `tween_validate`: `{ "type": "tween_validate", "sequenceJson": { ... } }`
