import { mkdtemp, chmod, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenario, render } from '../task-approval/fixtures.mjs';
import { createReceiptConsumptionStore } from './ledger.mjs';

if (process.platform === 'win32') {
 console.log(JSON.stringify(await (await createReceiptConsumptionStore('unused')).consume({}), null, 2));
} else {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'arc-consumption-demo-')));
 try {
  await chmod(root, 0o700);
  const store = await createReceiptConsumptionStore(root);
  const input = render(await scenario());
  for (const label of ['first', 'repeat']) {
   const result = await store.consume(input);
   console.log(label, result.consumption_status, 'authority=' + result.authority_status,
    'execution_authorized=' + result.execution_authorized, 'action_executed=' + result.action_executed);
  }
 } finally { await rm(root, { recursive: true, force: true }); }
}
