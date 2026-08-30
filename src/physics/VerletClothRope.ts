import * as THREE from 'three';

export interface VerletParticle {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  acc: THREE.Vector3;
  pinned: boolean;
  mass: number;
}

export interface DistanceConstraint {
  p1: number;
  p2: number;
  restLength: number;
}

export interface CollisionSphere {
  center: THREE.Vector3;
  radius: number;
}

export class VerletClothRope {
  readonly particles: VerletParticle[] = [];
  readonly constraints: DistanceConstraint[] = [];
  readonly collisionSpheres: CollisionSphere[] = [];
  gravity = new THREE.Vector3(0, -9.81, 0);
  damping = 0.98;

  addParticle(pos: THREE.Vector3, pinned = false, mass = 1.0): number {
    const idx = this.particles.length;
    this.particles.push({
      pos: pos.clone(),
      prevPos: pos.clone(),
      acc: new THREE.Vector3(),
      pinned,
      mass,
    });
    return idx;
  }

  addConstraint(p1: number, p2: number, restLength?: number): void {
    const len = restLength ?? this.particles[p1].pos.distanceTo(this.particles[p2].pos);
    this.constraints.push({ p1, p2, restLength: len });
  }

  addCollisionSphere(center: THREE.Vector3, radius: number): void {
    this.collisionSpheres.push({ center, radius });
  }

  step(dt: number, iterations = 4): void {
    const dtSq = dt * dt;

    // 1. Verlet integration
    for (const p of this.particles) {
      if (p.pinned) continue;

      const vel = p.pos.clone().sub(p.prevPos).multiplyScalar(this.damping);
      p.prevPos.copy(p.pos);

      // Apply gravity
      p.acc.copy(this.gravity);
      p.pos.add(vel).addScaledVector(p.acc, dtSq);
    }

    // 2. Relaxation constraint solve
    const delta = new THREE.Vector3();
    for (let it = 0; it < iterations; it++) {
      for (const c of this.constraints) {
        const pA = this.particles[c.p1];
        const pB = this.particles[c.p2];

        delta.subVectors(pB.pos, pA.pos);
        const dist = delta.length();
        if (dist === 0) continue;

        const diff = (dist - c.restLength) / dist;
        const offset = delta.clone().multiplyScalar(diff * 0.5);

        if (!pA.pinned && !pB.pinned) {
          pA.pos.add(offset);
          pB.pos.sub(offset);
        } else if (!pA.pinned) {
          pA.pos.add(offset.multiplyScalar(2));
        } else if (!pB.pinned) {
          pB.pos.sub(offset.multiplyScalar(2));
        }
      }

      // 3. Collision sphere resolution
      for (const p of this.particles) {
        if (p.pinned) continue;
        for (const sphere of this.collisionSpheres) {
          const toP = p.pos.clone().sub(sphere.center);
          const dist = toP.length();
          if (dist < sphere.radius && dist > 0) {
            toP.normalize().multiplyScalar(sphere.radius);
            p.pos.copy(sphere.center).add(toP);
          }
        }
      }
    }
  }

  /** Factory: creates a rectangular cloth grid */
  static createClothGrid(
    width: number,
    height: number,
    segsX: number,
    segsY: number,
    pinTop = true,
  ): VerletClothRope {
    const sim = new VerletClothRope();
    const dx = width / segsX;
    const dy = height / segsY;

    // Create particles
    for (let y = 0; y <= segsY; y++) {
      for (let x = 0; x <= segsX; x++) {
        const pos = new THREE.Vector3(x * dx - width / 2, -y * dy, 0);
        const pinned = pinTop && y === 0;
        sim.addParticle(pos, pinned);
      }
    }

    // Structural & shear constraints
    const getIdx = (x: number, y: number) => y * (segsX + 1) + x;

    for (let y = 0; y <= segsY; y++) {
      for (let x = 0; x <= segsX; x++) {
        if (x < segsX) sim.addConstraint(getIdx(x, y), getIdx(x + 1, y));
        if (y < segsY) sim.addConstraint(getIdx(x, y), getIdx(x, y + 1));
        if (x < segsX && y < segsY) {
          sim.addConstraint(getIdx(x, y), getIdx(x + 1, y + 1));
          sim.addConstraint(getIdx(x + 1, y), getIdx(x, y + 1));
        }
      }
    }

    return sim;
  }
}
