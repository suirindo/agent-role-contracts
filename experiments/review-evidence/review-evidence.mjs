/**
 * Review-evidence report (experimental, not a public ARC API).
 * Binds collector-observed Git facts to supplied, unauthenticated declarations.
 * It grants no permission, executes nothing, and never emits a single safety verdict.
 */
import { createHash } from 'node:crypto';
import { explainTask, describeTaskAction, validateTaskActionBinding } from '../../src/core.mjs';
import { scopeContains } from '../../src/validation.mjs';
import { parseJsonRejectDuplicateKeys } from '../../src/strict-json.mjs';
import { collect, EvidenceError } from './collect.mjs';

export { EvidenceError };
export const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_FINDINGS = 200;
const ID = /^[a-z0-9][a-z0-9._-]*$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TRUST_KEYS = new Set(['trusted', 'verified', 'authenticated', 'approved', 'safe', 'signature', 'signed', 'attestation', 'hmac', 'proof', 'authorized', 'verdict', 'result', 'overall', 'conclusion']);
const DIMENSIONS = ['declarations_consistency', 'artifact_binding', 'test_evidence', 'semantic_acceptance', 'authority', 'execution'];
const sha256 = text => createHash('sha256').update(text).digest('hex');
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sortedKeys = o => Object.keys(o).sort().join(',');

const MESSAGES = {
  REVIEW_DECLARATION_NOT_SUPPLIED: 'No G1 review/approval declaration was supplied; declared review is unknown.',
  ENVELOPE_TASK_MISMATCH: 'Envelope task_id differs from the task declaration id.',
  TASK_SCOPE_UNAVAILABLE: 'Task declares no single string inputs.scope to compare allowed paths against.',
  ALLOWED_PATH_WIDER_THAN_TASK_SCOPE: 'Allowed path is wider than the task scope declaration.',
  ALLOWED_PATH_OUTSIDE_ROLE_AUTHORITY: 'Allowed path is outside the routed write executor authority.',
  PROTECTED_PATH_INSIDE_ALLOWED: 'A protected path overlaps an allowed path.',
  BASELINE_NOT_ANCESTOR: 'Baseline commit is not an ancestor of the candidate commit.',
  PATH_OUT_OF_SCOPE: 'Changed path is not contained by any allowed path.',
  PROTECTED_PATH_CHANGED: 'A protected path changed.',
  PROTECTED_BLOCK_BASELINE_MISMATCH: 'Protected block hash does not match the baseline bytes.',
  PROTECTED_BLOCK_CHANGED: 'Protected block is absent or changed in the candidate.',
  PROTECTED_BLOCK_MOVED: 'Protected block exists unchanged but at different lines.',
  PROTECTED_BLOCK_AMBIGUOUS: 'Protected block text occurs more than once in the candidate.',
  PROTECTED_BLOCK_UNREADABLE: 'Protected file could not be measured as bounded UTF-8 text.',
  SURFACE_SYMLINK: 'Symlink surface is not interpreted.',
  SURFACE_SUBMODULE: 'Submodule surface is not interpreted.',
  SURFACE_BINARY_FILE: 'Binary file content is not interpreted.',
  SURFACE_UNSUPPORTED_MODE: 'Unsupported file mode is not interpreted.',
  SURFACE_NON_UTF8_PATH: 'Non-UTF-8 path cannot be compared with declared paths.',
  SURFACE_FILE_TOO_LARGE: 'File exceeds the per-file measurement limit.',
  SURFACE_TOTAL_BUDGET_EXCEEDED: 'File was not measured: total byte budget exhausted.',
  WORKTREE_UNTRACKED: 'Untracked files exist; the worktree surface is unobserved.',
  WORKTREE_DIRTY: 'Tracked worktree or index changes exist; the worktree surface is unobserved.',
  WORKTREE_CONFIG_UNSAFE: 'Local git config could execute or redirect during status; worktree was not inspected.',
  WORKTREE_STATUS_UNAVAILABLE: 'Worktree status could not be collected within bounds.',
  TEST_RECEIPT_NOT_SUPPLIED: 'No test receipt supplied; test evidence is missing.',
  TEST_SUBJECT_MISSING: 'Receipt names no candidate commit and cannot be bound.',
  TEST_SUBJECT_STALE: 'Receipt candidate commit differs from the envelope candidate.',
  TEST_BASELINE_STALE: 'Receipt baseline commit differs from the envelope baseline.',
  TEST_TREE_STALE: 'Receipt candidate tree differs from the observed candidate tree.',
  TEST_MISSING: 'Required test identity is absent from the receipt.',
  TEST_SKIPPED: 'Required test was skipped.',
  TEST_FAILED: 'Required test failed.',
  TEST_DUPLICATE_ID: 'Test identity appears more than once in the receipt.',
  TEST_ID_SUBSTITUTION: 'Receipt has as many tests as required but different identities.',
  TEST_UNREQUESTED_ID: 'Receipt contains a test identity that was not required.',
  TEST_SUMMARY_COUNT_MISMATCH: 'Receipt summary counts differ from its test list.',
  FORGED_TRUST_FIELD_IGNORED: 'Trust-like field in the supplied receipt was ignored.',
  SEMANTIC_ACCEPTANCE_UNKNOWN: 'Behavior of in-scope changes is not evaluated by this checker.',
  AUTHORITY_NOT_ESTABLISHED: 'No reviewer, approver or runtime authority is established by this report.',
  RECEIPT_AUTHENTICITY_UNSUPPORTED: 'Receipt authenticity and execution cannot be established from supplied metadata.',
};
const UNKNOWN_CODES = new Set(['REVIEW_DECLARATION_NOT_SUPPLIED', 'TASK_SCOPE_UNAVAILABLE', 'PROTECTED_BLOCK_MOVED', 'PROTECTED_BLOCK_AMBIGUOUS', 'PROTECTED_BLOCK_UNREADABLE', 'TEST_RECEIPT_NOT_SUPPLIED', 'TEST_UNREQUESTED_ID', 'FORGED_TRUST_FIELD_IGNORED', 'SEMANTIC_ACCEPTANCE_UNKNOWN', 'AUTHORITY_NOT_ESTABLISHED', 'RECEIPT_AUTHENTICITY_UNSUPPORTED', 'WORKTREE_UNTRACKED', 'WORKTREE_DIRTY', 'WORKTREE_CONFIG_UNSAFE', 'WORKTREE_STATUS_UNAVAILABLE']);

