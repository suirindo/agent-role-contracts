#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ARC_V1_SHA = '9f6771056c47de971202360952af6d41941f7625';
const SHIPRULES_SHA = '8b8302e9551fb8784d7cbe7fa61eeecf127bf247';
const SCANNER_SHA256 = '58b650402c321d69cdeddc3b71abcb55ad882585a9bdad00929b1f545c61b8d7';
const OUTSIDE_SCOPE = 'outside-shiprules-comparison/forbidden.gd';
const HERE = dirname(fileURLToPath(import.meta.url));
const EVALUATOR = resolve(HERE, '..', 'evaluate.mjs');
const BUNDLE = join(HERE, 'bundle.json');
const CASE_FILES = Object.freeze([
  ['baseline', join(HERE, 'cases', 'baseline', 'player.gd')],
  ['syntax-regression', join(HERE, 'cases', 'syntax-regression', 'player.gd')],
  ['repaired', join(HERE, 'cases', 'repaired', 'player.gd')]
]);

function parseArgs(argv) {
  if (argv.includes('--help')) {
    console.log('Usage: node run-comparison.mjs --arc-v1 /path/to/arc-v1 --shiprules /path/to/shiprules-free');
    process.exit(0);
  }
  if (argv.length !== 4) throw new Error('Expected --arc-v1 and --shiprules, each exactly once');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (!['--arc-v1', '--shiprules'].includes(option) || values.has(option) || !argv[index + 1]) {
      throw new Error(`Invalid option: ${option}`);
    }
    values.set(option, resolve(argv[index + 1]));
  }
  if (!values.has('--arc-v1') || !values.has('--shiprules')) throw new Error('Both paths are required');
  return values;
}

function command(file, args, options = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(file, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    ...options
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  return {
    exit_code: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    elapsed_ms: Number(elapsedMs.toFixed(3))
  };
}

function git(repo, ...args) {
  const result = command('git', ['-C', repo, ...args]);
  if (result.exit_code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function assertPinnedClean(repo, expectedSha, label) {
  const actual = git(repo, 'rev-parse', 'HEAD');
  if (actual !== expectedSha) throw new Error(`${label} commit ${actual} differs from ${expectedSha}`);
  const dirty = git(repo, 'status', '--porcelain', '--untracked-files=all');
  if (dirty) throw new Error(`${label} checkout is not clean`);
}

function assertFixtureCases() {
  for (const [caseName, file] of CASE_FILES) {
    const stat = lstatSync(file);
    if (!stat.isFile()) throw new Error(`Fixture case ${caseName} is not a regular file: ${file}`);
    readFileSync(file);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function runArc(arcV1, taskName) {
  const task = join(HERE, 'tasks', `${taskName}.json`);
  const invocation = command(process.execPath, [
    EVALUATOR,
    '--arc', arcV1,
    '--bundle', BUNDLE,
    '--task', task,
    '--bad-scope', OUTSIDE_SCOPE
  ]);
  let report;
  try {
    report = JSON.parse(invocation.stdout);
  } catch {
    throw new Error(`ARC ${taskName} returned non-JSON output: ${invocation.stdout || invocation.stderr}`);
  }
  return { invocation, report };
}

function runScanner(scanner, caseName) {
  return command('bash', [scanner, join('cases', caseName)], { cwd: HERE });
}

function arcPassed(result) {
  return result.invocation.exit_code === 0 &&
    result.report.verdict === 'DECLARATION_TESTS_PASSED' &&
    result.report.normal?.valid === true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const arcV1 = args.get('--arc-v1');
  const shiprules = args.get('--shiprules');
  assertPinnedClean(arcV1, ARC_V1_SHA, 'ARC v1.0.0');
  assertPinnedClean(shiprules, SHIPRULES_SHA, 'ShipRules-free');
  assertFixtureCases();

  const scanner = join(shiprules, 'godot4', 'scripts', 'check-godot3.sh');
  const scannerHash = sha256(scanner);
  if (scannerHash !== SCANNER_SHA256) {
    throw new Error(`ShipRules scanner hash ${scannerHash} differs from ${SCANNER_SHA256}`);
  }

  const started = process.hrtime.bigint();
  const baselineArc = runArc(arcV1, 'baseline');
  const syntaxArc = runArc(arcV1, 'syntax-regression');
  const repairedArc = runArc(arcV1, 'repaired');
  const baselineScanner = runScanner(scanner, 'baseline');
  const syntaxScanner = runScanner(scanner, 'syntax-regression');
  const repairedScanner = runScanner(scanner, 'repaired');

  const scopeCodes = baselineArc.report.contradictory_scope?.diagnostic_codes || [];
  const expectations = {
    baseline: arcPassed(baselineArc) && baselineScanner.exit_code === 0,
    outside_scope: baselineArc.report.contradictory_scope?.valid === false &&
      scopeCodes.length > 0 && scopeCodes.every(code => code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY') &&
      baselineScanner.exit_code === 0,
    syntax_regression: arcPassed(syntaxArc) && syntaxScanner.exit_code === 1 &&
      syntaxScanner.stdout.includes('Godot 3 syntax'),
    repaired: arcPassed(repairedArc) && repairedScanner.exit_code === 0
  };
  const allExpected = Object.values(expectations).every(Boolean);
  const totalElapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const report = {
    profile: 'ARC_SHIPRULES_FREE_COMPARISON_V1',
    evidence_class: 'MAINTAINER_EXECUTED_PUBLIC_REPOSITORY_SYNTHETIC_COMPARISON',
    observed_at_utc: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    pinned_sources: {
      arc_v1_commit: ARC_V1_SHA,
      shiprules_free_commit: SHIPRULES_SHA,
      shiprules_scanner_sha256: scannerHash
    },
    cases: {
      baseline: {
        arc: baselineArc.report.normal,
        scanner: baselineScanner
      },
      outside_scope: {
        arc: baselineArc.report.contradictory_scope,
        scanner: baselineScanner,
        note: 'The scanner reuses clean baseline content because only the supplied task scope changes.'
      },
      syntax_regression: {
        arc: syntaxArc.report.normal,
        scanner: syntaxScanner
      },
      repaired: {
        arc: repairedArc.report.normal,
        scanner: repairedScanner
      }
    },
    expectations,
    all_expectations_passed: allExpected,
    automated_wall_ms: Number(totalElapsedMs.toFixed(3)),
    human_setup_minutes: 'UNMEASURED',
    legitimate_fixture_refusals: {
      arc: { count: 0, denominator: 3 },
      shiprules_scanner: { count: 0, denominator: 2 },
      note: 'All three tasks are legitimate for ARC scope. Baseline and repaired syntax are the scanner-positive controls; the syntax-regression rejection is expected.'
    },
    external_operator_reviewed_or_executed: false,
    completed_external_hands_on_evaluations_added: 0,
    paid_shiprules_controls_evaluated: false
  };
  console.log(JSON.stringify(report, null, 2));
  if (!allExpected) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    profile: 'ARC_SHIPRULES_FREE_COMPARISON_V1',
    verdict: 'COMPARISON_ERROR',
    error: String(error?.message || error),
    external_operator_reviewed_or_executed: false
  }, null, 2));
  process.exitCode = 2;
}
