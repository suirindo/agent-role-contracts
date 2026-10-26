import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluate, renderSummary, exitCodeFor } from '../experiments/review-evidence/review-evidence.mjs';

const CLI = fileURLToPath(new URL('../experiments/review-evidence/cli.mjs', import.meta.url));
const read = name => fs.readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8');
const BUNDLE = read('starter-bundle.json');
const TASK = JSON.stringify({ ...JSON.parse(read('starter-task.json')), id: 'rev-evidence-1', inputs: { scope: 'src/example.mjs' } });
const GIT_ENV = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function tmp(t) {
 const dir = fs.mkdtempSync(join(tmpdir(), 'arc-review-evidence-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 return dir;
}
const git = (repo, args, input) => execFileSync('git', ['-C', repo, ...args], { env: GIT_ENV, input, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
function newRepo(t) {
 const repo = join(tmp(t), 'repo');
 execFileSync('git', ['init', '-q', '--template=', repo], { env: GIT_ENV });
 return repo;
}
// Commit built purely from objects (no worktree files, no hooks, no filters).
function buildTree(repo, entries) {
 const direct = [];
 const dirs = new Map();
 for (const [mode, type, oid, path] of entries) {
  const buf = Buffer.isBuffer(path) ? path : Buffer.from(path);
  const slash = buf.indexOf(0x2f);
  if (slash < 0) direct.push([mode, type, oid, buf]);
  else {
   const head = buf.subarray(0, slash).toString('latin1');
   if (!dirs.has(head)) dirs.set(head, []);
   dirs.get(head).push([mode, type, oid, buf.subarray(slash + 1)]);
  }
 }
 for (const [name, sub] of dirs) direct.push(['040000', 'tree', buildTree(repo, sub), Buffer.from(name, 'latin1')]);
 const lines = direct.map(([mode, type, oid, name]) => Buffer.concat([Buffer.from(`${mode} ${type} ${oid}\t`), name, Buffer.from([0])]));
 return git(repo, ['mktree', '-z', '--missing'], Buffer.concat(lines));
}
function commitEntries(repo, entries, parent, message = 'c') {
 const tree = buildTree(repo, entries);
 return git(repo, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
}
const blob = (repo, content) => git(repo, ['hash-object', '-w', '--stdin'], Buffer.isBuffer(content) ? content : Buffer.from(content));
const files = (repo, map) => Object.entries(map).map(([path, content]) => ['100644', 'blob', blob(repo, content), path]);

const EXAMPLE_BASE = 'export const A = 1;\nexport const KEEP = 2;\nexport const Z = 3;\n';
const EXAMPLE_CAND = 'export const A = 10;\nexport const KEEP = 2;\nexport const Z = 3;\n';
const KEEP_SHA = sha256('export const KEEP = 2;\n');

// Base commit + one-file candidate. `change` returns the candidate entries.
function scenario(t, { change, checkout = true } = {}) {
 const repo = newRepo(t);
 const common = { 'README.md': '# fixture\n', 'src/keep.mjs': 'export const K = 1;\n' };
 const baseEntries = files(repo, { ...common, 'src/example.mjs': EXAMPLE_BASE });
 const base = commitEntries(repo, baseEntries, null, 'base');
 const candEntries = change ? change(repo, baseEntries) : files(repo, { ...common, 'src/example.mjs': EXAMPLE_CAND });
 const candidate = commitEntries(repo, candEntries, base, 'candidate');
 git(repo, ['update-ref', 'refs/heads/main', candidate]);
 git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
 if (checkout) git(repo, ['reset', '-q', '--hard']);
 return { repo, base, candidate };
}
function envelopeFor(s, over = {}) {
 return {
  schema_version: 'review-evidence-envelope/0.1', task_id: 'rev-evidence-1', baseline_commit: s.base, candidate_commit: s.candidate,
  allowed_paths: ['src/example.mjs'],
  protected: [{ id: 'keep-line', type: 'block', path: 'src/example.mjs', start_line: 2, end_line: 2, sha256: KEEP_SHA }],
  required_tests: ['unit:a', 'unit:b'], ...over,
 };
}
function receiptFor(s, over = {}) {
 return {
  schema_version: 'review-evidence-test-receipt/0.1', subject: { baseline_commit: s.base, candidate_commit: s.candidate },
  provenance: { producer: 'synthetic-ci', kind: 'ci' },
  tests: [{ id: 'unit:a', status: 'passed' }, { id: 'unit:b', status: 'passed' }], ...over,
 };
}
const json = value => JSON.stringify(value);
async function run(s, { envelope = {}, receipt, binding = true, task = TASK, bundle = BUNDLE } = {}) {
 const input = { repo: s.repo, envelope: json(envelopeFor(s, envelope)), bundle, task };
 if (receipt !== null) input.receipt = typeof receipt === 'string' ? receipt : json(receipt ?? receiptFor(s));
 if (binding === true) {
  const first = await evaluate(input);
  const digest = first.g1.subject_digest;
  input.binding = json({ schema_version: '0.3', subject_digest: digest, reviews: [{ subject_digest: digest, role_id: 'reviewer', decision: 'pass' }], human_approval: { subject_digest: digest, role_id: 'implementer', decision: 'approved' } });
 } else if (binding) input.binding = binding;
 return evaluate(input);
}
const codes = (report, dimension) => report.findings.filter(f => !dimension || f.dimension === dimension).map(f => f.code);
const statuses = report => Object.fromEntries(Object.entries(report.dimensions).map(([k, v]) => [k, v.status]));
async function rejects(promise, code) {
 await assert.rejects(promise, error => { assert.equal(error.code, code); assert.ok(!error.message.includes(tmpdir()), 'error must not leak local paths'); return true; });
}

test('legitimate minimal change: consistent evidence, yet no single PASS and no authority', async t => {
 const s = scenario(t);
 const report = await run(s);
 assert.deepEqual(statuses(report), { declarations_consistency: 'CONSISTENT', artifact_binding: 'CONSISTENT', test_evidence: 'CONSISTENT', semantic_acceptance: 'UNKNOWN', authority: 'UNKNOWN', execution: 'NOT_PERFORMED' });
 assert.deepEqual(report.findings.filter(f => f.severity === 'inconsistent'), []);
 assert.equal(report.verdict, 'NO_SINGLE_VERDICT');
 assert.equal(exitCodeFor(report), 0);
 assert.equal(report.inventory.complete, true);
 assert.deepEqual(report.inventory.entries.map(e => [e.path, e.status]), [['src/example.mjs', 'modified']]);
 const entry = report.inventory.entries[0];
 assert.equal(entry.candidate.sha256, sha256(EXAMPLE_CAND));
 assert.equal(entry.base.sha256, sha256(EXAMPLE_BASE));
 assert.equal(entry.candidate.git_object_verified, true);
 assert.equal(report.protected[0].status, 'PRESERVED_IN_PLACE');
 assert.equal(report.protected[0].semantic_dependence, 'UNKNOWN');
 for (const flag of ['execution_authorized', 'permissions_granted', 'tests_executed_by_checker', 'candidate_code_executed', 'network_used', 'reviewer_authenticated', 'receipt_authenticated', 'semantic_acceptance_evaluated']) assert.equal(report.limitations[flag], false, flag);
 // Distinct provenance and authority for observed Git bytes vs supplied CI metadata.
 assert.deepEqual([report.subject.provenance.origin, report.subject.provenance.authority], ['collector_observed_git', 'OBSERVED_BY_COLLECTOR']);
 assert.deepEqual([report.test_receipt.provenance.origin, report.test_receipt.provenance.authority], ['supplied_ci_metadata', 'UNAUTHENTICATED_SUPPLIED']);
 const text = json(report);
 for (const secret of ['export const', 'KEEP = 2', tmpdir()]) assert.ok(!text.includes(secret), 'no file content or local path: ' + secret);
 assert.equal(json(await run(s)), json(report), 'deterministic output');
 assert.ok(!/\bPASS(ED)?\b/.test(renderSummary(report)), 'summary must not print a PASS');
 assert.match(renderSummary(report), /NOT an approval/);
});

test('out-of-scope added, deleted and renamed paths are all inventoried and flagged', async t => {
 const s = scenario(t, { change: (repo, base) => [
  ...base.filter(([, , , path]) => path !== 'README.md' && path !== 'src/keep.mjs' && path !== 'src/example.mjs'),
  ['100644', 'blob', blob(repo, EXAMPLE_CAND), 'src/example.mjs'],
  ['100644', 'blob', blob(repo, '# fixture\n'), 'docs/README.md'], // exact-content rename of README.md
  ['100755', 'blob', blob(repo, '#!/bin/sh\n'), 'tools/added.sh'],
 ] });
 const report = await run(s);
 const byPath = Object.fromEntries(report.inventory.entries.map(e => [e.path, e]));
 assert.deepEqual(Object.keys(byPath).sort(), ['README.md', 'docs/README.md', 'src/example.mjs', 'src/keep.mjs', 'tools/added.sh']);
 assert.equal(byPath['tools/added.sh'].status, 'added');
 assert.equal(byPath['tools/added.sh'].candidate.mode, '100755');
 assert.equal(byPath['src/keep.mjs'].status, 'deleted');
 assert.equal(byPath['README.md'].rename_candidate_to, 'docs/README.md');
 assert.equal(byPath['docs/README.md'].rename_candidate_from, 'README.md');
 assert.deepEqual(report.findings.filter(f => f.code === 'PATH_OUT_OF_SCOPE').map(f => f.path), ['README.md', 'docs/README.md', 'src/keep.mjs', 'tools/added.sh']);
 assert.equal(report.dimensions.artifact_binding.status, 'INCONSISTENT');
 assert.equal(exitCodeFor(report), 1);
});

test('mode-only change is inventoried', async t => {
 const s = scenario(t, { change: (repo, base) => base.map(e => e[3] === 'src/example.mjs' ? ['100755', 'blob', e[2], e[3]] : e) });
 const report = await run(s, { envelope: { protected: [] } });
 assert.deepEqual(report.inventory.entries.map(e => [e.path, e.status, e.base.mode, e.candidate.mode]), [['src/example.mjs', 'mode_changed', '100644', '100755']]);
});

test('protected changes: path, and unexpected same-file block change that a plain path check accepts', async t => {
 const sameFile = scenario(t, { change: repo => files(repo, { 'README.md': '# fixture\n', 'src/keep.mjs': 'export const K = 1;\n', 'src/example.mjs': 'export const A = 10;\nexport const KEEP = 99;\nexport const Z = 3;\n' }) });
 const report = await run(sameFile);
 assert.deepEqual(codes(report, 'artifact_binding'), ['PROTECTED_BLOCK_CHANGED']);
 assert.equal(report.protected[0].status, 'CHANGED_OR_REMOVED');
 // Plain path/hash/test-set check, as a baseline: it accepts the same candidate.
 const plain = (r, allowed) => r.inventory.entries.every(e => allowed.includes(e.path)) && r.test_receipt.counts_declared === undefined;
 assert.equal(plain(report, ['src/example.mjs']), true, 'a path check alone cannot see the protected line');
 // Overlap is overlap: for an out-of-scope path the plain check and this report agree.
 const outside = scenario(t, { change: repo => files(repo, { 'README.md': 'changed\n', 'src/keep.mjs': 'export const K = 1;\n', 'src/example.mjs': EXAMPLE_BASE }) });
 const r2 = await run(outside, { envelope: { protected: [] } });
 assert.equal(plain(r2, ['src/example.mjs']), false);
 assert.deepEqual(codes(r2, 'artifact_binding'), ['PATH_OUT_OF_SCOPE']);

 const pathProtected = scenario(t);
 const r3 = await run(pathProtected, { envelope: { protected: [{ id: 'no-touch', type: 'path', path: 'src/example.mjs' }] } });
 assert.ok(codes(r3, 'declarations_consistency').includes('PROTECTED_PATH_INSIDE_ALLOWED'));
 assert.ok(codes(r3, 'artifact_binding').includes('PROTECTED_PATH_CHANGED'));
 // Baseline hash of the protected block must match what the collector reads.
 const r4 = await run(pathProtected, { envelope: { protected: [{ id: 'k', type: 'block', path: 'src/example.mjs', start_line: 1, end_line: 1, sha256: KEEP_SHA }] } });
 assert.ok(codes(r4, 'artifact_binding').includes('PROTECTED_BLOCK_BASELINE_MISMATCH'));
 // Moved block is not silently accepted.
 const moved = scenario(t, { change: repo => files(repo, { 'README.md': '# fixture\n', 'src/keep.mjs': 'export const K = 1;\n', 'src/example.mjs': 'export const A = 1;\nexport const Z = 3;\nexport const KEEP = 2;\n' }) });
 assert.ok(codes(await run(moved), 'artifact_binding').includes('PROTECTED_BLOCK_MOVED'));
});

test('whole-file and inside-window semantic blind spots stay UNKNOWN', async t => {
 const s = scenario(t, { change: repo => files(repo, { 'README.md': '# fixture\n', 'src/keep.mjs': 'export const K = 1;\n', 'src/example.mjs': 'export const A = -999;\nexport const KEEP = 2;\nexport const Z = 3;\n' }) });
 const report = await run(s);
 assert.equal(report.dimensions.artifact_binding.status, 'CONSISTENT');
 assert.equal(report.dimensions.semantic_acceptance.status, 'UNKNOWN');
 assert.deepEqual(report.dimensions.semantic_acceptance.per_path, [{ path: 'src/example.mjs', observed: 'CHANGE_INSIDE_ALLOWED_PATH', behavior: 'UNKNOWN', granularity: 'whole_file' }]);
 assert.equal(report.dimensions.semantic_acceptance.objective_evaluated, false);
 assert.equal(report.protected[0].semantic_dependence, 'UNKNOWN');
});

test('stale baseline, candidate and test bindings are reported', async t => {
 const s = scenario(t);
 const later = commitEntries(s.repo, files(s.repo, { 'README.md': '# fixture\n', 'src/keep.mjs': 'export const K = 1;\n', 'src/example.mjs': EXAMPLE_CAND + '// later\n' }), s.candidate, 'later');
 // Declarations and receipt were produced for s.candidate; the envelope now pins a newer commit.
 const stale = { ...s, candidate: later };
 const good = await run(s); // reviewer binding for s.candidate
 const binding = json({ schema_version: '0.3', subject_digest: good.g1.subject_digest, reviews: [{ subject_digest: good.g1.subject_digest, role_id: 'reviewer', decision: 'pass' }], human_approval: { subject_digest: good.g1.subject_digest, role_id: 'implementer', decision: 'approved' } });
 const report = await run(stale, { binding, receipt: receiptFor(s) });
 assert.ok(codes(report, 'declarations_consistency').includes('G1_SUBJECT_MISMATCH'));
 assert.ok(codes(report, 'test_evidence').includes('TEST_SUBJECT_STALE'));
 assert.equal(report.dimensions.declarations_consistency.status, 'INCONSISTENT');
 assert.equal(report.dimensions.test_evidence.status, 'INCONSISTENT');
 // Baseline that is not an ancestor of the candidate.
 const side = commitEntries(s.repo, files(s.repo, { 'other.txt': 'x' }), null, 'unrelated');
 const r2 = await run({ ...s, base: side }, { envelope: { protected: [] } });
 assert.ok(codes(r2, 'artifact_binding').includes('BASELINE_NOT_ANCESTOR'));
 // Receipt for another baseline / tree.
 const r3 = await run(s, { receipt: receiptFor(s, { subject: { baseline_commit: side, candidate_commit: s.candidate, candidate_tree: '0'.repeat(40) } }) });
 assert.deepEqual(codes(r3, 'test_evidence'), ['TEST_BASELINE_STALE', 'TEST_TREE_STALE']);
 // Receipt that names no subject cannot be bound.
 const r4 = await run(s, { receipt: receiptFor(s, { subject: {} }) });
 assert.deepEqual(codes(r4, 'test_evidence'), ['TEST_SUBJECT_MISSING']);
});

test('equal-count substituted test IDs are caught where counts alone pass', async t => {
 const s = scenario(t);
 const receipt = receiptFor(s, { tests: [{ id: 'unit:a', status: 'passed' }, { id: 'unit:x', status: 'passed' }], summary: { passed: 2, failed: 0, skipped: 0 } });
 const report = await run(s, { receipt });
 const counts = receipt.summary.passed === envelopeFor(s).required_tests.length;
 assert.equal(counts, true, 'a count-only check would accept this receipt');
 assert.deepEqual(codes(report, 'test_evidence').sort(), ['TEST_ID_SUBSTITUTION', 'TEST_MISSING', 'TEST_UNREQUESTED_ID']);
 assert.equal(report.dimensions.test_evidence.status, 'INCONSISTENT');
 const dup = await run(s, { receipt: receiptFor(s, { tests: [{ id: 'unit:a', status: 'passed' }, { id: 'unit:a', status: 'passed' }, { id: 'unit:b', status: 'passed' }] }) });
 assert.deepEqual(codes(dup, 'test_evidence'), ['TEST_DUPLICATE_ID']);
 const lying = await run(s, { receipt: receiptFor(s, { summary: { passed: 5, failed: 0, skipped: 0 } }) });
 assert.deepEqual(codes(lying, 'test_evidence'), ['TEST_SUMMARY_COUNT_MISMATCH']);
});

test('missing, skipped and failed receipts are not evidence', async t => {
 const s = scenario(t);
 const none = await run(s, { receipt: null });
 assert.equal(none.dimensions.test_evidence.status, 'UNKNOWN');
 assert.deepEqual(codes(none, 'test_evidence'), ['TEST_RECEIPT_NOT_SUPPLIED']);
 const skipped = await run(s, { receipt: receiptFor(s, { tests: [{ id: 'unit:a', status: 'passed' }, { id: 'unit:b', status: 'skipped' }] }) });
 assert.deepEqual(codes(skipped, 'test_evidence'), ['TEST_SKIPPED']);
 const failed = await run(s, { receipt: receiptFor(s, { tests: [{ id: 'unit:a', status: 'failed' }] }) });
 assert.deepEqual(codes(failed, 'test_evidence').sort(), ['TEST_FAILED', 'TEST_MISSING']);
 await rejects(run(s, { receipt: '{"schema_version":' }), 'RECEIPT_INVALID');
 await rejects(run(s, { receipt: '{"tests":[],"tests":[]}' }), 'RECEIPT_INVALID');
});

test('agent-written trust flags, PASS text and invented signatures are ignored and never upgrade evidence', async t => {
 const s = scenario(t);
 const forged = { trusted: true, verified: true, verdict: 'PASS', signature: 'deadbeef', nested: { authenticated: true } };
 const missing = await run(s, { receipt: receiptFor(s, { ...forged, tests: [{ id: 'unit:a', status: 'passed' }] }) });
 assert.equal(missing.dimensions.test_evidence.status, 'INCONSISTENT');
 assert.ok(codes(missing, 'test_evidence').includes('TEST_MISSING'));
 const complete = await run(s, { receipt: receiptFor(s, forged) });
 assert.notEqual(complete.dimensions.test_evidence.status, 'CONSISTENT');
 assert.deepEqual(complete.findings.filter(f => f.code === 'FORGED_TRUST_FIELD_IGNORED').map(f => f.path), ['nested/authenticated', 'signature', 'trusted', 'verdict', 'verified']);
 assert.ok(codes(complete, 'authority').includes('RECEIPT_AUTHENTICITY_UNSUPPORTED'));
 assert.equal(complete.limitations.receipt_authenticated, false);
 assert.equal(complete.dimensions.authority.status, 'UNKNOWN');
 assert.equal(complete.dimensions.authority.permissions_granted, false);
 // A G1 review/approval declaration is declared consistency only, never reviewer authenticity.
 assert.equal(complete.limitations.reviewer_authenticated, false);
});

test('dirty or untracked worktree makes artifact binding UNKNOWN without reading worktree bytes', async t => {
 const clean = scenario(t);
 git(clean.repo, ['reset', '-q', '--hard']);
 const cleanReport = await run(clean);
 assert.equal(cleanReport.worktree.state, 'CLEAN');
 assert.equal(cleanReport.dimensions.artifact_binding.status, 'CONSISTENT');

 fs.writeFileSync(join(clean.repo, 'untracked.txt'), 'x');
 const untracked = await run(clean);
 assert.deepEqual(codes(untracked, 'artifact_binding'), ['WORKTREE_UNTRACKED']);
 assert.equal(untracked.dimensions.artifact_binding.status, 'UNKNOWN');

 fs.writeFileSync(join(clean.repo, 'src/example.mjs'), 'export const A = "dirty";\n');
 const dirty = await run(clean);
 assert.deepEqual(codes(dirty, 'artifact_binding').sort(), ['WORKTREE_DIRTY', 'WORKTREE_UNTRACKED']);
 assert.equal(dirty.inventory.entries[0].candidate.sha256, sha256(EXAMPLE_CAND), 'measured from the committed object, not the worktree');
});

test('repository config, hooks, filters, replace refs and caller git env cannot execute code or substitute bytes', async t => {
 const s = scenario(t);
 git(s.repo, ['reset', '-q', '--hard']);
 const marker = join(tmp(t), 'executed');
 const script = join(tmp(t), 'run.sh');
 fs.writeFileSync(script, `#!/bin/sh\necho x >> "${marker}"\ncat\n`, { mode: 0o755 });
 git(s.repo, ['config', 'core.fsmonitor', script]);
 git(s.repo, ['config', 'filter.x.clean', script]);
 git(s.repo, ['config', 'filter.x.smudge', script]);
 git(s.repo, ['config', 'diff.external', script]);
 git(s.repo, ['config', 'core.pager', script]);
 fs.writeFileSync(join(s.repo, '.gitattributes'), '* filter=x\n');
 // Substitute the candidate blob with a replace ref.
 const real = git(s.repo, ['rev-parse', `${s.candidate}:src/example.mjs`]);
 git(s.repo, ['replace', real, blob(s.repo, 'export const A = "replaced";\n')]);
for (const hook of ['post-checkout', 'reference-transaction', 'pre-commit']) {
  fs.mkdirSync(join(s.repo, '.git/hooks'), { recursive: true });
  fs.writeFileSync(join(s.repo, '.git/hooks', hook), `#!/bin/sh\necho x >> "${marker}"\n`, { mode: 0o755 });
 }
  const saved = { ...process.env };
 process.env.GIT_EXTERNAL_DIFF = script; process.env.GIT_DIR = '/nonexistent'; process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = '/nonexistent';
 t.after(() => { for (const k of ['GIT_EXTERNAL_DIFF', 'GIT_DIR', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) if (!(k in saved)) delete process.env[k]; });
 const report = await run(s);
 assert.ok(!fs.existsSync(marker), 'no configured command or hook may run');
 assert.equal(report.worktree.state, 'UNKNOWN');
 assert.deepEqual(codes(report, 'artifact_binding'), ['WORKTREE_CONFIG_UNSAFE']);
 assert.equal(report.inventory.entries[0].candidate.sha256, sha256(EXAMPLE_CAND), 'replace refs must not substitute bytes');
});

test('collecting does not modify the repository', async t => {
 const s = scenario(t);
 git(s.repo, ['reset', '-q', '--hard']);
 const snap = () => json([...fs.readdirSync(s.repo, { recursive: true }).sort().map(p => { const st = fs.lstatSync(join(s.repo, p)); return [p, st.isFile() ? sha256(fs.readFileSync(join(s.repo, p))) : 'd']; })]);
 const before = snap();
 await run(s);
 assert.equal(snap(), before);
});

test('unsupported surfaces stay UNKNOWN: symlink, submodule, binary, odd mode, non-UTF8 path, oversize', async t => {
 const s = scenario(t, { checkout: false, change: (repo, base) => [
  ...base.filter(e => e[3] !== 'src/example.mjs'),
  ['100644', 'blob', blob(repo, EXAMPLE_CAND), 'src/example.mjs'],
  ['120000', 'blob', blob(repo, 'example.mjs'), 'src/link'],
  ['160000', 'commit', 'a'.repeat(40), 'src/sub'],
  ['100644', 'blob', blob(repo, Buffer.from([0, 1, 2, 3])), 'src/bin.dat'],
  ['100644', 'blob', blob(repo, 'x'), Buffer.from([0x73, 0x72, 0x63, 0x2f, 0xff, 0x2e, 0x6d, 0x6a, 0x73])],
  ['100644', 'blob', blob(repo, Buffer.alloc(1024 * 1024 + 1, 97)), 'src/huge.txt'],
 ] });
 const report = await run(s, { envelope: { allowed_paths: ['src/**'], protected: [] }, task: JSON.stringify({ ...JSON.parse(TASK), inputs: { scope: 'src/**' } }) });
 const c = codes(report, 'artifact_binding');
 for (const code of ['SURFACE_SYMLINK', 'SURFACE_SUBMODULE', 'SURFACE_BINARY_FILE', 'SURFACE_NON_UTF8_PATH', 'SURFACE_FILE_TOO_LARGE']) assert.ok(c.includes(code), code);
 assert.equal(report.dimensions.artifact_binding.status, 'UNKNOWN');
 assert.equal(report.inventory.complete, true);
 const nonUtf8 = report.inventory.entries.find(e => e.path_utf8 === false);
 assert.equal(nonUtf8.path_hex, '7372632fff2e6d6a73');
 assert.equal(nonUtf8.path, undefined);
 assert.ok(!c.includes('PATH_OUT_OF_SCOPE'));
 // Out-of-scope still dominates UNKNOWN.
 const mixed = await run(s, { envelope: { allowed_paths: ['src/example.mjs'], protected: [] } });
 assert.equal(mixed.dimensions.artifact_binding.status, 'INCONSISTENT');
});

test('input and tool failures are fail-closed, bounded and path-free', async t => {
 const s = scenario(t);
 const input = over => ({ repo: s.repo, envelope: json(envelopeFor(s)), bundle: BUNDLE, task: TASK, ...over });
 await rejects(evaluate(input({ envelope: json(envelopeFor(s, { candidate_commit: 'main' })) })), 'ENVELOPE_INVALID');
 await rejects(evaluate(input({ envelope: json(envelopeFor(s, { extra: 1 })) })), 'ENVELOPE_INVALID');
 await rejects(evaluate(input({ envelope: json(envelopeFor(s, { allowed_paths: [] })) })), 'ENVELOPE_INVALID');
 await rejects(evaluate(input({ envelope: json(envelopeFor(s, { candidate_commit: 'b'.repeat(40) })) })), 'PIN_NOT_FOUND');
 const tree = git(s.repo, ['rev-parse', `${s.candidate}^{tree}`]);
 await rejects(evaluate(input({ envelope: json(envelopeFor(s, { candidate_commit: tree })) })), 'PIN_NOT_COMMIT');
 await rejects(evaluate(input({ repo: join(tmp(t), 'missing') })), 'REPO_UNREADABLE');
 await rejects(evaluate(input({ repo: tmp(t) })), 'REPO_UNREADABLE');
 await rejects(evaluate(input({ envelope: '{"a":1,"a":2}' })), 'ENVELOPE_INVALID');
 await rejects(evaluate(input({ envelope: 'x'.repeat(1024 * 1024 + 1) })), 'INPUT_TOO_LARGE');
 // Invalid ARC declarations are findings, not crashes.
 const bad = await evaluate(input({ task: JSON.stringify({ ...JSON.parse(TASK), inputs: { scope: 'secrets/production.txt' } }) }));
 assert.ok(codes(bad, 'declarations_consistency').includes('TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY'));
 const wide = await evaluate(input({ envelope: json(envelopeFor(s, { allowed_paths: ['src/**'] })) }));
 assert.ok(codes(wide, 'declarations_consistency').includes('ALLOWED_PATH_WIDER_THAN_TASK_SCOPE'));
 const outsideAuthority = await evaluate(input({ envelope: json(envelopeFor(s, { allowed_paths: ['src/example.mjs', 'secrets/x.txt'] })) }));
 assert.ok(codes(outsideAuthority, 'declarations_consistency').includes('ALLOWED_PATH_OUTSIDE_ROLE_AUTHORITY'));
 const other = await evaluate(input({ envelope: json(envelopeFor(s, { task_id: 'another-task' })) }));
 assert.ok(codes(other, 'declarations_consistency').includes('ENVELOPE_TASK_MISMATCH'));
 const noBinding = await evaluate(input());
 assert.deepEqual(codes(noBinding, 'declarations_consistency'), ['REVIEW_DECLARATION_NOT_SUPPLIED']);
 assert.equal(noBinding.dimensions.declarations_consistency.status, 'UNKNOWN');
});

test('changed-path inventory limit fails closed instead of truncating', async t => {
 const s = scenario(t, { change: (repo, base) => [...base, ...Array.from({ length: 501 }, (_, i) => ['100644', 'blob', blob(repo, 'f' + i), `gen/f${i}.txt`])] });
 await rejects(run(s, { binding: false }), 'CHANGED_PATH_LIMIT');
});

function cli(args, cwd) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd, env: { ...GIT_ENV } }); }
test('CLI: JSON, summary, exit codes and sanitized errors', async t => {
 const s = scenario(t);
 const dir = tmp(t);
 const write = (name, text) => { const p = join(dir, name); fs.writeFileSync(p, text); return p; };
 const envPath = write('envelope.json', json(envelopeFor(s)));
 const base = ['--repo', s.repo, '--envelope', envPath, '--bundle', write('bundle.json', BUNDLE), '--task', write('task.json', TASK), '--receipt', write('receipt.json', json(receiptFor(s)))];
 const first = cli(base);
 assert.equal(first.status, 0, first.stderr);
 const report = JSON.parse(first.stdout);
 assert.equal(report.verdict, 'NO_SINGLE_VERDICT');
 assert.equal(report.dimensions.declarations_consistency.status, 'UNKNOWN'); // no binding supplied
 const digest = report.g1.subject_digest;
 const binding = write('binding.json', json({ schema_version: '0.3', subject_digest: digest, reviews: [{ subject_digest: digest, role_id: 'reviewer', decision: 'pass' }], human_approval: { subject_digest: digest, role_id: 'implementer', decision: 'approved' } }));
 const summary = cli([...base, '--binding', binding, '--format', 'summary']);
 assert.equal(summary.status, 0, summary.stderr);
 assert.match(summary.stdout, /declarations_consistency: CONSISTENT/);
 assert.match(summary.stdout, /semantic_acceptance: UNKNOWN/);
 assert.match(summary.stdout, /NOT an approval/);
 assert.ok(summary.stdout.length < 4000);
 const failing = write('envelope-bad.json', json(envelopeFor(s, { allowed_paths: ['src/keep.mjs'] })));
 const bad = cli(base.map(v => v === envPath ? failing : v));
 assert.equal(bad.status, 1);
 const usage = cli(['--repo']);
 assert.equal(usage.status, 2);
 const err = cli(base.map(v => v === s.repo ? join(dir, 'nope') : v));
 assert.equal(err.status, 2);
 assert.match(err.stderr, /^REVIEW_EVIDENCE_ERROR: REPO_UNREADABLE\n$/);
 assert.equal(err.stdout, '');
 const big = cli(base.map(v => v === envPath ? write('big.json', 'x'.repeat(1024 * 1024 + 1)) : v));
 assert.match(big.stderr, /INPUT_TOO_LARGE/);
 fs.symlinkSync(envPath, join(dir, 'link.json'));
 assert.match(cli(base.map(v => v === envPath ? join(dir, 'link.json') : v)).stderr, /INPUT_NOT_REGULAR_FILE/);
 assert.equal(cli(['--help']).status, 0);
 assert.equal(cli([...base, '--repo', s.repo]).status, 2, 'duplicate option');
});

test('required test sets with embedded newlines cannot reuse an old G1 binding', async t => {
 const s = scenario(t);
 const a = ['unit:a\nunit:b', 'unit:c'];
 const b = ['unit:a', 'unit:b\nunit:c'];
 const makeReceipt = ids => receiptFor(s, { tests: ids.map(id => ({ id, status: 'passed' })) });
 const first = await run(s, { envelope: { required_tests: a }, receipt: makeReceipt(a) });
 const digest = first.g1.subject_digest;
 const binding = json({ schema_version: '0.3', subject_digest: digest, reviews: [{ subject_digest: digest, role_id: 'reviewer', decision: 'pass' }], human_approval: { subject_digest: digest, role_id: 'implementer', decision: 'approved' } });
 const changed = await run(s, { envelope: { required_tests: b }, receipt: makeReceipt(b), binding });
 assert.ok(codes(changed, 'declarations_consistency').includes('G1_SUBJECT_MISMATCH'));
 assert.notEqual(changed.g1.subject_digest, digest);
});

test('truncated findings cannot hide the failure exit code', async t => {
 const s = scenario(t, { change: (repo, base) => {
  const oid = blob(repo, Buffer.from([0]));
  return [...base, ...Array.from({ length: 201 }, (_, i) => ['100644', 'blob', oid, `src/binary-${i}.bin`])];
 } });
 const task = json({ ...JSON.parse(TASK), inputs: { scope: 'src/**' } });
 const report = await run(s, { task, envelope: { allowed_paths: ['src/**'], protected: [] }, receipt: receiptFor(s, { tests: [{ id: 'unit:a', status: 'failed' }, { id: 'unit:b', status: 'passed' }] }) });
 assert.equal(report.findings_truncated, true);
 assert.ok(report.findings.every(f => f.severity === 'unknown'));
 assert.equal(report.dimensions.test_evidence.status, 'INCONSISTENT');
 assert.equal(exitCodeFor(report), 1);
});

test('missing promisor objects cannot invoke a configured SSH command', async t => {
 const s = scenario(t);
 const dir = tmp(t), marker = join(dir, 'ssh-was-invoked');
 const helper = join(dir, 'ssh-helper.mjs');
 fs.writeFileSync(helper, `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)}, 'called');process.exit(1);\n`);
 git(s.repo, ['config', 'extensions.partialClone', 'origin']);
 git(s.repo, ['config', 'remote.origin.promisor', 'true']);
 git(s.repo, ['config', 'remote.origin.url', 'ssh://fixture.invalid/unused']);
 git(s.repo, ['config', 'core.sshCommand', `"${process.execPath}" "${helper}"`]);
 await assert.rejects(evaluate({ repo: s.repo, envelope: json(envelopeFor(s, { candidate_commit: 'f'.repeat(40) })), bundle: BUNDLE, task: TASK }), e => e.code === 'PIN_NOT_FOUND');
 assert.equal(fs.existsSync(marker), false, 'collector must never start the fake SSH transport');
});

test('offline demo is runnable and keeps synthetic claims explicit', () => {
 const demo = fileURLToPath(new URL('../experiments/review-evidence/demo.mjs', import.meta.url));
 const r = spawnSync(process.execPath, [demo], { encoding: 'utf8', timeout: 30000 });
 assert.equal(r.status, 0, r.stderr);
 const report = JSON.parse(r.stdout);
 assert.equal(report.evidence_class, 'SYNTHETIC_LABORATORY');
 assert.equal(report.expectations_matched, true);
 assert.equal(report.fixture_code_executed, false);
 assert.equal(report.external_calls, 0);
 assert.equal(report.test_receipts_authenticated, false);
 assert.equal(report.human_time_saved, null);
 assert.equal(report.scenarios.length, 3);
 assert.ok(report.scenarios.every(s => s.dimensions.authority.status === 'UNKNOWN'));
});

test('unreadable baseline for a protected block is UNKNOWN; missing or mismatching baseline stays INCONSISTENT', async t => {
 const first = 'export const KEEP = 2;\n';
 const block = { id: 'k', type: 'block', path: 'src/example.mjs', start_line: 1, end_line: 1, sha256: sha256(first) };
 const withBase = (content, mode = '100644') => {
  const s = scenario(t, {});
  // Rebuild with a custom baseline file; candidate keeps the ordinary small file.
  const common = { 'README.md': '# fixture\n', 'src/keep.mjs': 'export const K = 1;\n' };
  const baseEntries = [...files(s.repo, common), [mode, 'blob', blob(s.repo, content), 'src/example.mjs']];
  const base = commitEntries(s.repo, baseEntries, null, 'base2');
  const candidate = commitEntries(s.repo, files(s.repo, { ...common, 'src/example.mjs': first + 'export const A = 10;\n' }), base, 'candidate2');
  git(s.repo, ['update-ref', 'refs/heads/main', candidate]);
  git(s.repo, ['reset', '-q', '--hard']);
  return { repo: s.repo, base, candidate };
 };
 const check = async (s, expectedStatus, expectedCode, expectedSeverity) => {
  const report = await run(s, { envelope: { protected: [block] } });
  const f = report.findings.filter(x => x.code.startsWith('PROTECTED_BLOCK'));
  assert.deepEqual(f.map(x => [x.code, x.severity]), [[expectedCode, expectedSeverity]]);
  assert.equal(report.protected[0].status, expectedStatus);
  return report;
 };
 const big = withBase(first + 'x'.repeat(1024 * 1024 + 1));
 const r = await check(big, 'UNKNOWN', 'PROTECTED_BLOCK_UNREADABLE', 'unknown');
 assert.ok(codes(r, 'artifact_binding').includes('SURFACE_FILE_TOO_LARGE'), 'other surface unknown is retained');
 assert.notEqual(r.dimensions.artifact_binding.status, 'INCONSISTENT');
 await check(withBase(Buffer.concat([Buffer.from(first), Buffer.from([0, 1, 2])])), 'UNKNOWN', 'PROTECTED_BLOCK_UNREADABLE', 'unknown');
 await check(withBase(first, '120000'), 'UNKNOWN', 'PROTECTED_BLOCK_UNREADABLE', 'unknown');
 // Genuinely mismatching baseline text.
 const mismatch = await check(withBase('export const KEEP = 3;\n'), 'BASELINE_MISMATCH', 'PROTECTED_BLOCK_BASELINE_MISMATCH', 'inconsistent');
 assert.equal(mismatch.dimensions.artifact_binding.status, 'INCONSISTENT');
 // Genuinely missing baseline file.
 const s = scenario(t, {});
 const missing = await run(s, { envelope: { protected: [{ ...block, path: 'src/none.mjs' }] } });
 assert.deepEqual(missing.findings.filter(x => x.code.startsWith('PROTECTED_BLOCK')).map(x => [x.code, x.severity]), [['PROTECTED_BLOCK_BASELINE_MISMATCH', 'inconsistent']]);
});