function parseInput(text, code) {
  if (typeof text !== 'string') throw new EvidenceError(code);
  if (Buffer.byteLength(text) > MAX_INPUT_BYTES) throw new EvidenceError('INPUT_TOO_LARGE');
  let value;
  try { value = parseJsonRejectDuplicateKeys(text, code); } catch { throw new EvidenceError(code); }
  if (!isObject(value)) throw new EvidenceError(code);
  return value;
}

function parseEnvelope(text) {
  const e = parseInput(text, 'ENVELOPE_INVALID');
  const bad = () => { throw new EvidenceError('ENVELOPE_INVALID'); };
  const allowed = new Set(['schema_version', 'task_id', 'baseline_commit', 'candidate_commit', 'allowed_paths', 'protected', 'required_tests', 'action_id']);
  if (Object.keys(e).some(k => !allowed.has(k)) || e.schema_version !== 'review-evidence-envelope/0.1') bad();
  if (typeof e.task_id !== 'string' || !ID.test(e.task_id) || e.task_id.length > 96) bad();
  if (e.action_id !== undefined && (typeof e.action_id !== 'string' || !ID.test(e.action_id) || e.action_id.length > 96)) bad();
  for (const k of ['baseline_commit', 'candidate_commit']) if (typeof e[k] !== 'string' || !COMMIT.test(e[k])) bad();
  const list = (v, max) => Array.isArray(v) && v.length > 0 && v.length <= max;
  if (!list(e.allowed_paths, 50) || e.allowed_paths.some(p => typeof p !== 'string' || !scopeContains(p, p)) || new Set(e.allowed_paths).size !== e.allowed_paths.length) bad();
  if (!list(e.required_tests, 500) || e.required_tests.some(t => typeof t !== 'string' || !t || t.length > 200) || new Set(e.required_tests).size !== e.required_tests.length) bad();
  if (!Array.isArray(e.protected) || e.protected.length > 50) bad();
  const ids = new Set();
  for (const p of e.protected) {
    if (!isObject(p) || typeof p.id !== 'string' || !ID.test(p.id) || ids.has(p.id) || typeof p.path !== 'string' || !scopeContains(p.path, p.path)) bad();
    ids.add(p.id);
    if (p.type === 'path') { if (sortedKeys(p) !== 'id,path,type') bad(); }
    else if (p.type === 'block') {
      if (sortedKeys(p) !== 'end_line,id,path,sha256,start_line,type' || p.path.endsWith('/**') || !Number.isInteger(p.start_line) || !Number.isInteger(p.end_line) || p.start_line < 1 || p.end_line < p.start_line || p.end_line - p.start_line > 10000 || !/^[0-9a-f]{64}$/.test(p.sha256 ?? '')) bad();
    } else bad();
  }
  return e;
}

