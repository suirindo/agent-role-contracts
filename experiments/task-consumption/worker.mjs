/** Fixed bounded stdin helper for tests/demo. It performs no target action. */
import { createReceiptConsumptionStore } from './ledger.mjs';

let text = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
 text += chunk;
 if (text.length > 4 * 1024 * 1024) throw new Error('TRC_WORKER_INPUT_TOO_LARGE');
}
const message = JSON.parse(text);
if (!message || typeof message !== 'object' || Array.isArray(message) ||
    !['root', 'input', 'waitAfterConsume'].every(k => Object.hasOwn(message, k)) ||
    Object.keys(message).some(k => !['root', 'input', 'waitAfterConsume'].includes(k)) ||
    typeof message.root !== 'string' || typeof message.waitAfterConsume !== 'boolean') throw new Error('TRC_WORKER_INPUT_INVALID');
const store = await createReceiptConsumptionStore(message.root);
const result = await store.consume(message.input);
process.stdout.write(JSON.stringify(result) + '\n');
if (message.waitAfterConsume) {
 const keepAlive = setInterval(() => {}, 1000);
 await new Promise(resolve => process.once('SIGTERM', resolve));
 clearInterval(keepAlive);
}
