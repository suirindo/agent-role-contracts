/**
 * TEST-HOST integration for the PR91 dispatch-target adapter (#69). Everything here is test-owned: ephemeral Ed25519 issuer
 * keys (memory only, never written), a synthetic registry/actor/policy, and a serialized verify->consume->dispatch path that
 * sends one synthetic payload to a separate loopback receiver. It is NOT production or native host authority: a PERMIT here
 * means only that this test host's own fixture policy matched. All sockets are 127.0.0.1.
 */
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
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

/** Spawn one receiver child process; returns { id, port, logPath, stop() }. */
async function startReceiver(dir, id, delayMs = 0) {
 const logPath = join(dir, id + '.log.jsonl');
 const child = spawn(process.execPath, [RECEIVER_SCRIPT, id, logPath, String(delayMs)], { stdio: ['ignore', 'pipe', 'inherit'] });
 const exited = new Promise(r => child.once('exit', (code, signal) => r({ code, signal })));
 const line = await new Promise((resolve, reject) => {
  let buf = '';
  child.stdout.on('data', d => { buf += d; if (buf.includes('\n')) resolve(buf.split('\n')[0]); });
  child.once('exit', () => reject(new Error('receiver exited early')));
 });
 const { port } = JSON.parse(line);
 return { id, port, logPath, pid: child.pid, async stop() { child.kill('SIGTERM'); return exited; } };
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
export async function createTestHost({ sendTimeoutMs = 1000 } = {}) {
 const dir = await realpath(await mkdtemp(join(tmpdir(), 'arc69-test-host-')));
 await chmod(dir, 0o700);
 const store = join(dir, 'store'); await (await import('node:fs/promises')).mkdir(store, { mode: 0o700 });
 const receivers = {};
 const identities = new Map();     // receiver_id -> logical target (host-owned test table)
 const revisions = new Map();      // request_id -> current revision
 const resolved = new Map();       // operation digest -> receiver port/id pinned at resolve time
 const state = { route: 'recv-a', resolves: 0, sends: 0, sendOutcomes: [], hostCalls: 0 };
 const add = async (id, target, delayMs = 0) => { receivers[id] = await startReceiver(dir, id, delayMs); identities.set(id, target); return receivers[id]; };
 await add('recv-a', APPROVED); await add('recv-b', OTHER);
 let adapter;
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
  async close() {
   const exits = await Promise.all(Object.values(receivers).map(r => r.stop()));
   await rm(dir, { recursive: true, force: true });
   return exits;
  },
 };
}
