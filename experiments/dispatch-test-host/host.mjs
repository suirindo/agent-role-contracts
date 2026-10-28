/**
 * TEST-HOST integration for the PR91 dispatch-target adapter (#69). Everything here is test-owned: ephemeral Ed25519 issuer
 * keys (memory only, never written), a synthetic registry/actor/policy, and a serialized verify->consume->dispatch path that
 * sends one synthetic payload to a separate loopback receiver. It is NOT production or native host authority: a PERMIT here
 * means only that this test host's own fixture policy matched. All sockets are 127.0.0.1.
 */
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDispatchTargetAdapter } from '../task-consumption/dispatch-target.mjs';
import { scenario, render, NOW } from '../task-approval/fixtures.mjs';
import { contextDigest } from '../task-approval/approval.mjs';
import { digest } from '../cross-tool-effects/contract.mjs';

export const TEST_AUTHORITY = 'TEST_HOST_ONLY_NOT_PRODUCTION';
export const PAYLOAD = Buffer.from('synthetic-test-line: no customer data\n', 'utf8');
export const APPROVED = Object.freeze({ scheme: 'https', host: 'receiver-a.lab.test', port: 443, path: '/inbox', tenant: 'tenant-a' });
export const OTHER = Object.freeze({ ...APPROVED, host: 'receiver-b.lab.test' });
const LOOPBACK = '127.0.0.1';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const RECEIVER_SCRIPT = new URL('./receiver.mjs', import.meta.url).pathname;

export const RECEIVER_PROCESS_IDENTITY = Object.freeze({
 same_uid_as_test_host: true, separation: 'separate process only (same UID, same machine, same filesystem permissions)',
 receiver_independence: 'UNPROVEN', effect_independence: 'UNPROVEN: the test host can signal, read and rewrite the receiver and its log' });
const STARTUP_TIMEOUT_MS = 5000, STOP_TIMEOUT_MS = 2000, KILL_TIMEOUT_MS = 2000;
const within = (promise, ms) => new Promise(resolve => { const t = setTimeout(() => resolve(null), ms); promise.then(v => { clearTimeout(t); resolve(v); }); });

/** Terminate a child: SIGTERM, bounded wait, then SIGKILL, bounded wait. Returns the exit record, or { unreaped: true } if it never exited. */
async function terminate(child, exited, stopMs = STOP_TIMEOUT_MS, killMs = KILL_TIMEOUT_MS) {
 let done = await within(exited, 0);
 if (done) return done;
 try { child.kill('SIGTERM'); } catch { /* already gone */ }
 done = await within(exited, stopMs);
 if (done) return done;
 try { child.kill('SIGKILL'); } catch { /* already gone */ }
 return (await within(exited, killMs)) ?? { code: null, signal: null, unreaped: true };
}

/**
 * Spawn one receiver child process; returns { id, port, logPath, stop() }. Any startup failure (spawn error, early exit, no
 * handshake before the deadline, malformed handshake) kills and reaps the child before the error is thrown.
 */
