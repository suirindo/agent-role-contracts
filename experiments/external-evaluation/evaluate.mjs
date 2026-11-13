#!/usr/bin/env node
/**
 * ARC external evaluation helper — read-only declaration checks against an
 * independently pinned official source checkout. Does not execute agents.
 * This helper is a separate evaluation artifact, not part of ARC's public API.
 *
 * Output: the JSON report on stdout, and a plain summary of at most four lines on stderr so that a run whose stdout
 * is redirected to a file still says what happened. On exit 2 the plain lines come first and the JSON error object
 * follows, both on stderr. The exports exist only for tests/evaluate-workflow-docs.test.mjs; they are not a stable
 * interface and may change without notice.
 */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export const EXPECTED_ARC_SHA = '9f6771056c47de971202360952af6d41941f7625';
export const EXPECTED_VERSION = '1.0.0';
// The clone command documented in this kit's README; named whenever --arc is not the pinned clean checkout.
export const PINNED_CLONE_COMMAND = 'git clone --depth 1 --branch v1.0.0 https://github.com/suirindo/agent-role-contracts.git arc-v1';
const OUTSIDE = 'outside-arc-evaluation/forbidden.txt';
const MAX_BYTES = 1024 * 1024;
const ERROR = 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY';
const PASSED = 'DECLARATION_TESTS_PASSED';
const SUFFIX = '(declarations only; execution NOT authorized)';
// Code-point ranges the plain lines escape: C0 and C1 controls, and the bidirectional and line/paragraph controls.
const UNSAFE_RANGES = [[0x0000, 0x001f], [0x007f, 0x009f], [0x061c, 0x061c], [0x200e, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069]];

