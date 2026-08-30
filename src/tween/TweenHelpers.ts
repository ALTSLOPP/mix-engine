import * as THREE from 'three';
import { Tween } from './Tween';
import { TweenHandle } from './TweenHandle';
import { TweenSequence } from './TweenSequence';
import { TweenPath, type PathOptions } from './TweenPath';
import { TweenPool } from './TweenPool';
import type { TweenOptions } from './types';
import type { TweenDirectorManager } from './TweenDirectorManager';

export class TweenHelpers {
  /**
   * Move an object in 3D space (local or world coordinates).
   */
  static move(
    manager: TweenDirectorManager,
    target: any,
    to: THREE.Vector3 | { x?: number; y?: number; z?: number },
    options: TweenOptions = {},
  ): TweenHandle {
    const rawPos = target.position ?? target;
    const toVec = new THREE.Vector3(
      to.x !== undefined ? to.x : (rawPos.x ?? 0),
      to.y !== undefined ? to.y : (rawPos.y ?? 0),
      to.z !== undefined ? to.z : (rawPos.z ?? 0),
    );
    return manager.to(target, 'position', toVec, options);
  }

  /**
   * Move in world space (handles transformed parent hierarchy correctly).
   */
  static moveWorld(
    manager: TweenDirectorManager,
    target: THREE.Object3D,
    worldTo: THREE.Vector3 | { x?: number; y?: number; z?: number },
    options: TweenOptions = {},
  ): TweenHandle {
    const worldTargetVec = new THREE.Vector3(worldTo.x ?? 0, worldTo.y ?? 0, worldTo.z ?? 0);
    const parent = target.parent;

    if (!parent) {
      return TweenHelpers.move(manager, target, worldTargetVec, options);
    }

    // Convert world target to local target space at start
    const localTarget = parent.worldToLocal(worldTargetVec.clone());
    return manager.to(target, 'position', localTarget, options);
  }

  /**
   * Rotate using Euler angles (degrees or radians).
   */
  static rotateEuler(
    manager: TweenDirectorManager,
    target: any,
    to: THREE.Euler | { x?: number; y?: number; z?: number },
    options: TweenOptions = {},
  ): TweenHandle {
    const rawRot = target.rotation ?? target;
    const toEuler = new THREE.Euler(
      to.x !== undefined ? to.x : (rawRot.x ?? 0),
      to.y !== undefined ? to.y : (rawRot.y ?? 0),
      to.z !== undefined ? to.z : (rawRot.z ?? 0),
      to instanceof THREE.Euler ? to.order : (rawRot.order ?? 'XYZ'),
    );
    return manager.to(target, 'rotation', toEuler, options);
  }

  /**
   * Rotate using Quaternion (shortest-path normalized slerp).
   */
  static rotateQuaternion(
    manager: TweenDirectorManager,
    target: any,
    to: THREE.Quaternion,
    options: TweenOptions = {},
  ): TweenHandle {
    return manager.to(target, 'quaternion', to, options);
  }

  /**
   * Look at a target point smoothly.
   */
  static lookAt(
    manager: TweenDirectorManager,
    target: THREE.Object3D,
    lookAtPoint: THREE.Vector3,
    options: TweenOptions = {},
  ): TweenHandle {
    const m = new THREE.Matrix4();
    m.lookAt(target.position, lookAtPoint, target.up);
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    return manager.to(target, 'quaternion', targetQuat, options);
  }

  /**
   * Uniform or multi-axis scale.
   */
  static scale(
    manager: TweenDirectorManager,
    target: any,
    to: number | THREE.Vector3 | { x?: number; y?: number; z?: number },
    options: TweenOptions = {},
  ): TweenHandle {
    const rawScale = target.scale ?? target;
    const toVec = typeof to === 'number'
      ? new THREE.Vector3(to, to, to)
      : new THREE.Vector3(
          to.x !== undefined ? to.x : (rawScale.x ?? 1),
          to.y !== undefined ? to.y : (rawScale.y ?? 1),
          to.z !== undefined ? to.z : (rawScale.z ?? 1),
        );
    return manager.to(target, 'scale', toVec, options);
  }

