// First-use path (issue #47, maintenance-only): docs/QUICKSTART.md, docs/EVALUATE-WORKFLOW.md, the README no-clone
// commands, and the external evaluation helper those pages send a reader to. The pages state commands, first output
// lines and exit codes; this file runs them, so a page cannot drift from the CLI or the helper without failing here.
// The helper's success path runs through its exported functions against this repository's own src/core.mjs: no test
// builds a stand-in for the pinned v1.0.0 checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as core from '../src/core.mjs';
import {
  EXPECTED_ARC_SHA, EXPECTED_VERSION, PINNED_CLONE_COMMAND, arcProblemLine, emit, formatErrorSummary, formatSummary, runEvaluation,
} from '../experiments/external-evaluation/evaluate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'bin', 'agent-role-contracts.mjs');
const helper = join(root, 'experiments', 'external-evaluation', 'evaluate.mjs');
const raw = (...parts) => readFileSync(join(root, ...parts), 'utf8');
// Pages are compared as text, so a CRLF checkout must read the same as an LF one.
const lf = text => text.replace(/\r\n/g, '\n');
const page = (...parts) => lf(raw(...parts));
const pkg = JSON.parse(raw('package.json'));
const node = (args, options = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000, ...options });
const outputLines = text => lf(text).replace(/\n+$/, '').split('\n');
const SUFFIX = '(declarations only; execution NOT authorized)';

// Lines of one section: from its heading to the next heading of the same or a higher level. Fences are tracked, so a
// line that starts with "#" inside a code block is never read as a heading.
function section(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `heading not found: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  let fenced = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) fenced = !fenced;
    const depth = fenced ? 0 : lines[i].match(/^(#+) /)?.[1].length;
    if (depth && depth <= level) return lines.slice(start + 1, i);
  }
  return lines.slice(start + 1);
}

// Fenced blocks with their language, the nearest text line above the opening fence and the two lines below the closing one.
function blocks(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^```(\w*)$/);
    if (!open) continue;
    const close = lines.indexOf('```', i + 1);
    assert.notEqual(close, -1, `unclosed fenced block at line ${i + 1}`);
    found.push({
      lang: open[1], body: lines.slice(i + 1, close),
      label: lines.slice(0, i).reverse().find(line => line.trim() !== '') || '',
      after: lines.slice(close + 1, close + 3),
    });
    i = close;
  }
  return found;
}
const proseLines = lines => { let fenced = false; return lines.filter(line => { if (line.startsWith('```')) { fenced = !fenced; return false; } return !fenced; }); };

const quickstart = page('docs', 'QUICKSTART.md');
const workflow = page('docs', 'EVALUATE-WORKFLOW.md');
const checks = section(workflow, '## 2. Run the declaration checks');
const checkBlocks = blocks(checks);
const commands = checkBlocks.map(block => block.body[0]);
const cliPrefix = 'node bin/agent-role-contracts.mjs ';
const cliCommands = commands.filter(command => command?.startsWith(cliPrefix));
const expectation = block => block.after.find(line => line.startsWith('Expected: '));
const measure = section(workflow, '## 4. Measure whether the contract helps');

test('QUICKSTART gives the task copy as a command of its own', () => {
  const copy = 'cp examples/starter-task.json task.demo.json';
  assert.ok(blocks(quickstart.split('\n')).some(block => block.body.length === 1 && block.body[0] === copy),
    'QUICKSTART needs a fenced block whose only line is the copy command');
  assert.equal(quickstart.includes('editor or file manager'), false);
  assert.ok(commands.includes(copy), 'EVALUATE-WORKFLOW section 2 uses the same copy command');
});

test('QUICKSTART sends an unexpected DEMO_ERROR back to the demo, not to the full suite', () => {
  const row = quickstart.split('\n').find(line => line.startsWith('| `DEMO_ERROR` reports an unexpected check result |'));
  assert.ok(row, 'the unexpected-DEMO_ERROR row is missing');
  assert.ok(row.includes('`npm run demo --silent`'), row);
  assert.equal(row.includes('npm run check'), false, row);
  assert.match(pkg.scripts.demo, /^node \S+$/);
});