function parseReceipt(text) {
  const r = parseInput(text, 'RECEIPT_INVALID');
  const bad = () => { throw new EvidenceError('RECEIPT_INVALID'); };
  if (r.schema_version !== 'review-evidence-test-receipt/0.1' || !isObject(r.subject) || !isObject(r.provenance) || !Array.isArray(r.tests) || r.tests.length > 2000) bad();
  for (const k of ['baseline_commit', 'candidate_commit', 'candidate_tree']) if (r.subject[k] !== undefined && typeof r.subject[k] !== 'string') bad();
  if (typeof r.provenance.producer !== 'string' || typeof r.provenance.kind !== 'string') bad();
  for (const t of r.tests) if (!isObject(t) || typeof t.id !== 'string' || !t.id || t.id.length > 200 || !['passed', 'failed', 'skipped'].includes(t.status)) bad();
  if (r.summary !== undefined && (!isObject(r.summary) || ['passed', 'failed', 'skipped'].some(k => r.summary[k] !== undefined && !Number.isInteger(r.summary[k])))) bad();
  return r;
}

function trustFields(value, prefix = '', depth = 0, out = []) {
  if (depth > 8 || out.length > 100) return out;
  if (Array.isArray(value)) value.slice(0, 2000).forEach((v, i) => trustFields(v, `${prefix}${i}/`, depth + 1, out));
  else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (TRUST_KEYS.has(k.toLowerCase())) out.push(prefix + k);
      trustFields(v, `${prefix}${k}/`, depth + 1, out);
    }
  }
  return out;
}

const safeLabel = v => (typeof v === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(v) ? v : null);

