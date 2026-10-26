/** Fixed synthetic loopback laboratory, not a general execution broker. */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { describeEffectRequest, evaluateEffectRequest } from '../policy.mjs';
import { digest, parse } from '../contract.mjs';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export const FIXTURE = 'ARC synthetic loopback fixture; no customer data.\n';
export const TOOLS = Object.freeze([
 Object.freeze({ name: 'read_file', input: 'fixed-fixture-only' }),
 Object.freeze({ name: 'send_report', input: 'opaque-handle-and-declaration-only', destination: 'registered-loopback-only' }),
]);
const TOOL_DIGEST = sha(JSON.stringify(TOOLS));
const ADAPTER_DIGEST = sha(fs.readFileSync(new URL('./host.mjs', import.meta.url)));
const J = JSON.stringify;
function submitInput(text) {
 const v = parse(text);
 if (!v || typeof v !== 'object' || Array.isArray(v) ||
     Object.keys(v).some(k => !['handle','bindingJson'].includes(k)) ||
     typeof v.handle !== 'string' || v.handle.length > 128 ||
     (v.bindingJson !== undefined && typeof v.bindingJson !== 'string')) throw new Error('LAB_INPUT_INVALID');
 return v;
}
function sendFixed(port, body) {
 return new Promise(resolve => {
  let settled = false, deadline;
  const finish = value => { if (!settled) { settled = true; clearTimeout(deadline); resolve(value); } };
  const req = http.request({
   host: '127.0.0.1', port, path: '/report', method: 'POST', agent: false,
   headers: { 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length },
  }, res => {
   let bytes = 0;
   res.on('data', chunk => { bytes += chunk.length; if (bytes > 1024) res.destroy(); });
   res.on('end', () => finish({ execution_status: 'RESPONSE_OBSERVED', http_status: res.statusCode }));
   res.on('error', () => finish({ execution_status: 'REMOTE_EFFECT_UNKNOWN' }));
  });
  deadline = setTimeout(() => { req.destroy(); finish({ execution_status: 'REMOTE_EFFECT_UNKNOWN' }); }, 3000);
  req.setTimeout(2000, () => req.destroy());
  req.on('error', () => finish({ execution_status: 'REMOTE_EFFECT_UNKNOWN' }));
  req.end(body); // One bounded request; no redirects, proxy configuration or retry.
 });
}
/**
 * Trusted laboratory setup only. Arguments are not a worker API. Real identity,
 * native egress isolation and authenticated approvals are not implemented.
 */
