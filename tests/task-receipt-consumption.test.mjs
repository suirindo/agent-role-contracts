import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, realpath, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario, render } from '../experiments/task-approval/fixtures.mjs';
import { contextDigest } from '../experiments/task-approval/approval.mjs';
import { createReceiptConsumptionStore } from '../experiments/task-consumption/ledger.mjs';

const POSIX = ['linux', 'darwin'].includes(process.platform);
const worker = new URL('../experiments/task-consumption/worker.mjs', import.meta.url);
const j = JSON.stringify;
async function root() { const p = await mkdtemp(join(tmpdir(), 'arc-consume-')); await chmod(p, 0o700); return realpath(p); }
async function valid() { return render(await scenario()); }
const markerNames = async p => (await readdir(p)).filter(x => x.endsWith('.consumed'));
function check(r, status) {
 assert.equal(r.consumption_status, status, j(r));
 assert.equal(r.authority_status, 'UNKNOWN');
 for (const k of ['execution_authorized', 'runtime_enforcement', 'action_executed', 'actor_authenticated', 'reviewer_authenticated', 'global_replay_protection']) assert.equal(r[k], false, k);
 return r;
}
function runWorker(root, input, waitAfterConsume = false) {
 const child = spawn(process.execPath, [fileURLToPath(worker)], { stdio: ['pipe', 'pipe', 'pipe'] });
 let stdout = '', stderr = '', lineSettled = false;
 let resolveLine, rejectLine, resolveExit, rejectExit;
 const line = new Promise((resolve, reject) => { resolveLine = resolve; rejectLine = reject; });
 const exit = new Promise((resolve, reject) => { resolveExit = resolve; rejectExit = reject; });
 // Retain the original rejection for awaiting callers without creating an unhandled rejection during startup failure.
 line.catch(() => {}); exit.catch(() => {});
 const timer = setTimeout(() => { child.kill('SIGKILL'); rejectLine(new Error('worker timeout')); rejectExit(new Error('worker timeout')); }, 10000);
 child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
 child.stdout.on('data', x => {
  stdout += x;
  if (!lineSettled && stdout.includes('\n')) {
   lineSettled = true;
   try { resolveLine(JSON.parse(stdout.slice(0, stdout.indexOf('\n')))); } catch (error) { rejectLine(error); }
  }
 });
 child.stderr.on('data', x => { stderr += x; });
 child.once('error', error => { clearTimeout(timer); rejectLine(error); rejectExit(error); });
 child.once('exit', (code, signal) => {
  clearTimeout(timer);
  if (!lineSettled) rejectLine(new Error(stderr || 'worker exited before report'));
  if (code === 0 || (waitAfterConsume && signal === 'SIGKILL')) resolveExit({ code, signal });
  else rejectExit(new Error(stderr || 'unexpected worker exit'));
 });
 child.stdin.end(j({ root, input, waitAfterConsume }));
 return { child, line, exit };
}
async function withRoot(fn) { const p = await root(); try { await fn(p); } finally { await rm(p, { recursive: true, force: true }); } }

test('valid ephemeral-key receipt creates exactly one durable marker; repeat is held', { skip: !POSIX }, async () => withRoot(async p => {
 const store = await createReceiptConsumptionStore(p), input = await valid();
 const first = check(await store.consume(input), 'CONSUMED');
 assert.equal(first.marker_persisted, true);
 assert.equal((await markerNames(p)).length, 1);
 const record = JSON.parse(await readFile(join(p, (await markerNames(p))[0]), 'utf8'));
 assert.deepEqual(Object.keys(record).sort(), ['binding_digest', 'context_digest', 'grant_hash', 'subject_digest', 'version']);
 check(await store.consume(input), 'REPLAY_OR_UNCERTAIN');
 assert.equal((await markerNames(p)).length, 1);
}));

test('two independent processes arbitrate one CONSUMED and one held', { skip: !POSIX }, async () => withRoot(async p => {
 const input = await valid(), a = runWorker(p, input), b = runWorker(p, input);
 const results = await Promise.all([a.line, b.line]); await Promise.all([a.exit, b.exit]);
 assert.deepEqual(results.map(x => x.consumption_status).sort(), ['CONSUMED', 'REPLAY_OR_UNCERTAIN']);
 assert.equal((await markerNames(p)).length, 1);
}));

test('fresh process after confirmed consumption remains held, including killed confirmed worker', { skip: !POSIX }, async () => withRoot(async p => {
 const input = await valid(), first = runWorker(p, input, true);
 check(await first.line, 'CONSUMED');
 first.child.kill('SIGKILL');
 const stopped = await first.exit;
 assert.equal(stopped.signal, 'SIGKILL');
 const restarted = runWorker(p, input);
 check(await restarted.line, 'REPLAY_OR_UNCERTAIN'); await restarted.exit;
}));

