import type { CommandMap, CmdCtx } from './BridgeContext';
import type { AICommand } from '../AIBridge';
import type { RigidBodyComponent } from '../../physics/RigidBodyComponent';

export function register(map: CommandMap, ctx: CmdCtx): void {
  map.set('set_gravity', (cmd: Extract<AICommand, { type: 'set_gravity' }>) => {
    ctx.physicsWorld.setGravity(cmd.gravity);
  });

  map.set('apply_impulse', (cmd: Extract<AICommand, { type: 'apply_impulse' }>) => {
    const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
    if (!rb) return;
    const body = rb.rapierBody;
    body.applyImpulse({ x: cmd.x, y: cmd.y, z: cmd.z }, true);
    body.wakeUp();
  });

  map.set('set_velocity', (cmd: Extract<AICommand, { type: 'set_velocity' }>) => {
    const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
    if (!rb) return;
    const body = rb.rapierBody;
    body.setLinvel({ x: cmd.x, y: cmd.y, z: cmd.z }, true);
    body.wakeUp();
  });

  map.set('set_angular_velocity', (cmd: Extract<AICommand, { type: 'set_angular_velocity' }>) => {
    const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
    if (!rb) return;
    const body = rb.rapierBody;
    body.setAngvel({ x: cmd.x, y: cmd.y, z: cmd.z }, true);
    body.wakeUp();
  });

  map.set('set_ccd', (cmd: Extract<AICommand, { type: 'set_ccd' }>) => {
    const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
    if (!rb) return;
    rb.enableCcd(cmd.enabled);
  });

  map.set('collision_layer_define', (cmd: Extract<AICommand, { type: 'collision_layer_define' }>) => {
    const id = cmd.id ?? ctx.physicsWorld.collisionMatrix.getLayerId(cmd.name) ?? 15;
    ctx.physicsWorld.collisionMatrix.defineLayer(cmd.name, id, cmd.collidesWith);
  });

  map.set('collision_set_layer', (cmd: Extract<AICommand, { type: 'collision_set_layer' }>) => {
    const rb = ctx.sceneManager.getComponent<RigidBodyComponent>(cmd.entityId, 'rigidBody');
    if (!rb || !rb.rapierBody) return;
    const mask = ctx.physicsWorld.collisionMatrix.layerMask(cmd.layer);
    const body = rb.rapierBody;
    for (let i = 0; i < body.numColliders(); i++) {
      const c = body.collider(i);
      c.setCollisionGroups(mask);
    }
  });

  map.set('collision_matrix_get', (_cmd: Extract<AICommand, { type: 'collision_matrix_get' }>) => {
    return ctx.physicsWorld.collisionMatrix.getConfig();
  });
}
