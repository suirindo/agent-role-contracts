/** Source-only Linux/overlayfs laboratory pilot. Never a package/runtime authority. */
import { constants, mkdtempSync, lstatSync, realpathSync, statfsSync, openSync, fstatSync,
 closeSync, writeSync, fsyncSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { describeTaskAction, validateTaskActionBinding } from '../../src/action-binding.mjs';
import { validateFilesystemWriteMapping } from '../../src/filesystem-write-adapter.mjs';
import { canonical } from '../../src/schema.mjs';

export const hashBytes = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const authorities = new WeakSet(), roots = new WeakSet();
const fail = code => { throw Error(code); };
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => canonical(a) === canonical(b);
const exact = (obj, keys) => obj && Object.getPrototypeOf(obj) === Object.prototype &&
 Object.keys(obj).sort().join(',') === keys.slice().sort().join(',') &&
 Object.values(Object.getOwnPropertyDescriptors(obj)).every(d => 'value' in d);
const OVERLAYFS = 0x794c7630;
export function supportedHost(parent) {
 return process.platform === 'linux' && Number(process.versions.node.split('.')[0]) === 24 &&
  !!constants.O_NOFOLLOW && typeof process.getuid === 'function' && statfsSync(parent).type === OVERLAYFS;
}
/** Host-only provisioner: no caller-selected existing root can be admitted. */
export function createPilotWorkspace(parent) {
 if (!supportedHost(parent)) fail('UNSUPPORTED_HOST');
 const root = mkdtempSync(join(realpathSync(parent), 'arc-write-pilot-'));
 const workspace = Object.freeze({ root, profile: 'linux-overlayfs-exclusive/0.1' });
 roots.add(workspace);
 return workspace;
}
function rootCheck(workspace) {
 if (!roots.has(workspace) || !supportedHost(workspace.root)) fail('UNSUPPORTED_WORKSPACE');
 const s = lstatSync(workspace.root);
 if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) ||
  realpathSync(workspace.root) !== workspace.root) fail('WORKSPACE_NOT_EXCLUSIVE');
}
function destination(workspace, path) {
 rootCheck(workspace);
 // Conservative single grammar, no dot segments, backslashes, aliases or wildcards.
 if (typeof path !== 'string' || path.length > 512 ||
  !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(path) ||
  path.split('/').some(p => p.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))
  fail('PATH_REJECTED');
 const file = resolve(workspace.root, path);
 if (!file.startsWith(workspace.root + '/')) fail('PATH_REJECTED');
 let parent = workspace.root;
 for (const segment of path.split('/').slice(0, -1)) {
  parent = join(parent, segment);
  const s = lstatSync(parent);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077))
   fail('PARENT_REJECTED');
 }
 if (realpathSync(dirname(file)) !== dirname(file)) fail('PARENT_REJECTED');
 try { lstatSync(file); fail('DESTINATION_EXISTS'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
 }
 return file;
}

/** LAB ONLY: authenticated source is the host test fixture, not any real human.
 * Kept out of worker API. No trusted=true input or production verifier fallback.
 */
export function createTestAuthorityStore() {
 const records = new Map();
 let fault = 'none';
 const check = (id, target) => {
  const r = records.get(id);
  if (fault !== 'none' || !r || r.revoked || r.used || r.expires <= Date.now() ||
   r.source !== 'host-test-fixture' || !same(r.target, target)) fail('AUTHORITY_REJECTED');
  return r;
 };
 const store = Object.freeze({
  label: 'TEST ONLY — host fixture authority; no human authentication',
  grant(target, { expires = Date.now() + 60000 } = {}) {
   if (!Number.isFinite(expires)) fail('INVALID_EXPIRY');
   const id = randomUUID();
   records.set(id, { target: copy(target), expires, revoked: false, used: false, source: 'host-test-fixture' });
   return id;
  },
  revoke(id) { const r = records.get(id); if (r) r.revoked = true; },
  setFault(mode) { fault = mode; },
  async verify(id, target) {
   if (fault === 'timeout') return new Promise(() => {});
   check(id, target); return true;
  },
  consume(id, target) { check(id, target).used = true; },
 });
 authorities.add(store);
 return store;
}

/** Trusted host control plane. Never expose this object to an untrusted worker.
 * Worker receives only a channel-bound submit closure / opaque admission ID.
 * No caller-provided executor callbacks: the frozen bytes reach our fixed executor.
 */
