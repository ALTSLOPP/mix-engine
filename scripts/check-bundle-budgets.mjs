#!/usr/bin/env node
/**
 * check-bundle-budgets.mjs — fail CI when the built JS bundle blows its size budget.
 *
 * Ported from the GTA prototype's scripts/check-bundle-budgets.mjs. Run AFTER `npm run build`.
 * Sums the gzipped size of dist/assets/*.js and compares total + largest-chunk against
 * budgets. Catches the silent open-world killer: a dependency or a fat new system quietly
 * inflating the initial download. Budgets are intentionally generous defaults — tighten in
 * scripts/bundle-budgets.json (optional) once a project knows its real footprint.
 *
 * Usage:
 *   node scripts/check-bundle-budgets.mjs [--dir dist/assets] [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const dirIdx = args.indexOf('--dir');
const assetsDir = path.resolve(dirIdx >= 0 ? args[dirIdx + 1] : 'dist/assets');
const budgetPath = path.resolve('scripts/bundle-budgets.json');

const DEFAULT_BUDGETS = { totalGzipKB: 4096, largestChunkGzipKB: 2048 };

function note(msg) { console.log(`[BundleBudgetCheck] ${msg}`); }
function fail(msg) { console.error(`[BundleBudgetCheck] ${msg}`); process.exit(1); }

const budgets = fs.existsSync(budgetPath)
  ? { ...DEFAULT_BUDGETS, ...JSON.parse(fs.readFileSync(budgetPath, 'utf8')) }
  : DEFAULT_BUDGETS;

if (!fs.existsSync(assetsDir)) {
  const msg = `No build output at ${assetsDir} — run \`npm run build\` first.`;
  if (strict) fail(msg);
  note(`${msg} (non-blocking; pass --strict to enforce)`);
  process.exit(0);
}

const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) { note('no .js chunks found, nothing to check'); process.exit(0); }

let totalGzip = 0;
let largestGzip = 0;
let largestName = '';
for (const file of jsFiles) {
  const buf = fs.readFileSync(path.join(assetsDir, file));
  const gz = zlib.gzipSync(buf).length;
  totalGzip += gz;
  if (gz > largestGzip) { largestGzip = gz; largestName = file; }
  note(`· ${file}: ${(gz / 1024).toFixed(1)} KB gz`);
}

const totalKB = totalGzip / 1024;
const largestKB = largestGzip / 1024;
note(`total: ${totalKB.toFixed(1)} KB gz (budget ${budgets.totalGzipKB} KB) · largest: ${largestName} ${largestKB.toFixed(1)} KB gz (budget ${budgets.largestChunkGzipKB} KB)`);

let failed = false;
if (totalKB > budgets.totalGzipKB) { console.error(`[BundleBudgetCheck] ✗ total ${totalKB.toFixed(1)} KB exceeds ${budgets.totalGzipKB} KB`); failed = true; }
if (largestKB > budgets.largestChunkGzipKB) { console.error(`[BundleBudgetCheck] ✗ largest chunk ${largestKB.toFixed(1)} KB exceeds ${budgets.largestChunkGzipKB} KB`); failed = true; }

process.exit(failed ? 1 : 0);
