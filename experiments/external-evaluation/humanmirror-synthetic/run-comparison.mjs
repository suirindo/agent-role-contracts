#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform, arch } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const PIN = '9f6771056c47de971202360952af6d41941f7625';
const HERE = dirname(fileURLToPath(import.meta.url));
const INPUTS = ['scenario.json', 'bundle.json', 'task.json', 'policy.json', 'transaction-a.json', 'transaction-b.json', 'intent-fictional.json', 'receipt-fictional.json'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function read(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error(`Expected regular file <=1 MiB: ${path}`);
  return readFileSync(path);
}
function command(file, args, cwd = HERE) {
  const started = process.hrtime.bigint();
  const r = spawnSync(file, args, { cwd, encoding: 'utf8', shell: false, timeout: 15000, maxBuffer: 1024 * 1024 });
  if (r.error || r.signal || r.status === null) throw new Error(`Tool failure: ${r.error?.message || r.signal}`);
  return { exit_code: r.status, stdout: r.stdout, stderr: r.stderr, elapsed_ms: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(3)) };
}
function git(repo, ...args) {
  const r = command('git', ['-C', repo, ...args]);
  if (r.exit_code !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
  return r.stdout.trim();
}
function verifyReference(repo) {
  assert.equal(git(repo, 'rev-parse', 'HEAD'), PIN, 'Requires exact official ARC v1.0.0 commit');
  assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=all'), '', 'Reference checkout must remain clean');
  // Check actual loaded bytes too: index assume-unchanged/skip-worktree flags must not hide edits.
  const hashes = {};
  const entries = git(repo, 'ls-tree', '-r', PIN, '--', 'src', 'bin', 'schemas').split('\n');
  for (const entry of entries) {
    const match = entry.match(/^100(?:644|755) blob ([0-9a-f]{40})\t(.+)$/);
    if (!match) throw new Error(`Unexpected reference tree entry: ${entry}`);
    const bytes = read(join(repo, match[2]));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(blob, match[1], `Modified reference bytes: ${match[2]}`);
    hashes[match[2]] = sha256(bytes);
  }
  return hashes;
}
function checkMapping(input) {
  const s = input['scenario.json'];
  assert.equal(s.fixture_id, 'arc-humanmirror-synthetic-v1');
  assert.equal(s.chain, 'eip155:8453'); assert.equal(s.amount_minor, 10000); assert.equal(s.asset_decimals, 6); assert.equal(s.asset, 'USDC');
  assert.equal(s.authorized_recipient, 'A');
  const a = input['transaction-a.json'], b = input['transaction-b.json'], policy = input['policy.json'];
  assert.deepEqual(b, { ...a, target: '0x' + 'b'.repeat(40) }, 'Only target may differ between A/B');
  assert.equal(a.target, '0x' + 'a'.repeat(40)); assert.equal(a.chain_id, '8453'); assert.equal(a.amount_base_units, '10000');
  assert.equal(a.asset, '0x' + 'c'.repeat(40)); assert.equal(a.sender, '0x' + '5e'.repeat(20));
  assert.deepEqual(policy.allowed_recipients, [a.target]); assert.deepEqual(policy.allowed_chain_ids, ['8453']);
  assert.deepEqual(input['intent-fictional.json'].transaction, a);
  assert.deepEqual(s.cases.map(c => [c.case_id, c.proposed_recipient, c.expected_arc_declaration]), [
    ['valid-declaration', 'A', 'PASS'], ['recipient-mutation', 'B', 'REJECT'],
    ['settled-missing-response', 'A', 'NOT_APPLICABLE_TO_RECONCILIATION'], ['uncertain-settlement', 'A', 'NOT_APPLICABLE_TO_RECONCILIATION']
  ]);
  assert.ok(s.cases.every(c => c.observed_arc === 'NOT_RUN' && c.observed_humanmirror === 'NOT_RUN'), 'Keep original observations unchanged');
}
function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === '--help') { console.log('Usage: node run-comparison.mjs --arc-v1 /path/to/clean/arc-v1'); return; }
  if (argv.length !== 2 || argv[0] !== '--arc-v1' || !argv[1]) throw new Error('Expected exactly --arc-v1 PATH');
  const arc = resolve(argv[1]);
  const referenceHashes = verifyReference(arc);
  const input = {}, inputHashes = {};
  for (const name of INPUTS) { const bytes = read(join(HERE, name)); inputHashes[name] = sha256(bytes); input[name] = JSON.parse(bytes); }
  checkMapping(input);
  const folder = mkdtempSync(join(tmpdir(), 'arc-humanmirror-offline-'));
  const results = [];
  function run(id, subcommand, extra, expected, receipt) {
    let receiptArg = [];
    if (receipt !== undefined) {
      const file = join(folder, `${id}.json`); writeFileSync(file, JSON.stringify(receipt) + '\n', { mode: 0o600 });
      receiptArg = ['--receipt', file];
    }
    const flags = ['--bundle', 'bundle.json', '--task', 'task.json', '--policy', 'policy.json', ...extra, ...receiptArg];
    const invocation = command(process.execPath, [join(arc, 'bin/agent-role-contracts.mjs'), subcommand, ...flags]);
    let report;
    try { report = JSON.parse(invocation.stdout); } catch { throw new Error(`${id} produced non-JSON output`); }
    const codes = report.errors?.map(e => e.code).sort();
    const matches = invocation.exit_code === expected.exit_code && report.valid === expected.valid && JSON.stringify(codes) === JSON.stringify(expected.codes);
    results.push({ case_id: id, expected, observed: { ...invocation, report }, matches_expectation: matches,
      command: ['<node>', '<arc-v1>/bin/agent-role-contracts.mjs', subcommand, ...flags.map(p => p.startsWith(folder) ? '<temporary-receipt.json>' : p)],
      ...(receipt !== undefined ? { receipt_input: receipt, receipt_sha256: sha256(JSON.stringify(receipt) + '\n') } : {}) });
    return report;
  }
  try {
    const pass = { exit_code: 0, valid: true, codes: [] };
    run('valid-declaration', 'finance-subject', ['--transaction', 'transaction-a.json'], pass);
    run('recipient-mutation', 'finance-subject', ['--transaction', 'transaction-b.json'], { exit_code: 1, valid: false, codes: ['FINANCE_RECIPIENT_NOT_ALLOWED'] });
    run('fictional-intent-precondition', 'finance', ['--intent', 'intent-fictional.json', '--at', '2030-01-01T00:00:03Z'], pass);
    const r = input['receipt-fictional.json'];
    const extras = ['--intent', 'intent-fictional.json', '--at', '2030-01-01T00:00:05Z'];
    run('matching-fictional-receipt', 'finance-execution', extras, pass, r);
    run('nonce-mismatch', 'finance-execution', extras, { exit_code: 1, valid: false, codes: ['FINANCE_EXECUTION_NONCE_MISMATCH'] }, { ...r, nonce: '8' });
    run('different-fictional-hash', 'finance-execution', extras, pass, { ...r, transaction_hash: '0x' + 'b'.repeat(64) });
    run('same-receipt-revalidated', 'finance-execution', extras, pass, r);
    run('null-receipt', 'finance-execution', extras, { exit_code: 1, valid: false, codes: ['SCHEMA_TYPE'] }, null);
    for (const key of ['tool_response', 'operation_id']) {
      run(`unknown-${key}`, 'finance-execution', extras, { exit_code: 1, valid: false, codes: ['SCHEMA_ADDITIONALPROPERTIES'] }, { ...r, [key]: key === 'tool_response' ? 'MISSING' : 'synthetic-op-001' });
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
  // Recheck reference and fixture identities after use; report no silent changed-input success.
  assert.deepEqual(verifyReference(arc), referenceHashes);
  for (const name of INPUTS) assert.equal(sha256(read(join(HERE, name))), inputHashes[name], `Input changed during run: ${name}`);
  const ok = results.every(r => r.matches_expectation);
  console.log(JSON.stringify({
    experiment: 'arc-humanmirror-synthetic-v1', verdict: ok ? 'EXPECTED_OFFLINE_RESULTS_REPRODUCED' : 'UNEXPECTED_RESULT',
    executed_at: new Date().toISOString(), evaluator: 'maintainer-operated synthetic offline fixture',
    environment: { node: process.version, platform: platform(), arch: arch() },
    reference: { commit: PIN, version: '1.0.0', clean: true, loaded_file_sha256: referenceHashes },
    input_sha256: inputHashes, runner_sha256: sha256(read(fileURLToPath(import.meta.url))),
    public_scenario: input['scenario.json'].cases.map((c, index) => ({ case_id: c.case_id, expected_arc_declaration: c.expected_arc_declaration,
      observed_arc: index < 2 ? (results[index].observed.report.valid ? 'PASS' : 'REJECT') : 'NOT_RUN',
      arc_reconciliation_applicability: 'NOT_APPLICABLE_TO_RECONCILIATION',
      observed_humanmirror: 'NOT_RUN', reconciliation_executed: false })),
    results,
    boundaries: { network_calls: false, payments_executed: false, humanmirror_executed: false, receipt_authenticity_verified: false, replay_prevention_verified: false, settlement_verified: false, delivery_verified: false, operation_id_reconciliation_implemented: false, missing_response_scenarios_executed: false, human_time_savings_measured: false, external_adoption_count: 0 }
  }, null, 2));
  if (!ok) process.exitCode = 1;
}
try { main(); } catch (error) { console.error(`HUMANMIRROR_EVALUATION_ERROR: ${error.message}`); process.exitCode = 2; }
