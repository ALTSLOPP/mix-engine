import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TweenValueAdapter } from '../src/tween/TweenValueAdapter';
import { TweenTargetResolver } from '../src/tween/TweenTargetResolver';
import { TweenDirectorManager } from '../src/tween/TweenDirectorManager';
import { TweenEase } from '../src/tween/TweenEase';

describe('TweenSecurityAndValidation — Prototype Safety, Suggestions & Diagnostics', () => {
  it('blocks prototype pollution through property paths', () => {
    const target: any = {};

    expect(() => {
      TweenValueAdapter.getNestedProperty(target, '__proto__.polluted');
    }).toThrow(/forbidden/i);

    expect(() => {
      TweenValueAdapter.setNestedProperty(target, '__proto__.polluted', true);
    }).toThrow(/forbidden/i);

    expect(() => {
      TweenValueAdapter.setNestedProperty(target, 'constructor.prototype.polluted', true);
    }).toThrow(/forbidden/i);

    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('provides Levenshtein distance suggestions for mistyped ease names', () => {
    const allEases = TweenEase.allNames();

    const suggestions = TweenTargetResolver.findSuggestions('cubcOut', allEases);
    expect(suggestions).toContain('cubicOut');

    const backSuggestions = TweenTargetResolver.findSuggestions('bakIn', allEases);
    expect(backSuggestions).toContain('backIn');
  });

  it('generates structured inspection diagnostics report and detects anomalies', () => {
    const manager = new TweenDirectorManager();
    const mesh = { position: new THREE.Vector3(0, 0, 0) };

    manager.to(mesh, 'position.x', 10, { duration: 1.0, ease: 'cubicOut' });
    manager.sequence('boss_intro').appendInterval(2.0);

    const report = manager.inspect();
    expect(report.activeTweenCount).toBe(1);
    expect(report.activeSequenceCount).toBe(1);
    expect(report.poolUsage).toBeDefined();
    expect(report.errors.length).toBe(0);
  });
});
