import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateBundle, describeTaskAction } from '../../src/core.mjs';
import { collectArtifactReceipt, verifyArtifactReceipt } from './artifact-receipt.mjs';

// A real, bounded local report task. No production/runtime/agent identity is claimed.
const root = mkdtempSync(join(tmpdir(), 'arc-artifact-observation-'));
try {
 const bundle = readFileSync(new URL('../../examples/starter-bundle.json', import.meta.url), 'utf8');
 const task = readFileSync(new URL('../../examples/starter-task.json', import.meta.url), 'utf8');
 const taskData = JSON.parse(task); taskData.inputs.scope = 'src/contract-report.json';
 const reportBytes = Buffer.from(JSON.stringify(validateBundle(bundle)) + '\n');
 const contentHash = 'sha256:' + createHash('sha256').update(reportBytes).digest('hex');
 const action = { schema_version: '0.3', id: 'generate-contract-report', kind: 'filesystem-write',
  parameters: { path: taskData.inputs.scope, content_sha256: contentHash } };
 const subject = await describeTaskAction(bundle, JSON.stringify(taskData), JSON.stringify(action));
 assert.equal(subject.valid, true);
 const metadata = {
  source_id: 'local-artifact-collector', run_id: 'local-report-run-1',
  subject_digest: subject.subject_digest, nonce: 'local-report-nonce-1',
  artifact_id: 'contract-report', artifact_path: action.parameters.path,
 };
 // Pin is held by this host before receipt collection; never loaded from the receipt.
 const keys = generateKeyPairSync('ed25519');
 const file = join(root, 'contract-report.json');
 writeFileSync(file, reportBytes, { flag: 'wx', mode: 0o600 });
 const receipt = collectArtifactReceipt(file, JSON.stringify(metadata), keys.privateKey);
 const context = { ...metadata, content_sha256: contentHash, evaluated_at: new Date().toISOString(),
  max_age_ms: 60000, max_clock_skew_ms: 1000 };
 const checked = verifyArtifactReceipt(JSON.stringify(receipt), keys.publicKey, JSON.stringify(context));
 assert.equal(checked.signature_valid, true); assert.equal(checked.binding_matches, true);
 assert.equal(checked.freshness, 'fresh'); assert.equal(checked.errors.length, 0);
 const tampered = structuredClone(receipt); tampered.payload.byte_length++;
 assert.equal(verifyArtifactReceipt(JSON.stringify(tampered), keys.publicKey, JSON.stringify(context)).signature_valid, false);
 const foreign = generateKeyPairSync('ed25519');
 assert.equal(verifyArtifactReceipt(JSON.stringify(receipt), foreign.publicKey, JSON.stringify(context)).signature_valid, false);
 console.log(JSON.stringify({
  task: 'generate-and-measure-contract-validation-report', report_bytes: reportBytes.length,
  measured_sha256: receipt.payload.content_sha256, collector_signature_valid: checked.signature_valid,
  binding_matches: checked.binding_matches, tamper_rejected: true, foreign_key_rejected: true,
  runtime_conformance_verified: checked.runtime_conformance_verified,
  scope: 'isolated local artifact observation, ephemeral test pin; not production adoption',
 }));
} finally { rmSync(root, { recursive: true, force: true }); }
