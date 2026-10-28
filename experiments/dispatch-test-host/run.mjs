/**
 * Bounded TEST-HOST loopback trial. Usage: node experiments/dispatch-test-host/run.mjs <out_dir>
 * Writes evidence JSON to <out_dir> (must not exist or be empty; created 0700). Keys are in memory only and are never written.
 * One synthetic line, 127.0.0.1 only, receivers are child processes stopped before exit. Not production authority.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestHost, PAYLOAD, APPROVED, TEST_AUTHORITY } from './host.mjs';

const out = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('usage: run.mjs <out_dir>'); process.exit(2); }
await mkdir(out, { mode: 0o700, recursive: true });
if ((await readdir(out)).length) { console.error('out_dir not empty'); process.exit(2); }

const root = fileURLToPath(new URL('../../', import.meta.url));
const flip = i => { const r = JSON.parse(i.receiptJson), s = Buffer.from(r.signature, 'base64'); s[0] ^= 1; return { ...i, receiptJson: JSON.stringify({ ...r, signature: s.toString('base64') }) }; };
const cases = [
 ['positive_exact_target', {}, async () => {}],
 ['replay_after_consume', {}, async (h, a) => { await h.dispatch(a); }],
 ['denied_forged_signature', { tamper: flip }],
 ['denied_revoked_key', { mutate: s => { s.registry.keys[0].status = 'revoked'; } }],
 ['denied_expired', { mutate: s => { s.payload.expires_at_ms = s.context.evaluated_at_ms; } }],
 ['denied_context_tampered', { tamper: i => ({ ...i, contextJson: JSON.stringify({ ...JSON.parse(i.contextJson), actor_principal: 'someone-else' }) }) }],
 ['denied_payload_changed', {}, null, Buffer.from('different synthetic line\n')],
 ['denied_stale_revision', {}, async h => { h.revisions.set('test-host-req-1', 2); }],
 ['denied_target_mismatch', {}, async h => { h.setRoute('recv-b'); }],
 ['response_uncertain_no_retry', {}, async (h, a, retry) => { await h.add('recv-slow', APPROVED, 1500); h.setRoute('recv-slow'); retry.after = true; }, undefined, { sendTimeoutMs: 300 }],
];
const results = [];
for (const [name, issueOpts, pre, payload, hostOpts] of cases) {
 const h = await createTestHost(hostOpts);
 try {
  const approval = await h.issue(issueOpts);
  const retry = {};
  if (pre) await pre(h, approval, retry);
  const r = await h.dispatch(approval, payload ?? PAYLOAD);
  let second = null;
  if (retry.after) { await new Promise(x => setTimeout(x, 150)); second = await h.dispatch(approval); }
  const brief = x => x && ({ adapter_decision: x.adapter_decision, consumption_status: x.consumption_status, verification_result: x.verification_result,
   send_outcome: x.send_outcome, target_binding: x.target_binding, payload_binding: x.payload_binding, codes: x.diagnostics.map(d => d.code), ledger_called: x.ledger_called });
  const effects = await h.effects();
  results.push({ name, report: brief(r), second_report: brief(second), host_sends: h.state.sends, host_callbacks: h.state.hostCalls,
   receiver_effects: Object.fromEntries(Object.entries(effects).map(([k, v]) => [k, v])),
   markers: (await readdir(join(h.dir, 'store'))).filter(x => x.endsWith('.consumed')).length,
   receiver_pids: Object.values(h.receivers).map(x => x.pid) });
 } finally { const exits = await h.close(); results.at(-1).receiver_exits = exits; }
}
const files = ['host.mjs', 'receiver.mjs', 'run.mjs'].map(f => 'experiments/dispatch-test-host/' + f)
 .concat(['experiments/task-consumption/dispatch-target.mjs', 'experiments/task-consumption/owned-payload.mjs', 'experiments/task-consumption/ledger.mjs', 'experiments/task-approval/approval.mjs']);
const git = a => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const evidence = {
 profile: 'arc69-test-host-loopback-trial/0.1', authority: TEST_AUTHORITY, node: process.version, platform: process.platform, arch: process.arch,
 git_head: git(['rev-parse', 'HEAD']), git_dirty: git(['status', '--porcelain']).length > 0, network: 'loopback 127.0.0.1 only; no external endpoint',
 payload: { synthetic: true, byte_length: PAYLOAD.length, sha256: 'sha256:' + createHash('sha256').update(PAYLOAD).digest('hex') },
 key_material: 'ephemeral in-memory only; never written to disk', source_sha256: Object.fromEntries(await Promise.all(files.map(async f =>
  [f, 'sha256:' + createHash('sha256').update(await readFile(join(root, f))).digest('hex')]))),
 limitations: { production_authority: false, native_host_enforcement: false, resolution_independence: 'UNPROVEN: test host resolves and sends; only the receiver log is independent',
  clock: 'fixed synthetic test clock', acceptance: 'UNKNOWN; independent QC separate and mandatory' },
 results,
};
await writeFile(join(out, 'trial.json'), JSON.stringify(evidence, null, 1) + '\n', { mode: 0o600 });
console.log(JSON.stringify(results.map(r => [r.name, r.report.adapter_decision, r.report.send_outcome, Object.values(r.receiver_effects).flat().length]), null, 0));
