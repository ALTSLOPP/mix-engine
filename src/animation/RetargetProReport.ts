import type { AnimationPackDef } from './AnimationPack';

export type RetargetReadiness = 'ready' | 'review' | 'blocked';
export type RetargetGrade = 'A' | 'B' | 'C' | 'F';

export interface RetargetProReport {
  packId: string;
  targetRig: string;
  readiness: RetargetReadiness;
  grade: RetargetGrade;
  clipCount: number;
  sourceProfiles: string[];
  categories: Record<string, number>;
  rootMotionClips: number;
  translationScale: { min: number; max: number } | null;
  critical: string[];
  warnings: string[];
  advisories: string[];
  recommendations: string[];
  /** Stable, agent-friendly summary suitable for IDE output and CI logs. */
  summary: string;
}

const CRITICAL = /produced 0 tracks|missing required bones|mirrored bind pose|non-finite|all files retargeted to 0 tracks/i;
const WARNING = /low source score|degenerate anatomical frame|not in a common scale|fits no axis convention|non-uniform bind scale/i;
const ADVISORY = /feet drift|footlock|dropped .*tracks|folded into the next mapped bone|bend concentrates/i;

/** Convert RetargetEngine's human diagnostics into a deterministic result IDE agents can gate on. */
export function buildRetargetProReport(def: AnimationPackDef, issues: readonly string[] = []): RetargetProReport {
  const critical: string[] = [], warnings: string[] = [], advisories: string[] = [];
  for (const issue of new Set(issues)) {
    if (CRITICAL.test(issue)) critical.push(issue);
    else if (WARNING.test(issue)) warnings.push(issue);
    else if (ADVISORY.test(issue)) advisories.push(issue);
    else warnings.push(issue);
  }

  const categories: Record<string, number> = {};
  for (const e of def.entries) categories[e.category] = (categories[e.category] ?? 0) + 1;
  const sourceProfiles = [...new Set(def.entries.map(e => e.sourceProfileId))].sort();
  const scales = def.entries.map(e => e.translationScale).filter(Number.isFinite);
  const translationScale = scales.length ? { min: Math.min(...scales), max: Math.max(...scales) } : null;
  const rootMotionClips = def.entries.filter(e => e.rootMotion).length;

  const readiness: RetargetReadiness = critical.length || def.entries.length === 0 ? 'blocked' : warnings.length ? 'review' : 'ready';
  const grade: RetargetGrade = readiness === 'blocked' ? 'F' : warnings.length > 2 ? 'C' : warnings.length ? 'B' : 'A';
  const recommendations: string[] = [];
  if (critical.length) recommendations.push('Fix critical rig/track errors before applying this pack to production characters.');
  if (warnings.some(w => /common scale|non-uniform/i.test(w))) recommendations.push('Normalize or re-export source/target units before enabling contact IK.');
  if (advisories.some(w => /feet drift/i.test(w))) recommendations.push('Use qualityPreset:"aaa" (foot locking) for contact-critical locomotion and combat clips.');
  if (advisories.some(w => /dropped .*tracks/i.test(w))) recommendations.push('Review dropped tracks; missing fingers/helpers are safe only when the target rig does not contain them.');
  if (!recommendations.length) recommendations.push('Pack is production-ready; preview representative locomotion, combat, and root-motion clips before shipping.');

  return {
    packId: def.id, targetRig: def.targetRig, readiness, grade, clipCount: def.entries.length,
    sourceProfiles, categories, rootMotionClips, translationScale,
    critical, warnings, advisories, recommendations,
    summary: `Retarget Pro ${def.id}: ${readiness.toUpperCase()} (grade ${grade}) — ${def.entries.length} clips, ${critical.length} critical, ${warnings.length} warnings, ${advisories.length} advisories.`,
  };
}
