/** Synthetic host-owned inputs. Never real approval or user adoption evidence. */
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describeTaskAction } from '../../src/action-binding.mjs';
import { createPilotWorkspace, createTestAuthorityStore, createWritePilot, hashBytes } from './write-pilot.mjs';
export async function setupPilot(parent, { mode = 'enforce', comparison = 'arc', alter = () => {} } = {}) {
 const load = name => JSON.parse(readFileSync(new URL('../../examples/starter-' + name + '.json', import.meta.url)));
 const bundle = load('bundle'), task = load('task'), bytes = Buffer.from('reviewed bytes\n');
 task.inputs.scope = 'src/**';
 const workspace = createPilotWorkspace(parent);
 mkdirSync(join(workspace.root, 'src'), { mode: 0o700 });
 const context = { bundle, task, principal: 'fixture-worker-1', role: 'implementer', run: 'fixture-run-1',
  policyRevision: 'fixture-policy-1',
  assignments: [{ principal: 'fixture-worker-1', role: 'implementer', task: task.id, run: 'fixture-run-1' }],
  native: { write: true, paths: ['src/example.mjs', 'src/other.mjs', 'src/link/file.mjs', 'src/existing.mjs'] } };
 const action = { schema_version: '0.3', id: 'fixture-write-1', kind: 'filesystem-write',
  parameters: { path: 'src/example.mjs', content_sha256: hashBytes(bytes) } };
 const subject = await describeTaskAction(...[bundle, task, action].map(JSON.stringify));
 if (!subject.valid) throw Error(JSON.stringify(subject.errors));
 const binding = { schema_version: '0.3', subject_digest: subject.subject_digest,
  reviews: [{ role_id: 'reviewer', subject_digest: subject.subject_digest, decision: 'pass' }],
  human_approval: { role_id: 'implementer', subject_digest: subject.subject_digest, decision: 'approved' } };
 alter(context);
 const authority = createTestAuthorityStore();
 const host = createWritePilot({ workspace, authority, context, mode, comparison, timeoutMs: 20 });
 const target = await host.prepare(action, binding);
 const approval = authority.grant(target);
 const admission = await host.admit(action, binding, approval);
 const channel = host.workerChannel(admission);
 const request = { operation: 'write_file', path: action.parameters.path, bytes };
 return { host, workspace, authority, context, action, binding, target, approval, admission, channel, request };
}
