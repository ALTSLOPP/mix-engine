import { describe, it, expect } from 'vitest';
import { CollisionMatrix } from '../src/physics/CollisionMatrix';

describe('CollisionMatrix', () => {
  it('loads default matrix and compiles 32-bit interaction groups', () => {
    const matrix = new CollisionMatrix();
    const playerMask = matrix.layerMask('Player');
    const enemyMask = matrix.layerMask('Enemy');
    const terrainMask = matrix.layerMask('StaticTerrain');

    expect(playerMask).toBeGreaterThan(0);
    expect(enemyMask).toBeGreaterThan(0);
    expect(terrainMask).toBeGreaterThan(0);

    // Verify upper 16 bits encode membership and lower 16 bits encode filter
    const playerMembership = (playerMask >>> 16) & 0xffff;
    const playerFilter = playerMask & 0xffff;

    expect(playerMembership).toBe(1 << 0); // Player is layer 0
    expect((playerFilter & (1 << 4)) !== 0).toBe(true); // Player collides with StaticTerrain (layer 4)
    expect((playerFilter & (1 << 1)) !== 0).toBe(true); // Player collides with Enemy (layer 1)
  });

  it('correctly checks collision compatibility', () => {
    const matrix = new CollisionMatrix();
    expect(matrix.canCollide('Player', 'Enemy')).toBe(true);
    expect(matrix.canCollide('Player', 'StaticTerrain')).toBe(true);
    expect(matrix.canCollide('Trigger', 'StaticTerrain')).toBe(false);
  });

  it('supports dynamically defining new layers', () => {
    const matrix = new CollisionMatrix();
    matrix.defineLayer('Water', 10, ['Player', 'Enemy', 'Vehicle']);

    const waterMask = matrix.layerMask('Water');
    const membership = (waterMask >>> 16) & 0xffff;
    const filter = waterMask & 0xffff;

    expect(membership).toBe(1 << 10);
    expect((filter & (1 << 0)) !== 0).toBe(true); // collides with Player (0)
    expect((filter & (1 << 1)) !== 0).toBe(true); // collides with Enemy (1)
    expect((filter & (1 << 4)) !== 0).toBe(false); // does not collide with StaticTerrain (4)
  });

  it('supports toggling collision between layers', () => {
    const matrix = new CollisionMatrix();
    expect(matrix.canCollide('Projectile', 'Debris')).toBe(false);

    matrix.setCollision('Projectile', 'Debris', true);
    expect(matrix.canCollide('Projectile', 'Debris')).toBe(true);

    matrix.setCollision('Projectile', 'Debris', false);
    expect(matrix.canCollide('Projectile', 'Debris')).toBe(false);
  });
});