  /**
   * Decaying punch oscillation: amplitude * exp(-decay * t) * sin(frequency * t).
   */
  static punch(
    manager: TweenDirectorManager,
    target: any,
    property: 'position' | 'rotation' | 'scale' | string,
    punchVector: THREE.Vector3 | number,
    options: {
      duration?: number;
      vibrato?: number;
      elasticity?: number;
    } & TweenOptions = {},
  ): TweenHandle {
    const duration = options.duration ?? 0.5;
    const vibrato = options.vibrato ?? 10;
    const elasticity = options.elasticity ?? 1.0;

    const baseVal = TweenPool.acquireVector3();
    const currentProp = target[property];
    if (currentProp instanceof THREE.Vector3 || currentProp instanceof THREE.Euler) {
      baseVal.set(currentProp.x, currentProp.y, currentProp.z);
    } else if (typeof currentProp === 'number') {
      baseVal.set(currentProp, 0, 0);
    }

    const punchVec = punchVector instanceof THREE.Vector3
      ? punchVector
      : new THREE.Vector3(punchVector, punchVector, punchVector);

    const tw = new Tween(
      target,
      property,
      target[property],
      {
        ...options,
        duration,
        ease: 'linear',
      },
    );

    const origFrom = baseVal.clone();
    tw.fromValue = origFrom;
    tw.toValue = origFrom;

    // Custom spring interpolation on each frame update
    tw.applyInterpolatedValue = (t: number): void => {
      const decay = Math.exp(-t * (5 * elasticity));
      const wave = Math.sin(t * Math.PI * vibrato);
      const factor = decay * wave;

      if (currentProp instanceof THREE.Vector3 || currentProp instanceof THREE.Euler) {
        currentProp.x = origFrom.x + punchVec.x * factor;
        currentProp.y = origFrom.y + punchVec.y * factor;
        currentProp.z = origFrom.z + punchVec.z * factor;
      } else if (typeof target[property] === 'number') {
        target[property] = origFrom.x + punchVec.x * factor;
      }
    };

    manager.registerTween(tw);
    return tw.getHandle();
  }

  /**
   * Random / multi-frequency shake with decaying intensity.
   */
  static shake(
    manager: TweenDirectorManager,
    target: any,
    property: 'position' | 'rotation' | 'scale' | string,
    strength: THREE.Vector3 | number = 0.5,
    options: {
      duration?: number;
      frequency?: number;
      fadeOut?: boolean;
    } & TweenOptions = {},
  ): TweenHandle {
    const duration = options.duration ?? 0.5;
    const freq = options.frequency ?? 25;
    const fadeOut = options.fadeOut ?? true;

    const origPos = new THREE.Vector3();
    const currentProp = target[property];
    if (currentProp instanceof THREE.Vector3 || currentProp instanceof THREE.Euler) {
      origPos.set(currentProp.x, currentProp.y, currentProp.z);
    }

    const strVec = strength instanceof THREE.Vector3
      ? strength
      : new THREE.Vector3(strength, strength, strength);

    const tw = new Tween(target, property, target[property], {
      ...options,
      duration,
      ease: 'linear',
    });

    tw.applyInterpolatedValue = (t: number): void => {
      const decay = fadeOut ? 1 - t : 1;
      const rx = (Math.sin(t * freq * 1.3) + Math.cos(t * freq * 0.7)) * 0.5;
      const ry = (Math.sin(t * freq * 0.9) + Math.cos(t * freq * 1.5)) * 0.5;
      const rz = (Math.sin(t * freq * 1.1) + Math.cos(t * freq * 1.1)) * 0.5;

      if (currentProp instanceof THREE.Vector3 || currentProp instanceof THREE.Euler) {
        currentProp.x = origPos.x + rx * strVec.x * decay;
        currentProp.y = origPos.y + ry * strVec.y * decay;
        currentProp.z = origPos.z + rz * strVec.z * decay;
      }
    };

    manager.registerTween(tw);
    return tw.getHandle();
  }

  /**
   * Jump trajectory (parabolic ballistic arc).
   */
  static jump(
    manager: TweenDirectorManager,
    target: any,
    endPosition: THREE.Vector3,
    jumpHeight = 2.0,
    numJumps = 1,
    options: TweenOptions = {},
  ): TweenHandle {
    const startPos = target.position ? target.position.clone() : new THREE.Vector3();
    const duration = options.duration ?? 1.0;

    const tw = new Tween(target, 'position', endPosition, {
      ...options,
      duration,
      ease: 'linear',
    });

    tw.applyInterpolatedValue = (t: number): void => {
      // Horizontal linear interpolation
      const x = startPos.x + (endPosition.x - startPos.x) * t;
      const z = startPos.z + (endPosition.z - startPos.z) * t;

      // Vertical parabolic arc per jump
      const jumpProgress = (t * numJumps) % 1;
      const yOffset = 4 * jumpHeight * jumpProgress * (1 - jumpProgress);
      const baseY = startPos.y + (endPosition.y - startPos.y) * t;

      if (target.position) {
        target.position.set(x, baseY + yOffset, z);
      }
    };

    manager.registerTween(tw);
    return tw.getHandle();
  }

