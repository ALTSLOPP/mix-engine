// Built-in "stock enemy" behaviour, attached via SceneManager.addScript by Engine.spawnEnemy.
//
// IMPORTANT: this is the SOURCE of a runtime script compiled with `new Function('dt','api', …)`
// (see ScriptComponent). It must be plain ES that runs in the browser — NO TypeScript syntax
// (no type annotations, no `as` casts). It talks to the engine through `api` (the ScriptAPI)
// and the global `window.engine` the editor exposes.
export const STOCK_ENEMY_AI_SCRIPT = `
// Enemy State Machine & Logic
api.state = api.state || {
  mode: 'idle',
  health: 100,
  speed: 2.5,
  attackRange: 1.5,
  lastAttackTime: 0,
  targetId: null
};

const state = api.state;

// If dead, do nothing (waiting to be despawned).
if (state.mode === 'dead') return;

const eng = (typeof window !== 'undefined') ? window.engine : null;

// Process events (hits from the player — a sensor overlapping this enemy).
for (const ev of api.events) {
  if (ev.type === 'sensor' && ev.intersecting) {
    state.health -= 25;

    const pos = api.position;
    if (pos && eng) {
      eng.effects.hit({ position: pos, intensity: 0.8, color: '#ff0000', vfx: 'impact_red' });
      eng.audio.play('/assets/audio/MELEE HEAVY/HEAVYPUNCH.wav', { volume: 1.0, loop: false });
    }

    if (state.health <= 0) {
      state.mode = 'dead';
      const rb = api.sceneManager.getRigidBody(api.entityId);
      if (rb) rb.mesh.visible = false;
      api.sceneManager.requestDestroy(api.entityId);
      return;
    } else {
      state.mode = 'hurt';
      state.hurtTimer = 0.5;
    }
  }
}

// Hurt state interrupts everything.
if (state.mode === 'hurt') {
  state.hurtTimer -= dt;
  if (state.hurtTimer <= 0) state.mode = 'chase';
  return;
}

// Find target (just chase the origin/player for prototyping).
if (!state.targetId) state.mode = 'chase';

if (state.mode === 'chase') {
  const rb = api.sceneManager.getRigidBody(api.entityId);
  if (!rb) return;

  const pos = rb.mesh.position;

  // Chase (0,0,0) for prototyping.
  const dx = 0 - pos.x;
  const dz = 0 - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < state.attackRange) {
    state.mode = 'attack';
  } else if (dist > 1e-4) {
    const dirX = dx / dist;
    const dirZ = dz / dist;
    // Drive a dynamic body: keep the current vertical velocity (gravity) and steer in XZ.
    const vel = rb.rapierBody.linvel();
    rb.rapierBody.setLinvel({ x: dirX * state.speed, y: vel.y, z: dirZ * state.speed }, true);
  }
}

if (state.mode === 'attack') {
  const now = performance.now() / 1000;
  if (now - state.lastAttackTime > 1.5) {
    state.lastAttackTime = now;
    if (eng) eng.audio.play('/assets/audio/MELEE HEAVY/HEAVYKICK.wav', { volume: 0.8, loop: false });
  }

  // Return to chasing if the target moved away.
  const rb = api.sceneManager.getRigidBody(api.entityId);
  if (rb) {
    const pos = rb.mesh.position;
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (dist > state.attackRange) state.mode = 'chase';
  }
}
`;
