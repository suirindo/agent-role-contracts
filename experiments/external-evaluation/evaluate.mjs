#!/usr/bin/env node
/**
 * ARC external evaluation helper — read-only declaration checks against an
 * independently pinned official source checkout. Does not execute agents.
 * This helper is a separate evaluation artifact, not part of ARC's public API.
 */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const EXPECTED_ARC_SHA = '9f6771056c47de971202360952af6d41941f7625';
const EXPECTED_VERSION = '1.0.0';
const OUTSIDE = 'outside-arc-evaluation/forbidden.txt';
const MAX_BYTES = 1024 * 1024;
const ERROR = 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY';

function usage() {
  return `Usage: node evaluate.mjs --arc /path/to/agent-role-contracts --bundle /path/to/bundle.json --task /path/to/task.json [--second-task /path/to/second-task.json] [--bad-scope other/path.txt]\n\nRuns read-only ARC v1.0.0 declaration checks on supplied JSON; records NO runtime execution or external adoption.\n`;
}
function parseArgs(argv) {
  const allowed = new Set(['--arc','--bundle','--task','--second-task','--bad-scope']);
  if (argv.includes('--help') || argv.length === 0) { console.log(usage()); process.exit(0); }
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
function git(arc, ...argv) {
  return execFileSync('git', ['-C', arc, ...argv], { encoding: 'utf8', timeout: 10000, maxBuffer: 128 * 1024 }).trim();
}
function outcome(report) {
  return {valid:report.valid === true, diagnostic_codes:(report.errors || []).map(e => e.code),
    execution_authorized:report.execution_authorized, runtime_enforcement:report.runtime_enforcement};
}
function enforceDeclarationOnly(report, label) {
  if (report.execution_authorized !== false || report.runtime_enforcement !== false)
    throw new Error(label + ': API reported execution authority or runtime enforcement; stop');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const arc = resolve(args.get('--arc'));
  const head = git(arc, 'rev-parse', 'HEAD');
  if (head !== EXPECTED_ARC_SHA) throw new Error('ARC source commit differs from pinned v1.0.0 tag: ' + head);
  if (git(arc, 'status', '--porcelain', '--untracked-files=no'))
    throw new Error('ARC checkout has tracked modifications; use a clean pinned v1.0.0 clone');
  const meta = JSON.parse(readBoundedRegularFile(join(arc, 'package.json')));
  if (meta.name !== '@netsujo/agent-role-contracts' || meta.version !== EXPECTED_VERSION)
    throw new Error('Wrong ARC package/version');

  const { validateBundle, explainTask } = await import(pathToFileURL(join(arc, 'src/core.mjs')).href);
  const bundleText = readBoundedRegularFile(args.get('--bundle'));
  const taskText = readBoundedRegularFile(args.get('--task'));
  const task = JSON.parse(taskText);
  if (typeof task.inputs?.scope !== 'string') throw new Error('This scope test requires task.inputs.scope to be a string');
  const badScope = args.get('--bad-scope') || OUTSIDE;
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
  const basicOk = bundle.valid === true && first.valid === true && negative.valid === false &&
    failureCodes.length > 0 && failureCodes.every(c => c === ERROR) && repair.valid === true;

  let second = null;
  let secondOk = true;
  if (args.has('--second-task')) {
    const secondText = readBoundedRegularFile(args.get('--second-task'));
    const secondJson = JSON.parse(secondText);
    if (secondJson.id === task.id || secondText === taskText) throw new Error('Second task must have a distinct task ID and content');
    const res = explainTask(bundleText, secondText);
    enforceDeclarationOnly(res, 'second task declaration');
    secondOk = res.valid === true;
    second = { task_id:secondJson.id, sha256:hash(secondText), declaration:outcome(res),
      actual_second_task_execution_verified:false, external_operator_verified:false };
  }

  const result = {
    profile:'ARC_EXTERNAL_EVALUATION_V1', arc_package:meta.name, arc_version:meta.version,
    exact_arc_source_commit:head, evaluated_at_utc:new Date().toISOString(),
    evidence_class:'LOCAL_DECLARATION_CHECK_ONLY',
    source_files:{bundle_sha256:hash(bundleText), first_task_sha256:hash(taskText)},
    task_id:task.id, original_scope:task.inputs.scope, injected_scope:badScope,
    normal:outcome(first), contradictory_scope:outcome(negative), repaired:outcome(repair),
    expected_pass_fail_pass:basicOk, second_task:second,
    second_task_declaration_passed:second ? secondOk : null,
    actual_agent_execution_verified:false, actual_external_adoption_verified:false,
    existing_controls_comparison:'OPERATOR_REPORT_REQUIRED', setup_minutes:'OPERATOR_REPORT_REQUIRED',
    pass_grants_runtime_authority:false,
    verdict:basicOk && secondOk ? 'DECLARATION_TESTS_PASSED' : 'EVALUATION_FAILED'
  };
  console.log(JSON.stringify(result, null, 2));
  if (!basicOk || !secondOk) process.exitCode = 1;
}
main().catch(error => {
  console.error(JSON.stringify({verdict:'EVALUATION_ERROR',error:String(error?.message || error),
    actual_agent_execution_verified:false, actual_external_adoption_verified:false}, null, 2));
  process.exitCode = 2;
});