export async function evaluate({ repo, envelope: envelopeText, bundle, task, receipt: receiptText, binding }) {
  const env = parseEnvelope(envelopeText);
  const receipt = receiptText === undefined ? null : parseReceipt(receiptText);
  for (const text of [bundle, task, binding]) if (text !== undefined && (typeof text !== 'string' || Buffer.byteLength(text) > MAX_INPUT_BYTES)) throw new EvidenceError('INPUT_TOO_LARGE');
  if (typeof bundle !== 'string' || typeof task !== 'string') throw new EvidenceError('INPUT_MISSING');

  const g = collect(repo, { base: env.baseline_commit, candidate: env.candidate_commit });
  const findings = [];
  const add = (code, dimension, path) => findings.push({ code, dimension, severity: UNKNOWN_CODES.has(code) || code.startsWith('SURFACE_') ? 'unknown' : 'inconsistent', ...(path === undefined ? {} : { path }), message: MESSAGES[code] ?? 'Reported by the reused ARC declaration check.' });

  // declarations_consistency: reuse the ARC core checkers; no duplicate schema.
  const explained = explainTask(bundle, task);
  for (const e of explained.errors) add(e.code, 'declarations_consistency', e.path);
  if (explained.valid) {
    if (explained.task_id !== env.task_id) add('ENVELOPE_TASK_MISMATCH', 'declarations_consistency');
    const taskObj = JSON.parse(task);
    const scope = taskObj.inputs?.scope;
    for (const p of env.allowed_paths) {
      if (typeof scope === 'string') {
        if (!scopeContains(scope, p)) add('ALLOWED_PATH_WIDER_THAN_TASK_SCOPE', 'declarations_consistency', p);
        const probe = explainTask(bundle, JSON.stringify({ ...taskObj, inputs: { ...taskObj.inputs, scope: p } }));
        if (probe.errors.some(e => e.code === 'TASK_WRITE_SCOPE_OUTSIDE_AUTHORITY' || e.code === 'TASK_WRITE_SCOPE_INVALID')) add('ALLOWED_PATH_OUTSIDE_ROLE_AUTHORITY', 'declarations_consistency', p);
      }
    }
    if (typeof scope !== 'string') add('TASK_SCOPE_UNAVAILABLE', 'declarations_consistency');
  }
  for (const p of env.protected) {
    if (p.type === 'path' && env.allowed_paths.some(a => scopeContains(a, p.path) || scopeContains(p.path, a))) add('PROTECTED_PATH_INSIDE_ALLOWED', 'declarations_consistency', p.path);
  }

  const entryKey = e => e.path ?? e.path_hex;
  const side = s => s && [s.mode, s.oid];
  const inventoryDigest = sha256(JSON.stringify(g.changed.map(e => [entryKey(e), e.status, side(e.base), side(e.candidate)])));
  const action = {
    schema_version: '0.3',
    id: (env.action_id ?? `review-evidence-${env.task_id}`).slice(0, 96),
    kind: 'review-evidence',
    parameters: {
      baseline_commit: g.base.commit, candidate_commit: g.candidate.commit, candidate_tree: g.candidate.tree,
      inventory_sha256: inventoryDigest,
      allowed_paths_sha256: sha256([...env.allowed_paths].sort().join('\n')),
      protected_sha256: sha256(JSON.stringify(env.protected)),
      required_tests_sha256: sha256(JSON.stringify([...env.required_tests].sort())),
    },
  };
  const g1 = { subject_digest: null, binding_profile: null, binding_checked: false, binding_matches_subject: null };
  if (explained.valid) {
    const described = await describeTaskAction(bundle, task, JSON.stringify(action));
    if (!described.valid) for (const e of described.errors) add(e.code, 'declarations_consistency', e.path);
    else {
      g1.subject_digest = described.subject_digest;
      g1.binding_profile = described.binding_profile;
      if (binding === undefined) add('REVIEW_DECLARATION_NOT_SUPPLIED', 'declarations_consistency');
      else {
        const checked = await validateTaskActionBinding(bundle, task, JSON.stringify(action), binding);
        g1.binding_checked = true;
        g1.binding_matches_subject = checked.binding_matches_subject === true;
        const seen = new Set();
        for (const e of checked.errors) if (!seen.has(e.code + e.path)) { seen.add(e.code + e.path); add(e.code, 'declarations_consistency', e.path); }
      }
    }
  }

  // artifact_binding: observed Git facts against the envelope.
  if (!g.baseline_is_ancestor) add('BASELINE_NOT_ANCESTOR', 'artifact_binding');
  for (const e of g.changed) {
    if (e.path_utf8 && !env.allowed_paths.some(a => scopeContains(a, e.path))) add('PATH_OUT_OF_SCOPE', 'artifact_binding', e.path);
    for (const code of e.surfaces) add(code, 'artifact_binding', entryKey(e));
  }
  const protectedReport = [];
  for (const p of env.protected) {
    const item = { id: p.id, type: p.type, path: p.path, semantic_dependence: 'UNKNOWN' };
    if (p.type === 'path') {
      const hit = g.changed.some(e => e.path_utf8 && scopeContains(p.path, e.path));
      item.status = hit ? 'CHANGED' : 'UNCHANGED';
      if (hit) add('PROTECTED_PATH_CHANGED', 'artifact_binding', p.path);
    } else {
      item.status = blockStatus(g, p, add);
    }
    protectedReport.push(item);
  }
  const wt = g.worktree;
  if (wt.state === 'DIRTY') {
    if (wt.untracked) add('WORKTREE_UNTRACKED', 'artifact_binding');
    if (wt.dirty) add('WORKTREE_DIRTY', 'artifact_binding');
  } else if (wt.state === 'UNKNOWN') add(wt.reason, 'artifact_binding');

  // test_evidence: supplied metadata only; never proof of execution.
  const testReport = { supplied: receipt !== null, provenance: { origin: 'supplied_ci_metadata', authority: 'UNAUTHENTICATED_SUPPLIED', producer: null, kind: null }, required_count: env.required_tests.length };
  if (!receipt) add('TEST_RECEIPT_NOT_SUPPLIED', 'test_evidence');
  else {
    testReport.provenance.producer = safeLabel(receipt.provenance.producer);
    testReport.provenance.kind = safeLabel(receipt.provenance.kind);
    const subj = receipt.subject;
    if (subj.candidate_commit === undefined) add('TEST_SUBJECT_MISSING', 'test_evidence');
    else if (subj.candidate_commit !== g.candidate.commit) add('TEST_SUBJECT_STALE', 'test_evidence');
    if (subj.baseline_commit !== undefined && subj.baseline_commit !== g.base.commit) add('TEST_BASELINE_STALE', 'test_evidence');
    if (subj.candidate_tree !== undefined && subj.candidate_tree !== g.candidate.tree) add('TEST_TREE_STALE', 'test_evidence');
    const rank = { passed: 0, skipped: 1, failed: 2 };
    const byId = new Map(), dups = new Set();
    for (const t of receipt.tests) {
      if (byId.has(t.id)) { dups.add(t.id); if (rank[t.status] > rank[byId.get(t.id)]) byId.set(t.id, t.status); } else byId.set(t.id, t.status);
    }
    for (const id of dups) add('TEST_DUPLICATE_ID', 'test_evidence', id);
    const required = new Set(env.required_tests);
    const missing = env.required_tests.filter(id => !byId.has(id));
    const extra = [...byId.keys()].filter(id => !required.has(id));
    for (const id of missing) add('TEST_MISSING', 'test_evidence', id);
    for (const id of env.required_tests) {
      if (byId.get(id) === 'skipped') add('TEST_SKIPPED', 'test_evidence', id);
      if (byId.get(id) === 'failed') add('TEST_FAILED', 'test_evidence', id);
    }
    for (const id of extra) add('TEST_UNREQUESTED_ID', 'test_evidence', id);
    if (missing.length && extra.length && receipt.tests.length === env.required_tests.length) add('TEST_ID_SUBSTITUTION', 'test_evidence');
    if (receipt.summary) {
      const counts = { passed: 0, failed: 0, skipped: 0 };
      for (const t of receipt.tests) counts[t.status] += 1;
      if (['passed', 'failed', 'skipped'].some(k => receipt.summary[k] !== undefined && receipt.summary[k] !== counts[k])) add('TEST_SUMMARY_COUNT_MISMATCH', 'test_evidence');
    }
    for (const field of trustFields(receipt)) add('FORGED_TRUST_FIELD_IGNORED', 'test_evidence', field);
    testReport.listed_count = receipt.tests.length;
    add('RECEIPT_AUTHENTICITY_UNSUPPORTED', 'authority');
  }

  // semantic_acceptance and authority are never established here.
  const inScope = g.changed.filter(e => e.path_utf8 && env.allowed_paths.some(a => scopeContains(a, e.path)));
  add('SEMANTIC_ACCEPTANCE_UNKNOWN', 'semantic_acceptance');
  add('AUTHORITY_NOT_ESTABLISHED', 'authority');

  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  findings.sort((a, b) => order(DIMENSIONS.indexOf(a.dimension), DIMENSIONS.indexOf(b.dimension)) || order(a.code, b.code) || order(a.path ?? '', b.path ?? ''));
  const status = dimension => {
    const own = findings.filter(f => f.dimension === dimension);
    return own.some(f => f.severity === 'inconsistent') ? 'INCONSISTENT' : own.length ? 'UNKNOWN' : 'CONSISTENT';
  };
  const truncated = findings.length > MAX_FINDINGS;

  return {
    report_kind: 'review-evidence/0.1',
    experimental: true,
    verdict: 'NO_SINGLE_VERDICT',
    subject: {
      object_format: g.object_format, baseline: g.base, candidate: g.candidate, baseline_is_ancestor: g.baseline_is_ancestor,
      provenance: { origin: 'collector_observed_git', authority: 'OBSERVED_BY_COLLECTOR' },
    },
    declarations: {
      provenance: { origin: 'supplied_declaration', authority: 'UNAUTHENTICATED_SUPPLIED' },
      task_id: env.task_id, allowed_paths: [...env.allowed_paths], required_tests: [...env.required_tests],
    },
    g1,
    inventory: { complete: true, count: g.changed.length, entries: g.changed },
    protected: protectedReport,
    worktree: wt,
    test_receipt: testReport,
    dimensions: {
      declarations_consistency: { status: status('declarations_consistency') },
      artifact_binding: { status: status('artifact_binding') },
      test_evidence: { status: status('test_evidence') },
      semantic_acceptance: {
        status: 'UNKNOWN', objective_evaluated: false,
        per_path: inScope.map(e => ({ path: e.path, observed: 'CHANGE_INSIDE_ALLOWED_PATH', behavior: 'UNKNOWN', granularity: 'whole_file' })),
      },
      authority: { status: 'UNKNOWN', permissions_granted: false, reviewer_authenticated: false, receipt_authenticated: false },
      execution: { status: 'NOT_PERFORMED', execution_authorized: false },
    },
    limitations: {
      execution_authorized: false, permissions_granted: false, tests_executed_by_checker: false, candidate_code_executed: false, network_used: false,
      reviewer_authenticated: false, receipt_authenticated: false, semantic_acceptance_evaluated: false,
      human_setup_review_time_measured: false, second_task_reuse_measured: false,
    },
    findings: findings.slice(0, MAX_FINDINGS),
    findings_truncated: truncated,
  };
}