export function createFixtureHost({ bundleJson, taskJson, allowSend, complete = true, receiverPort = null }) {
 if (typeof allowSend !== 'boolean' || typeof complete !== 'boolean' ||
     !(receiverPort === null || (Number.isInteger(receiverPort) && receiverPort > 0 && receiverPort < 65536))) throw new Error('LAB_SETUP_INVALID');
 const bundle = parse(bundleJson), task = parse(taskJson);
 const dir = fs.mkdtempSync(join(tmpdir(), 'arc-cte-lab-'));
 const file = join(dir, 'notes.txt');
 try { fs.writeFileSync(file, FIXTURE, { flag: 'wx', mode: 0o600 }); }
 catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
 const expected = sha(Buffer.from(FIXTURE));
 let handle = null, ownedBytes = null, closed = false, busy = false, consumed = false, dispatches = 0;
 const contract = {
  schema_version: '0.1-draft', profile: 'cross-tool-effects/0.1-draft', id: 'loopback-fixture', revision: 1,
  task_binding: { canonicalization: 'JCS/RFC8785', bundle_task_digest: digest('arc-ctei-task/0.1', { bundle, task }) },
  allowed_effects: allowSend ? ['filesystem.read','network.send'] : ['filesystem.read'],
  read_sources: ['fixture-public'], destinations: ['lab.receiver'],
  flows: [{ id: 'public', effect: 'network.send', destination_ref: 'lab.receiver', source_refs: ['trusted-input','fixture-public'], allowed_labels: ['public'] }],
  provenance: { mode: 'session-union', on_missing: 'deny', allow_declassification: false },
  limits: { max_read_bytes: 1048576, max_egress_bytes_per_action: 65536, max_egress_bytes_per_run: 65536, max_egress_calls_per_run: 1, max_events: 256 },
 };
 const status = (policy_result, code) => ({
  policy_result, diagnostic: code, executor_starts: dispatches, execution_status: 'NOT_PERFORMED',
  authority_status: 'SYNTHETIC_LAB_ONLY', coverage: 'FIXED_LAB_FUNCTION_ONLY',
 });
 function snapshot(id) {
  if (closed || !ownedBytes || id !== handle) throw new Error('LAB_HANDLE_UNAVAILABLE');
  return {
   bundleJson, taskJson, contractJson: J(contract),
   requestJson: J({ effect: 'network.send', run_id: 'synthetic-run', session_id: 'synthetic-session', tenant: 'synthetic-tenant',
    source_refs: ['fixture-public'], destination_ref: 'lab.receiver', content_sha256: sha(ownedBytes), byte_length: ownedBytes.length,
    adapter_digest: ADAPTER_DIGEST, tool_definition_digest: TOOL_DIGEST }),
   provenanceJson: J({ run_id: 'synthetic-run', session_id: 'synthetic-session', tenant: 'synthetic-tenant', complete,
    sources: [{ source_ref: 'trusted-input', classification: 'public', content_sha256: sha(bundleJson + taskJson) },
     { source_ref: 'fixture-public', classification: 'public', content_sha256: expected }],
    exposure_source_refs: ['trusted-input','fixture-public'],
    usage: { egress_bytes: consumed ? ownedBytes.length : 0, egress_calls: consumed ? 1 : 0, event_count: 1 } }),
  };
 }
 const worker = Object.freeze({
  read_file(inputJson = '{}') {
   if (closed || busy || handle) throw new Error('LAB_READ_UNAVAILABLE');
   const input = parse(inputJson);
   if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('LAB_INPUT_INVALID');
   const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
   try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== Buffer.byteLength(FIXTURE)) throw new Error('LAB_FIXTURE_CHANGED');
    const storage = Buffer.alloc(Buffer.byteLength(FIXTURE) + 1);
    const count = fs.readSync(fd, storage, 0, storage.length, 0);
    const bytes = storage.subarray(0, count);
    if (count !== Buffer.byteLength(FIXTURE) || sha(bytes) !== expected) throw new Error('LAB_FIXTURE_CHANGED');
    ownedBytes = Buffer.from(bytes); handle = randomUUID();
    return Object.freeze({ handle, byte_length: bytes.length, content_sha256: expected });
   } finally { fs.closeSync(fd); }
  },
  async send_report(inputJson) {
   if (closed) return status('DENY','LAB_CLOSED');
   if (busy || consumed) return status('DENY','LAB_ALREADY_CONSUMED_OR_BUSY');
   let input;
   try { input = submitInput(inputJson); } catch { return status('REJECT_INPUT','LAB_INPUT_INVALID'); }
   let current;
   try { current = snapshot(input.handle); } catch { return status('DENY','LAB_HANDLE_UNAVAILABLE'); }
   busy = true;
   try {
    // Own immutable bytes before any await. Worker cannot replace URL/body/context.
    const body = Buffer.from(ownedBytes);
    const report = await evaluateEffectRequest({ ...current, ...(input.bindingJson === undefined ? {} : { bindingJson: input.bindingJson }) });
    if (report.policy_result !== 'ALLOW') return { ...status(report.policy_result,report.diagnostics[0]?.code), policy_report: report };
    if (closed) return status('DENY','LAB_CLOSED');
    if (receiverPort === null) return status('UNKNOWN','LAB_TRANSPORT_DISABLED');
    consumed = true; dispatches++; // Synchronous reservation before fixed transport.
    const result = await sendFixed(receiverPort, body);
    return { ...status('ALLOW',null), ...result, request_sha256: sha(body), request_bytes: body.length, policy_report: report };
   } finally { busy = false; }
  },
 });
 const owner = Object.freeze({
  async describe(id) { return describeEffectRequest(snapshot(id)); },
  close() {
   if (busy) throw new Error('LAB_BUSY');
   if (!closed) { closed = true; ownedBytes?.fill(0); ownedBytes = null; fs.rmSync(dir, { recursive: true, force: true }); }
  },
 });
 return Object.freeze({ worker, owner, tool_definition_digest: TOOL_DIGEST, adapter_digest: ADAPTER_DIGEST });
}