function usage() {
  return `Usage: node evaluate.mjs --arc /path/to/agent-role-contracts --bundle /path/to/bundle.json --task /path/to/task.json [--second-task /path/to/second-task.json] [--bad-scope other/path.txt]\n\nRuns read-only ARC v1.0.0 declaration checks on supplied JSON; records NO runtime execution or external adoption.\n`;
}
// Returns null when the usage text was asked for (--help, or no arguments).
function parseArgs(argv) {
  const allowed = new Set(['--arc','--bundle','--task','--second-task','--bad-scope']);
  if (argv.includes('--help') || argv.length === 0) return null;
  if (argv.length % 2) throw new Error('Every option requires one value.\n' + usage());
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (!allowed.has(k) || args.has(k) || !v || v.startsWith('--')) throw new Error('Unknown, duplicate or missing option: ' + k);
    args.set(k, v);
  }
  for (const k of ['--arc','--bundle','--task']) if (!args.has(k)) throw new Error('Missing ' + k + '\n' + usage());
  return args;
}
function readBoundedRegularFile(file) {
  const path = resolve(file);
  const st = lstatSync(path);
  if (!st.isFile()) throw new Error('Input must be a regular file (symlinks refused): ' + path);
  if (st.size > MAX_BYTES) throw new Error('Input exceeds 1MiB: ' + path);
  return readFileSync(path, 'utf8');
}
function hash(text) { return createHash('sha256').update(text).digest('hex'); }
// Plain lines echo operator-supplied paths and diagnostics: keep each on one line and free of terminal controls.
function safeText(value) {
  return Array.from(String(value), c => {
    const point = c.codePointAt(0);
    return UNSAFE_RANGES.some(([from, to]) => point >= from && point <= to) ? '\\u' + point.toString(16).padStart(4, '0') : c;
  }).join('');
}
// git's stderr is captured, not inherited, so its raw "fatal: ..." line never reaches the operator. A numeric exit
// status means git ran and refused; anything else (git missing, timeout) means it could not run at all.
function git(arc, ...argv) {
  try {
    return execFileSync('git', ['-C', arc, ...argv], { encoding: 'utf8', timeout: 10000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const refused = typeof error?.status === 'number';
    throw Object.assign(new Error(refused ? 'git ' + argv[0] + ' failed in the --arc directory (exit ' + error.status + ')'
      : 'Could not run git (' + (error?.code || 'no exit status') + ')'), { gitRefused: refused, gitStatus: error?.status });
  }
}
/** The plain reason why --arc is not the pinned clean checkout, or null when it is. A null head: git found no checkout. */
export function arcProblemLine(arcArg, head, modified = false) {
  const reason = head === null ? 'is not a git checkout'
    : head !== EXPECTED_ARC_SHA ? 'is at ' + head + ', not v1.0.0 ' + EXPECTED_ARC_SHA
    : modified ? 'has tracked modifications' : null;
  return reason && '--arc ' + arcArg + ' ' + reason;
}
function arcError(message, arcArg, head, modified) {
  return Object.assign(new Error(message), { arcProblem: arcProblemLine(arcArg, head, modified) });
}
function pinnedCheckout(arcArg) {
  const arc = resolve(arcArg);
  let head;
  try { head = git(arc, 'rev-parse', 'HEAD'); }
  catch (error) { throw error.gitRefused ? arcError('ARC source is not a readable git checkout (git rev-parse exit ' + error.gitStatus + '); use a clean pinned v1.0.0 clone', arcArg, null) : error; }
  if (head !== EXPECTED_ARC_SHA) throw arcError('ARC source commit differs from pinned v1.0.0 tag: ' + head, arcArg, head);
  if (git(arc, 'status', '--porcelain', '--untracked-files=no'))
    throw arcError('ARC checkout has tracked modifications; use a clean pinned v1.0.0 clone', arcArg, head, true);
  const meta = JSON.parse(readBoundedRegularFile(join(arc, 'package.json')));
  if (meta.name !== '@netsujo/agent-role-contracts' || meta.version !== EXPECTED_VERSION)
    throw new Error('Wrong ARC package/version');
  return { arc, head, meta };
}
function outcome(report) {
  return {valid:report.valid === true, diagnostic_codes:(report.errors || []).map(e => e.code),
    execution_authorized:report.execution_authorized, runtime_enforcement:report.runtime_enforcement};
}
function enforceDeclarationOnly(report, label) {
  if (report.execution_authorized !== false || report.runtime_enforcement !== false)
    throw new Error(label + ': API reported execution authority or runtime enforcement; stop');
}
// One step of the sequence: what was expected, what the checker returned, and its diagnostics for the summary.
function step(name, expected, report, asExpected) {
  return { name, expected, got: report.valid === true ? 'PASS' : 'FAIL', as_expected: asExpected,
    errors: (report.errors || []).map(({ code, path, message }) => ({ code, path, message })) };
}

/**
 * The declaration sequence, given a checkout's core functions and the contents of the input files. It reads no file,
 * runs no git and no clock, so a test can run it against any core. `steps` and `exitCode` feed the stderr summary
 * and the process exit; only `result` is printed as the report.
 */
export function runEvaluation({ validateBundle, explainTask }, { meta, head, evaluatedAt, bundleText, taskText, badScope = OUTSIDE, secondTaskText }) {
  const task = JSON.parse(taskText);
  if (typeof task.inputs?.scope !== 'string') throw new Error('This scope test requires task.inputs.scope to be a string');
  if (badScope === task.inputs.scope) throw new Error('Bad scope must differ from original scope');

  const bundle = validateBundle(bundleText);
  const first = explainTask(bundleText, taskText);
  const contradiction = JSON.parse(taskText);
  contradiction.inputs.scope = badScope;
  const negative = explainTask(bundleText, JSON.stringify(contradiction));
  const repair = explainTask(bundleText, JSON.stringify(task));
  for (const [label, r] of [['bundle',bundle],['normal',first],['scope contradiction',negative],['repaired',repair]])
    enforceDeclarationOnly(r, label);
  const failureCodes = (negative.errors || []).map(x => x.code);
  const steps = [
    step('normal', 'PASS', bundle.valid === true ? first : bundle, bundle.valid === true && first.valid === true),
    step('injected scope', 'FAIL', negative, negative.valid === false && failureCodes.length > 0 && failureCodes.every(c => c === ERROR)),
    step('repaired', 'PASS', repair, repair.valid === true),
  ];
  const basicOk = steps.every(s => s.as_expected);

  let second = null;
  let secondOk = true;
  if (secondTaskText !== undefined) {
    const secondJson = JSON.parse(secondTaskText);
    if (secondJson.id === task.id || secondTaskText === taskText) throw new Error('Second task must have a distinct task ID and content');
    const res = explainTask(bundleText, secondTaskText);
    enforceDeclarationOnly(res, 'second task declaration');
    secondOk = res.valid === true;
    second = { task_id:secondJson.id, sha256:hash(secondTaskText), declaration:outcome(res),
      actual_second_task_execution_verified:false, external_operator_verified:false };
    steps.push(step('second task', 'PASS', res, secondOk));
  }

  const result = {
    profile:'ARC_EXTERNAL_EVALUATION_V1', arc_package:meta.name, arc_version:meta.version,
    exact_arc_source_commit:head, evaluated_at_utc:evaluatedAt,
    evidence_class:'LOCAL_DECLARATION_CHECK_ONLY',
    source_files:{bundle_sha256:hash(bundleText), first_task_sha256:hash(taskText)},
    task_id:task.id, original_scope:task.inputs.scope, injected_scope:badScope,
    normal:outcome(first), contradictory_scope:outcome(negative), repaired:outcome(repair),
    expected_pass_fail_pass:basicOk, second_task:second,
    second_task_declaration_passed:second ? secondOk : null,
    actual_agent_execution_verified:false, actual_external_adoption_verified:false,
    existing_controls_comparison:'OPERATOR_REPORT_REQUIRED', setup_minutes:'OPERATOR_REPORT_REQUIRED',
    pass_grants_runtime_authority:false,
    verdict:basicOk && secondOk ? PASSED : 'EVALUATION_FAILED'
  };
  return { result, steps, exitCode: result.verdict === PASSED ? 0 : 1 };
}

/** The stderr summary of a finished evaluation: at most four plain lines. */
export function formatSummary({ result, steps, exitCode }) {
  const last = 'JSON report written to stdout; exit ' + exitCode;
  if (exitCode === 0) return [
    'PASS: evaluation sequence ' + SUFFIX,
    'Steps: normal PASS, injected scope FAIL (expected), repaired PASS; second task: ' + (result.second_task ? 'declaration PASS' : 'not supplied'),
    'bundle_sha256: ' + result.source_files.bundle_sha256,
    last,
  ];
  const bad = steps.find(s => !s.as_expected);
  const injected = bad.name === 'injected scope';
  // An injected scope can also be refused for a reason other than lying outside the declared scope; show that reason.
  const shown = bad.errors.find(e => !injected || e.code !== ERROR) || bad.errors[0];
  const detail = injected && bad.got === 'PASS'
    ? 'No diagnostic: --bad-scope ' + result.injected_scope + ' is inside the declared write scope; choose a path outside it'
    : shown ? shown.code + ' ' + shown.path + ': ' + shown.message + (bad.errors.length > 1 ? '   [+' + (bad.errors.length - 1) + ' more in the JSON report]' : '')
    : 'No diagnostic: the checker returned none for this step';
  return [
    'FAIL: evaluation sequence ' + SUFFIX,
    'Step not as expected: ' + bad.name + ': expected ' + bad.expected + ', got ' + bad.got + (bad.got === bad.expected ? ' with a different diagnostic' : ''),
    safeText(detail),
    last,
  ];
}

/** The plain stderr lines of an evaluation that did not run (exit 2); the JSON error object follows them. */
export function formatErrorSummary(error) {
  const lines = ['ERROR: evaluation not run; exit 2'];
  if (typeof error?.arcProblem === 'string') lines.push(safeText(error.arcProblem), 'Create a clean pinned clone: ' + PINNED_CLONE_COMMAND);
  else lines.push(safeText(String(error?.message || error).split('\n')[0]), 'Run: node evaluate.mjs --help');
  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) { console.log(usage()); return; }
  const { arc, head, meta } = pinnedCheckout(args.get('--arc'));
  const core = await import(pathToFileURL(join(arc, 'src/core.mjs')).href);
  const inputs = { meta, head, evaluatedAt: new Date().toISOString(),
    bundleText: readBoundedRegularFile(args.get('--bundle')), taskText: readBoundedRegularFile(args.get('--task')),
    badScope: args.get('--bad-scope') || OUTSIDE };
  if (args.has('--second-task')) inputs.secondTaskText = readBoundedRegularFile(args.get('--second-task'));
  const exitCode = emit(runEvaluation(core, inputs), text => console.log(text), text => console.error(text));
  if (exitCode) process.exitCode = exitCode;
}
/** Writes a finished evaluation: the JSON report to `out` (stdout), the plain summary to `err` (stderr). Returns the exit code. */
export function emit(evaluation, out, err) {
  out(JSON.stringify(evaluation.result, null, 2));
  err(formatSummary(evaluation).join('\n'));
  return evaluation.exitCode === 0 ? 0 : 1;
}
// Run only when invoked as a script: importing this module must not start an evaluation. Both paths are resolved, so a
// symlinked directory compares equal, and Windows paths that differ only in letter case name the same file.
function invokedAsScript() {
  if (!process.argv[1]) return false;
  try {
    const [invoked, self] = [process.argv[1], fileURLToPath(import.meta.url)].map(path => realpathSync(path));
    return process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self;
  } catch { return false; }
}
if (invokedAsScript()) main().catch(error => {
  console.error(formatErrorSummary(error).join('\n'));
  console.error(JSON.stringify({verdict:'EVALUATION_ERROR',error:String(error?.message || error),
    actual_agent_execution_verified:false, actual_external_adoption_verified:false}, null, 2));
  process.exitCode = 2;
});