export function createWritePilot({ workspace, authority, context, mode, timeoutMs = 100, comparison = 'arc' }) {
 rootCheck(workspace);
 if (!['arc', 'native-only'].includes(comparison)) fail('INVALID_COMPARISON');
 if (!['shadow', 'enforce'].includes(mode)) fail('EXPLICIT_MODE_REQUIRED');
 if (!authorities.has(authority)) fail('TRUSTED_TEST_VERIFIER_REQUIRED');
 if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000) fail('INVALID_TIMEOUT');
 let current = copy(context);
 const session = randomUUID(), admissions = new Map(), audit = [];
 let executorCalls = 0;
 function hostContext() {
  const c = copy(current);
  if (!c || !c.bundle || !c.task || !c.principal || !c.role || !c.run ||
   !c.policyRevision || !Array.isArray(c.assignments) || !c.native ||
   !Array.isArray(c.native.paths) || typeof c.native.write !== 'boolean') fail('CONTEXT_MISSING');
  return c;
 }
 function target(c, subject, action) {
  return { subject, operation: 'write_file', path: action.parameters.path,
   content_sha256: action.parameters.content_sha256, task: c.task.id, run: c.run, session,
   principal: c.principal, role: c.role, workspace: workspace.root, policyRevision: c.policyRevision };
 }
 async function describe(action, binding) {
  const c = hostContext(), a = copy(action), b = copy(binding);
  const args = [c.bundle, c.task, a].map(JSON.stringify);
  const s = await describeTaskAction(...args);
  if (!s.valid) fail('DECLARATION_REJECTED');
  return { c, a, b, target: target(c, s.subject_digest, a) };
 }
 async function boundedVerify(id, value) {
  let timer;
  try {
   const ok = await Promise.race([authority.verify(id, copy(value)), new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('VERIFIER_TIMEOUT')), timeoutMs);
   })]);
   if (ok !== true) fail('VERIFIER_DENIED');
  } finally { clearTimeout(timer); }
 }
 async function submit(admissionId, request) {
  let frozen, path;
  const started = performance.now();
  const log = (outcome, reason, extra = {}) => {
   const record = { admission: typeof admissionId === 'string' ? admissionId : null, mode,
    outcome, reason, comparison, recorded_at: new Date().toISOString(),
    expected_target: admission?.target ?? null,
    received: frozen ? { operation: 'write_file', path: typeof path === 'string' ? path.slice(0, 512) : null,
     content_sha256: hashBytes(frozen), byte_length: frozen.length } : null,
    executor_calls: executorCalls, elapsed_ms: performance.now() - started, ...extra };
   audit.push(copy(record)); return copy(record);
  };
  // Claim synchronously, before any await. Failed attempts burn the admission too.
  const admission = admissions.get(admissionId);
  if (!admission || admission.state !== 'fresh') return log('rejected_before_execution', 'ADMISSION_REUSED_OR_FOREIGN');
  admission.state = 'claimed';
  try {
   if (!exact(request, ['operation', 'path', 'bytes']) || request.operation !== 'write_file' ||
    !(request.bytes instanceof Uint8Array) || request.bytes.byteLength > 1048576 ||
    request.bytes.buffer instanceof SharedArrayBuffer) fail('REQUEST_REJECTED');
   path = request.path;
   // Own buffer: neither the worker nor a verifier ever receives this reference.
   frozen = Buffer.from(request.bytes);
   const c = hostContext();
   if (!same(c, admission.c)) fail('CONTEXT_CHANGED');
   if (comparison === 'arc') {
   const args = [c.bundle, c.task, admission.a].map(JSON.stringify);
   const binding = await validateTaskActionBinding(...args, JSON.stringify(admission.b));
   if (!binding.valid) fail('G1_BINDING_REJECTED');
   const mapping = await validateFilesystemWriteMapping(...args, JSON.stringify({
    schema_version: '0.1', subject_digest: binding.subject_digest,
    operation: 'write_file', path, content_sha256: hashBytes(frozen),
   }));
   if (!mapping.valid) fail('G2_MAPPING_REJECTED');
   if (!mapping.eligible_executors.includes(c.role) ||
    !c.assignments.some(v => v.role === c.role && v.principal === c.principal &&
      v.task === c.task.id && v.run === c.run)) fail('ACTOR_NOT_ASSIGNED_ELIGIBLE_WRITER');
   }
   if (!c.native.write || !c.native.paths.includes(path)) fail('NATIVE_PERMISSION_DENIED');
   destination(workspace, path);
   if (comparison === 'arc') await boundedVerify(admission.approval, admission.target);
   // Recheck after every asynchronous boundary and immediately before consume/I/O.
   if (!same(hostContext(), c)) fail('CONTEXT_CHANGED');
   const file = destination(workspace, path);
   if (mode === 'shadow') return log('shadow_would_allow', 'NOT_EXECUTED');
   if (comparison === 'arc') authority.consume(admission.approval, admission.target);
   admission.state = 'consumed';
   // Synchronous fixed executor. O_EXCL prevents any overwrite; no async path swap
   // callbacks. Parent-path races by hostile host processes remain OUT OF SCOPE.
   executorCalls++;
   let fd, phase = 'open';
   try {
    fd = openSync(file, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    phase = 'write';
    const s = fstatSync(fd);
    if (!s.isFile() || s.nlink !== 1) fail('NONREGULAR_DESTINATION');
    let offset = 0;
    while (offset < frozen.length) {
     const count = writeSync(fd, frozen, offset, frozen.length - offset, offset);
     if (count <= 0) fail('SHORT_WRITE');
     offset += count;
    }
    fsyncSync(fd);
    phase = 'readback';
    const actual = readFileSync(fd);
    if (!actual.equals(frozen)) fail('READBACK_MISMATCH');
    closeSync(fd); fd = undefined;
    admission.state = 'completed';
    return log('committed', 'READBACK_MATCH', { path, content_sha256: hashBytes(actual), byte_length: actual.length });
   } catch (error) {
    // Never return to fresh, delete partial files, restore approval, or retry.
    admission.state = 'uncertain';
    return log(phase === 'readback' ? 'execution_result_unknown' : 'write_failed',
     'IO_FAILURE', { phase, io_code: error.code ?? error.message, automatic_retry: false });
   } finally { if (fd !== undefined) { try { closeSync(fd); } catch { /* already uncertain */ } } }
  } catch (error) {
   return log('rejected_before_execution', error.message);
  }
 }
 return Object.freeze({
  // These are ADMIN methods, not worker-callable RPCs.
  async prepare(action, binding) { return copy((await describe(action, binding)).target); },
  async admit(action, binding, approval) {
   const admission = await describe(action, binding);
   const id = randomUUID(); admissions.set(id, { ...admission, approval, state: 'fresh' }); return id;
  },
  updateContext(value) { current = copy(value); },
  workerChannel(admissionId) { return Object.freeze({ submit: request => submit(admissionId, request) }); },
  audit() { return copy(audit); },
  stats() { return { executorCalls, session, protected_entries: readdirSync(workspace.root).length }; },
 });
}