  /**
   * Path follower tween with constant-speed arc-length traversal and banking.
   */
  static followPath(
    manager: TweenDirectorManager,
    target: THREE.Object3D,
    waypoints: THREE.Vector3[] | number[][],
    options: {
      pathOptions?: PathOptions;
      orientToPath?: boolean;
    } & TweenOptions = {},
  ): TweenHandle {
    const path = new TweenPath(waypoints, options.pathOptions);
    const duration = options.duration ?? Math.max(1, path.length / 5);
    const orient = options.orientToPath ?? true;

    const tw = new Tween(target, 'position', path.samplePosition(1), {
      ...options,
      duration,
      ease: options.ease ?? 'linear',
    });

    tw.applyInterpolatedValue = (t: number): void => {
      path.samplePosition(t, target.position);
      if (orient) {
        path.sampleOrientation(t, target.quaternion);
      }
    };

    manager.registerTween(tw);
    return tw.getHandle();
  }

  /**
   * Spiral movement (radius expansion + rotation + elevation).
   */
  static spiral(
    manager: TweenDirectorManager,
    target: THREE.Object3D,
    options: {
      center?: THREE.Vector3;
      startRadius?: number;
      endRadius?: number;
      turns?: number;
      heightDelta?: number;
    } & TweenOptions = {},
  ): TweenHandle {
    const center = options.center ?? target.position.clone();
    const startRadius = options.startRadius ?? 1;
    const endRadius = options.endRadius ?? 5;
    const turns = options.turns ?? 2;
    const heightDelta = options.heightDelta ?? 0;
    const duration = options.duration ?? 2.0;

    const startY = center.y;

    const tw = new Tween(target, 'position', target.position, {
      ...options,
      duration,
      ease: options.ease ?? 'linear',
    });

    tw.applyInterpolatedValue = (t: number): void => {
      const radius = startRadius + (endRadius - startRadius) * t;
      const angle = t * Math.PI * 2 * turns;
      target.position.x = center.x + Math.cos(angle) * radius;
      target.position.z = center.z + Math.sin(angle) * radius;
      target.position.y = startY + heightDelta * t;
    };

    manager.registerTween(tw);
    return tw.getHandle();
  }

  /**
   * Material helpers: color, opacity, emissive, texture offset.
   */
  static material(
    manager: TweenDirectorManager,
    material: THREE.Material | any,
    properties: {
      color?: THREE.Color | number | string;
      opacity?: number;
      emissive?: THREE.Color | number | string;
      emissiveIntensity?: number;
      roughness?: number;
      metalness?: number;
    },
    options: TweenOptions = {},
  ): TweenSequence {
    const seq = manager.sequence(options.id ? `${options.id}_mat` : undefined);
    const dur = options.duration ?? 1.0;

    for (const [key, val] of Object.entries(properties)) {
      if (val !== undefined) {
        if (key === 'color' && material.color) {
          const c = val instanceof THREE.Color ? val : new THREE.Color(val as any);
          seq.join(new Tween(material.color, '', c, { ...options, duration: dur, autoPlay: false }));
        } else if (key === 'emissive' && material.emissive) {
          const c = val instanceof THREE.Color ? val : new THREE.Color(val as any);
          seq.join(new Tween(material.emissive, '', c, { ...options, duration: dur, autoPlay: false }));
        } else if (key in material) {
          seq.join(new Tween(material, key, val, { ...options, duration: dur, autoPlay: false }));
        }
      }
    }

    seq.play();
    return seq;
  }

  /**
   * Audio fade in / fade out / crossfade.
   */
  static audioFade(
    manager: TweenDirectorManager,
    audioSource: { volume: number; setVolume?: (v: number) => void },
    toVolume: number,
    options: TweenOptions = {},
  ): TweenHandle {
    return manager.to(audioSource, 'volume', toVolume, options);
  }
}