test('section 2 starts with the three exit codes', () => {
  const key = checks.slice(0, checks.findIndex(line => line.startsWith('```'))).filter(line => /^- `[012]`: /.test(line));
  assert.deepEqual(key.map(line => line[3]), ['0', '1', '2']);
  assert.match(key[1], /expected in step 2/);
});

test('section 2 blocks each hold one pasteable command', () => {
  for (const { lang, body } of checkBlocks) {
    assert.equal(lang, 'sh');
    assert.equal(body.length, 1, `one command per block: ${body.join(' / ')}`);
    assert.doesNotMatch(body[0], /^\s*#/, 'no comment line inside a block');
    assert.doesNotMatch(body[0], /\\\s*$/, 'no backslash continuation inside a block');
    assert.equal(body[0], body[0].trim());
  }
  // The clone, cd and cp lines and the four numbered steps each have a block of their own.
  for (const start of ['git clone ', 'cd ', 'cp ', cliPrefix + 'explain ', cliPrefix + 'validate ', 'npm run demo:binding ', cliPrefix + 'handoff ']) {
    assert.equal(commands.filter(command => command.startsWith(start)).length, 1, `one block starting with: ${start}`);
  }
  const numbered = checkBlocks.filter(block => /^\*\*Step \d/.test(block.label));
  assert.deepEqual(numbered.map(block => block.label.match(/^\*\*Step (\d)/)[1]), ['1', '2', '3', '4']);
  assert.deepEqual(numbered.map(block => block.body[0].split(' ').slice(0, 3).join(' ')),
    [cliPrefix + 'explain', cliPrefix + 'validate', 'npm run demo:binding', cliPrefix + 'handoff']);
});

test('every section 2 block states its expected result and exit code within two lines', () => {
  for (const block of checkBlocks) {
    const line = expectation(block);
    assert.ok(line, `no "Expected:" line within two lines of: ${block.body[0]}`);
    assert.match(line, /exit code [012]\b/, line);
  }
  const selfReview = checkBlocks.find(block => block.body[0].startsWith(cliPrefix + 'validate '));
  assert.ok(selfReview, 'the declared self-review step is missing');
  assert.ok(selfReview.label.includes('Expected failure'), `the self-review step must be labelled as an expected failure: ${selfReview.label}`);
  assert.match(expectation(selfReview), /exit code 1\b/);
  // The exit-code key says a rejection is "expected in step 2": that step, and no other block, expects exit code 1.
  assert.match(selfReview.label, /^\*\*Step 2\b/);
  assert.deepEqual(checkBlocks.filter(block => /exit code 1\b/.test(expectation(block))), [selfReview]);
});

test('section 2 CLI commands ask for text output and the section shows no JSON', () => {
  assert.ok(cliCommands.length >= 3, 'section 2 must run the explain, validate and handoff checks');
  for (const command of cliCommands) assert.match(command, / --format text$/, command);
  assert.equal(checkBlocks.some(block => block.lang === 'json'), false);
  for (const line of checks) assert.doesNotMatch(line, /^\s*[{}]|^\s*"[^"]+"\s*:|"valid"/, `JSON output in section 2: ${line}`);
});

test('section 2 subcommands exist in the CLI help', () => {
  const help = node([cli, '--help']);
  assert.equal(help.status, 0, help.stderr);
  const usage = outputLines(help.stdout);
  const subcommands = cliCommands.map(command => command.split(' ')[2]);
  for (const name of ['explain', 'validate', 'handoff']) assert.ok(subcommands.includes(name), `section 2 no longer runs ${name}`);
  for (const name of subcommands) assert.ok(usage.some(line => line.startsWith(`  ${cliPrefix}${name} `)), `--help does not list ${name}`);
});

test('section 2 expected lines and exit codes match a real run of each command', t => {
  // A copy of what `git clone` gives the reader, so the commands run exactly as written and nothing lands in the checkout.
  const clone = mkdtempSync(join(tmpdir(), 'arc first use '));
  t.after(() => rmSync(clone, { recursive: true, force: true }));
  for (const dir of ['bin', 'src', 'examples']) cpSync(join(root, dir), join(clone, dir), { recursive: true });
  const cloneUrl = pkg.repository.url.replace(/^git\+/, '');
  const cloneDir = cloneUrl.split('/').pop().replace(/\.git$/, '');
  const script = name => {
    assert.match(pkg.scripts[name] || '', /^node \S+$/, `npm script ${name} must be "node <file>" to run here`);
    return pkg.scripts[name].split(' ')[1];
  };
  let ran = 0;
  for (const block of checkBlocks) {
    const command = block.body[0], expected = expectation(block);
    const exitCode = Number(expected.match(/exit code ([012])/)[1]);
    const words = command.split(' ');
    const npm = command.match(/^npm (?:--prefix (\S+) )?run (\S+) --silent$/);
    let args;
    if (words[0] === 'git') { // Needs the network: checked for shape only; the copy above stands in for the clone.
      assert.deepEqual(words, ['git', 'clone', cloneUrl]);
      assert.equal(exitCode, 0);
      continue;
    } else if (words[0] === 'cd') {
      assert.deepEqual(words, ['cd', cloneDir]);
      assert.equal(exitCode, 0);
      continue;
    } else if (words[0] === 'cp') {
      assert.equal(words.length, 3, command);
      copyFileSync(join(clone, words[1]), join(clone, words[2]));
      assert.match(expected, /no output/);
      assert.equal(exitCode, 0);
      continue;
    } else if (words[0] === 'node') args = words.slice(1);
    else if (npm) {
      if (npm[1]) assert.equal(npm[1], cloneDir, command);
      args = [script(npm[2])];
    } else assert.fail(`section 2 command form is not covered by this test: ${command}`);
    const result = node(args, { cwd: clone });
    const out = outputLines(result.stdout);
    assert.equal(result.status, exitCode, `${command}\n${result.stdout}${result.stderr}`);
    assert.equal(result.stderr, '', command);
    const first = expected.match(/first line `([^`]+)`/);
    assert.ok(first, `the Expected line must quote the first output line of: ${command}`);
    assert.equal(out[0], first[1], command);
    const last = expected.match(/last line starts with `([^`]+)`/);
    if (last) assert.ok(out.at(-1).startsWith(last[1]), `${command}: last line is ${out.at(-1)}`);
    ran++;
  }
  assert.ok(ran >= 5, `only ${ran} section 2 commands were run`);

  // Step 1 also states what an out-of-scope edit of the copy returns.
  const explain = checkBlocks.find(block => block.body[0].startsWith(cliPrefix + 'explain '));
  const explainArgs = explain.body[0].split(' ').slice(1);
  const taskFile = join(clone, explainArgs[explainArgs.indexOf('--task') + 1]);
  const task = JSON.parse(readFileSync(taskFile, 'utf8'));
  task.inputs.scope = 'README.md';
  writeFileSync(taskFile, JSON.stringify(task, null, 2));
  const rejected = node(explainArgs, { cwd: clone });
  const stated = expectation(explain);
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(stated, /exit code is 1\b/);
  assert.ok(stated.includes('`' + outputLines(rejected.stdout)[0] + '`'), `step 1 must quote: ${outputLines(rejected.stdout)[0]}`);
  assert.match(lf(rejected.stdout), /^TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY /m);
  assert.ok(stated.includes('`TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY`'));
});

test('section 4 carries exactly one copyable two-task record', () => {
  const records = blocks(measure).filter(block => block.lang === 'text');
  assert.equal(records.length, 1);
  const record = records[0].body;
  assert.equal(record[0], 'ARC two-task record');
  const fields = record.filter(line => /^\d+\. /.test(line)).map(line => Number(line.split('.')[0]));
  assert.deepEqual(fields, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const line of record) assert.ok(line.length <= 60, `${line.length} characters: ${line}`);
  // Every field leaves a labelled place to write, so the block can be filled in where it is pasted.
  for (let n = 1; n <= 9; n++) {
    const from = record.findIndex(line => line.startsWith(`${n}. `));
    const to = n === 9 ? record.length : record.findIndex(line => line.startsWith(`${n + 1}. `));
    assert.ok(record.slice(from, to).some(line => /^ {3}(task [12]|reason):$/.test(line)), `field ${n} has no line to fill`);
  }
  assert.ok(record.some(line => line.includes('KEEP, REMOVE or DEFER')));
});

test('section 4 keeps unmeasured values unmeasured and claims no saving', () => {
  const text = measure.join(' ').replace(/\s+/g, ' ');
  for (const phrase of ['UNMEASURED', 'Do not rebuild minutes from logs', 'Do not subtract minutes or report time saved', 'our existing controls are enough']) {
    assert.ok(text.includes(phrase), `section 4 must contain: ${phrase}`);
  }
  for (const phrase of ['without the check', 'adopt', 'permission', 'time saved by', 'first real use']) {
    assert.equal(text.toLowerCase().includes(phrase), false, `section 4 must not contain: ${phrase}`);
  }
  const prose = proseLines(measure);
  assert.deepEqual(prose.filter(line => /^\d\. /.test(line)).map(line => line[0]), ['1', '2', '3'], 'the three-step procedure');
  assert.ok(prose.some(line => line.includes('](../experiments/external-evaluation/EVIDENCE_TEMPLATE.md)')), 'the evidence checklist link');
});

test('the kit pages and the helper name the same pinned commit and clone command', () => {
  assert.match(EXPECTED_ARC_SHA, /^[0-9a-f]{40}$/);
  // Only lines that name the pinned ARC core are compared: the kit pages also record commits of other tools
  // (for example the external report checker), which are not ARC pins.
  const arcLine = line => /\barc-v1\b|\bv1\.0\.0\b|ARC core/.test(line);
  for (const name of ['README.md', 'EVIDENCE_TEMPLATE.md']) {
    const named = page('experiments', 'external-evaluation', name).split('\n').filter(arcLine)
      .flatMap(line => line.match(/\b[0-9a-f]{40}\b/g) || []);
    assert.ok(named.length > 0, `${name} names no pinned ARC commit`);
    for (const sha of named) assert.equal(sha, EXPECTED_ARC_SHA, `${name} names ${sha} for ARC v1.0.0; evaluate.mjs pins ${EXPECTED_ARC_SHA}`);
  }
  assert.ok(PINNED_CLONE_COMMAND.includes(` --branch v${EXPECTED_VERSION} `));
  assert.ok(PINNED_CLONE_COMMAND.includes(pkg.repository.url.replace(/^git\+/, '')));
  assert.ok(page('experiments', 'external-evaluation', 'README.md').split('\n').includes(PINNED_CLONE_COMMAND),
    'the clone command the helper names must be a command line of the kit README');
});

test('README no-clone commands are single lines and match README.ja.md and SHELL-COMMANDS.md', () => {
  const readme = page('README.md');
  const noClone = [...section(readme, '### Try the published stable package (no clone)'), ...section(readme, '### If npm cannot use its cache')];
  for (const line of noClone) assert.doesNotMatch(line, /\\\s*$/, `backslash continuation: ${line}`);
  const installed = `node_modules/${pkg.name}/`;
  const checkCommands = lines => lines.filter(line => line.startsWith(`node ${installed}bin/agent-role-contracts.mjs explain `));
  const [command, ...others] = checkCommands(noClone);
  assert.ok(command, 'README.md no-clone section has no one-line check command');
  assert.deepEqual(others, []);
  assert.deepEqual(checkCommands(page('README.ja.md').split('\n')), [command]);
  // SHELL-COMMANDS.md repeats the line per shell and adds the rejection check both READMEs describe in words.
  const rejection = command.replace('starter-task.json', 'starter-task-outside-scope.json');
  assert.deepEqual([...new Set(checkCommands(page('docs', 'SHELL-COMMANDS.md').split('\n')))].sort(), [command, rejection].sort());
  const install = `npm install --ignore-scripts ${pkg.name}@${core.VERSION}`;
  for (const [name, lines] of [['README.md', noClone], ['README.ja.md', page('README.ja.md').split('\n')], ['docs/SHELL-COMMANDS.md', page('docs', 'SHELL-COMMANDS.md').split('\n')]]) {
    assert.ok(lines.includes(install), `${name} must pin ${install}`);
  }
  // Without the installed-package prefix the documented lines are commands of this source tree, so they can be run here.
  const local = line => node(line.split(' ').slice(1).map(word => word.replace(installed, '')), { cwd: root });
  const passRun = local(command), rejectRun = local(rejection);
  assert.equal(passRun.status, 0, passRun.stderr);
  assert.ok(passRun.stdout.startsWith('PASS: explain '), passRun.stdout);
  assert.equal(rejectRun.status, 1, rejectRun.stderr);
  assert.match(lf(rejectRun.stdout), /^TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY /m);
});

// --- External evaluation helper -------------------------------------------------------------------------------------

const bundleText = raw('examples', 'starter-bundle.json');
const taskText = raw('examples', 'starter-task.json');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const editTask = edit => { const task = JSON.parse(taskText); edit(task); return JSON.stringify(task); };
// Identity fields are test values: this repository's own core is under test, not the pinned v1.0.0 checkout.
const identity = { meta: { name: pkg.name, version: pkg.version }, head: 'source-under-test', evaluatedAt: '2026-01-01T00:00:00.000Z' };
const evaluate = (inputs = {}) => runEvaluation(core, { ...identity, bundleText, taskText, ...inputs });
const consistent = { valid: true, diagnostic_codes: [], execution_authorized: false, runtime_enforcement: false };
const refused = { ...consistent, valid: false, diagnostic_codes: ['TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'] };
const verdictLines = lines => lines.filter(line => /^(PASS|FAIL):/.test(line));

test('helper report keeps its keys, their order and its fixed values', () => {
  const secondTaskText = editTask(task => { task.id = 'starter-change-2'; task.inputs.scope = 'src/second.mjs'; });
  const expected = {
    profile: 'ARC_EXTERNAL_EVALUATION_V1', arc_package: pkg.name, arc_version: pkg.version,
    exact_arc_source_commit: 'source-under-test', evaluated_at_utc: '2026-01-01T00:00:00.000Z',
    evidence_class: 'LOCAL_DECLARATION_CHECK_ONLY',
    source_files: { bundle_sha256: sha256(bundleText), first_task_sha256: sha256(taskText) },
    task_id: 'starter-change-1', original_scope: 'src/example.mjs', injected_scope: 'outside-arc-evaluation/forbidden.txt',
    normal: consistent, contradictory_scope: refused, repaired: consistent,
    expected_pass_fail_pass: true, second_task: null, second_task_declaration_passed: null,
    actual_agent_execution_verified: false, actual_external_adoption_verified: false,
    existing_controls_comparison: 'OPERATOR_REPORT_REQUIRED', setup_minutes: 'OPERATOR_REPORT_REQUIRED',
    pass_grants_runtime_authority: false, verdict: 'DECLARATION_TESTS_PASSED',
  };
  const single = evaluate();
  assert.deepEqual(single.result, expected);
  assert.deepEqual(Object.keys(single.result), Object.keys(expected), 'key order is part of the printed report');
  assert.deepEqual(Object.keys(single.result.normal), Object.keys(consistent));
  assert.equal(single.exitCode, 0);

  const double = evaluate({ secondTaskText });
  const second = { task_id: 'starter-change-2', sha256: sha256(secondTaskText), declaration: consistent,
    actual_second_task_execution_verified: false, external_operator_verified: false };
  assert.deepEqual(double.result, { ...expected, second_task: second, second_task_declaration_passed: true });
  assert.deepEqual(Object.keys(double.result), Object.keys(expected));
  assert.deepEqual(Object.keys(double.result.second_task), Object.keys(second));
  // The summary detail travels beside the report, never inside it.
  assert.deepEqual(Object.keys(double), ['result', 'steps', 'exitCode']);
  assert.equal(JSON.stringify(double.result).includes('"message"'), false);
});

test('helper summary for the expected sequence is four plain lines', () => {
  const lines = formatSummary(evaluate());
  assert.deepEqual(lines, [
    `PASS: evaluation sequence ${SUFFIX}`,
    'Steps: normal PASS, injected scope FAIL (expected), repaired PASS; second task: not supplied',
    `bundle_sha256: ${sha256(bundleText)}`,
    'JSON report written to stdout; exit 0',
  ]);
  const withSecond = formatSummary(evaluate({ secondTaskText: editTask(task => { task.id = 'starter-change-2'; }) }));
  assert.equal(withSecond[1], 'Steps: normal PASS, injected scope FAIL (expected), repaired PASS; second task: declaration PASS');
  // Equal hashes across two reports mean the same bundle file was checked; nothing more is claimed.
  assert.equal(withSecond[2], lines[2]);
});

test('helper summary for an unexpected step names the step and its diagnostic code, path and message', () => {
  const outside = editTask(task => { task.inputs.scope = 'README.md'; });
  const failed = evaluate({ taskText: outside });
  const [diagnostic] = core.explainTask(bundleText, outside).errors;
  assert.equal(diagnostic.code, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY');
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.result.verdict, 'EVALUATION_FAILED');
  assert.deepEqual(formatSummary(failed), [
    `FAIL: evaluation sequence ${SUFFIX}`,
    'Step not as expected: normal: expected PASS, got FAIL',
    `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
    'JSON report written to stdout; exit 1',
  ]);

  const selfReview = evaluate({ bundleText: raw('examples', 'invalid-self-review.json') });
  const bundleErrors = core.validateBundle(raw('examples', 'invalid-self-review.json')).errors;
  assert.ok(bundleErrors.length > 1);
  assert.equal(formatSummary(selfReview)[2],
    `${bundleErrors[0].code} ${bundleErrors[0].path}: ${bundleErrors[0].message}   [+${bundleErrors.length - 1} more in the JSON report]`);

  const insideScope = evaluate({ badScope: 'src/other.mjs' });
  assert.equal(insideScope.exitCode, 1);
  assert.deepEqual(formatSummary(insideScope).slice(1, 3), [
    'Step not as expected: injected scope: expected FAIL, got PASS',
    'No diagnostic: --bad-scope src/other.mjs is inside the declared write scope; choose a path outside it',
  ]);

  // An injected scope refused for another reason than lying outside the declared scope is not the expected refusal.
  const notPortable = evaluate({ badScope: '../outside.txt' });
  const [otherReason, ...more] = core.explainTask(bundleText, editTask(task => { task.inputs.scope = '../outside.txt'; })).errors;
  assert.notEqual(otherReason.code, 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY');
  assert.deepEqual(more, [], 'this core refuses a non-portable scope with a single diagnostic');
  assert.equal(notPortable.exitCode, 1);
  assert.deepEqual(formatSummary(notPortable).slice(1, 3), [
    'Step not as expected: injected scope: expected FAIL, got FAIL with a different diagnostic',
    `${otherReason.code} ${otherReason.path}: ${otherReason.message}`,
  ]);

  const secondOutside = evaluate({ secondTaskText: editTask(task => { task.id = 'starter-change-2'; task.inputs.scope = 'README.md'; }) });
  assert.equal(secondOutside.result.expected_pass_fail_pass, true);
  assert.equal(secondOutside.result.second_task_declaration_passed, false);
  assert.equal(formatSummary(secondOutside)[1], 'Step not as expected: second task: expected PASS, got FAIL');

  for (const evaluation of [evaluate(), failed, selfReview, insideScope, notPortable, secondOutside]) {
    const lines = formatSummary(evaluation);
    assert.ok(lines.length <= 4, lines.join('\n'));
    assert.equal(verdictLines(lines).length, 1);
    for (const line of verdictLines(lines)) assert.ok(line.endsWith(SUFFIX), line);
    assert.equal(lines.at(-1), `JSON report written to stdout; exit ${evaluation.exitCode}`);
    for (const line of lines) assert.doesNotMatch(line, /[\r\n]/);
  }
});

test('helper writes the JSON report to stdout, the summary to stderr, and returns exit 0 or 1', () => {
  const failed = evaluate({ taskText: editTask(task => { task.inputs.scope = 'README.md'; }) });
  for (const [evaluation, code] of [[evaluate(), 0], [failed, 1]]) {
    const out = [], err = [];
    assert.equal(emit(evaluation, text => out.push(text), text => err.push(text)), code);
    assert.deepEqual(out, [JSON.stringify(evaluation.result, null, 2)], 'stdout carries the JSON report and nothing else');
    assert.deepEqual(err, [formatSummary(evaluation).join('\n')], 'stderr carries the plain summary');
    assert.deepEqual(JSON.parse(out[0]), evaluation.result);
    assert.ok(err[0].endsWith(`JSON report written to stdout; exit ${code}`), err[0]);
  }
});

test('helper plain lines keep operator-supplied text on one line and escape terminal controls', () => {
  const bundle = JSON.parse(bundleText);
  bundle['bad\nkey\u001b[2J'] = 'x';
  const lines = formatSummary(evaluate({ bundleText: JSON.stringify(bundle) }));
  assert.equal(lines.length, 4);
  for (const line of lines) assert.doesNotMatch(line, /[\u0000-\u001f]/);
  assert.ok(lines[2].includes('bad\\u000akey\\u001b[2J'), lines[2]);
  const unusable = Object.assign(new Error('unused'), { arcProblem: arcProblemLine('arc\u001b[2J', null) });
  assert.equal(formatErrorSummary(unusable)[1], '--arc arc\\u001b[2J is not a git checkout');
  // Bidirectional controls are escaped as well. The character is built from its code point so this file stays ASCII.
  const override = 0x202e;
  assert.equal(formatErrorSummary(new Error('left' + String.fromCharCode(override) + 'right'))[1], 'left' + '\\u' + override.toString(16) + 'right');
});

test('helper refuses a second task that is not distinct, and inputs it cannot test', () => {
  assert.throws(() => evaluate({ secondTaskText: taskText }), /Second task must have a distinct task ID and content/);
  assert.throws(() => evaluate({ secondTaskText: editTask(task => { task.inputs.scope = 'src/second.mjs'; }) }), /distinct task ID/);
  assert.throws(() => evaluate({ badScope: 'src/example.mjs' }), /Bad scope must differ from original scope/);
  assert.throws(() => evaluate({ taskText: editTask(task => { delete task.inputs.scope; }) }), /requires task\.inputs\.scope to be a string/);
});

test('helper error summary names the documented clone command when --arc is not the pinned clean checkout', () => {
  const other = 'a'.repeat(40);
  assert.equal(arcProblemLine('arc-v1', null), '--arc arc-v1 is not a git checkout');
  assert.equal(arcProblemLine('arc-v1', other), `--arc arc-v1 is at ${other}, not v1.0.0 ${EXPECTED_ARC_SHA}`);
  assert.equal(arcProblemLine('arc-v1', EXPECTED_ARC_SHA, true), '--arc arc-v1 has tracked modifications');
  assert.equal(arcProblemLine('arc-v1', EXPECTED_ARC_SHA, false), null);
  const unusable = Object.assign(new Error('kept for the JSON error object'), { arcProblem: arcProblemLine('arc-v1', other) });
  assert.deepEqual(formatErrorSummary(unusable), [
    'ERROR: evaluation not run; exit 2',
    `--arc arc-v1 is at ${other}, not v1.0.0 ${EXPECTED_ARC_SHA}`,
    `Create a clean pinned clone: ${PINNED_CLONE_COMMAND}`,
  ]);
  assert.deepEqual(formatErrorSummary(new Error('Missing --task\nUsage: node evaluate.mjs ...')), [
    'ERROR: evaluation not run; exit 2',
    'Missing --task',
    'Run: node evaluate.mjs --help',
  ]);
});

test('helper run on a directory that is not a git checkout exits 2 with plain lines and no raw git output', t => {
  const dir = mkdtempSync(join(tmpdir(), 'arc-not-a-checkout-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // The ceiling keeps git from adopting a repository that happens to contain the temporary directory.
  const result = node([helper, '--arc', dir, '--bundle', join(root, 'examples', 'starter-bundle.json'), '--task', join(root, 'examples', 'starter-task.json')],
    { env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) } });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  const stderr = lf(result.stderr);
  assert.deepEqual(stderr.split('\n').slice(0, 3), [
    'ERROR: evaluation not run; exit 2',
    `--arc ${dir} is not a git checkout`,
    `Create a clean pinned clone: ${PINNED_CLONE_COMMAND}`,
  ]);
  assert.ok(stderr.includes('git clone --depth 1 --branch v1.0.0'));
  assert.equal(stderr.includes('fatal:'), false, stderr);
  // The JSON error object still follows the plain lines on stderr, with the keys it had before.
  const error = JSON.parse(stderr.slice(stderr.indexOf('\n{\n') + 1));
  assert.deepEqual(Object.keys(error), ['verdict', 'error', 'actual_agent_execution_verified', 'actual_external_adoption_verified']);
  assert.equal(error.verdict, 'EVALUATION_ERROR');
  assert.match(error.error, /^ARC source is not a readable git checkout \(git rev-parse exit \d+\); use a clean pinned v1\.0\.0 clone$/);
  assert.equal(error.actual_agent_execution_verified, false);
  assert.equal(error.actual_external_adoption_verified, false);
});

test('helper runs only when invoked as a script', t => {
  for (const args of [['--help'], []]) {
    const help = node([helper, ...args]);
    assert.equal(help.status, 0, help.stderr);
    assert.ok(help.stdout.startsWith('Usage: node evaluate.mjs --arc '), help.stdout);
    assert.equal(help.stderr, '');
  }
  const missing = node([helper, '--arc', root, '--bundle', join(root, 'examples', 'starter-bundle.json')]);
  assert.equal(missing.status, 2);
  assert.deepEqual(lf(missing.stderr).split('\n').slice(0, 3), ['ERROR: evaluation not run; exit 2', 'Missing --task', 'Run: node evaluate.mjs --help']);
  // Importing it, as this file does, must print nothing and start no evaluation. The importer is a script of its own,
  // run by path with --help after it, so process.argv[1] is set and names another file: the guard has to compare paths.
  // Were the guard to accept any script, main() would print the usage text to stdout here.
  const dir = mkdtempSync(join(tmpdir(), 'arc-helper-import-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const importer = join(dir, 'import-helper.mjs');
  writeFileSync(importer, `const names = Object.keys(await import(${JSON.stringify(pathToFileURL(helper).href)}));\nconsole.log('EXPORTS ' + names.sort().join(' '));\n`);
  const imported = node([importer, '--help']);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stderr, '');
  assert.match(lf(imported.stdout), /^EXPORTS [\w ]*\bformatSummary\b[\w ]*\n$/);
});
