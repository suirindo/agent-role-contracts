#!/usr/bin/env node
/** Offline synthetic demonstration; no candidate code, external calls or real approvals. */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluate } from './review-evidence.mjs';

const root = fs.mkdtempSync(join(tmpdir(), 'arc-review-demo-'));
const repo = join(root, 'fixture.git');
const env = {
 PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_ALLOW_PROTOCOL: '',
 GIT_AUTHOR_NAME: 'Fictional demo', GIT_AUTHOR_EMAIL: 'demo@example.invalid',
 GIT_COMMITTER_NAME: 'Fictional demo', GIT_COMMITTER_EMAIL: 'demo@example.invalid',
 GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};
function git(args, input) {
 return execFileSync('git', ['--git-dir=' + repo, ...args], {
  env, input, timeout: 10000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
 }).toString().trim();
}
try {
 execFileSync('git', ['init', '--bare', '-q', '--template=', repo], { env, stdio: ['ignore', 'pipe', 'pipe'] });
 const blob = text => git(['hash-object', '-w', '--stdin'], text);
 const commit = (content, parent, extra = false) => {
  const src = git(['mktree'], '100644 blob ' + blob(content) + '\tprice.mjs\n');
  let entries = '040000 tree ' + src + '\tsrc\n';
  if (extra) entries += '100644 blob ' + blob('fictional unrequested change\n') + '\tREADME.md\n';
  const tree = git(['mktree'], entries);
  return git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'inert demo']);
 };
 const baseline = commit('export const price = 1;\n');
 const candidate = commit('export const price = 2;\n', baseline);
 const extra = commit('export const price = 2;\n', baseline, true);
 const bundle = fs.readFileSync(new URL('../../examples/starter-bundle.json', import.meta.url), 'utf8');
 const originalTask = JSON.parse(fs.readFileSync(new URL('../../examples/starter-task.json', import.meta.url), 'utf8'));
 const task = JSON.stringify({ ...originalTask, id: 'review-demo', objective: 'Review an inert scoped price change.', inputs: { scope: 'src/price.mjs' } });
 const envelope = id => JSON.stringify({
  schema_version: 'review-evidence-envelope/0.1', task_id: 'review-demo',
  baseline_commit: baseline, candidate_commit: id, allowed_paths: ['src/price.mjs'],
  protected: [], required_tests: ['price:unit', 'price:regression'],
 });
 const receipt = ids => JSON.stringify({
  schema_version: 'review-evidence-test-receipt/0.1',
  subject: { baseline_commit: baseline, candidate_commit: candidate },
  provenance: { producer: 'fictional-demo', kind: 'synthetic' },
  tests: ids.map(id => ({ id, status: 'passed' })),
 });
 const input = { repo, bundle, task, envelope: envelope(candidate), receipt: receipt(['price:unit', 'price:regression']) };
 const first = await evaluate(input);
 const digest = first.g1.subject_digest;
 // Fictional declarations apply only to this original candidate; no reapproval is invented.
 const binding = JSON.stringify({
  schema_version: '0.3', subject_digest: digest,
  reviews: [{ role_id: 'reviewer', subject_digest: digest, decision: 'pass' }],
  human_approval: { role_id: 'implementer', subject_digest: digest, decision: 'approved' },
 });
 const original = await evaluate({ ...input, binding });
 const changed = await evaluate({ ...input, binding, envelope: envelope(extra) });
 const substituted = await evaluate({ ...input, binding, receipt: receipt(['price:unit', 'replacement:test']) });
 const has = (r, code) => r.findings.some(f => f.code === code);
 const all = [original, changed, substituted];
 const expectations = original.dimensions.artifact_binding.status === 'CONSISTENT'
  && has(changed, 'PATH_OUT_OF_SCOPE') && has(changed, 'G1_SUBJECT_MISMATCH')
  && has(substituted, 'TEST_ID_SUBSTITUTION')
  && all.every(r => r.dimensions.authority.status === 'UNKNOWN' && r.dimensions.semantic_acceptance.status === 'UNKNOWN' && r.dimensions.execution.status === 'NOT_PERFORMED');
 const summarize = (name, r) => ({
  name, subject: r.subject, dimensions: r.dimensions,
  codes: r.findings.map(f => f.code),
 });
 process.stdout.write(JSON.stringify({
  evidence_class: 'SYNTHETIC_LABORATORY', expectations_matched: expectations,
  fixture_code_executed: false, external_calls: 0, fictional_approval_declarations: true,
  test_receipts_authenticated: false, human_time_saved: null, external_second_task_reuse: false,
  scenarios: [summarize('original scoped change', original), summarize('unrequested change with old review', changed), summarize('equal-count test substitution', substituted)],
 }, null, 2) + '\n');
 process.exitCode = expectations ? 0 : 1;
} catch {
 process.stderr.write('REVIEW_EVIDENCE_DEMO_ERROR\n');
 process.exitCode = 2;
} finally {
 fs.rmSync(root, { recursive: true, force: true });
}