test('empty, corrupt, symlink and directory preexisting markers are held and untouched', { skip: !POSIX }, async () => {
 for (const kind of ['empty', 'corrupt', 'symlink', 'directory']) await withRoot(async p => {
  const input = await valid(), store = await createReceiptConsumptionStore(p);
  const first = check(await store.consume(input), 'CONSUMED'), name = (await markerNames(p))[0];
  await rm(join(p, name)); // fixture setup only: the production API never removes markers
  const target = join(p, name);
  if (kind === 'empty') await writeFile(target, '');
  if (kind === 'corrupt') await writeFile(target, 'not-json');
  if (kind === 'directory') await mkdir(target);
  if (kind === 'symlink') await symlink(join(p, 'absent'), target);
  const before = await lstat(target);
  check(await store.consume(input), 'REPLAY_OR_UNCERTAIN');
  const after = await lstat(target);
  assert.equal(after.ino, before.ino, `${kind} replaced`); assert.equal(first.grant_hash.startsWith('sha256:'), true);
 });
});

test('same issuer/receipt ID stays consumed after valid re-sign; new receipt ID is distinct', { skip: !POSIX }, async () => withRoot(async p => {
 const store = await createReceiptConsumptionStore(p), one = await scenario();
 check(await store.consume(render(one)), 'CONSUMED');
 one.context.request_revision = 2; one.payload.context_digest = contextDigest(one.context); one.payload.expires_at_ms += 1;
 check(await store.consume(render(one)), 'REPLAY_OR_UNCERTAIN');
 const two = await scenario(); two.payload.receipt_id = 'receipt-2';
 check(await store.consume(render(two)), 'CONSUMED');
 assert.equal((await markerNames(p)).length, 2);
}));

test('foreign, expired, revoked, invalid, missing and D1 denial allocate no marker', { skip: !POSIX }, async () => withRoot(async p => {
 const cases = [];
 let s = await scenario(); s.payload.issuer_id = 'foreign'; cases.push(render(s));
 s = await scenario(); s.context.evaluated_at_ms = s.payload.expires_at_ms; cases.push(render(s));
 s = await scenario(); s.registry.keys[0].status = 'revoked'; cases.push(render(s));
 s = await scenario(); s.context.actor_principal = 'foreign-actor'; cases.push(render(s));
 s = await scenario(); let x = render(s); x.receiptJson = x.receiptJson.replace(/.$/, 'x'); cases.push(x);
 s = await scenario(); x = render(s); delete x.receiptJson; cases.push(x);
 s = await scenario(); s.f.contract.allowed_effects = []; cases.push(render(s));
 const store = await createReceiptConsumptionStore(p);
 for (const input of cases) assert.notEqual((await store.consume(input)).consumption_status, 'CONSUMED');
 assert.deepEqual(await markerNames(p), []);
}));

test('unsafe roots and replacement fail closed', { skip: !POSIX }, async () => withRoot(async p => {
 await chmod(p, 0o755); await assert.rejects(createReceiptConsumptionStore(p)); await chmod(p, 0o700);
 const link = p + '-link'; await symlink(p, link); await assert.rejects(createReceiptConsumptionStore(link)); await rm(link);
 const store = await createReceiptConsumptionStore(p), moved = p + '-old'; await rename(p, moved); await mkdir(p, 0o700);
 try { check(await store.consume(await valid()), 'NOT_CONSUMED'); assert.deepEqual(await markerNames(p), []); }
 finally { await rm(p, { recursive: true, force: true }); await rename(moved, p); }
}));

test('captured input cannot be substituted across verifier await; reports echo no private data', { skip: !POSIX }, async () => withRoot(async p => {
 const input = await valid(), original = { ...input }, store = await createReceiptConsumptionStore(p);
 const pending = store.consume(input);
 for (const key of Object.keys(input)) input[key] = '{}';
 const r = check(await pending, 'CONSUMED'), text = j(r);
 const receipt = JSON.parse(original.receiptJson), context = JSON.parse(original.contextJson);
 for (const privateValue of [receipt.signature, receipt.payload.receipt_id, context.actor_principal, p]) assert.equal(text.includes(privateValue), false);
 let touched = false; const accessor = { ...original };
 Object.defineProperty(accessor, 'receiptJson', { enumerable: true, get() { touched = true; return original.receiptJson; } });
 check(await store.consume(accessor), 'NOT_CONSUMED'); assert.equal(touched, false);
}));

test('unsupported hosts return UNSUPPORTED without consuming or path I/O', { skip: POSIX }, async () => {
 const store = await createReceiptConsumptionStore('not-an-absolute-path');
 check(await store.consume(await valid()), 'UNSUPPORTED');
});

test('experiment leaves public package boundaries unchanged', async () => {
 const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
 assert.equal(j(pkg.files ?? []).includes('task-consumption'), false);
 assert.equal(j(pkg.exports ?? {}).includes('task-consumption'), false);
});
