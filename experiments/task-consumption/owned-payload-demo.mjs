import { mkdtemp, chmod, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenario, render } from '../task-approval/fixtures.mjs';
import { createOwnedPayloadConsumptionStore } from './owned-payload.mjs';

const body = Uint8Array.from([0x00, 0xff, 0xfe, 0x80, 0x41, 0x00, 0x7f, 0xc3, 0x28, 0x01, 0x02, 0x03]);
const sha = 'sha256:' + createHash('sha256').update(body).digest('hex');
const show = (label, r) => console.log(label, 'binding=' + r.payload_binding, r.consumption_status, 'source_bytes_observed=' + r.source_bytes_observed,
 'authority=' + r.authority_status, 'execution_authorized=' + r.execution_authorized, 'action_executed=' + r.action_executed);

if (process.platform === 'win32') {
 show('unsupported', await (await createOwnedPayloadConsumptionStore('unused')).consume({}));
} else {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'arc-owned-payload-demo-')));
 try {
  await chmod(root, 0o700);
  const store = await createOwnedPayloadConsumptionStore(root);
  const approvalInput = render(await scenario(f => {
   f.request.content_sha256 = sha; f.request.byte_length = body.length;
   for (const s of f.provenance.sources) s.content_sha256 = sha;
  }));
  const changed = Uint8Array.from(body); changed[4] ^= 1;
  show('changed byte', await store.consume({ approvalInput, payloadBytes: changed }));
  show('matching bytes', await store.consume({ approvalInput, payloadBytes: body }));
  show('replay', await store.consume({ approvalInput, payloadBytes: body }));
 } finally { await rm(root, { recursive: true, force: true }); }
}