async function startReceiver(dir, id, delayMs = 0, { script = RECEIVER_SCRIPT, startupTimeoutMs = STARTUP_TIMEOUT_MS, stopTimeoutMs = STOP_TIMEOUT_MS, killTimeoutMs = KILL_TIMEOUT_MS } = {}) {
 const logPath = join(dir, id + '.log.jsonl');
 const child = spawn(process.execPath, [script, id, logPath, String(delayMs)], { stdio: ['ignore', 'pipe', 'inherit'] });
 const exited = new Promise(r => { child.once('exit', (code, signal) => r({ code, signal })); child.once('error', e => r({ code: null, signal: null, error: e.message })); });
 const stop = () => terminate(child, exited, stopTimeoutMs, killTimeoutMs);
 let timer;
 try {
  const line = await new Promise((resolve, reject) => {
   let buf = '';
   timer = setTimeout(() => reject(new Error('receiver ' + id + ' startup timeout')), startupTimeoutMs);
   child.stdout.on('data', d => { buf += d; if (buf.includes('\n')) resolve(buf.split('\n')[0]); });
   exited.then(() => reject(new Error('receiver ' + id + ' exited early')));
  });
  const { port } = JSON.parse(line);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('receiver ' + id + ' bad handshake');
  return { id, port, logPath, pid: child.pid, stop };
 } catch (e) {
  const exit = await stop();
  if (exit.unreaped) e.message += ' (child ' + child.pid + ' could not be reaped)';
  throw e;
 } finally { clearTimeout(timer); }
}
async function readLog(r) {
 try { return (await readFile(r.logPath, 'utf8')).split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch { return []; }
}
function request(opts, body, timeoutMs) {
 return new Promise((resolve, reject) => {
  const req = http.request({ host: LOOPBACK, ...opts, agent: false, timeout: timeoutMs }, res => {
   const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
  req.end(body);
 });
}

/**
 * Create a test host. `receivers` is a map of receiver_id -> { logical target, delayMs }. The host-owned identity table maps a
 * receiver identity to the logical target it stands for; `route` says which receiver a logical send actually reaches.
 */
export async function createTestHost({ sendTimeoutMs = 1000, receiverOptions = {} } = {}) {
 const created = await mkdtemp(join(tmpdir(), 'arc69-test-host-'));
 let dir = created;
 const receivers = {};
 const identities = new Map();     // receiver_id -> logical target (host-owned test table)
 const revisions = new Map();      // request_id -> current revision
 const resolved = new Map();       // operation digest -> receiver port/id pinned at resolve time
 const state = { route: 'recv-a', resolves: 0, sends: 0, sendOutcomes: [], hostCalls: 0 };
 const optsFor = id => ({ ...receiverOptions, ...(receiverOptions.byId?.[id] ?? {}) });
 const add = async (id, target, delayMs = 0) => { receivers[id] = await startReceiver(dir, id, delayMs, optsFor(id)); identities.set(id, target); return receivers[id]; };
 let adapter, closing, store;
 // Idempotent teardown: every receiver is stopped (each bounded) and the tempdir removed even if some step fails.
 const teardown = () => closing ??= (async () => {
  const stops = await Promise.allSettled(Object.values(receivers).map(r => r.stop()));
  const removed = await Promise.allSettled([rm(dir, { recursive: true, force: true })]);
  const failures = [...stops, ...removed].filter(x => x.status === 'rejected').map(x => x.reason);
  if (failures.length) throw new AggregateError(failures, 'test host teardown incomplete');
  return stops.map(x => x.value);
 })();
 try {
 dir = await realpath(created); await chmod(dir, 0o700);
 store = join(dir, 'store'); await mkdir(store, { mode: 0o700 });
 await add('recv-a', APPROVED); await add('recv-b', OTHER);
 const host = {
  now: () => NOW,
  currentRevision: async id => { state.hostCalls++; return revisions.get(id) ?? null; },
  transport: {
   async resolve(op, challenge) {
    state.hostCalls++; state.resolves++;
    const r = receivers[state.route];
    const hit = await request({ port: r.port, path: '/__identity', method: 'GET' }, undefined, 1000);
    const claimed = JSON.parse(hit.body).receiver_id, target = identities.get(claimed);
    const opDigest = digest('arc-dtb-operation/0.1', op);
    if (target) resolved.set(opDigest, claimed);
    return { producer: { component: 'test-host-loopback-connector' }, operation_digest: opDigest, challenge, resolved_at_ms: NOW,
     resolution_status: 'RESOLVED', final: target ?? OTHER, final_hop_verified: Boolean(target), hops: [] };
   },
   async send(op, bytes) {
    state.hostCalls++; state.sends++;
    const opDigest = digest('arc-dtb-operation/0.1', op), pinned = resolved.get(opDigest);
    resolved.delete(opDigest);
    if (!pinned) throw new Error('no pinned resolution');
    const res = await request({ port: receivers[pinned].port, path: '/inbox', method: 'POST',
     headers: { 'content-type': 'application/octet-stream', 'x-op-digest': opDigest, 'x-expected-receiver-id': pinned } }, Buffer.from(bytes), sendTimeoutMs);
    if (res.status !== 204) throw new Error('receiver status ' + res.status);
   },
  },
 };
 adapter = await createDispatchTargetAdapter({ root: store, destinations: { 'lab.receiver': APPROVED }, host, timeoutMs: 2000 });

 // Serialization: one dispatch at a time through a single promise chain; a failure never breaks the chain.
 let tail = Promise.resolve();
 const serialized = fn => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };

 /** Issue a synthetic approval. `mutate(s)` may alter the scenario before signing; `after(input, s)` may tamper after. */
 async function issue({ body = PAYLOAD, requestId = 'test-host-req-1', revision = 1, mutate = () => {}, tamper = x => x } = {}) {
  const s = await scenario(f => {
   f.request.content_sha256 = sha(body); f.request.byte_length = body.length; f.request.destination_ref = 'lab.receiver';
   f.contract.destinations = ['lab.receiver']; f.contract.flows[0].destination_ref = 'lab.receiver';
   for (const x of f.provenance.sources) x.content_sha256 = sha(body);
  });
  Object.assign(s.context, { request_id: requestId, request_revision: revision, actor_principal: 'test-host-actor' });
  s.registry.keys[0].issuer_id = 'test-host-issuer'; s.payload.issuer_id = 'test-host-issuer';
  s.payload.receipt_id = 'test-host-receipt-' + requestId + '-' + revision + '-' + Math.random().toString(16).slice(2, 10);
  s.payload.context_digest = contextDigest(s.context);
  mutate(s);
  if (!revisions.has(requestId)) revisions.set(requestId, 1);
  return tamper(render(s), s);
 }
 const dispatch = (approvalInput, payloadBytes = PAYLOAD) => serialized(() => adapter.dispatch({ approvalInput, payloadBytes }));
 return {
  dir, state, receivers, issue, dispatch, adapter, revisions, add,
  setRoute: id => { state.route = id; },
  effects: async () => Object.fromEntries(await Promise.all(Object.values(receivers).map(async r => [r.id, await readLog(r)]))),
  close: teardown,
 };
 } catch (e) {
  // Transactional construction: any partial failure releases everything acquired so far, then the original error propagates.
  try { await teardown(); } catch (c) { e.cleanup_error = c; }
  throw e;
 }
}