function blockStatus(g, p, add) {
  const lines = text => { const l = text.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
  const base = g.readFile('base', p.path);
  if (base.state === 'ABSENT') { add('PROTECTED_BLOCK_BASELINE_MISMATCH', 'artifact_binding', p.path); return 'BASELINE_MISMATCH'; }
  if (base.state !== 'OK') { add('PROTECTED_BLOCK_UNREADABLE', 'artifact_binding', p.path); return 'UNKNOWN'; }
  const bl = lines(base.text);
  const block = bl.slice(p.start_line - 1, p.end_line);
  if (block.length !== p.end_line - p.start_line + 1 || sha256(block.map(l => l + '\n').join('')) !== p.sha256) {
    add('PROTECTED_BLOCK_BASELINE_MISMATCH', 'artifact_binding', p.path);
    return 'BASELINE_MISMATCH';
  }
  const cand = g.readFile('candidate', p.path);
  if (cand.state === 'ABSENT') { add('PROTECTED_BLOCK_CHANGED', 'artifact_binding', p.path); return 'CHANGED_OR_REMOVED'; }
  if (cand.state !== 'OK') { add('PROTECTED_BLOCK_UNREADABLE', 'artifact_binding', p.path); return 'UNKNOWN'; }
  const cl = lines(cand.text);
  const at = [];
  for (let i = 0; i + block.length <= cl.length; i += 1) if (block.every((l, j) => cl[i + j] === l)) at.push(i);
  if (at.length === 0) { add('PROTECTED_BLOCK_CHANGED', 'artifact_binding', p.path); return 'CHANGED_OR_REMOVED'; }
  if (at.length > 1) { add('PROTECTED_BLOCK_AMBIGUOUS', 'artifact_binding', p.path); return 'AMBIGUOUS'; }
  if (at[0] !== p.start_line - 1) { add('PROTECTED_BLOCK_MOVED', 'artifact_binding', p.path); return 'MOVED'; }
  return 'PRESERVED_IN_PLACE';
}

export const exitCodeFor = report => (Object.values(report.dimensions).some(d => d.status === 'INCONSISTENT') ? 1 : 0);

export function renderSummary(report) {
  const lines = [
    `${report.report_kind} (experimental)`,
    `baseline  ${report.subject.baseline.commit}`,
    `candidate ${report.subject.candidate.commit}`,
    `changed paths: ${report.inventory.count} (inventory ${report.inventory.complete ? 'complete' : 'incomplete'})`,
  ];
  for (const [name, d] of Object.entries(report.dimensions)) lines.push(`${name}: ${d.status}`);
  lines.push(`findings: ${report.findings.length}${report.findings_truncated ? '+ (truncated)' : ''}`);
  for (const f of report.findings.slice(0, 40)) lines.push(`  [${f.severity}] ${f.dimension} ${f.code}${f.path === undefined ? '' : ' ' + JSON.stringify(f.path)}`);
  lines.push('This is NOT an approval, permission or execution grant; no single safety verdict exists.');
  return lines.join('\n') + '\n';
}
