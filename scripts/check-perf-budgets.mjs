#!/usr/bin/env node
/**
 * check-perf-budgets.mjs — fail CI when a scenario blows its runtime perf budget.
 *
 * Ported from the GTA prototype's scripts/check-perf-budgets.mjs and adapted to MIX:
 * budgets live in scripts/perf-scenarios.json; measured metrics come from a metrics file
 * (default: artifacts/perf-metrics.json, or --metrics <path>) that a SENSORIUM run or a
 * manual capture writes. Shape of the metrics file:
 *
 *   { "driving": { "frameMs": 16.2, "calls": 1010, "triangles": 1500000,
 *                  "geometries": 2700, "textures": 900 }, ... }
 *
 * Each measured field is compared to its budget: <= budget passes; <= budget*warnMultiplier
 * warns; above that fails (exit 1). Missing metrics file is NON-blocking unless --strict
 * (so the gate is opt-in until a project captures perf), keeping parity with the prototype's
 * "capture, then enforce" workflow.
 *
 * Usage:
 *   node scripts/check-perf-budgets.mjs [--metrics <path>] [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const metricsIdx = args.indexOf('--metrics');
const metricsPath = path.resolve(metricsIdx >= 0 ? args[metricsIdx + 1] : 'artifacts/perf-metrics.json');
const scenarioPath = path.resolve('scripts/perf-scenarios.json');

const FIELDS = ['frameMs', 'calls', 'triangles', 'geometries', 'textures'];

function fail(msg) { console.error(`[PerfBudgetCheck] ${msg}`); process.exit(1); }
function note(msg) { console.log(`[PerfBudgetCheck] ${msg}`); }

if (!fs.existsSync(scenarioPath)) fail(`Missing budget baseline: ${scenarioPath}`);
const budgets = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const warnMultiplier = Number(budgets.warnMultiplier ?? 1.25);
if (!(warnMultiplier >= 1 && warnMultiplier <= 2)) fail(`warnMultiplier must be in [1,2], got ${warnMultiplier}`);
if (!budgets.scenarios || typeof budgets.scenarios !== 'object') fail('perf-scenarios.json must contain a `scenarios` object');

if (!fs.existsSync(metricsPath)) {
  const msg = `No metrics file at ${metricsPath} — run a capture/SENSORIUM pass and write measured metrics there.`;
  if (strict) fail(msg);
  note(`${msg} (non-blocking; pass --strict to enforce)`);
  process.exit(0);
}

const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
let failures = 0;
let warnings = 0;
let checked = 0;

for (const [scenario, budget] of Object.entries(budgets.scenarios)) {
  if (scenario.startsWith('_')) continue;
  const measured = metrics[scenario];
  if (!measured) { note(`· ${scenario}: no measured metrics, skipped`); continue; }
  for (const field of FIELDS) {
    const limit = Number(budget[field]);
    const value = Number(measured[field]);
    if (!Number.isFinite(limit) || !Number.isFinite(value)) continue;
    checked++;
    if (value <= limit) continue;
    if (value <= limit * warnMultiplier) {
      warnings++;
      note(`⚠ ${scenario}.${field}: ${value} > budget ${limit} (within ${Math.round((warnMultiplier - 1) * 100)}% warn band)`);
    } else {
      failures++;
      console.error(`[PerfBudgetCheck] ✗ ${scenario}.${field}: ${value} exceeds budget ${limit} by >${Math.round((warnMultiplier - 1) * 100)}%`);
    }
  }
}

note(`checked ${checked} budget(s): ${failures} failure(s), ${warnings} warning(s)`);
if (failures > 0) process.exit(1);
process.exit(0);
