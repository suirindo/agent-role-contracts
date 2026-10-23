import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWritePilot, supportedHost, hashBytes } from '../experiments/runtime-conformance/write-pilot.mjs';
import { setupPilot } from '../experiments/runtime-conformance/write-pilot-fixtures.mjs';
const supported = supportedHost(tmpdir());
function sandbox(t) {
 const parent = fs.mkdtempSync(join(tmpdir(), 'arc-pilot-test-'));
 t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
 fs.writeFileSync(join(parent, 'sentinel'), 'untouched');
 return parent;
}
function snapshot(parent) {
 const visit = path => {
  const s = fs.lstatSync(path);
  return s.isSymbolicLink() ? ['link', fs.readlinkSync(path)] : s.isDirectory() ?
   Object.fromEntries(fs.readdirSync(path).sort().map(v => [v, visit(join(path, v))])) :
   s.isFile() ? ['file', fs.readFileSync(path).toString('hex'), s.mode] : ['special', s.mode];
 };
 return visit(parent);
}
const pilotTest = (name, fn) => test(name, { skip: !supported && 'pilot requires Linux Node24 overlayfs' }, fn);
pilotTest('shadow then enforcement: exact fixed bytes are created once, all other attempts are denied', async t => {
 const parent = sandbox(t), shadow = await setupPilot(parent, { mode: 'shadow' });
 const before = snapshot(parent);
 assert.equal((await shadow.channel.submit(shadow.request)).outcome, 'shadow_would_allow');
 assert.equal(shadow.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
 const s = await setupPilot(parent);
 const r = await s.channel.submit(s.request);
 assert.equal(r.outcome, 'committed', JSON.stringify(r));
 assert.equal(r.content_sha256, hashBytes(s.request.bytes));
 assert.deepEqual(fs.readFileSync(join(s.workspace.root, s.request.path)), s.request.bytes);
 const after = snapshot(parent);
 assert.equal((await s.channel.submit(s.request)).outcome, 'rejected_before_execution');
 assert.deepEqual(snapshot(parent), after); assert.equal(s.host.stats().executorCalls, 1);
 assert.equal(s.host.audit().length, 2); // audit is separate host memory, not protected output
});
const mutations = {
 path: s => { s.request.path = 'src/other.mjs'; },
 bytes: s => { s.request.bytes = Buffer.from('changed'); },
 task: s => { s.context.task.objective += ' drift'; s.host.updateContext(s.context); },
 'bundle policy': s => { s.context.bundle.policy_version += '-new'; s.host.updateContext(s.context); },
 role: s => { s.context.role = 'reviewer'; s.host.updateContext(s.context); },
 run: s => { s.context.run += '-other'; s.host.updateContext(s.context); },
 'policy revision': s => { s.context.policyRevision += '-other'; s.host.updateContext(s.context); },
 'missing context': s => { delete s.context.task; s.host.updateContext(s.context); },
 'worker role forgery': s => { s.request.role = 'implementer'; },
 'worker task forgery': s => { s.request.task = s.context.task; },
 'worker trusted flag': s => { s.request.trusted = true; },
 'unsupported operation': s => { s.request.operation = 'delete_file'; },
 'native deny': s => { s.context.native.write = false; s.host.updateContext(s.context); },
 revoked: s => s.authority.revoke(s.approval),
 'verifier exception': s => s.authority.setFault('stopped'),
 'verifier timeout': s => s.authority.setFault('timeout'),
 absolute: s => { s.request.path = '/tmp/arc-escape'; },
 traversal: s => { s.request.path = '../sentinel'; },
 'noncanonical path': s => { s.request.path = 'src/../sentinel'; },
 'shared bytes': s => { s.request.bytes = new Uint8Array(new SharedArrayBuffer(8)); },
};
for (const [name, mutate] of Object.entries(mutations)) pilotTest('reject without executor or protected/sentinel change: ' + name, async t => {
 const parent = sandbox(t), s = await setupPilot(parent); mutate(s);
 const before = snapshot(parent), r = await s.channel.submit(s.request);
 assert.equal(r.outcome, 'rejected_before_execution', JSON.stringify(r));
 assert.equal(s.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
 assert.equal(s.host.audit().length, 1);
});
pilotTest('actual read-only actor is refused despite eligible different writer and valid G1/G2', async t => {
 const parent = sandbox(t), s = await setupPilot(parent, { alter(c) {
  c.role = 'reviewer'; c.assignments = [{ role: c.role, principal: c.principal, task: c.task.id, run: c.run }];
 } });
 const before = snapshot(parent), r = await s.channel.submit(s.request);
 assert.equal(r.reason, 'ACTOR_NOT_ASSIGNED_ELIGIBLE_WRITER');
 assert.equal(s.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
});
pilotTest('eligible but currently unassigned actor cannot write', async t => {
 const parent = sandbox(t), s = await setupPilot(parent, { alter(c) { c.assignments = []; } });
 const before = snapshot(parent), r = await s.channel.submit(s.request);
 assert.equal(r.reason, 'ACTOR_NOT_ASSIGNED_ELIGIBLE_WRITER'); assert.deepEqual(snapshot(parent), before);
});
pilotTest('expired approval, old session, old approval revision, and approval reuse fail closed', async t => {
 const parent = sandbox(t);
 for (const kind of ['expired', 'session', 'revision', 'reuse']) {
  const s = await setupPilot(parent);
  let target = structuredClone(s.target);
  if (kind === 'revision') target.policyRevision += '-old';
  const approval = s.authority.grant(target, { expires: kind === 'expired' ? Date.now() - 1 : Date.now() + 60000 });
  if (kind === 'reuse') s.authority.consume(approval, target);
  let host = s.host;
  if (kind === 'session') host = createWritePilot({ workspace: s.workspace, authority: s.authority, context: s.context, mode: 'enforce' });
  const id = await host.admit(s.action, s.binding, approval);
  const before = snapshot(parent);
  const r = await host.workerChannel(id).submit(s.request);
  assert.equal(r.outcome, 'rejected_before_execution', kind + JSON.stringify(r));
  assert.equal(host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
  if (kind === 'session') assert.equal((await host.workerChannel(s.admission).submit(s.request)).reason, 'ADMISSION_REUSED_OR_FOREIGN');
 }
});
pilotTest('same admission and same approval across admissions each execute at most once concurrently', async t => {
 for (const separate of [false, true]) {
  const parent = sandbox(t), s = await setupPilot(parent);
  const other = separate ? s.host.workerChannel(await s.host.admit(s.action, s.binding, s.approval)) : s.channel;
  const results = await Promise.all([s.channel.submit(s.request), other.submit(s.request)]);
  assert.equal(results.filter(r => r.outcome === 'committed').length, 1);
  assert.equal(s.host.stats().executorCalls, 1);
 }
});
pilotTest('buffer and path mutation during pending verification cannot substitute executed bytes/path', async t => {
 const parent = sandbox(t), s = await setupPilot(parent), expected = Buffer.from(s.request.bytes);
 const pending = s.channel.submit(s.request);
 s.request.bytes.fill(88); s.request.path = 'src/other.mjs';
 const r = await pending;
 assert.equal(r.outcome, 'committed');
 assert.deepEqual(fs.readFileSync(join(s.workspace.root, 'src/example.mjs')), expected);
 assert.equal(fs.existsSync(join(s.workspace.root, 'src/other.mjs')), false);
});
pilotTest('symlink parents/final targets, existing file/directory, missing parent and nonexclusive root reject before executor', async t => {
 const parent = sandbox(t);
 for (const kind of ['parent-link', 'final-link', 'file', 'directory', 'missing-parent', 'root-mode']) {
  const s = await setupPilot(parent);
  if (kind === 'parent-link') {
   fs.rmdirSync(join(s.workspace.root, 'src')); fs.symlinkSync(parent, join(s.workspace.root, 'src'));
  } else if (kind === 'final-link') fs.symlinkSync(join(parent, 'sentinel'), join(s.workspace.root, s.request.path));
  else if (kind === 'file') fs.writeFileSync(join(s.workspace.root, s.request.path), 'existing');
  else if (kind === 'directory') fs.mkdirSync(join(s.workspace.root, s.request.path));
  else if (kind === 'missing-parent') fs.rmdirSync(join(s.workspace.root, 'src'));
  else fs.chmodSync(s.workspace.root, 0o777);
  const before = snapshot(parent), r = await s.channel.submit(s.request);
  assert.equal(r.outcome, 'rejected_before_execution', kind + JSON.stringify(r));
  assert.equal(s.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
 }
});
pilotTest('native permission denial is preserved even with matching ARC and test approval', async t => {
 const parent = sandbox(t), s = await setupPilot(parent, { alter(c) { c.native.write = false; } });
 const before = snapshot(parent), r = await s.channel.submit(s.request);
 assert.equal(r.reason, 'NATIVE_PERMISSION_DENIED'); assert.deepEqual(snapshot(parent), before);
 assert.equal(s.host.stats().executorCalls, 0);
});
pilotTest('missing verifier, self-attested verifier and existing unprovisioned workspace refuse enforcement', async t => {
 const parent = sandbox(t), s = await setupPilot(parent);
 for (const authority of [undefined, { trusted: true, verify: () => true, consume: () => {} }])
  assert.throws(() => createWritePilot({ workspace: s.workspace, authority, context: s.context, mode: 'enforce' }), /TRUSTED_TEST_VERIFIER_REQUIRED/);
 assert.throws(() => createWritePilot({ workspace: { root: s.workspace.root }, authority: s.authority, context: s.context, mode: 'enforce' }), /UNSUPPORTED_WORKSPACE/);
});
pilotTest('I/O partial failure and unknown readback consume approval and never retry', async t => {
 // Fault injection replaces builtins ONLY in this test; no production executor callback.
 const parent = sandbox(t);
 for (const fault of ['write', 'readback']) {
  const s = await setupPilot(parent), originalWrite = fs.writeSync, originalRead = fs.readFileSync;
  let count = 0;
  try {
   if (fault === 'write') fs.writeSync = (...args) => {
    if (++count > 1) throw Object.assign(Error('injected ENOSPC'), { code: 'ENOSPC' });
    return originalWrite(args[0], args[1], args[2], 1, args[4]);
   };
   else fs.readFileSync = (file, ...args) => {
    if (typeof file === 'number') throw Object.assign(Error('injected EIO'), { code: 'EIO' });
    return originalRead(file, ...args);
   };
   syncBuiltinESMExports();
   const r = await s.channel.submit(s.request);
   assert.equal(r.outcome, fault === 'write' ? 'write_failed' : 'execution_result_unknown');
   assert.equal(r.automatic_retry, false); assert.equal(s.host.stats().executorCalls, 1);
  } finally { fs.writeSync = originalWrite; fs.readFileSync = originalRead; syncBuiltinESMExports(); }
  const after = snapshot(parent);
  assert.equal((await s.channel.submit(s.request)).outcome, 'rejected_before_execution');
  const second = s.host.workerChannel(await s.host.admit(s.action, s.binding, s.approval));
  assert.equal((await second.submit(s.request)).outcome, 'rejected_before_execution');
  assert.deepEqual(snapshot(parent), after);
 }
});
pilotTest('real restricted worker transport reaches fixed executor; alternate filesystem/Bash/Python denied', async t => {
 const { runReferenceWorker, submitReferenceWorker } = await import('../experiments/runtime-conformance/write-pilot-channel.mjs');
 const parent = sandbox(t), s = await setupPilot(parent), before = snapshot(parent);
 const probe = runReferenceWorker({ probe: join(parent, 'sentinel') });
 assert.deepEqual(probe.denied, { direct_filesystem: true, symlink: true, bash: true, python: true });
 assert.deepEqual(snapshot(parent), before);
 const result = await submitReferenceWorker(s.channel, s.request);
 assert.equal(result.outcome, 'committed');
 assert.deepEqual(fs.readFileSync(join(s.workspace.root, s.request.path)), s.request.bytes);
 const second = await setupPilot(parent); second.request.bytes = Buffer.from('unapproved');
 const after = snapshot(parent);
 assert.equal((await submitReferenceWorker(second.channel, second.request)).outcome, 'rejected_before_execution');
 assert.equal(second.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), after);
});
pilotTest('fresh admission with stale G1 declaration does not get authority from matching fixture approval', async t => {
 const parent = sandbox(t), s = await setupPilot(parent);
 const action = structuredClone(s.action); action.parameters.content_sha256 = hashBytes(Buffer.from('other'));
 const target = await s.host.prepare(action, s.binding), approval = s.authority.grant(target);
 const admission = await s.host.admit(action, s.binding, approval);
 const before = snapshot(parent), r = await s.host.workerChannel(admission).submit({ ...s.request, bytes: Buffer.from('other') });
 assert.equal(r.reason, 'G1_BINDING_REJECTED'); assert.equal(s.host.stats().executorCalls, 0);
 assert.deepEqual(snapshot(parent), before);
});
pilotTest('timeout never consumes authority or dispatches a late executor', async t => {
 const parent = sandbox(t), s = await setupPilot(parent);
 s.authority.setFault('timeout'); const before = snapshot(parent);
 assert.equal((await s.channel.submit(s.request)).reason, 'VERIFIER_TIMEOUT');
 s.authority.setFault('none');
 assert.equal((await s.channel.submit(s.request)).reason, 'ADMISSION_REUSED_OR_FOREIGN');
 assert.equal(s.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
});
pilotTest('real nonregular FIFO destination is rejected before executor', async t => {
 // Fixed fixture provisioning command, never exposed as a worker/executor tool.
 const { spawnSync } = await import('node:child_process');
 const parent = sandbox(t), s = await setupPilot(parent);
 const result = spawnSync('mkfifo', [join(s.workspace.root, s.request.path)], { encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 assert.equal(fs.lstatSync(join(s.workspace.root, s.request.path)).isFIFO(), true);
 const before = snapshot(parent), r = await s.channel.submit(s.request);
 assert.equal(r.reason, 'DESTINATION_EXISTS'); assert.equal(s.host.stats().executorCalls, 0);
 assert.deepEqual(snapshot(parent), before);
});
pilotTest('foreign authority record, missing approval, deny declaration and stale review reject without effects', async t => {
 const parent = sandbox(t);
 for (const kind of ['foreign', 'missing', 'deny', 'stale-review']) {
  const s = await setupPilot(parent), binding = structuredClone(s.binding);
  let approval = s.approval;
  if (kind === 'foreign') approval = s.authority.grant({ ...s.target, run: 'foreign-run' });
  if (kind === 'missing') approval = 'unknown-approval';
  if (kind === 'deny') binding.human_approval.decision = 'denied';
  if (kind === 'stale-review') binding.reviews[0].subject_digest = 'sha256:' + '0'.repeat(64);
  const id = await s.host.admit(s.action, binding, approval), before = snapshot(parent);
  assert.equal((await s.host.workerChannel(id).submit(s.request)).outcome, 'rejected_before_execution');
  assert.equal(s.host.stats().executorCalls, 0); assert.deepEqual(snapshot(parent), before);
 }
});
